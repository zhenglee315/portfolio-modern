"""Job declarations delegate locking to the scheduler's mandatory registration path."""

from SCHEDULER.SYSTEM.extension import scheduler


def scheduled_job_with_lock(trigger, id=None, replace_existing=False, **job_kwargs):
    def decorator(func):
        job = scheduler.add_job(func, trigger, id=id, replace_existing=replace_existing, **job_kwargs)
        return job.func

    return decorator
