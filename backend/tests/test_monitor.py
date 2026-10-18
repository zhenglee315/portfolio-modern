"""Run with unittest; MONITOR_TEST_REDIS_URL enables isolated Redis/process checks.

All integration keys use a random prefix. No configured SQL/Redis service is used.
The ASGI fixture below is test-only and is never discovered by application routers.
"""

import asyncio
import fnmatch
import json
import multiprocessing
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from fastapi import FastAPI
from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.retry import Retry
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.responses import StreamingResponse
from uvicorn.supervisors import Multiprocess
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from COMMON.tools.storage.redis import RedisAsync, RedisSync
from COMMON.tools.storage.sqlalchemy import SqlAlchemyTransactionObserver
from COMMON.tools.tools_geoip import GeoIpDatabaseImporter

from SYSTEM.middleware import MonitorMiddleware
from SYSTEM.tools.tools_monitor import (
    ENV_RUN,
    WorkerMonitor,
    MonitorSupervisor,
)


class MemoryRedis(Redis):
    """Virtual-time Redis double for expiry/failure tests; real Redis is checked separately."""

    def __init__(self):
        super().__init__()
        self.now = 0
        self.values = {}
        self.fail = False

    def pipeline(self, transaction=True):
        owner = self

        class Pipeline:
            def __init__(self):
                self.commands = []

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                pass

            def set(self, key, value, ex):
                self.commands.append((key, value, ex))

            def delete(self, key):
                self.commands.append((key, None, 0))

            async def execute(self):
                if owner.fail:
                    raise RedisConnectionError("isolated outage")
                for key, value, expiry in self.commands:
                    if value is None:
                        owner.values.pop(key, None)
                    else:
                        owner.values[key] = (value, owner.now + expiry)

        return Pipeline()

    async def scan_iter(self, match, count=100):
        for key, (_, expiry) in list(self.values.items()):
            if expiry > self.now and fnmatch.fnmatchcase(key, match):
                yield key

    async def mget(self, keys):
        return [
            (self.values[key][0] if key in self.values and self.values[key][1] > self.now else None) for key in keys
        ]


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.redis = MemoryRedis()
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.cache = RedisAsync(redis=self.redis)
        self.observer = SqlAlchemyTransactionObserver(self.engine, ignore_key="system.monitor.ignore")
        self.monitor = WorkerMonitor(self.cache, transactions=self.observer, prefix="test:monitor")

    async def asyncTearDown(self):
        await self.monitor.stop()
        await self.engine.dispose()

    async def test_snapshot_uses_process_identity_and_monotonic_uptime(self):
        first = self.monitor.snapshot()
        self.assertIsNone(first["cpu_percent"])
        self.assertGreater(first["rss_bytes"], 0)
        self.assertIn(str(os.getpid()), first["process_uid"])
        with patch("SYSTEM.tools.tools_monitor.time.time", return_value=1):
            second = self.monitor.snapshot()
        self.assertGreaterEqual(second["uptime_seconds"], first["uptime_seconds"])

    async def test_expiry_is_unknown_then_removed_and_stop_is_terminal(self):
        self.monitor.status = "running"
        token = self.monitor.begin_request()
        await self.monitor.publish()
        snapshot = await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor")
        self.assertTrue(snapshot["workers"][0]["busy"])
        self.redis.now = 16
        stale = (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["workers"][0]
        self.assertEqual(stale["status"], "stale")
        self.assertIsNone(stale["busy"])
        self.redis.now = 61
        self.assertEqual(
            (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["workers"],
            [],
        )
        self.monitor.end_request(token)
        await self.monitor.stop()
        row = (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["workers"][0]
        self.assertEqual(row["status"], "stopped")
        self.assertFalse(row["fresh"])

    async def test_reporting_survives_redis_outage_without_blocking_requests(self):
        self.redis.fail = True
        await self.monitor.start()
        await asyncio.sleep(0.01)
        self.assertEqual(self.monitor.publish_failures_total, 1)
        token = self.monitor.begin_request()
        self.monitor.end_request(token)
        self.redis.fail = False
        await self.monitor._safe_publish()
        row = (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["workers"][0]
        self.assertEqual(row["completed_requests_total"], 1)

    async def test_root_transactions_commit_rollback_and_savepoint(self):
        await self.monitor.start()
        sessions = async_sessionmaker(self.engine)
        async with sessions() as session:
            async with session.begin():
                self.assertEqual(self.monitor.snapshot()["active_transactions"], 1)
                async with session.begin_nested():
                    await session.execute(text("select 1"))
                    self.assertEqual(self.monitor.snapshot()["active_transactions"], 1)
                self.assertEqual(self.monitor.snapshot()["active_transactions"], 1)
            self.assertEqual(self.monitor.snapshot()["active_transactions"], 0)
            with self.assertRaises(ValueError):
                async with session.begin():
                    self.assertEqual(self.monitor.snapshot()["active_transactions"], 1)
                    raise ValueError("rollback")
            self.assertEqual(self.monitor.snapshot()["active_transactions"], 0)
        self.assertEqual(self.monitor.completed_transactions_total, 2)

    async def test_other_engines_are_excluded_and_listeners_detach(self):
        await self.monitor.start()
        other = create_async_engine("sqlite+aiosqlite:///:memory:")
        try:
            async with async_sessionmaker(other).begin():
                self.assertEqual(self.monitor.snapshot()["active_transactions"], 0)
            await self.monitor.stop()
            async with async_sessionmaker(self.engine).begin():
                self.assertEqual(self.monitor.snapshot()["active_transactions"], 0)
        finally:
            await other.dispose()

    async def test_lifespan_initializes_monitor_after_resources_and_stops_before_redis(
        self,
    ):
        from SYSTEM.lifespan import lifespan

        app = FastAPI()
        order = []

        async def shutdown():
            self.assertEqual(app.state.monitor.status, "stopped")
            self.assertIsNone(app.state.monitor._task)
            self.assertFalse(app.state.monitor._transaction_observer.listening)
            order.append("closed")

        manager = SimpleNamespace(
            init_cache=lambda: order.append("redis"),
            init_db=lambda: order.append("database"),
            get_engine=lambda: self.engine,
            get_cache=lambda key: self.redis,
            shutdown_all_connections=shutdown,
        )
        reader = SimpleNamespace(
            open=lambda: order.append("geoip"),
            close=lambda: order.append("geoip_closed"),
        )

        async def stop_socketio(_):
            order.append("socketio")

        with (
            patch("SYSTEM.lifespan.CONN_MANAGER", manager),
            patch("SYSTEM.lifespan.GeoIpReader", return_value=reader),
            patch(
                "SYSTEM.lifespan.MonitorRequestMetrics",
                return_value=SimpleNamespace(flush=AsyncMock(), record=lambda **_: None),
            ),
            patch(
                "SYSTEM.lifespan.socketio_start_monitor",
                new=AsyncMock(return_value=SimpleNamespace(stop=AsyncMock())),
            ),
            patch("SYSTEM.lifespan.socketio_shutdown", side_effect=stop_socketio),
        ):
            async with lifespan(app):
                self.assertEqual(order[:3], ["redis", "database", "geoip"])
                self.assertTrue(app.state.monitor.running)
                await asyncio.sleep(0)
                async with async_sessionmaker(self.engine).begin():
                    self.assertEqual(app.state.monitor.snapshot()["active_transactions"], 1)
        self.assertEqual(order[-3:], ["socketio", "geoip_closed", "closed"])

    async def test_manager_engine_and_monitoring_do_not_open_sql_connections(self):
        from SYSTEM.constants import EnumDBType
        from SYSTEM.database.database_core import ConnectionManager

        manager = ConnectionManager()
        manager.db_conf = {
            "type": EnumDBType.SQLLite,
            "name": ":memory:",
            "is_async": True,
        }
        manager.engine_conf = {"echo": False, "future": True}
        with self.assertRaises(RuntimeError):
            manager.get_engine()
        manager.init_db()
        engine = manager.get_engine()
        connections = []
        event.listen(engine.sync_engine, "connect", lambda *_: connections.append(True))
        self.observer.engine = engine.sync_engine
        try:
            self.assertIs(manager.get_engine(), engine)
            await self.monitor.start()
            await asyncio.sleep(0)
            self.assertEqual(self.monitor.snapshot()["active_transactions"], 0)
            await self.monitor.stop()
            self.assertEqual(connections, [])
        finally:
            await self.monitor.stop()
            await manager.shutdown_all_connections()
        with self.assertRaises(RuntimeError):
            manager.get_engine()

    async def test_lifespan_failure_still_closes_resources(self):
        from SYSTEM.lifespan import lifespan

        close = AsyncMock()
        manager = SimpleNamespace(
            init_cache=lambda: None,
            init_db=lambda: None,
            get_cache=lambda key: self.redis,
            shutdown_all_connections=close,
        )

        def broken():
            raise RuntimeError("startup fixture failure")

        reader = SimpleNamespace(open=broken, close=lambda: None)
        with patch("SYSTEM.lifespan.CONN_MANAGER", manager), patch("SYSTEM.lifespan.GeoIpReader", return_value=reader):
            with self.assertRaises(RuntimeError):
                async with lifespan(FastAPI()):
                    self.fail("Startup should fail before yielding.")
        close.assert_awaited_once()

    def scope(self, path="/work"):
        return {
            "type": "http",
            "path": path,
            "method": "GET",
            "scheme": "http",
            "headers": [],
            "client": ("127.0.0.1", 1234),
            "app": SimpleNamespace(state=SimpleNamespace(monitor=self.monitor)),
        }

    async def test_request_events_include_ip_geo_timestamps_phase_and_http(self):
        main_thread = threading.get_ident()
        lookups = []

        def lookup(address):
            lookups.append((address, threading.get_ident()))
            return SimpleNamespace(
                record_values=lambda: {
                    "ip_address": address,
                    "country_code": "US",
                    "region": "California",
                    "city": "Mountain View",
                    "geo_status": "resolved",
                }
            )

        self.monitor.geoip_reader = SimpleNamespace(lookup=lookup)
        self.monitor.status = "running"
        scope = self.scope("/api/users")
        scope["client"] = ("8.8.8.8", 1234)
        scope["query_string"] = b"secret=not-recorded"
        ready, finish = asyncio.Event(), asyncio.Event()

        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 201, "headers": []})
            ready.set()
            await finish.wait()
            await send({"type": "http.response.body", "body": b"ok"})

        async def send(_):
            pass

        task = asyncio.create_task(MonitorMiddleware(app)(scope, None, send))
        await ready.wait()
        await self.monitor.publish()
        snapshot = await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor")
        row = snapshot["requests"][0]
        self.assertEqual(
            (row["method"], row["path"], row["ip_address"]),
            ("GET", "/api/users", "8.8.8.8"),
        )
        self.assertEqual(
            (row["country_code"], row["region"], row["city"]),
            ("US", "California", "Mountain View"),
        )
        self.assertEqual(row["location"], "US / California / Mountain View")
        self.assertEqual(row["phase"], "response")
        self.assertIsNone(row["http_status"])
        self.assertIsNone(row["left_at"])
        self.assertNotIn("not-recorded", json.dumps(snapshot))
        self.assertNotEqual(lookups[0][1], main_thread)
        finish.set()
        await task
        await self.monitor.publish()
        completed = (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["requests"][0]
        self.assertEqual(completed["request_id"], row["request_id"])
        self.assertEqual((completed["status"], completed["http_status"]), ("completed", 201))
        self.assertEqual(completed["location"], row["location"])
        self.assertGreaterEqual(completed["left_at"], completed["entered_at"])
        self.assertGreaterEqual(completed["duration_ms"], 0)
        self.assertEqual(len(lookups), 1)
        from SYSTEM.scripts.check_monitor import render

        output = render(
            await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"),
            requests=True,
        )
        self.assertIn("8.8.8.8", output)
        self.assertIn("Mountain View", output)

    async def test_proxy_headers_only_affect_trusted_peers(self):
        self.monitor.status = "running"

        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        async def send(_):
            pass

        wrapped = ProxyHeadersMiddleware(MonitorMiddleware(app), trusted_hosts="127.0.0.1,10.0.0.0/8")
        for peer, forwarded, expected in (
            ("203.0.113.9", "8.8.8.8", "203.0.113.9"),
            ("127.0.0.1", "8.8.8.8, 10.0.0.8", "8.8.8.8"),
        ):
            scope = self.scope()
            scope["client"] = (peer, 1234)
            scope["headers"] = [(b"x-forwarded-for", forwarded.encode())]
            await wrapped(scope, None, send)
            self.assertEqual(self.monitor.snapshot()["recent_requests"][-1]["ip_address"], expected)

    async def test_ipv6_private_and_unknown_locations_are_explicit(self):
        for raw, expected, state in (
            ("::ffff:8.8.8.8", "8.8.8.8", "unavailable"),
            ("2001:4860:4860::8888", "2001:4860:4860::8888", "unavailable"),
            ("127.0.0.1", "127.0.0.1", "non_public"),
            ("::1", "::1", "non_public"),
            ("::ffff:127.0.0.1", "127.0.0.1", "non_public"),
            ("10.0.0.1", "10.0.0.1", "non_public"),
            ("fd00::1", "fd00::1", "non_public"),
            ("testclient", None, "unknown"),
        ):
            scope = self.scope()
            scope["client"] = (raw, 1234)
            token = self.monitor.begin_request(scope)
            row = self.monitor.snapshot()["requests"][-1]
            self.assertEqual((row["ip_address"], row["geo_status"]), (expected, state))
            await self.monitor.publish()
            snapshot = await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor")
            event = next(item for item in snapshot["requests"] if item["request_id"] == row["request_id"])
            self.assertEqual(event["location"], "local" if state == "non_public" else None)
            self.assertTrue(all(event[key] is None for key in ("country_code", "region", "city")))
            self.monitor.end_request(token)

    async def test_real_bundled_geoip_lookup_is_local_and_public_only(self):
        from SYSTEM.tools.tools_geoip import GeoIpReader

        reader = GeoIpReader(
            Path(__file__).resolve().parents[1] / "SYSTEM" / "geoip" / "City.mmdb",
            prepare_database=GeoIpDatabaseImporter.prepare_bundle,
        )
        try:
            self.assertTrue(await asyncio.to_thread(reader.open))
            public = await asyncio.to_thread(reader.lookup, "8.8.8.8")
            self.assertEqual(public.geo_status, "resolved")
            self.assertEqual(len(public.country_code), 2)
            self.assertEqual(reader.lookup("127.0.0.1").geo_status, "non_public")
        finally:
            await asyncio.to_thread(reader.close)

    async def test_recent_request_buffer_is_bounded_and_expires_while_worker_lives(
        self,
    ):
        self.monitor.max_requests = 2
        for _ in range(3):
            token = self.monitor.begin_request(self.scope())
            self.monitor.end_request(token, http_status=200)
        snapshot = self.monitor.snapshot()
        self.assertEqual(len(snapshot["recent_requests"]), 2)
        self.assertEqual(snapshot["recent_dropped_total"], 1)
        self.assertTrue(snapshot["recent_details_truncated"])
        with patch(
            "SYSTEM.tools.tools_monitor.time.monotonic",
            return_value=time.monotonic() + 61,
        ):
            self.assertEqual(self.monitor.snapshot()["recent_requests"], [])

    async def test_ui_cards_match_three_inflight_two_busy_and_eighty_six_ms(self):
        self.monitor.status = "running"
        token = self.monitor.begin_request(self.scope())
        template = self.monitor.snapshot()["requests"][0]
        self.monitor.end_request(token)
        base = self.monitor.snapshot()
        now = time.time()
        workers = []
        for index, active in enumerate((2, 1, 0, 0)):
            worker = dict(
                base,
                pid=1000 + index,
                slot=index + 1,
                fresh=True,
                current=True,
                active_requests=active,
                requests=[],
                recent_requests=[],
            )
            for number in range(active):
                worker["requests"].append(
                    dict(
                        template,
                        request_id=f"active-{index}-{number}",
                        pid=worker["pid"],
                    )
                )
            workers.append(worker)
        for index, duration in enumerate((142, 92, 24)):
            workers[index]["recent_requests"].append(
                dict(
                    template,
                    request_id=f"done-{index}",
                    pid=workers[index]["pid"],
                    status="completed",
                    phase="finished",
                    http_status=200,
                    left_at=now,
                    duration_ms=duration,
                    elapsed_ms=duration,
                )
            )
        manager = {
            "instance_id": base["instance_id"],
            "run_id": base["run_id"],
            "status": "running",
            "fresh": True,
            "sampled_at": now,
            "expected_workers": 4,
            "restarts": 0,
            "slots": [{"slot": row["slot"], "pid": row["pid"]} for row in workers],
        }
        snapshot = {"workers": workers, "supervisors": [manager], "sampled_at": now}
        WorkerMonitor._build_ui_snapshot(snapshot, 60)
        summary = snapshot["summary"]
        self.assertEqual(
            (
                summary["active_requests"],
                summary["busy_workers"],
                summary["idle_workers"],
            ),
            (3, 2, 2),
        )
        self.assertEqual((summary["running_workers"], summary["expected_workers"]), (4, 4))
        self.assertEqual(
            (
                summary["recent_completed_requests"],
                summary["recent_average_duration_ms"],
            ),
            (3, 86),
        )
        self.assertEqual(summary["recent_max_duration_ms"], 142)
        self.assertEqual(summary["health"], "healthy")
        self.assertEqual(len(snapshot["requests"]), 6)
        workers[-1].update(status="stale", fresh=False)
        WorkerMonitor._build_ui_snapshot(snapshot, 60)
        self.assertEqual(snapshot["summary"]["health"], "unknown")
        self.assertFalse(snapshot["summary"]["active_requests_complete"])

    async def test_request_changes_are_batched_until_the_shared_cycle(self):
        self.monitor.interval = 0.1
        await self.monitor.start()
        await asyncio.sleep(0)
        token = self.monitor.begin_request(self.scope())
        self.monitor.end_request(token, http_status=200)
        await asyncio.sleep(0.02)
        rows = (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["requests"]
        self.assertEqual(rows, [])
        await asyncio.sleep(0.12)
        rows = (await WorkerMonitor.read_snapshot(self.cache, prefix="test:monitor"))["requests"]
        self.assertEqual(len(rows), 1)

    async def test_concurrent_requests_are_counts_and_finish_once(self):
        self.monitor.status = "running"
        release = asyncio.Event()

        async def app(scope, receive, send):
            await release.wait()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        async def send(_):
            pass

        middleware = MonitorMiddleware(app)
        tasks = [asyncio.create_task(middleware(self.scope(), None, send)) for _ in range(20)]
        await asyncio.sleep(0)
        self.assertEqual(self.monitor.snapshot()["active_requests"], 20)
        release.set()
        await asyncio.gather(*tasks)
        self.assertEqual(self.monitor.snapshot()["active_requests"], 0)
        self.assertEqual(self.monitor.completed_requests_total, 20)

    async def test_middleware_records_run_metrics_once_after_terminal_http_outcome(self):
        self.monitor.status = "running"
        outcomes = []
        self.monitor.request_metrics = SimpleNamespace(
            record=lambda **values: outcomes.append(values["failed"]), flush=AsyncMock()
        )

        async def send(_):
            pass

        for status in (200, 204, 302, 400, 404, 500):

            async def app(scope, receive, send):
                await send({"type": "http.response.start", "status": status, "headers": []})
                await send({"type": "http.response.body", "body": b"done"})
                raise RuntimeError("post-response work")

            with self.assertRaises(RuntimeError):
                await MonitorMiddleware(app)(self.scope(), None, send)
        self.assertEqual(outcomes, [False, False, False, True, True, True])
        self.assertEqual(self.monitor.completed_requests_total, 6)
        self.assertEqual(self.monitor.failed_requests_total, 3)
        self.monitor.request_metrics.flush.assert_not_awaited()

    async def test_streaming_finishes_at_last_body_before_background_work(self):
        self.monitor.status = "running"
        body = asyncio.Event()
        background = asyncio.Event()
        waiting = asyncio.Event()

        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"first", "more_body": True})
            waiting.set()
            await body.wait()
            await send({"type": "http.response.body", "body": b"last"})
            await background.wait()

        async def send(_):
            pass

        task = asyncio.create_task(MonitorMiddleware(app)(self.scope(), None, send))
        await waiting.wait()
        self.assertEqual(self.monitor.snapshot()["active_requests"], 1)
        body.set()
        await asyncio.sleep(0)
        self.assertEqual(self.monitor.snapshot()["active_requests"], 0)
        self.assertFalse(task.done())
        background.set()
        await task
        self.assertEqual(self.monitor.completed_requests_total, 1)

    async def test_cancellation_exception_and_exclusion_cleanup(self):
        self.monitor.status = "running"
        started = asyncio.Event()

        async def waiting(scope, receive, send):
            started.set()
            await asyncio.Event().wait()

        task = asyncio.create_task(MonitorMiddleware(waiting)(self.scope(), None, None))
        await started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(self.monitor.snapshot()["active_requests"], 0)
        self.assertEqual(self.monitor.failed_requests_total, 1)

        async def broken(scope, receive, send):
            raise RuntimeError("handler failure")

        with self.assertRaises(RuntimeError):
            await MonitorMiddleware(broken)(self.scope(), None, None)
        self.assertEqual(self.monitor.snapshot()["active_requests"], 0)

        async def excluded(scope, receive, send):
            self.assertEqual(self.monitor.snapshot()["active_requests"], 0)

        await MonitorMiddleware(excluded)(self.scope("/health"), None, None)
        self.assertEqual(self.monitor.completed_requests_total, 2)

    async def test_trailers_keep_request_active_until_last_trailer(self):
        self.monitor.status = "running"

        async def app(scope, receive, send):
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [],
                    "trailers": True,
                }
            )
            await send({"type": "http.response.body", "body": b"ok"})
            self.assertEqual(self.monitor.snapshot()["active_requests"], 1)
            await send({"type": "http.response.trailers", "headers": []})
            self.assertEqual(self.monitor.snapshot()["active_requests"], 0)

        async def send(_):
            pass

        await MonitorMiddleware(app)(self.scope(), None, send)

    async def test_outer_wrapper_captures_generated_500_without_double_counting(self):
        self.monitor.status = "running"
        app = FastAPI()
        app.state.monitor = self.monitor
        app.add_middleware(MonitorMiddleware)

        @app.get("/error")
        async def error():
            raise RuntimeError("test handler failure")

        wrapped = MonitorMiddleware(app, state=app.state)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=wrapped, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            self.assertEqual((await client.get("/error")).status_code, 500)
        snapshot = self.monitor.snapshot()
        self.assertEqual(snapshot["completed_requests_total"], 1)
        self.assertEqual(snapshot["active_requests"], 0)
        self.assertEqual(snapshot["recent_requests"][0]["http_status"], 500)
        self.assertEqual(snapshot["recent_requests"][0]["status"], "completed")

    async def test_application_io_error_and_client_disconnect_are_distinct(self):
        self.monitor.status = "running"

        async def failed_application(scope, receive, send):
            raise OSError("application storage failed")

        with self.assertRaises(OSError):
            await MonitorMiddleware(failed_application)(self.scope(), None, None)
        self.assertEqual(self.monitor.snapshot()["recent_requests"][-1]["status"], "error")

        async def disconnected(scope, receive, send):
            await receive()

        async def receive():
            return {"type": "http.disconnect"}

        await MonitorMiddleware(disconnected)(self.scope(), receive, None)
        self.assertEqual(self.monitor.snapshot()["recent_requests"][-1]["status"], "disconnected")


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.supervisor = object.__new__(MonitorSupervisor)
        self.supervisor._monitor_lock = threading.RLock()
        self.supervisor._slots = {}
        self.supervisor._retired = {}
        self.supervisor._restarts = 0
        self.supervisor._reloads = 0
        self.supervisor.processes = [SimpleNamespace(pid=100 + number, exitcode=None) for number in range(4)]
        self.supervisor._observe([], "initial")

    def test_native_replacement_counts_once_and_preserves_slot(self):
        before = self.supervisor.processes[1]

        def replace(supervisor):
            before.exitcode = -9
            supervisor.processes[1] = SimpleNamespace(pid=201, exitcode=None)

        with patch.object(Multiprocess, "keep_subprocess_alive", replace):
            self.supervisor.keep_subprocess_alive()
        current = list(self.supervisor.processes)
        self.supervisor._observe(current, "unexpected")
        self.assertEqual(self.supervisor._restarts, 1)
        self.assertEqual(self.supervisor._slots[2]["restarts"], 1)
        self.assertEqual(self.supervisor._slots[2]["exit_code"], -9)
        self.assertEqual(self.supervisor._slots[2]["previous_pid"], 101)
        self.assertIn(101, self.supervisor._retired)

    def test_planned_reload_and_scaling_are_separate(self):
        def reload(supervisor):
            supervisor.processes = [SimpleNamespace(pid=300 + i, exitcode=None) for i in range(4)]

        with patch.object(Multiprocess, "restart_all", reload):
            self.supervisor.restart_all()
        self.assertEqual(self.supervisor._restarts, 0)
        self.assertEqual(self.supervisor._reloads, 4)
        before = list(self.supervisor.processes)
        self.supervisor.processes.pop()
        self.supervisor._observe(before, "scale_down")
        before = list(self.supervisor.processes)
        self.supervisor.processes.append(SimpleNamespace(pid=999, exitcode=None))
        self.supervisor._observe(before, "scale_up")
        self.assertEqual(self.supervisor._slots[4]["restarts"], 0)
        self.assertEqual(self.supervisor._slots[4]["reloads"], 0)

    def test_launcher_context_restores_environment_on_failure(self):
        with patch.dict(os.environ, {ENV_RUN: "previous"}):
            with self.assertRaises(ValueError):
                with WorkerMonitor.supervise(workers=4, storage_factory=lambda: None):
                    self.assertNotEqual(os.environ[ENV_RUN], "previous")
                    raise ValueError("startup failed")
            self.assertEqual(os.environ[ENV_RUN], "previous")


