"""Periodic monitor dependency checks and request-history ingestion."""

from SCHEDULER.SYSTEM.decorator import scheduled_job_with_lock
from SCHEDULER.JOBs.Sys.module.module_monitor import (
    MonitorRequestModule,
)
from APPs.Monitor.module.module_monitor import MonitorModule
from datetime import datetime, timezone


@scheduled_job_with_lock("interval", id="system.monitor.health", seconds=60, timeout=10)
async def jobs_monitor_health():
    """Every 60 seconds, persist a bounded HTTP/Redis/SQL availability observation."""
    return await MonitorModule().sample_health()


@scheduled_job_with_lock("interval", id="system.monitor.request", seconds=60, timeout=50)
async def jobs_monitor_request():
    """Drain completed HTTP events from SYS Redis into record_request each minute."""
    started = datetime.now(timezone.utc)
    result = await MonitorRequestModule().flush()
    await MonitorModule().mark_ingested(started)
    return result
