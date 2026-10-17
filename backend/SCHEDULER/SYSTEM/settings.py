"""Process-local schedules and shared Redis mutexes for every job."""

from SYSTEM.constants import EnumCache
from SYSTEM.extension import SYS_CONF
from SYSTEM.settings import CACHE_CONF, TIME_ZONE as TIME_ZONE

SCHEDULER_CACHE = CACHE_CONF[EnumCache.SCHEDULER]
SCHEDULER_JOB_TIMEOUT = float(SYS_CONF.get("SCHEDULER", "timeout", fallback=300))
SCHEDULER_SHUTDOWN_GRACE = float(SYS_CONF.get("SCHEDULER", "shutdown_grace", fallback=30))
SCHEDULER_LOCK_PREFIX = SYS_CONF.get("SCHEDULER", "lock_prefix", fallback="portfolio-modern:scheduler:lock")
SCHEDULER_JOB_DEFAULTS = {
    "coalesce": SYS_CONF.get("SCHEDULER", "coalesce", fallback=True),
    "max_instances": 1,
    "misfire_grace_time": 60,
}

if SCHEDULER_JOB_TIMEOUT <= 0 or SCHEDULER_SHUTDOWN_GRACE <= 0:
    raise ValueError("Scheduler timeout and shutdown_grace must be positive.")
if not isinstance(SCHEDULER_LOCK_PREFIX, str) or not SCHEDULER_LOCK_PREFIX.strip():
    raise ValueError("Scheduler lock_prefix must be a non-empty shared namespace.")
