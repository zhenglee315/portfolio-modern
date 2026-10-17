"""Mandatory locking, deterministic discovery and orderly APScheduler shutdown."""

import asyncio
import importlib
import logging
import sys
from pathlib import Path

from apscheduler.events import (
    EVENT_JOB_ERROR,
    EVENT_JOB_MISSED,
    EVENT_SCHEDULER_SHUTDOWN,
)
from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.util import ref_to_obj

LOGGER = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parents[3]


class DrainingAsyncIOExecutor(AsyncIOExecutor):
    async def drain(self, grace):
        # APScheduler 3's shutdown(wait=True) does not await coroutine finalizers.
        futures = set(self._pending_futures)
        if not futures:
            return
        _, pending = await asyncio.wait(futures, timeout=grace)
        for future in pending:
            future.cancel()
        await asyncio.gather(*futures, return_exceptions=True)


class AsyncIOSchedulerLock(AsyncIOScheduler):
    def __init__(self, *, runner, **kwargs):
        self.runner = runner
        super().__init__(executors={"default": DrainingAsyncIOExecutor()}, **kwargs)

    def start(self, paused=False):
        self.runner.closing = False
        return super().start(paused)

    def add_jobstore(self, jobstore, alias="default", **kwargs):
        if alias != "default" or not isinstance(jobstore, MemoryJobStore):
            raise ValueError("Each scheduler must use its own default MemoryJobStore.")
        return super().add_jobstore(jobstore, alias, **kwargs)

    def add_executor(self, executor, alias="default", **kwargs):
        if alias != "default" or not isinstance(executor, DrainingAsyncIOExecutor):
            raise ValueError("Locked jobs require the draining asyncio executor.")
        return super().add_executor(executor, alias, **kwargs)

    def add_job(
        self,
        func,
        trigger=None,
        id=None,
        name=None,
        replace_existing=False,
        *,
        timeout=None,
        lock_timeout=None,
        lock_buffer=10,
        lock_key=None,
        is_lock=True,
        **kwargs,
    ):
        if is_lock is not True:
            raise ValueError("Distributed locking is mandatory for every scheduled job.")
        if kwargs.get("executor", "default") != "default" or kwargs.get("jobstore", "default") != "default":
            raise ValueError("Locked jobs must use the default executor and memory store.")
        if kwargs.get("max_instances", 1) != 1:
            raise ValueError("max_instances must be 1; the Redis mutex also protects other processes.")
        if isinstance(func, str):
            func = ref_to_obj(func)
        job_id = id or f"{func.__module__}.{func.__qualname__}"
        if not replace_existing and self.get_job(job_id) is not None:
            raise ValueError(f"Duplicate job id: {job_id}")
        if getattr(func, "__scheduler_runner__", None) is not None:
            raise ValueError("Register the original callable, not an already locked job wrapper.")
        wrapped = self.runner.wrap(
            func,
            job_id,
            timeout=timeout,
            lock_timeout=lock_timeout,
            lock_buffer=lock_buffer,
            lock_key=lock_key,
        )
        return super().add_job(
            wrapped,
            trigger,
            id=job_id,
            name=name,
            replace_existing=replace_existing,
            **{**kwargs, "max_instances": 1},
        )

    def modify_job(self, job_id, jobstore=None, **changes):
        if "func" in changes or changes.get("max_instances", 1) != 1 or "executor" in changes:
            raise ValueError("Remove and register the job again to change execution policy.")
        return super().modify_job(job_id, jobstore, **changes)

    def scheduler_add(self, func, *args, **kwargs):
        return self.add_job(func, *args, **kwargs)

    async def stop(self, grace=30):
        if not self.running:
            return
        self.pause()
        self.runner.closing = True
        await self._executors["default"].drain(grace)
        stopped = asyncio.get_running_loop().create_future()

        def on_shutdown(_event):
            if not stopped.done():
                stopped.set_result(None)

        self.add_listener(on_shutdown, EVENT_SCHEDULER_SHUTDOWN)
        try:
            self.shutdown(wait=False)
            await stopped
        finally:
            self.remove_listener(on_shutdown)


def apscheduler_include_jobs(base_dir="SCHEDULER", project_dir="JOBs", file_pattern="jobs_*.py"):
    base_path = Path(base_dir)
    if not base_path.is_absolute():
        base_path = BACKEND_DIR / base_path
    base_path = base_path.resolve()
    jobs_path = base_path / project_dir
    if not jobs_path.is_dir():
        raise FileNotFoundError(f"Jobs directory does not exist: {jobs_path}")
    if str(base_path.parent) not in sys.path:
        sys.path.insert(0, str(base_path.parent))
    importlib.invalidate_caches()
    discovered = []
    for job_file in sorted(jobs_path.rglob(file_pattern)):
        parts = (base_path.name, *job_file.relative_to(base_path).with_suffix("").parts)
        if not all(part.isidentifier() for part in parts):
            raise ValueError(f"Invalid job module path: {job_file}")
        module_name = ".".join(parts)
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])
        else:
            importlib.import_module(module_name)
        discovered.append(module_name)
        LOGGER.info("Loaded job module %s", module_name)
    return discovered


def apscheduler_list_jobs(scheduler):
    for job in scheduler.get_jobs():
        print(f"{job.id} | {job.trigger} | next={getattr(job, 'next_run_time', 'pending')}")


def apscheduler_jobs_listener(scheduler):
    def listener(event):
        if event.code == EVENT_JOB_MISSED:
            LOGGER.warning(
                "Job %s missed %s; recurring schedule retained",
                event.job_id,
                event.scheduled_run_time,
            )
        elif event.code == EVENT_JOB_ERROR:
            LOGGER.error("Job %s failed: %s", event.job_id, event.exception)

    scheduler.add_listener(listener, EVENT_JOB_ERROR | EVENT_JOB_MISSED)
    return listener
