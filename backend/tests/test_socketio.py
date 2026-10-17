"""Conventional event loading and an isolated, optional four-worker Socket.IO probe.

SOCKETIO_TEST_REDIS_URL must point to disposable Redis. Real-process tests use a
random channel/key prefix and test-only commands; configured SQL/Redis are not used.
"""

import asyncio
import importlib
import json
import multiprocessing
import os
import signal
import socket
import sys
import tempfile
import time
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import httpx
import psutil
import socketio
from fastapi import FastAPI
from redis.asyncio import Redis
from socketio import packet
from websockets.asyncio.client import connect as websocket_connect

from COMMON.tools.storage.redis import RedisAsync
from SYSTEM.constants import EnumSess

from SYSTEM.tools.tools_socketio import (
    socketio_include_events,
    socketio_init_app,
    socketio_shutdown,
)
from SYSTEM.tools.tools_monitor import MonitorStream, WorkerMonitor


class StreamContractTests(unittest.TestCase):
    def test_clock_changes_are_ignored_but_state_and_resource_changes_are_not(self):
        value = {
            "data": {
                "workers": [{"pid": 1, "sampled_at": 1, "uptime_seconds": 1, "cpu_percent": 2}],
                "requests": [{"elapsed_ms": 5, "status": "processing"}],
            }
        }
        changed = json.loads(json.dumps(value))
        changed["data"]["workers"][0].update(sampled_at=10, uptime_seconds=10)
        changed["data"]["requests"][0]["elapsed_ms"] = 50
        self.assertEqual(MonitorStream.fingerprint(value), MonitorStream.fingerprint(changed))
        changed["data"]["workers"][0]["cpu_percent"] = 3
        self.assertNotEqual(MonitorStream.fingerprint(value), MonitorStream.fingerprint(changed))


