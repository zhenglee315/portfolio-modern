"""Periodic monitor dependency checks and request-history ingestion."""

from SCHEDULER.SYSTEM.decorator import scheduled_job_with_lock
from SCHEDULER.JOBs.Sys.module.module_monitor import (
    check_monitor_dependencies,
    MonitorRequestModule,
)


@scheduled_job_with_lock("interval", id="system.monitor.health", seconds=60, timeout=10)
async def jobs_monitor_health():
    """Every 60 seconds, check Redis and SQL dependencies."""
    return await check_monitor_dependencies()


@scheduled_job_with_lock("interval", id="system.monitor.request", seconds=60, timeout=50)
async def jobs_monitor_request():
    """Drain completed HTTP events from SYS Redis into record_request each minute."""
    return await MonitorRequestModule().flush()
