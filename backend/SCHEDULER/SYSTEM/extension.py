"""Adapters are constructed without opening connections or starting event loops."""

from COMMON.tools.storage.redis import RedisAsync
from SYSTEM.settings import EnumCache
from SCHEDULER.SYSTEM.settings import (
    SCHEDULER_JOB_DEFAULTS,
    SCHEDULER_JOB_TIMEOUT,
    SCHEDULER_LOCK_PREFIX,
    TIME_ZONE,
)
from SCHEDULER.SYSTEM.tools.tools_apscheduler import AsyncIOSchedulerLock
from SCHEDULER.SYSTEM.tools.tools_lock import LockedJobRunner

job_runner = LockedJobRunner(
    lambda: RedisAsync(key=EnumCache.SCHEDULER),
    timeout=SCHEDULER_JOB_TIMEOUT,
    prefix=SCHEDULER_LOCK_PREFIX,
)
scheduler = AsyncIOSchedulerLock(runner=job_runner, job_defaults=SCHEDULER_JOB_DEFAULTS, timezone=TIME_ZONE)