@unittest.skipUnless(os.environ.get("SOCKETIO_TEST_REDIS_URL"), "Requires isolated Redis")
class StreamRedisTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.redis = Redis.from_url(os.environ["SOCKETIO_TEST_REDIS_URL"])
        self.prefix = f"socket-stream-test:{uuid4().hex}"
        self.monitor = WorkerMonitor(
            RedisAsync(redis=self.redis),
            prefix=self.prefix,
            interval=0.1,
            heartbeat=2,
            retention=4,
        )
        self.monitor.single_worker = True
        self.monitor.status = "running"
        self.server = SimpleNamespace(
            emit=AsyncMock(),
            enter_room=AsyncMock(),
            leave_room=AsyncMock(),
            disconnect=AsyncMock(),
        )
        self.authorize = AsyncMock(return_value=1)
        self.stream = MonitorStream(self.monitor, self.server, authorize=self.authorize)
        await self.monitor.publish()

    async def asyncTearDown(self):
        await self.stream.stop()
        await self.monitor.stop()
        keys = [key async for key in self.redis.scan_iter(match=f"{self.prefix}*")]
        if keys:
            await self.redis.delete(*keys)
        await self.redis.aclose()

    async def test_initial_snapshot_quiet_cycles_and_request_change(self):
        self.assertTrue(await self.stream.connect("one", {}))
        self.assertTrue((await self.stream.subscribe("one", ["requests"]))["ok"])
        initial = self.server.emit.call_args.args[1]
        self.assertEqual(initial["data"]["requests"], [])
        self.assertEqual(initial["revision"], "0")
        await self.stream.tick()
        first_revision = int(self.server.emit.call_args.args[1]["revision"])
        self.server.emit.reset_mock()
        await self.stream.tick()
        self.server.emit.assert_not_awaited()
        token = self.monitor.begin_request({"method": "GET", "path": "/slow", "client": ("127.0.0.1", 12)})
        await self.monitor.publish()
        await self.stream.tick()
        self.assertGreater(int(self.server.emit.call_args.args[1]["revision"]), first_revision)
        self.server.emit.reset_mock()
        await asyncio.sleep(0.01)
        await self.monitor.publish()  # CPU/clock changes cannot update the request topic.
        await self.stream.tick()
        self.server.emit.assert_not_awaited()
        self.monitor.end_request(token, http_status=200)
        await self.monitor.publish()
        await self.stream.tick()
        self.assertEqual(
            self.server.emit.call_args.args[1]["data"]["summary"]["recent_completed_requests"],
            1,
        )

    async def test_single_publisher_takeover_and_stale_owner_cannot_commit(self):
        await self.stream.connect("one", {})
        await self.stream.subscribe("one", ["requests"])
        await self.stream.tick()
        second_server = SimpleNamespace(emit=AsyncMock())
        second = MonitorStream(self.monitor, second_server)
        await second.tick()
        second_server.emit.assert_not_awaited()
        await self.stream.stop()
        # Restore presence from a surviving remote worker before it takes over.
        await self.redis.zadd(f"{second.prefix}:watch:requests", {"remote-worker": time.time() + 5})
        await second.tick()
        second_server.emit.assert_awaited_once()
        refused = await self.redis.eval(
            MonitorStream._COMMIT,
            3,
            f"{second.prefix}:lease",
            f"{second.prefix}:hash:requests",
            f"{second.prefix}:revision",
            self.stream.owner,
            "different",
            4,
            "1",
        )
        self.assertIsNone(refused)
        await second.stop()

    async def test_permissions_rechecked_during_quiet_cycles_and_fail_closed(self):
        self.authorize.return_value = None
        self.assertFalse(await self.stream.connect("guest", {}))
        self.authorize.return_value = 1
        await self.stream.connect("one", {})
        await self.stream.subscribe("one", ["requests"])
        self.authorize.return_value = None
        await self.stream.tick()
        self.server.disconnect.assert_awaited_once_with("one", namespace="/monitor", ignore_queue=True)
        self.assertNotIn("one", self.stream.connections)

    async def test_current_single_worker_run_excludes_previous_run_events(self):
        old = WorkerMonitor(RedisAsync(redis=self.redis), prefix=self.prefix)
        old.instance_id = self.monitor.instance_id
        old.single_worker = True
        old.run_id = "previous-run"
        old.started_at -= 100
        old.status = "running"
        token = old.begin_request({"method": "GET", "path": "/old"})
        old.end_request(token, http_status=200)
        await old.publish()
        snapshot = await self.stream._read()
        self.assertEqual(snapshot["summary"]["running_workers"], 1)
        self.assertEqual(snapshot["summary"]["recent_completed_requests"], 0)
        self.assertEqual(snapshot["requests"], [])

    async def test_real_session_reload_and_database_role_revocation(self):
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from SYSTEM.models import AuthRole, AuthUser
        from APPs.Auth.module import AuthModule
        from APPs.Sys.events_monitor import authorize_monitor
        from SYSTEM.tools.tools_socketio import socketio_session_request

        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda sync: AuthRole.metadata.create_all(sync, tables=[AuthRole.__table__, AuthUser.__table__])
            )
        async with sessions.begin() as session:
            role = AuthRole(role="monitor-test", is_manage_sites=True)
            session.add(role)
            await session.flush()
            user = AuthUser(user="monitor_test", email="monitor@portfolio.test", role_id=role.id)
            await user.set_password("Monitor-test-password-2026")
            session.add(user)
            await session.flush()
            identity = {
                "id": user.id,
                EnumSess.AUTH_IDENTITY: AuthModule.session_identity(user.id, user.password),
            }
            uid, rid = user.id, role.id
        sid = uuid4().hex
        key = f"sess:{sid}"
        await self.redis.set(key, json.dumps(identity), ex=30)
        environ = {
            "asgi.scope": {
                "type": "websocket",
                "path": "/socket.io/",
                "headers": [(b"cookie", f"session_id={sid}".encode())],
                "query_string": b"",
            }
        }
        manager = SimpleNamespace(get_cache=lambda **_: self.redis, get_db=sessions)
        try:
            with patch("APPs.Sys.events_monitor.CONN_MANAGER", manager):
                self.assertEqual(await authorize_monitor(environ), uid)
                async with sessions.begin() as session:
                    (await session.get(AuthRole, rid)).is_manage_sites = False
                self.assertIsNone(await authorize_monitor(environ))
                await self.redis.delete(key)
                # A new handler observes logout; the socket never retains SESSION data.
                request = await socketio_session_request(
                    environ, self.redis, {"cookie_name": "session_id", "lifetime": 1800}
                )
                self.assertEqual(request.session, {})
        finally:
            await self.redis.delete(key)
            await engine.dispose()


