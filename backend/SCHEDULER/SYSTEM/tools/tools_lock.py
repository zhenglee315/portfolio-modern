"""Renewable, token-owned Redis leases; no Redis I/O in module initialization."""

import asyncio
import inspect
import logging
import math
from functools import wraps

LOGGER = logging.getLogger(__name__)


class JobLockLost(RuntimeError):
    """The job must stop because its distributed lease cannot be confirmed."""


async def finish_cleanup(task):
    """Finish cleanup even if a second shutdown cancellation arrives."""
    cancelled = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            cancelled = True
    result = task.result()
    if cancelled:
        raise asyncio.CancelledError
    return result


class LockedJobRunner:
    def __init__(
        self,
        redis_provider,
        *,
        timeout=300,
        prefix="portfolio-modern:scheduler:lock",
        io_timeout=5,
    ):
        self.redis_provider = redis_provider
        self.timeout = timeout
        self.prefix = prefix
        self.io_timeout = io_timeout
        self.closing = False

    def wrap(
        self,
        func,
        job_id,
        *,
        timeout=None,
        lock_timeout=None,
        lock_buffer=10,
        lock_key=None,
    ):
        timeout = self.timeout if timeout is None else float(timeout)
        lease = timeout + lock_buffer if lock_timeout is None else float(lock_timeout)
        if not all(math.isfinite(value) and value > 0 for value in (timeout, lease, lock_buffer)):
            raise ValueError("Job timeout, lock_timeout and lock_buffer must be finite and positive.")
        if lease < 0.03:
            raise ValueError("lock_timeout must be at least 0.03 seconds.")
        key = f"{self.prefix}:{lock_key or job_id}"
        is_async = inspect.iscoroutinefunction(func)

        @wraps(func)
        async def locked(*args, **kwargs):
            if self.closing:
                LOGGER.info("Skipping %s during shutdown", job_id)
                return None
            # Separate objects/tokens also protect tasks in the same event-loop thread.
            cache = self.redis_provider()
            lock = cache.lock(key, timeout=lease, blocking=False, thread_local=False)
            started = asyncio.get_running_loop().time()
            async with asyncio.timeout(min(self.io_timeout, lease / 3)):
                acquired = await lock.acquire(blocking=False)
            if not acquired:
                LOGGER.info("Skipping %s: another instance is executing it", job_id)
                return None

            work = renew = None
            failed = False
            try:
                if asyncio.get_running_loop().time() - started >= lease / 3:
                    raise JobLockLost(f"{job_id}: lock acquisition consumed its safety margin")
                renew = asyncio.create_task(self._renew(lock, lease, job_id))
                if is_async:
                    work = asyncio.create_task(func(*args, **kwargs))
                else:
                    work = asyncio.create_task(asyncio.to_thread(func, *args, **kwargs))
                done, _ = await asyncio.wait({work, renew}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
                if renew in done:
                    await renew
                if work not in done:
                    raise TimeoutError(f"{job_id} exceeded {timeout:g}s")
                return await work
            except BaseException:
                failed = True
                raise
            finally:

                async def cleanup():
                    try:
                        if work is not None:
                            if is_async and not work.done():
                                work.cancel()
                            # to_thread cancellation cannot stop its thread. Retain the
                            # renewing lease until the actual synchronous work finishes.
                            await asyncio.gather(work, return_exceptions=True)
                    finally:
                        if renew is not None:
                            renew.cancel()
                            await asyncio.gather(renew, return_exceptions=True)
                        try:
                            async with asyncio.timeout(min(self.io_timeout, lease / 3)):
                                await lock.release()
                        except Exception:
                            if not failed:
                                raise
                            LOGGER.exception(
                                "Could not release job lock %s; token/TTL protects its successor",
                                job_id,
                            )

                await finish_cleanup(asyncio.create_task(cleanup()))

        setattr(locked, "__scheduler_runner__", self)
        setattr(locked, "__scheduler_job_id__", job_id)
        return locked

    async def _renew(self, lock, lease, job_id):
        try:
            while True:
                await asyncio.sleep(lease / 3)
                async with asyncio.timeout(min(self.io_timeout, lease / 3)):
                    await lock.reacquire()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            raise JobLockLost(f"{job_id}: distributed lease renewal failed") from exc
