"""A real independent scheduler competing for the same Redis job mutex."""

import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from redis.asyncio import Redis
from redis import Redis as SyncRedis
from COMMON.tools.storage.redis import RedisAsync
from SCHEDULER.SYSTEM.tools.tools_apscheduler import AsyncIOSchedulerLock
from SCHEDULER.SYSTEM.tools.tools_lock import LockedJobRunner


async def main(url, prefix, mode="async"):
    redis = Redis.from_url(url)
    runner = LockedJobRunner(lambda: RedisAsync(redis=redis), prefix=prefix, timeout=2)
    scheduler = AsyncIOSchedulerLock(runner=runner, timezone="UTC")

    async def job():
        active = await redis.incr(f"{prefix}:active")
        await redis.eval(
            "local current=tonumber(redis.call('get',KEYS[1]) or '0'); "
            "if tonumber(ARGV[1])>current then redis.call('set',KEYS[1],ARGV[1]) end",
            1,
            f"{prefix}:max-active",
            active,
        )
        try:
            await redis.incr(f"{prefix}:runs")
            # Work outlives its initial lease, exercising renewal in each process.
            await asyncio.sleep(0.18)
        finally:
            await redis.decr(f"{prefix}:active")

    def sync_job():
        with SyncRedis.from_url(url) as client:
            active = client.incr(f"{prefix}:active")
            client.eval(
                "local current=tonumber(redis.call('get',KEYS[1]) or '0'); "
                "if tonumber(ARGV[1])>current then redis.call('set',KEYS[1],ARGV[1]) end",
                1,
                f"{prefix}:max-active",
                active,
            )
            try:
                client.incr(f"{prefix}:runs")
                time.sleep(0.18)
            finally:
                client.decr(f"{prefix}:active")

    scheduler.add_job(
        sync_job if mode == "sync" else job,
        "interval",
        id="shared",
        seconds=0.07,
        next_run_time=datetime.now(timezone.utc),
        lock_timeout=0.09,
    )
    try:
        scheduler.start()
        await asyncio.sleep(1.4)
    finally:
        await scheduler.stop(2)
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:]))
