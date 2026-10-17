"""Discover jobs, run a local scheduler and drain jobs before closing resources."""

import argparse
import asyncio
import logging
from pathlib import Path
import signal

from SYSTEM.database import CONN_MANAGER
from SYSTEM.settings import EnumCache
from COMMON.tools.storage.redis import RedisAsync
from SCHEDULER.SYSTEM.extension import scheduler
from SCHEDULER.SYSTEM.settings import SCHEDULER_SHUTDOWN_GRACE
from SCHEDULER.SYSTEM.tools.tools_apscheduler import (
    apscheduler_include_jobs,
    apscheduler_jobs_listener,
    apscheduler_list_jobs,
)

LOGGER = logging.getLogger(__name__)


class AsyncIOSchedulerServer:
    def __init__(self, base_dir=None, project_dir="JOBs", jobs_pattern="jobs_*.py"):
        self.base_dir = base_dir or Path(__file__).resolve().parent / "SCHEDULER"
        self.project_dir = project_dir
        self.jobs_pattern = jobs_pattern
        self.jobs_loaded = []
        self.listener = None
        self.resources_started = False

    def load_jobs(self):
        scheduler.remove_all_jobs()
        self.jobs_loaded = apscheduler_include_jobs(self.base_dir, self.project_dir, self.jobs_pattern)
        if not scheduler.get_jobs():
            raise RuntimeError("No scheduled jobs registered; check the jobs directory and decorators.")

    async def startup(self):
        self.resources_started = True
        CONN_MANAGER.init_cache()
        CONN_MANAGER.init_db()
        # Redis failure must fail startup, never run unprotected work.
        await asyncio.wait_for(RedisAsync(key=EnumCache.SCHEDULER).ping(), timeout=5)
        self.load_jobs()
        self.listener = apscheduler_jobs_listener(scheduler)
        scheduler.runner.closing = False
        scheduler.start()
        LOGGER.info("Scheduler started with %s job(s)", len(scheduler.get_jobs()))

    async def shutdown(self):
        try:
            await scheduler.stop(SCHEDULER_SHUTDOWN_GRACE)
        finally:
            if self.listener is not None:
                scheduler.remove_listener(self.listener)
                self.listener = None
            if self.resources_started:
                await CONN_MANAGER.shutdown_all_connections()
                self.resources_started = False

    async def serve(self):
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        signals = (signal.SIGINT, signal.SIGTERM)
        for sig in signals:
            loop.add_signal_handler(sig, stop.set)
        try:
            await self.startup()
            await stop.wait()
        finally:
            # Startup failures also close every resource already registered.
            try:
                await self.shutdown()
            finally:
                for sig in signals:
                    loop.remove_signal_handler(sig)

    def run(self):
        asyncio.run(self.serve())


def main(argv=None):
    parser = argparse.ArgumentParser(description="APScheduler Manager")
    parser.add_argument(
        "--init",
        action="store_true",
        help="Load job declarations; with --run, start them",
    )
    parser.add_argument(
        "--jobs",
        "--list",
        dest="jobs",
        action="store_true",
        help="List declarations without executing jobs",
    )
    parser.add_argument("--run", action="store_true", help="Run the scheduler until SIGINT/SIGTERM")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    server = AsyncIOSchedulerServer()
    if args.run:
        server.run()
    elif args.init or args.jobs:
        server.load_jobs()
        apscheduler_list_jobs(scheduler)
    else:
        parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