class DiscoveryTests(unittest.TestCase):
    def test_full_package_names_relative_imports_order_and_import_cache(self):
        name = f"eventfixture_{uuid4().hex}"
        with tempfile.TemporaryDirectory() as directory, patch.object(sys, "path", [directory, *sys.path]):
            root = Path(directory)
            project = root / name / "Project"
            project.mkdir(parents=True)
            (project.parent / "__init__.py").write_text("loads = []\n")
            (project / "__init__.py").write_text("")
            (project / "helper.py").write_text("TOKEN = 'relative import works'\n")
            body = f"from {name} import loads\nfrom .helper import TOKEN\nloads.append(__name__)\n"
            for filename in ("events_z.py", "events_a.py"):
                (project / filename).write_text(body)
            (project / "chat_events.py").write_text("raise AssertionError('not a prefix match')\n")
            try:
                expected = (f"{name}.Project.events_a", f"{name}.Project.events_z")
                self.assertEqual(socketio_include_events(name, project_root=root), expected)
                self.assertEqual(socketio_include_events(name, project_root=root), expected)
                self.assertEqual(importlib.import_module(name).loads, list(expected))
                self.assertEqual(importlib.import_module(expected[0]).TOKEN, "relative import works")
            finally:
                for module in list(sys.modules):
                    if module == name or module.startswith(f"{name}."):
                        del sys.modules[module]

    def test_default_root_is_independent_of_working_directory(self):
        before = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                loaded = socketio_include_events("APPs")
            finally:
                os.chdir(before)
        self.assertIn("APPs.Sys.events_monitor", loaded)

    def test_missing_directory_and_invalid_prefix_fail_startup(self):
        with self.assertRaises(FileNotFoundError):
            socketio_include_events("missing-socket-event-directory")
        with self.assertRaises(ValueError):
            socketio_include_events("APPs", file_pattern="events*")

    def test_production_server_requires_websocket_and_has_scoped_channel(self):
        from SYSTEM.extension import sio

        self.assertEqual(sio.eio.transports, ["websocket"])
        self.assertNotEqual(sio.manager.channel, "socketio")
        self.assertIsNone(sio.manager.redis)


class EventTests(unittest.IsolatedAsyncioTestCase):
    async def test_storage_failure_is_unavailable_not_a_permission_rejection(self):
        from APPs.Sys import events_monitor
        from socketio.exceptions import ConnectionRefusedError

        server = SimpleNamespace(monitor_stream=SimpleNamespace(connect=AsyncMock(side_effect=OSError())))
        with patch.object(events_monitor, "sio", server), self.assertRaises(ConnectionRefusedError) as error:
            await events_monitor.connect("sid", {})
        self.assertEqual(error.exception.error_args["data"], {"code": "MONITOR_UNAVAILABLE"})

    async def test_test_event_replies_only_to_its_own_sid(self):
        from APPs.Sys import events_monitor

        server = SimpleNamespace(emit=AsyncMock(), transport=Mock(return_value="websocket"))
        server.monitor_stream = SimpleNamespace(connect=AsyncMock(return_value=True), disconnect=AsyncMock())
        with patch.object(events_monitor, "sio", server):
            self.assertTrue(await events_monitor.connect("sid-a", {}, {"token": "never echo"}))
            result = await events_monitor.monitor_test("sid-a", {"message": "probe"})
            await events_monitor.disconnect("sid-a", "test complete")
        self.assertEqual(
            result,
            {
                "ok": True,
                "message": "probe",
                "pid": os.getpid(),
                "sid": "sid-a",
                "transport": "websocket",
            },
        )
        server.emit.assert_awaited_once_with("monitor_test_result", result, to="sid-a", namespace="/monitor")

    async def test_invalid_test_data_never_echoes_extra_or_sensitive_fields(self):
        from APPs.Sys import events_monitor

        server = SimpleNamespace(emit=AsyncMock(), transport=Mock(return_value="websocket"))
        with patch.object(events_monitor, "sio", server):
            for data in (
                {"message": 123},
                {"message": "x" * 257},
                {"password": "not echoed"},
                [],
            ):
                self.assertEqual(
                    await events_monitor.monitor_test("sid", data),
                    {"ok": False, "error": "INVALID_PAYLOAD"},
                )

    async def test_transport_rejects_polling_and_falls_back_to_http_app(self):
        from SYSTEM.extension import sio

        app = FastAPI()

        @app.get("/ordinary")
        async def ordinary():
            return {"ordinary": True}

        wrapper = socketio_init_app(app, server=sio)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=wrapper), base_url="http://test") as client:
            self.assertEqual((await client.get("/ordinary")).json(), {"ordinary": True})
            self.assertEqual(
                (await client.get("/socket.io/?EIO=4&transport=polling")).status_code,
                400,
            )

    async def test_shutdown_stops_listener_before_closing_redis(self):
        order = []

        async def listen():
            try:
                await asyncio.Event().wait()
            finally:
                order.append("listener")

        async def close_pubsub():
            order.append("pubsub")

        async def close_redis():
            order.append("redis")

        task = asyncio.create_task(listen())
        await asyncio.sleep(0)
        manager = SimpleNamespace(
            thread=task,
            pubsub=SimpleNamespace(aclose=AsyncMock(side_effect=close_pubsub)),
            redis=SimpleNamespace(aclose=AsyncMock(side_effect=close_redis)),
        )
        await socketio_shutdown(SimpleNamespace(manager=manager, shutdown=AsyncMock()))
        self.assertTrue(task.cancelled())
        self.assertEqual(order, ["listener", "pubsub", "redis"])