def create_test_app():
    """Only the explicit integration launcher imports this ASGI fixture."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    sessions = async_sessionmaker(engine)

    @asynccontextmanager
    async def lifespan(app):
        from SYSTEM.tools.tools_geoip import GeoIpReader

        reader = GeoIpReader(
            Path(__file__).resolve().parents[1] / "SYSTEM" / "geoip" / "City.mmdb",
            prepare_database=GeoIpDatabaseImporter.prepare_bundle,
        )
        await asyncio.to_thread(reader.open)
        redis = Redis.from_url(os.environ["MONITOR_TEST_REDIS_URL"])
        monitor = WorkerMonitor(
            # Retain crash evidence beyond Uvicorn's process health-check/restart
            # window; a 4s TTL can expire before the replacement starts.
            RedisAsync(redis=redis),
            transactions=SqlAlchemyTransactionObserver(engine, ignore_key="system.monitor.ignore"),
            geoip_reader=reader,
            interval=0.1,
            heartbeat=2,
            retention=15,
        )
        app.state.monitor = monitor
        await monitor.start()
        try:
            yield
        finally:
            await monitor.stop()
            await asyncio.to_thread(reader.close)
            await redis.aclose()
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(MonitorMiddleware, exclude=("/snapshot",))

    @app.get("/snapshot")
    async def snapshot():
        return app.state.monitor.snapshot()

    @app.get("/hold")
    async def hold(delay: float = 2):
        async with sessions.begin() as session:
            await session.execute(text("select 1"))
            await asyncio.sleep(delay)
        return {"pid": os.getpid()}

    @app.get("/stream")
    async def stream():
        async def chunks():
            yield b"first\n"
            await asyncio.sleep(10)
            yield b"last\n"

        return StreamingResponse(chunks())

    @app.get("/error")
    async def error():
        raise RuntimeError("isolated handler failure")

    return MonitorMiddleware(app, state=app.state, exclude=("/snapshot",))


def _serve_test_workers(url, prefix, port):
    import uvicorn
    from SYSTEM.constants import EnumCache
    from SYSTEM.settings import CACHE_CONF

    parsed = urlparse(url)
    CACHE_CONF[EnumCache.SYS].update(HOST=parsed.hostname, PORT=parsed.port, DB=int(parsed.path.lstrip("/") or "0"))
    os.environ["MONITOR_TEST_REDIS_URL"] = url
    with WorkerMonitor.supervise(
        workers=4,
        instance_id="isolated-test",
        prefix=prefix,
        storage_factory=lambda: RedisSync.from_config(CACHE_CONF[EnumCache.SYS]),
        interval=0.1,
    ):
        uvicorn.run(
            app=f"{create_test_app.__module__}:{create_test_app.__name__}",
            factory=True,
            workers=4,
            host="127.0.0.1",
            port=port,
            log_level="critical",
            timeout_graceful_shutdown=2,
        )


@unittest.skipUnless(os.environ.get("MONITOR_TEST_REDIS_URL"), "Set an isolated MONITOR_TEST_REDIS_URL.")
class RedisProcessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.url = os.environ["MONITOR_TEST_REDIS_URL"]
        self.redis = Redis.from_url(self.url, socket_timeout=2, retry=Retry(NoBackoff(), 0))
        self.cache = RedisAsync(redis=self.redis)
        self.prefix = f"monitor-test:{uuid4().hex}"
        self.server = None
        self.http = None

    async def asyncTearDown(self):
        if self.http is not None:
            await self.http.aclose()
        if self.server is not None:
            self.server.terminate()
            await asyncio.to_thread(self.server.join, 12)
            if self.server.is_alive():
                self.server.kill()
                await asyncio.to_thread(self.server.join, 5)
        keys = [key async for key in self.redis.scan_iter(match=f"{self.prefix}:*")]
        if keys:
            await self.redis.delete(*keys)
        await self.redis.aclose()

    async def until(self, predicate, timeout=20):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            snapshot = await WorkerMonitor.read_snapshot(self.cache, prefix=self.prefix)
            if predicate(snapshot):
                return snapshot
            await asyncio.sleep(0.1)
        self.fail("Timed out waiting for isolated monitoring state.")

    async def test_run_metrics_sum_workers_retry_safely_and_reset_only_on_new_run(self):
        from APPs.Monitor.module import MonitorRequestMetrics

        def metric(boot, process):
            value = MonitorRequestMetrics(
                cache=self.cache,
                instance_id="isolated",
                run_id=boot,
                process_uid=process,
            )
            value.key = f"{self.prefix}:request-metrics:{boot}"
            return value

        workers = [metric("first-boot", f"worker-{index}") for index in range(4)]
        for worker in workers:
            for _ in range(10):
                worker.record(failed=False)
            for _ in range(3):
                worker.record(failed=True)
        await asyncio.gather(*(worker.flush() for worker in workers))
        result = await workers[0].read()
        self.assertEqual((result["total"], result["successful"], result["failed"]), (52, 40, 12))
        for worker in workers:
            worker._flushed = None
        await asyncio.gather(*(worker.flush() for worker in workers))
        self.assertEqual((await workers[0].read())["total"], 52)
        replacement = metric("first-boot", "replacement")
        replacement.record(failed=False)
        replacement.record(failed=True)
        await replacement.flush()
        self.assertEqual((await replacement.read())["total"], 54)
        new_boot = metric("second-boot", "worker-1")
        await new_boot.flush()
        self.assertEqual((await new_boot.read())["total"], 0)
        self.assertEqual((await replacement.read())["total"], 54)
        self.assertGreater(await self.cache.ttl(new_boot.key), 0)

    async def test_real_redis_heartbeat_retention_and_terminal_record(self):
        monitor = WorkerMonitor(self.cache, prefix=self.prefix, interval=0.1, heartbeat=1, retention=3)
        monitor.status = "running"
        await monitor.publish()
        worker_key = f"{self.prefix}:worker:{monitor.run_id}:{monitor.process_uid}"
        self.assertGreater(await self.redis.ttl(worker_key), 0)
        cli = await asyncio.to_thread(
            subprocess.run,
            [
                sys.executable,
                "-m",
                "SYSTEM.scripts.check_monitor",
                "--json",
                "--prefix",
                self.prefix,
                "--redis-url",
                self.url,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(cli.returncode, 0, cli.stderr)
        self.assertEqual(json.loads(cli.stdout)["workers"][0]["pid"], os.getpid())
        await asyncio.sleep(1.1)
        row = (await WorkerMonitor.read_snapshot(self.cache, prefix=self.prefix))["workers"][0]
        self.assertEqual(row["status"], "stale")
        await asyncio.sleep(2.1)
        self.assertEqual(
            (await WorkerMonitor.read_snapshot(self.cache, prefix=self.prefix))["workers"],
            [],
        )
        await monitor.stop()
        row = (await WorkerMonitor.read_snapshot(self.cache, prefix=self.prefix))["workers"][0]
        self.assertEqual(row["status"], "stopped")

    async def test_four_workers_busy_transactions_crash_reload_and_scale(self):
        with socket.socket() as available:
            available.bind(("127.0.0.1", 0))
            port = available.getsockname()[1]
        self.server = multiprocessing.get_context("spawn").Process(
            target=_serve_test_workers, args=(self.url, self.prefix, port)
        )
        self.server.start()
        self.http = httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=15)
        first = await self.until(
            lambda s: len([r for r in s["workers"] if r["status"] == "running"]) == 4
            and len(s["supervisors"]) == 1
            and len(s["supervisors"][0]["slots"]) == 4
        )
        self.assertEqual({r["slot"] for r in first["workers"]}, {1, 2, 3, 4})
        self.assertTrue(all(r["restarts"] == 0 for r in first["workers"]))
        self.assertEqual(first["summary"]["health"], "healthy")
        self.assertEqual(first["supervisors"][0]["server"]["port"], port)
        work = [
            asyncio.create_task(self.http.get("/hold", params={"delay": 2}, headers={"x-forwarded-for": "8.8.8.8"}))
            for _ in range(3)
        ]
        busy = await self.until(
            lambda s: s["summary"]["active_requests"] == 3
            and s["summary"]["active_transactions"] == 3
            and len([r for r in s["requests"] if r["status"] == "processing" and r["geo_status"] == "resolved"]) == 3
        )
        self.assertTrue(any(row["busy"] for row in busy["workers"]))
        pending = [row for row in busy["requests"] if row["status"] == "processing"]
        self.assertEqual(len({row["request_id"] for row in pending}), 3)
        self.assertTrue(all(row["ip_address"] == "8.8.8.8" and row["country_code"] for row in pending))
        self.assertTrue(all(row["slot"] in (1, 2, 3, 4) for row in pending))
        self.assertTrue(all(response.status_code == 200 for response in await asyncio.gather(*work)))
        await self.until(lambda s: all(r["active_requests"] == r["active_transactions"] == 0 for r in s["workers"]))
        done = await self.until(lambda s: s["summary"]["recent_completed_requests"] == 3)
        self.assertEqual(done["summary"]["recent_http_2xx"]["count"], 3)
        self.assertEqual((await self.http.get("/error")).status_code, 500)
        failed = await self.until(lambda s: any(row["http_status"] == 500 for row in s["requests"]))
        self.assertEqual(failed["summary"]["recent_http_2xx"]["count"], 3)
        async with self.http.stream("GET", "/stream") as response:
            async for chunk in response.aiter_bytes():
                self.assertIn(b"first", chunk)
                break
        await self.until(lambda s: all(r["active_requests"] == 0 for r in s["workers"]))
        crash_work = asyncio.create_task(self.http.get("/hold", params={"delay": 10}))
        crashing = await self.until(
            lambda s: any(row["status"] == "processing" and row["path"] == "/hold" for row in s["requests"])
        )
        interrupted = next(
            row for row in crashing["requests"] if row["status"] == "processing" and row["path"] == "/hold"
        )
        victim = next(row for row in crashing["workers"] if row["pid"] == interrupted["pid"])
        os.kill(victim["pid"], signal.SIGKILL)
        with self.assertRaises(httpx.RemoteProtocolError):
            await crash_work
        replacement = await self.until(
            lambda s: any(
                r.get("slot") == victim["slot"] and r["pid"] != victim["pid"] and r["restarts"] == 1
                for r in s["workers"]
            )
        )
        self.assertEqual(replacement["supervisors"][0]["restarts"], 1)
        retired = next(row for row in replacement["workers"] if row["pid"] == victim["pid"])
        self.assertEqual(retired["status"], "exited")
        self.assertFalse(retired["busy"])
        event = next(row for row in replacement["requests"] if row["request_id"] == interrupted["request_id"])
        self.assertEqual(event["status"], "interrupted")
        self.assertIsNone(event["http_status"])
        os.kill(self.server.pid, signal.SIGHUP)
        reloaded = await self.until(lambda s: s["supervisors"][0]["reloads"] == 4, timeout=30)
        self.assertEqual(reloaded["supervisors"][0]["restarts"], 1)
        os.kill(self.server.pid, signal.SIGTTIN)
        await self.until(
            lambda s: s["supervisors"][0]["expected_workers"] == 5
            and len([r for r in s["workers"] if r["status"] == "running"]) == 5
        )
        os.kill(self.server.pid, signal.SIGTTOU)
        scaled = await self.until(lambda s: s["supervisors"][0]["expected_workers"] == 4)
        self.assertEqual(scaled["supervisors"][0]["restarts"], 1)
