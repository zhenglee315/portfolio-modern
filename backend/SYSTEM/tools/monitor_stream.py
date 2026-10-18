"""Authorized Socket.IO subscriptions and cross-worker publication leases."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from contextlib import suppress
from uuid import uuid4
from redis.exceptions import RedisError
from SYSTEM.events import EventMonitor, NameSpace
from .monitor_contracts import LOGGER
from .monitor_worker import WorkerMonitor


class MonitorStream:
    """One publisher per instance, with process-local authorized Socket.IO subscribers.

    SYS Redis stores only expiring leases, presence and comparison state. The socket
    manager delivers rooms across workers; authorization is injected by APPs/Monitor.
    Slow consumers receive bounded snapshots, never an unbounded request event log.
    """

    NAMESPACE = NameSpace.MONITOR
    TOPICS = frozenset(("workers", "requests"))
    _LEASE = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            redis.call('PEXPIRE', KEYS[1], ARGV[2]); return 1
        end
        return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) and 1 or 0
    """
    _RELEASE = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
        return 0
    """
    _COMMIT = """
        if redis.call('GET', KEYS[1]) ~= ARGV[1] then return false end
        if redis.call('GET', KEYS[2]) == ARGV[2] and ARGV[4] ~= '1' then
            redis.call('EXPIRE', KEYS[2], ARGV[3]); return false
        end
        local clock = redis.call('TIME')
        local rev = math.max(tonumber(clock[1])*1000000 + tonumber(clock[2]),
                             tonumber(redis.call('GET', KEYS[3]) or '0') + 1)
        redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
        redis.call('SET', KEYS[3], string.format('%.0f', rev), 'EX', ARGV[3])
        return string.format('%.0f', rev)
    """

    def __init__(self, monitor: WorkerMonitor, server, *, authorize=None):
        self.monitor, self.redis, self.server = monitor, monitor.redis, server
        self.authorize = authorize
        self.interval = monitor.interval
        self.owner = uuid4().hex
        identity = hashlib.sha256(monitor.instance_id.encode()).hexdigest()[:24]
        self.prefix = f"{monitor.prefix}:stream:{identity}"
        self.lease_ms = int(max(5, self.interval * 3) * 1000)
        self.connections: dict[str, dict] = {}
        self._task: asyncio.Task | None = None
        self._ready = asyncio.Event()
        self._leader = False
        self._unavailable = False
        self._last_tick = float("-inf")

    def room(self, topic: str) -> str:
        return f"{self.prefix}:{topic}"

    async def start(self) -> None:
        if self._task is not None:
            raise RuntimeError("Monitor stream already started.")
        self.monitor.on_publish = self._ready.set
        self._task = asyncio.create_task(self._loop(), name="monitor-stream")

    async def stop(self) -> None:
        self.monitor.on_publish = None
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        try:
            async with asyncio.timeout(1):
                for topic in self.TOPICS:
                    await self.redis.zrem(f"{self.prefix}:watch:{topic}", self.owner)
                await self.redis.eval(self._RELEASE, 1, f"{self.prefix}:lease", self.owner)
        except (RedisError, TimeoutError, OSError):
            pass  # Lease and presence expire if Redis is unavailable during shutdown.
        self.connections.clear()

    async def _identity(self, environ: dict):
        if self.authorize is None:
            return None
        async with asyncio.timeout(max(1.0, self.interval)):
            return await self.authorize(environ)

    async def connect(self, sid: str, environ: dict) -> bool:
        if len(self.connections) >= 128:
            # The event boundary maps availability failures to MONITOR_UNAVAILABLE.
            # A generic rejection is reserved for an absent or unauthorized identity.
            raise RuntimeError("Monitor connection capacity reached.")
        identity = await self._identity(environ)
        if identity is None:
            return False
        self.connections[sid] = {
            "environ": environ,
            "identity": identity,
            "topics": set(),
            "last_sync": 0.0,
        }
        return True

    async def disconnect(self, sid: str) -> None:
        self.connections.pop(sid, None)

    async def subscribe(self, sid: str, topics: list[str], *, resync=False) -> dict:
        if not topics or len(topics) > 2 or set(topics) - self.TOPICS or len(set(topics)) != len(topics):
            return {"ok": False, "error": "INVALID_PAYLOAD"}
        connection = self.connections.get(sid)
        if connection is None:
            return {"ok": False, "error": "AUTH_REQUIRED"}
        if await self._identity(connection["environ"]) != connection["identity"]:
            await self._revoke(sid)
            return {"ok": False, "error": "PERMISSION_DENIED"}
        requested = set(topics)
        now = time.monotonic()
        if requested == connection["topics"] and now - connection["last_sync"] < self.interval:
            return {"ok": True, "topics": sorted(requested)}
        # Read first: a failed subscription never joins a private room partially.
        snapshot = await self._read()
        for topic in connection["topics"] - requested:
            await self.server.leave_room(sid, self.room(topic), namespace=self.NAMESPACE)
        for topic in requested - connection["topics"]:
            await self.server.enter_room(sid, self.room(topic), namespace=self.NAMESPACE)
        connection["topics"] = requested
        connection["last_sync"] = now
        await self._presence()
        for topic in sorted(requested):
            await self.server.emit(
                EventMonitor.SNAPSHOT,
                self.payload(snapshot, topic),
                to=sid,
                namespace=self.NAMESPACE,
                ignore_queue=True,
            )
        return {"ok": True, "topics": sorted(requested)}

    async def unsubscribe(self, sid: str) -> dict:
        if connection := self.connections.get(sid):
            for topic in tuple(connection["topics"]):
                await self.server.leave_room(sid, self.room(topic), namespace=self.NAMESPACE)
            connection["topics"].clear()
            await self._presence()
        return {"ok": True}

    async def _revoke(self, sid: str, *, status="denied") -> None:
        self.connections.pop(sid, None)
        await self.server.emit(
            EventMonitor.STATUS,
            {"status": status},
            to=sid,
            namespace=self.NAMESPACE,
            ignore_queue=True,
        )
        await self.server.disconnect(sid, namespace=self.NAMESPACE, ignore_queue=True)

    async def _presence(self) -> set[str]:
        watched = set()
        now = time.time()
        for topic in sorted(self.TOPICS):
            key = f"{self.prefix}:watch:{topic}"
            async with await self.redis.pipeline() as pipe:
                if any(topic in connection["topics"] for connection in self.connections.values()):
                    pipe.zadd(key, {self.owner: now + self.lease_ms / 1000})
                    pipe.expire(key, self.monitor.retention)
                else:
                    pipe.zrem(key, self.owner)
                pipe.zremrangebyscore(key, "-inf", now)
                pipe.zcard(key)
                result = await pipe.execute()
            if result[-1]:
                watched.add(topic)
        return watched

    async def _read(self) -> dict:
        return await WorkerMonitor.read_snapshot(
            self.redis,
            prefix=self.monitor.prefix,
            instance_id=self.monitor.instance_id,
            window_seconds=self.monitor.retention,
        )

    def payload(self, snapshot: dict, topic: str) -> dict:
        common = (
            "instance_id",
            "run_id",
            "process_uid",
            "slot",
            "pid",
            "status",
            "fresh",
            "started_at",
        )
        extra = (
            (
                "cpu_percent",
                "rss_bytes",
                "uptime_seconds",
                "restarts",
                "reloads",
                "server",
                "sampled_at",
                "active_requests",
                "active_transactions",
                "completed_requests_total",
                "failed_requests_total",
                "publish_failures_total",
                "sample_error",
            )
            if topic == "workers"
            else ("active_requests", "active_transactions")
        )
        summary_keys = (
            (
                "running_workers",
                "expected_workers",
                "abnormal_workers",
                "unknown_workers",
                "health",
                "restarts",
            )
            if topic == "workers"
            else (
                "active_requests",
                "active_requests_complete",
                "active_transactions",
                "running_workers",
                "expected_workers",
                "busy_workers",
                "idle_workers",
                "transaction_busy_workers",
                "recent_completed_requests",
                "recent_average_duration_ms",
                "recent_max_duration_ms",
                "recent_http_2xx",
                "request_details_truncated",
            )
        )
        data = {
            "workers": [{key: row.get(key) for key in (*common, *extra)} for row in snapshot["current_workers"]],
            "summary": {key: snapshot["summary"][key] for key in summary_keys},
            "window_seconds": snapshot["request_window_seconds"],
            "health_basis": snapshot["health_basis"],
        }
        if topic == "requests":
            data["requests"] = snapshot["requests"]
        return {
            "schema": 1,
            "topic": topic,
            "revision": "0",
            "sampled_at": snapshot["sampled_at"],
            "cycle_seconds": self.interval,
            "data": data,
        }

    @staticmethod
    def fingerprint(payload: dict) -> str:
        # Clocks remain in transmitted snapshots as display anchors, but never
        # turn an otherwise unchanged observation into another socket update.
        clocks = {
            "sampled_at",
            "observed_at",
            "uptime_seconds",
            "elapsed_ms",
            "oldest_request_seconds",
            "oldest_transaction_seconds",
        }

        def stable(value):
            if isinstance(value, dict):
                return {key: stable(item) for key, item in value.items() if key not in clocks}
            if isinstance(value, list):
                return [stable(item) for item in value]
            return value

        raw = json.dumps(
            stable(payload["data"]),
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        return hashlib.sha256(raw.encode()).hexdigest()

    async def _status(self, status: str) -> None:
        for sid in tuple(self.connections):
            await self.server.emit(
                EventMonitor.STATUS,
                {"status": status},
                to=sid,
                namespace=self.NAMESPACE,
                ignore_queue=True,
            )

    async def tick(self) -> None:
        # Authorize before room broadcast on every cycle, including quiet periods.
        for sid, connection in tuple(self.connections.items()):
            try:
                valid = await self._identity(connection["environ"]) == connection["identity"]
            except Exception:
                await self._revoke(sid, status="unavailable")
                continue
            if not valid:
                await self._revoke(sid)
        watched = await self._presence()
        if not watched:
            if self._leader:
                await self.redis.eval(self._RELEASE, 1, f"{self.prefix}:lease", self.owner)
            self._leader = False
            return
        leader = bool(await self.redis.eval(self._LEASE, 1, f"{self.prefix}:lease", self.owner, self.lease_ms))
        if not leader:
            self._leader = False
            return
        takeover = not self._leader
        self._leader = True
        snapshot = await self._read()
        for topic in sorted(watched):
            payload = self.payload(snapshot, topic)
            # Check lease ownership, compare content and assign its revision in one
            # Redis operation. A publisher that lost its lease cannot commit state.
            encoded = await self.redis.eval(
                self._COMMIT,
                3,
                f"{self.prefix}:lease",
                f"{self.prefix}:hash:{topic}",
                f"{self.prefix}:revision",
                self.owner,
                self.fingerprint(payload),
                self.monitor.retention,
                "1" if takeover else "0",
            )
            if encoded:
                payload["revision"] = encoded.decode() if isinstance(encoded, bytes) else str(encoded)
                await self.server.emit(
                    EventMonitor.SNAPSHOT,
                    payload,
                    to=self.room(topic),
                    namespace=self.NAMESPACE,
                )

    async def _loop(self) -> None:
        while True:
            # Wake after this worker publishes; timeout still detects expired peers.
            try:
                async with asyncio.timeout(self.interval):
                    await self._ready.wait()
            except TimeoutError:
                pass
            self._ready.clear()
            await asyncio.sleep(max(0, self._last_tick + self.interval - time.monotonic()))
            self._last_tick = time.monotonic()
            try:
                async with asyncio.timeout(max(3.0, self.interval * 2)):
                    await self.tick()
                if self._unavailable:
                    await self._status("ready")
                    self._unavailable = False
            except (RedisError, TimeoutError, OSError, ValueError, KeyError) as exc:
                self._leader = False
                if not self._unavailable:
                    LOGGER.warning("Monitor stream unavailable (%s).", type(exc).__name__)
                    await self._status("unavailable")
                    self._unavailable = True