def create_test_app():
    """Use actual auto-discovered events, isolated Redis and test-only commands."""
    import SYSTEM.extension as extension

    channel = os.environ["SOCKETIO_TEST_CHANNEL"]
    url = os.environ["SOCKETIO_TEST_REDIS_URL"]
    server = socketio.AsyncServer(
        async_mode="asgi",
        transports=["websocket"],
        client_manager=socketio.AsyncRedisManager(url, channel=channel),
    )
    extension.sio = server

    @asynccontextmanager
    async def lifespan(app):
        from SYSTEM.tools.tools_monitor import WorkerMonitor, MonitorStream

        redis = Redis.from_url(url)
        key = f"{channel}:worker:{os.getpid()}"
        await redis.set(key, "1", ex=60)
        # The stream lease is at least 5s; request evidence must outlive a killed
        # publisher's lease so its successor can deliver it after takeover.
        monitor = WorkerMonitor(
            RedisAsync(redis=redis),
            prefix=f"{channel}:metrics",
            interval=0.1,
            heartbeat=2,
            retention=15,
        )

        async def authorize(_):
            return 1  # This isolated fixture has no configured identity database.

        server.monitor_stream = MonitorStream(monitor, server, authorize=authorize)
        await monitor.start()
        await server.monitor_stream.start()

        async def commands():
            while True:
                command = await redis.blpop(f"{channel}:command:{os.getpid()}", timeout=1)
                if command is not None:
                    value = json.loads(command[1])
                    if value.get("action") == "request":
                        token = monitor.begin_request(
                            {
                                "method": "GET",
                                "path": "/cross-worker",
                                "client": ("127.0.0.1", 1),
                            }
                        )
                        monitor.end_request(token, http_status=200)
                        continue
                    sid = value["sid"]
                    await server.emit(
                        "monitor_test_result",
                        {"from_pid": os.getpid(), "message": "cross-worker"},
                        to=sid,
                        namespace="/monitor",
                    )

        task = asyncio.create_task(commands())
        try:
            yield
        finally:
            await server.monitor_stream.stop()
            server.monitor_stream = None
            await monitor.stop()
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            await socketio_shutdown(server)
            await redis.delete(key)
            await redis.aclose()

    app = FastAPI(lifespan=lifespan)

    return socketio_init_app(app, server=server)


def serve_test_workers(url, channel, port):
    import uvicorn

    os.environ["SOCKETIO_TEST_REDIS_URL"] = url
    os.environ["SOCKETIO_TEST_CHANNEL"] = channel
    uvicorn.run(
        app=f"{create_test_app.__module__}:{create_test_app.__name__}",
        factory=True,
        host="127.0.0.1",
        port=port,
        workers=4,
        log_level="critical",
        timeout_graceful_shutdown=2,
    )


class ProbeClient:
    """Use the installed Socket.IO packet codec over a real WebSocket transport."""

    async def open(self, url):
        self.socket = await websocket_connect(url, proxy=None, close_timeout=1)
        self.sequence = 0
        opening = await asyncio.wait_for(self.socket.recv(), 3)
        if not opening.startswith("0"):
            raise AssertionError(f"Expected Engine.IO OPEN, got {opening!r}")
        await self.socket.send("4" + packet.Packet(packet.CONNECT, namespace="/monitor", data={}).encode())
        joined = await self.receive()
        if joined.packet_type != packet.CONNECT:
            raise AssertionError("Namespace connection was not accepted")
        self.sid = joined.data["sid"]
        return self

    async def receive(self, timeout=3):
        while True:
            frame = await asyncio.wait_for(self.socket.recv(), timeout)
            if frame == "2":
                await self.socket.send("3")
            elif frame.startswith("4"):
                return packet.Packet(encoded_packet=frame[1:])

    async def probe(self, message):
        self.sequence += 1
        await self.socket.send(
            "4"
            + packet.Packet(
                packet.EVENT,
                namespace="/monitor",
                id=self.sequence,
                data=["monitor_test", {"message": message}],
            ).encode()
        )
        result = None
        while True:
            response = await self.receive()
            if response.packet_type == packet.EVENT:
                if response.data[0] != "monitor_test_result":
                    raise AssertionError("Unexpected probe event")
                result = response.data[1]
            elif response.packet_type == packet.ACK and response.id == self.sequence:
                if response.data != [result]:
                    raise AssertionError("ACK and named result differ")
                return result

    async def close(self):
        await self.socket.close()


