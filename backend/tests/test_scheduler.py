"""Scheduler regressions. SCHEDULER_TEST_REDIS_URL enables isolated Redis/process checks."""

import asyncio
import builtins
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError, LockNotOwnedError

from SCHEDULER.SYSTEM.tools.tools_lock import JobLockLost, LockedJobRunner
from SCHEDULER.SYSTEM.tools.tools_apscheduler import (
    AsyncIOSchedulerLock,
    apscheduler_include_jobs,
    apscheduler_jobs_listener,
)

BACKEND = Path(__file__).resolve().parents[1]


class MemoryRedis(Redis):
    def __init__(self):
        super().__init__()
        self.values = {}
        self.calls = []
        self.fail_acquire = False
        self.fail_renew = False

    def lock(self, key, **options):
        owner = self
        token = uuid4().hex
        lease = options["timeout"]
        self.calls.append(options)

        class Lock:
            async def acquire(self, **_):
                if owner.fail_acquire:
                    raise RedisConnectionError("outage")
                row = owner.values.get(key)
                if row and row[1] > time.monotonic():
                    return False
                owner.values[key] = (token, time.monotonic() + lease)
                return True

            async def reacquire(self):
                if owner.fail_renew:
                    raise RedisConnectionError("renewal outage")
                row = owner.values.get(key)
                if not row or row[0] != token or row[1] <= time.monotonic():
                    raise LockNotOwnedError("lost")
                owner.values[key] = (token, time.monotonic() + lease)

            async def release(self):
                row = owner.values.get(key)
                if not row or row[0] != token:
                    raise LockNotOwnedError("lost")
                del owner.values[key]

        return Lock()


class LockTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.redis = MemoryRedis()
        self.runner = LockedJobRunner(lambda: self.redis, timeout=0.4, prefix="test")

    async def test_other_instance_skips_same_job_until_completion(self):
        entered, release = asyncio.Event(), asyncio.Event()
        calls = []

        async def job():
            calls.append(1)
            entered.set()
            await release.wait()

        first = asyncio.create_task(self.runner.wrap(job, "same")())
        await entered.wait()
        other = LockedJobRunner(lambda: self.redis, prefix="test").wrap(job, "same")
        self.assertIsNone(await other())
        self.assertEqual(len(calls), 1)
        release.set()
        await first
        await other()
        self.assertEqual(len(calls), 2)

    async def test_different_jobs_can_run_together(self):
        entered = []
        release = asyncio.Event()

        async def job(name):
            entered.append(name)
            await release.wait()

        tasks = [asyncio.create_task(self.runner.wrap(job, name)(name)) for name in ("a", "b")]
        while len(entered) != 2:
            await asyncio.sleep(0)
        self.assertEqual(len(self.redis.values), 2)
        release.set()
        await asyncio.gather(*tasks)

    async def test_business_error_propagates_and_unlocks(self):
        async def broken():
            raise ValueError("business failure")

        with self.assertRaisesRegex(ValueError, "business failure"):
            await self.runner.wrap(broken, "broken")()
        self.assertFalse(self.redis.values)

    async def test_timeout_cancels_async_work_and_reports_error(self):
        cleaned = asyncio.Event()

        async def slow():
            try:
                await asyncio.sleep(5)
            finally:
                cleaned.set()

        with self.assertRaises(TimeoutError):
            await self.runner.wrap(slow, "slow", timeout=0.02)()
        self.assertTrue(cleaned.is_set())
        self.assertFalse(self.redis.values)

    async def test_cancellation_propagates_after_cleanup(self):
        entered, cleaned = asyncio.Event(), asyncio.Event()

        async def job():
            entered.set()
            try:
                await asyncio.sleep(5)
            finally:
                cleaned.set()

        task = asyncio.create_task(self.runner.wrap(job, "cancel")())
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(cleaned.is_set())
        self.assertFalse(self.redis.values)

    async def test_second_cancellation_does_not_unlock_during_finalizer(self):
        entered, cleaning, release = asyncio.Event(), asyncio.Event(), asyncio.Event()

        async def job():
            entered.set()
            try:
                await asyncio.sleep(5)
            finally:
                cleaning.set()
                await release.wait()

        task = asyncio.create_task(self.runner.wrap(job, "cancel-twice")())
        await entered.wait()
        task.cancel()
        await cleaning.wait()
        task.cancel()
        await asyncio.sleep(0)
        self.assertTrue(self.redis.values)
        release.set()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertFalse(self.redis.values)

    async def test_lease_is_renewed_beyond_initial_ttl(self):
        entered, release = asyncio.Event(), asyncio.Event()

        async def job():
            entered.set()
            await release.wait()

        wrapped = self.runner.wrap(job, "renew", lock_timeout=0.09)
        first = asyncio.create_task(wrapped())
        await entered.wait()
        await asyncio.sleep(0.18)
        self.assertIsNone(await wrapped())
        release.set()
        await first

    async def test_renewal_failure_stops_async_work(self):
        cleaned = asyncio.Event()

        async def job():
            try:
                await asyncio.sleep(3)
            finally:
                cleaned.set()

        self.redis.fail_renew = True
        with self.assertRaises(JobLockLost):
            await self.runner.wrap(job, "lost", lock_timeout=0.06)()
        self.assertTrue(cleaned.is_set())
        self.assertFalse(self.redis.values)

    async def test_acquisition_outage_never_runs_job(self):
        calls = []
        self.redis.fail_acquire = True

        async def job():
            calls.append(1)

        with self.assertRaises(RedisConnectionError):
            await self.runner.wrap(job, "fail-closed")()
        self.assertEqual(calls, [])

    async def test_sync_work_is_locked_and_does_not_block_event_loop(self):
        entered, release = threading.Event(), threading.Event()

        def job():
            entered.set()
            release.wait(2)
            return 42

        wrapped = self.runner.wrap(job, "sync")
        task = asyncio.create_task(wrapped())
        try:
            while not entered.is_set():
                await asyncio.sleep(0.001)
            self.assertIsNone(await wrapped())
        finally:
            release.set()
        self.assertEqual(await task, 42)

    async def test_sync_timeout_retains_lease_until_thread_really_stops(self):
        entered, release = threading.Event(), threading.Event()

        def job():
            entered.set()
            release.wait(2)

        wrapped = self.runner.wrap(job, "sync-timeout", timeout=0.02, lock_timeout=0.06)
        task = asyncio.create_task(wrapped())
        try:
            while not entered.is_set():
                await asyncio.sleep(0.001)
            await asyncio.sleep(0.12)
            self.assertFalse(task.done())
            self.assertIsNone(await wrapped())
        finally:
            release.set()
        with self.assertRaises(TimeoutError):
            await task
        self.assertFalse(self.redis.values)

    async def test_default_timeout_and_buffer_are_used(self):
        async def job():
            return "ok"

        self.assertEqual(await self.runner.wrap(job, "defaults")(), "ok")
        self.assertEqual(self.redis.calls[0]["timeout"], 10.4)

    async def test_invalid_policy_is_rejected(self):
        async def job():
            pass

        for option in (
            {"timeout": 0},
            {"timeout": float("inf")},
            {"lock_timeout": -1},
            {"lock_buffer": 0},
        ):
            with self.subTest(option=option), self.assertRaises(ValueError):
                self.runner.wrap(job, "bad", **option)


class SchedulerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.redis = MemoryRedis()
        self.runner = LockedJobRunner(lambda: self.redis, timeout=1, prefix="test")
        self.scheduler = AsyncIOSchedulerLock(runner=self.runner, timezone="UTC")

    async def asyncTearDown(self):
        await self.scheduler.stop(0.01)

    async def test_direct_add_and_alias_return_locked_job(self):
        async def job():
            return 12

        first = self.scheduler.add_job(job, "interval", seconds=60, id="direct")
        second = self.scheduler.scheduler_add(job, "interval", seconds=60, id="alias")
        self.assertEqual(first.id, "direct")
        self.assertIs(first.func.__scheduler_runner__, self.runner)
        self.assertEqual(await second.func(), 12)

    async def test_unsafe_registration_and_modification_are_rejected(self):
        async def job():
            pass

        for options in (
            {"is_lock": False},
            {"max_instances": 2},
            {"executor": "thread"},
            {"jobstore": "redis"},
        ):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.scheduler.add_job(job, "interval", seconds=60, **options)
        item = self.scheduler.add_job(job, "interval", seconds=60, id="only")
        with self.assertRaises(ValueError):
            self.scheduler.add_job(job, "interval", seconds=60, id="only")
        with self.assertRaises(ValueError):
            self.scheduler.add_job(item.func, "interval", seconds=60, id="wrapped")
        with self.assertRaises(ValueError):
            item.modify(func=job)
        with self.assertRaises(ValueError):
            item.modify(max_instances=2)
        with self.assertRaises(ValueError):
            self.scheduler.add_jobstore(object())

    async def test_four_misfires_do_not_remove_recurring_job(self):
        async def job():
            pass

        item = self.scheduler.add_job(job, "interval", seconds=60, id="recurring")
        listener = apscheduler_jobs_listener(self.scheduler)
        for _ in range(4):
            listener(SimpleNamespace(code=EVENT_JOB_MISSED, job_id=item.id, scheduled_run_time="past"))
        self.assertIsNotNone(self.scheduler.get_job(item.id))

    async def test_business_failure_emits_apscheduler_error_event(self):
        completed = asyncio.Event()
        events = []

        async def broken():
            raise ValueError("visible error")

        def listener(event):
            events.append(event)
            completed.set()

        self.scheduler.add_listener(listener, EVENT_JOB_ERROR)
        self.scheduler.add_job(broken, "date", run_date=datetime.now(timezone.utc))
        self.scheduler.start()
        await asyncio.wait_for(completed.wait(), 1)
        self.assertIsInstance(events[0].exception, ValueError)

    async def test_shutdown_finishes_finalizers_before_connections_close(self):
        import manage_apscheduler

        entered, cleaned = asyncio.Event(), asyncio.Event()
        sequence = []

        async def job():
            entered.set()
            try:
                await asyncio.sleep(5)
            finally:
                await asyncio.sleep(0.02)
                sequence.append("job-cleaned")
                cleaned.set()

        async def close():
            self.assertTrue(cleaned.is_set())
            self.assertFalse(self.redis.values)
            sequence.append("connections-closed")

        self.scheduler.add_job(job, "date", run_date=datetime.now(timezone.utc))
        self.scheduler.start()
        await entered.wait()
        server = manage_apscheduler.AsyncIOSchedulerServer()
        server.resources_started = True
        with (
            patch.object(manage_apscheduler, "scheduler", self.scheduler),
            patch.object(manage_apscheduler, "SCHEDULER_SHUTDOWN_GRACE", 0.01),
            patch.object(
                manage_apscheduler.CONN_MANAGER,
                "shutdown_all_connections",
                AsyncMock(side_effect=close),
            ),
        ):
            await server.shutdown()
        self.assertEqual(sequence, ["job-cleaned", "connections-closed"])

    async def test_graceful_shutdown_allows_normal_completion(self):
        entered = asyncio.Event()
        finished = []

        async def job():
            entered.set()
            await asyncio.sleep(0.02)
            finished.append(True)

        self.scheduler.add_job(job, "date", run_date=datetime.now(timezone.utc))
        self.scheduler.start()
        await entered.wait()
        await self.scheduler.stop(0.5)
        self.assertEqual(finished, [True])

    async def test_partial_startup_failure_closes_registered_resources(self):
        import manage_apscheduler

        server = manage_apscheduler.AsyncIOSchedulerServer()
        cache = Mock(spec=Redis)
        cache.ping = AsyncMock(side_effect=RedisConnectionError("startup outage"))
        with (
            patch.object(manage_apscheduler.CONN_MANAGER, "init_cache"),
            patch.object(manage_apscheduler.CONN_MANAGER, "init_db"),
            patch.object(manage_apscheduler.CONN_MANAGER, "get_cache", return_value=cache),
            patch.object(manage_apscheduler.CONN_MANAGER, "shutdown_all_connections", AsyncMock()) as close,
        ):
            with self.assertRaises(RedisConnectionError):
                await server.serve()
            close.assert_awaited_once()