@unittest.skipUnless(
    os.environ.get("SOCKETIO_TEST_REDIS_URL"),
    "Set an isolated SOCKETIO_TEST_REDIS_URL.",
)
class ProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_four_workers_stickiness_cross_worker_redis_and_reconnect(self):
        url = os.environ["SOCKETIO_TEST_REDIS_URL"]
        channel = f"socketio-test:{uuid4().hex}"
        redis = Redis.from_url(url)
        with socket.socket() as free_port:
            free_port.bind(("127.0.0.1", 0))
            port = free_port.getsockname()[1]
        server = multiprocessing.get_context("spawn").Process(target=serve_test_workers, args=(url, channel, port))
        clients = []
        server.start()
        try:

            async def worker_pids():
                return {
                    int(key.decode().rsplit(":", 1)[1]) async for key in redis.scan_iter(match=f"{channel}:worker:*")
                }

            async def until(predicate):
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    value = await worker_pids()
                    if predicate(value):
                        return value
                    await asyncio.sleep(0.1)
                self.fail("Isolated Socket.IO worker startup timed out")

            initial = await until(lambda pids: len(pids) == 4)
            socket_url = f"ws://127.0.0.1:{port}/socket.io/?EIO=4&transport=websocket"
            first = await ProbeClient().open(socket_url)
            clients.append(first)
            result = await first.probe("first")
            self.assertTrue(result["ok"])
            self.assertEqual(result["transport"], "websocket")
            self.assertEqual(result["sid"], first.sid)
            pid = result["pid"]
            self.assertIn(pid, initial)
            for index in range(5):
                self.assertEqual((await first.probe(str(index)))["pid"], pid)
            second = await ProbeClient().open(socket_url)
            clients.append(second)
            self.assertNotEqual(second.sid, first.sid)
            await second.probe("second")
            sender_pid = next(other for other in initial if other != pid)
            await redis.rpush(f"{channel}:command:{sender_pid}", json.dumps({"sid": first.sid}))
            pushed = await first.receive()
            self.assertEqual(
                pushed.data,
                [
                    "monitor_test_result",
                    {"from_pid": sender_pid, "message": "cross-worker"},
                ],
            )
            self.assertNotEqual(sender_pid, pid)
            with self.assertRaises(TimeoutError):
                await asyncio.wait_for(second.receive(), 0.15)
            os.kill(pid, signal.SIGKILL)
            await asyncio.wait_for(first.socket.wait_closed(), 5)
            await until(lambda pids: bool(pids - initial))
            reconnected = await ProbeClient().open(socket_url)
            clients.append(reconnected)
            self.assertNotEqual(reconnected.sid, first.sid)
            self.assertNotEqual((await reconnected.probe("reconnected"))["pid"], pid)
            await reconnected.socket.send(
                "4"
                + packet.Packet(
                    packet.EVENT,
                    namespace="/monitor",
                    id=99,
                    data=["monitor_subscribe", {"topics": ["requests"]}],
                ).encode()
            )
            acknowledged, observed = False, False
            for _ in range(12):
                response = await reconnected.receive()
                if response.packet_type == packet.ACK and response.id == 99:
                    acknowledged = response.data[0]["ok"]
                if response.packet_type == packet.EVENT and response.data[0] == "monitor_snapshot":
                    observed = len(response.data[1]["data"]["workers"]) >= 4
                if acknowledged and observed:
                    break
            self.assertTrue(acknowledged and observed)
            await redis.rpush(f"{channel}:command:{sender_pid}", json.dumps({"action": "request"}))
            found = False
            # A killed stream leader retains its 5s Redis lease. Wait for real
            # takeover rather than treating a healthy successor as a timeout.
            async with asyncio.timeout(12):
                while not found:
                    response = await reconnected.receive(timeout=12)
                    if response.packet_type == packet.EVENT and response.data[0] == "monitor_snapshot":
                        found = any(
                            row["path"] == "/cross-worker" and row["pid"] == sender_pid
                            for row in response.data[1]["data"].get("requests", [])
                        )
            self.assertTrue(found)
        finally:
            for client in clients:
                await client.close()
            children = psutil.Process(server.pid).children(recursive=True) if server.is_alive() else []
            server.terminate()
            await asyncio.to_thread(server.join, 10)
            if server.is_alive():
                server.kill()
                await asyncio.to_thread(server.join, 5)
            for child in children:
                if child.is_running():
                    child.kill()
            keys = [key async for key in redis.scan_iter(match=f"{channel}:*")]
            if keys:
                await redis.delete(*keys)
            await redis.aclose()