class DiscoveryTests(unittest.TestCase):
    def test_full_names_avoid_collision_and_reload_cached_modules(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary) / f"fixture_{uuid4().hex}"
            builtins.scheduler_test_modules = []
            try:
                for folder in ("First", "Second"):
                    path = base / "JOBs" / folder / "jobs_same.py"
                    path.parent.mkdir(parents=True)
                    path.write_text(f"import builtins\nbuiltins.scheduler_test_modules.append({folder!r})\n")
                modules = apscheduler_include_jobs(base)
                self.assertEqual(len(set(modules)), 2)
                self.assertEqual(builtins.scheduler_test_modules, ["First", "Second"])
                apscheduler_include_jobs(base)
                self.assertEqual(len(builtins.scheduler_test_modules), 4)
            finally:
                del builtins.scheduler_test_modules
                for name in list(sys.modules):
                    if name.startswith(base.name):
                        del sys.modules[name]

    def test_import_failure_is_fatal(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary) / f"fixture_{uuid4().hex}"
            path = base / "JOBs" / "jobs_broken.py"
            path.parent.mkdir(parents=True)
            path.write_text("raise RuntimeError('broken module')\n")
            with self.assertRaisesRegex(RuntimeError, "broken module"):
                apscheduler_include_jobs(base)

    def test_missing_directory_is_fatal(self):
        with self.assertRaises(FileNotFoundError):
            apscheduler_include_jobs("/nonexistent/scheduler")

    def test_cli_modes_exit_without_services_or_executing_jobs(self):
        with tempfile.TemporaryDirectory() as cwd:
            for flag in ("--list", "--jobs", "--init", "--help", None):
                with self.subTest(flag=flag):
                    command = [sys.executable, str(BACKEND / "manage_apscheduler.py")]
                    if flag:
                        command.append(flag)
                    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertNotIn("Registered async", result.stdout)
                    if flag in ("--list", "--jobs", "--init"):
                        self.assertIn("system.monitor.health", result.stdout)


@unittest.skipUnless(os.environ.get("SCHEDULER_TEST_REDIS_URL"), "isolated Redis URL not supplied")
class RedisProcessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.url = os.environ["SCHEDULER_TEST_REDIS_URL"]
        self.redis = Redis.from_url(self.url)
        self.prefix = f"test:scheduler:{uuid4().hex}"
        await self.redis.ping()
        self.children = []

    async def asyncTearDown(self):
        for child in self.children:
            if child.poll() is None:
                child.kill()
            await asyncio.to_thread(child.wait)
            for stream in (child.stdout, child.stderr):
                if stream is not None:
                    stream.close()
        keys = [key async for key in self.redis.scan_iter(match=f"{self.prefix}:*")]
        if keys:
            await self.redis.delete(*keys)
        await self.redis.aclose()

    async def test_four_real_schedulers_never_overlap_across_processes(self):
        await self.compete("async")

    async def test_four_sync_schedulers_never_overlap_across_processes(self):
        await self.compete("sync")

    async def compete(self, mode):
        command = [
            sys.executable,
            str(BACKEND / "tests" / "scheduler_process_fixture.py"),
            self.url,
            self.prefix,
            mode,
        ]
        self.children = [
            subprocess.Popen(command, cwd=BACKEND, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(4)
        ]
        for child in self.children:
            stdout, stderr = await asyncio.to_thread(child.communicate, timeout=12)
            self.assertEqual(child.returncode, 0, (stdout + stderr).decode())
        self.assertEqual(int(await self.redis.get(f"{self.prefix}:max-active")), 1)
        self.assertGreaterEqual(int(await self.redis.get(f"{self.prefix}:runs")), 3)
        self.assertEqual(int(await self.redis.get(f"{self.prefix}:active")), 0)

    async def test_real_lease_loss_cancels_work_without_deleting_new_owner(self):
        entered, cleaned = asyncio.Event(), asyncio.Event()

        async def job():
            entered.set()
            try:
                await asyncio.sleep(5)
            finally:
                cleaned.set()

        runner = LockedJobRunner(lambda: self.redis, prefix=self.prefix)
        task = asyncio.create_task(runner.wrap(job, "lost", lock_timeout=0.09)())
        await entered.wait()
        key = f"{self.prefix}:lost"
        await self.redis.set(key, "successor", px=1000)
        with self.assertRaises(JobLockLost):
            await task
        self.assertTrue(cleaned.is_set())
        self.assertEqual(await self.redis.get(key), b"successor")

    async def test_old_owner_cannot_delete_successor_lock(self):
        runner = LockedJobRunner(lambda: self.redis, prefix=self.prefix, timeout=1)
        entered, release = asyncio.Event(), asyncio.Event()

        async def job():
            entered.set()
            await release.wait()

        task = asyncio.create_task(runner.wrap(job, "owner", lock_timeout=1)())
        await entered.wait()
        key = f"{self.prefix}:owner"
        await self.redis.set(key, "successor-token", px=1000)
        release.set()
        with self.assertRaises(LockNotOwnedError):
            await task
        self.assertEqual(await self.redis.get(key), b"successor-token")

    async def test_crashed_process_lease_expires_and_job_can_run_again(self):
        script = (
            "import asyncio,sys; from redis.asyncio import Redis\n"
            "async def run():\n"
            " r=Redis.from_url(sys.argv[1]); "
            "await r.set(sys.argv[2], 'crashed-owner', nx=True, px=150); print('locked',flush=True); await asyncio.sleep(60)\n"
            "asyncio.run(run())"
        )
        key = f"{self.prefix}:crash"
        child = subprocess.Popen([sys.executable, "-c", script, self.url, key], stdout=subprocess.PIPE)
        self.children.append(child)
        self.assertEqual(await asyncio.to_thread(child.stdout.readline), b"locked\n")
        child.kill()
        await asyncio.to_thread(child.wait)
        await asyncio.sleep(0.2)

        async def job():
            return 7

        runner = LockedJobRunner(lambda: self.redis, prefix=self.prefix)
        self.assertEqual(await runner.wrap(job, "crash")(), 7)


if __name__ == "__main__":
    unittest.main()
