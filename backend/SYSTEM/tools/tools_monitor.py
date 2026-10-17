"""Short-lived, process-local monitoring published to the existing SYS Redis database.

Lifespan owns WorkerMonitor; middleware and SQLAlchemy events only update memory.
MonitorSupervisor observes Uvicorn 0.54.0 without replacing its restart algorithm.
MonitorStream aggregates snapshots and publishes changed topics to authorized rooms.
There are no HTTP endpoints, SQL writes, long-term history, or import-time connections.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import socket
import sys
import threading
import time
import weakref
from collections import OrderedDict, deque
from contextlib import contextmanager, suppress
from ipaddress import ip_address
from typing import Any
from uuid import uuid4

import psutil
import uvicorn
from redis import Redis as SyncRedis
from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry
from sqlalchemy import event
from sqlalchemy.orm import Session
from starlette.types import Scope
from uvicorn.supervisors import Multiprocess

LOGGER = logging.getLogger(__name__)
MONITOR_PREFIX = "system:monitor"
HEARTBEAT_SECONDS = 15
RETENTION_SECONDS = 60
MAX_REQUEST_DETAILS = 200
UVICORN_VERSION = "0.54.0"
ENV_RUN = "SYSTEM_MONITOR_RUN"
ENV_INSTANCE = "SYSTEM_MONITOR_INSTANCE"
ENV_PREFIX = "SYSTEM_MONITOR_PREFIX"
ENV_WORKERS = "SYSTEM_MONITOR_WORKERS"


def _key(prefix: str, kind: str, identity: str) -> str:
    return f"{prefix}:{kind}:{identity}"


class WorkerMonitor:
    """Own one worker's counters, SQL listeners, sampler and bounded Redis snapshots.

    The injected Redis client is borrowed, never closed here. Transaction counters
    cover outer logical Session transactions (including read autobegin), filtered
    to the supplied synchronous engine; they do not measure active SQL execution.
    """

    def __init__(
        self,
        redis: Redis,
        *,
        engine=None,
        prefix: str | None = None,
        interval: float | None = None,
        heartbeat: int = HEARTBEAT_SECONDS,
        retention: int = RETENTION_SECONDS,
        publish_timeout: float = 1.0,
        geoip_reader=None,
        server_info: dict | None = None,
        max_requests: int = MAX_REQUEST_DETAILS,
    ):
        if interval is None:
            from SYSTEM.settings import MONITOR_CYCLE_SEC

            interval = MONITOR_CYCLE_SEC
        if not 0 < interval < heartbeat < retention or publish_timeout <= 0:
            raise ValueError("Require 0 < interval < heartbeat < retention and a positive publish timeout.")
        if max_requests <= 0:
            raise ValueError("Request detail limit must be positive.")
        self.redis = redis
        self.engine = engine
        self.prefix = prefix or os.environ.get(ENV_PREFIX, MONITOR_PREFIX)
        self.interval, self.heartbeat, self.retention = interval, heartbeat, retention
        self.publish_timeout = publish_timeout
        self.geoip_reader = geoip_reader
        self.server_info = dict(server_info or {})
        self.max_requests = max_requests
        self.process = psutil.Process()
        self.pid = self.process.pid
        self.started_at = self.process.create_time()
        self.process_uid = f"{self.pid}-{int(self.started_at * 1_000_000)}"
        self.instance_id = os.environ.get(ENV_INSTANCE, socket.gethostname())
        self.run_id = os.environ.get(ENV_RUN, f"unmanaged-{self.process_uid}")
        self.single_worker = os.environ.get(ENV_WORKERS) == "1"
        self._clock = time.monotonic()
        self._initial_age = max(0.0, time.time() - self.started_at)
        self._cpu_clock = self._clock
        self._lock = threading.RLock()
        self._requests: dict[int, dict[str, Any]] = {}
        self._recent: deque[tuple[float, dict[str, Any]]] = deque()
        self._recent_dropped = 0
        self._last_drop = float("-inf")
        self._locations: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._transactions = weakref.WeakKeyDictionary()
        self._request_sequence = 0
        self.completed_requests_total = 0
        self.failed_requests_total = 0
        self.completed_transactions_total = 0
        self.publish_failures_total = 0
        self._listeners: list[tuple[str, Any]] = []
        self._task: asyncio.Task | None = None
        self.status = "starting"

    @property
    def running(self) -> bool:
        return self.status == "running"

    async def start(self) -> None:
        """Register listeners and schedule reporting without waiting for Redis I/O."""
        if self._task is not None:
            raise RuntimeError("Monitor already started.")
        self.process.cpu_percent(interval=None)
        self._cpu_clock = time.monotonic()
        if self.engine is not None:
            for name, callback in (
                ("after_transaction_create", self._transaction_started),
                ("after_transaction_end", self._transaction_ended),
            ):
                event.listen(Session, name, callback)
                self._listeners.append((name, callback))
        self.status = "running"
        self._task = asyncio.create_task(self._report_loop(), name=f"worker-monitor-{self.pid}")

    async def stop(self) -> None:
        """Cancel reporting, detach listeners, and publish a bounded terminal record."""
        if self.status == "stopped":
            return
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        for name, callback in self._listeners:
            event.remove(Session, name, callback)
        self._listeners.clear()
        with self._lock:
            self._requests.clear()
            self._transactions.clear()
            self.status = "stopped"
        await self._safe_publish()

    @staticmethod
    def _client_location(scope: Scope | None) -> dict[str, Any]:
        client = (scope or {}).get("client")
        try:
            raw = client[0] if client else None
            if not isinstance(raw, str) or "%" in raw:
                raise ValueError("Unknown client")
            address = ip_address(raw.strip())
            if address.version == 6 and address.ipv4_mapped is not None:
                address = address.ipv4_mapped
            if address.is_unspecified:
                raise ValueError("Unknown client")
            value = str(address)
            state = "pending" if address.is_global and not address.is_multicast else "non_public"
        except ValueError:
            value, state = None, "unknown"
        return {"ip_address": value, "country_code": None, "region": None, "city": None, "geo_status": state}

    def begin_request(self, scope: Scope | None = None) -> int:
        with self._lock:
            self._request_sequence += 1
            token = self._request_sequence
            self._requests[token] = {
                "request_id": uuid4().hex,
                "method": str((scope or {}).get("method", ""))[:16],
                "path": str((scope or {}).get("path", ""))[:2048],
                "entered_at": time.time(),
                "left_at": None,
                "response_started_at": None,
                "http_status": None,
                "status": "processing",
                "phase": "application",
                "_clock": time.monotonic(),
                **self._client_location(scope),
            }
        return token

    def response_started(self, token: int, status: int) -> None:
        with self._lock:
            if row := self._requests.get(token):
                row["response_started_at"] = time.time()
                row["response_status"] = status
                row["phase"] = "response"

    def end_request(
        self, token: int, *, failed: bool = False, http_status: int | None = None, outcome: str | None = None
    ) -> None:
        with self._lock:
            row = self._requests.pop(token, None)
            if row is not None:
                now = time.monotonic()
                row.update(
                    left_at=time.time(),
                    duration_ms=max(0.0, (now - row.pop("_clock")) * 1000),
                    http_status=http_status,
                    failed=failed,
                    status=outcome or ("error" if failed and http_status is None else "completed"),
                    phase="finished",
                )
                self.completed_requests_total += 1
                self.failed_requests_total += int(failed)
                self._recent.append((now, row))
                self._prune_recent(now)
                if len(self._recent) > self.max_requests:
                    self._recent.popleft()
                    self._recent_dropped += 1
                    self._last_drop = now

    def _prune_recent(self, now: float) -> None:
        while self._recent and self._recent[0][0] < now - self.retention:
            self._recent.popleft()

    def _request_view(self, row: dict, now: float) -> dict:
        result = {key: value for key, value in row.items() if not key.startswith("_")}
        result.update(
            run_id=self.run_id,
            instance_id=self.instance_id,
            process_uid=self.process_uid,
            pid=self.pid,
            elapsed_ms=max(0.0, (now - row["_clock"]) * 1000) if "_clock" in row else row["duration_ms"],
        )
        if location := self._locations.get(result["ip_address"]):
            if location[0] > now:
                result.update(location[1])
        if result["geo_status"] == "pending" and self.geoip_reader is None:
            result["geo_status"] = "unavailable"
        return result

    async def _enrich_locations(self) -> None:
        if self.geoip_reader is None:
            return
        now = time.monotonic()
        with self._lock:
            self._locations = OrderedDict((key, value) for key, value in self._locations.items() if value[0] > now)
            rows = list(self._requests.values())[: self.max_requests] + [row for _, row in self._recent]
            pending = list(
                dict.fromkeys(
                    row["ip_address"]
                    for row in rows
                    if row["geo_status"] == "pending" and row["ip_address"] not in self._locations
                )
            )[:64]
        if not pending:
            return

        def lookup_batch():
            locations = {}
            for address in pending:
                try:
                    locations[address] = self.geoip_reader.lookup(address).record_values()
                except (AttributeError, OSError, ValueError):
                    locations[address] = {"geo_status": "unavailable"}
            return locations

        locations = await asyncio.to_thread(lookup_batch)
        with self._lock:
            for address, location in locations.items():
                self._locations[address] = (time.monotonic() + self.retention, location)
                self._locations.move_to_end(address)
            while len(self._locations) > 1024:
                self._locations.popitem(last=False)

    def _transaction_started(self, session, transaction) -> None:
        if (
            transaction.parent is None
            and not session.info.get("system.monitor.ignore")
            and getattr(session.bind, "engine", session.bind) is self.engine
        ):
            with self._lock:
                self._transactions[transaction] = time.monotonic()

    def _transaction_ended(self, session, transaction) -> None:
        if transaction.parent is None:
            with self._lock:
                if self._transactions.pop(transaction, None) is not None:
                    self.completed_transactions_total += 1

    def snapshot(self) -> dict[str, Any]:
        """Return current process metrics; CPU is unknown until its sampling baseline exists."""
        now = time.monotonic()
        cpu, rss, sample_error = None, None, None
        try:
            if now - self._cpu_clock >= 0.1:
                cpu = self.process.cpu_percent(interval=None)
                self._cpu_clock = now
            rss = self.process.memory_info().rss
        except psutil.Error as exc:
            sample_error = type(exc).__name__
        with self._lock:
            self._prune_recent(now)
            transactions = list(self._transactions.values())
            return {
                "schema": 2,
                "instance_id": self.instance_id,
                "run_id": self.run_id,
                "process_uid": self.process_uid,
                "pid": self.pid,
                "started_at": self.started_at,
                "sampled_at": time.time(),
                "status": self.status,
                "server": self.server_info,
                "cpu_percent": cpu,
                "rss_bytes": rss,
                "uptime_seconds": self._initial_age + now - self._clock,
                "active_requests": len(self._requests),
                "completed_requests_total": self.completed_requests_total,
                "failed_requests_total": self.failed_requests_total,
                "oldest_request_seconds": (
                    now - min(row["_clock"] for row in self._requests.values()) if self._requests else 0.0
                ),
                "requests": [
                    self._request_view(row, now) for row in list(self._requests.values())[: self.max_requests]
                ],
                "recent_requests": [self._request_view(row, now) for _, row in self._recent],
                "active_details_truncated": len(self._requests) > self.max_requests,
                "recent_details_truncated": now - self._last_drop < self.retention,
                "recent_dropped_total": self._recent_dropped,
                "request_window_seconds": self.retention,
                "report_interval_seconds": self.interval,
                "active_transactions": len(transactions),
                "completed_transactions_total": self.completed_transactions_total,
                "oldest_transaction_seconds": now - min(transactions) if transactions else 0.0,
                "publish_failures_total": self.publish_failures_total,
                "sample_error": sample_error,
                "slot": 1 if self.single_worker else None,
                "restarts": 0 if self.single_worker else None,
                "reloads": 0 if self.single_worker else None,
                "restart_tracking": "single_process" if self.single_worker else "unavailable",
            }

    async def publish(self) -> None:
        """Atomically replace a JSON snapshot and its heartbeat; all keys expire."""
        identity = f"{self.run_id}:{self.process_uid}"
        async with asyncio.timeout(self.publish_timeout):
            await self._enrich_locations()
            async with self.redis.pipeline(transaction=True) as pipe:
                # Snapshots outlive liveness so the UI can show a stale worker and
                # its recent events. This SET replaces state; readers do not consume it.
                pipe.set(_key(self.prefix, "worker", identity), json.dumps(self.snapshot()), ex=self.retention)
                alive = _key(self.prefix, "alive:worker", identity)
                if self.running:
                    pipe.set(alive, "1", ex=self.heartbeat)
                else:
                    pipe.delete(alive)
                await pipe.execute()
        if callback := getattr(self, "on_publish", None):
            callback()

    async def _safe_publish(self) -> None:
        try:
            await self.publish()
        except (RedisError, TimeoutError, OSError) as exc:
            self.publish_failures_total += 1
            if self.publish_failures_total == 1 or self.publish_failures_total % 30 == 0:
                LOGGER.warning("Worker monitoring publish unavailable (%s).", type(exc).__name__)

    async def _report_loop(self) -> None:
        """Sample on the shared cycle, keeping Redis I/O outside request handlers."""
        deadline = asyncio.get_running_loop().time()
        while True:
            await self._safe_publish()
            deadline = max(deadline + self.interval, asyncio.get_running_loop().time())
            await asyncio.sleep(max(0, deadline - asyncio.get_running_loop().time()))

    @staticmethod
    async def read_snapshot(
        redis: Redis,
        *,
        prefix: str = MONITOR_PREFIX,
        run_id: str | None = None,
        instance_id: str | None = None,
        window_seconds: float = RETENTION_SECONDS,
    ) -> dict[str, Any]:
        """Read retained snapshots and join authoritative supervisor slots by run and PID."""
        if window_seconds <= 0:
            raise ValueError("Request window must be positive.")
        result: dict[str, Any] = {"workers": [], "supervisors": []}
        for kind, collection in (("supervisor", "supervisors"), ("worker", "workers")):
            keys = [key async for key in redis.scan_iter(match=f"{prefix}:{kind}:*", count=100)]
            if not keys:
                continue
            names = [key.decode() if isinstance(key, bytes) else key for key in keys]
            alive = [name.replace(f"{prefix}:{kind}:", f"{prefix}:alive:{kind}:", 1) for name in names]
            values = await redis.mget(names + alive)
            for index, raw in enumerate(values[: len(names)]):
                if raw is None:
                    continue
                try:
                    row = json.loads(raw)
                    if not isinstance(row, dict):
                        continue
                except (ValueError, TypeError):
                    continue
                if run_id is not None and row.get("run_id") != run_id:
                    continue
                if instance_id is not None and row.get("instance_id") != instance_id:
                    continue
                row["fresh"] = values[len(names) + index] is not None
                if row.get("status") != "stopped" and not row["fresh"]:
                    row["status"] = "stale"
                result[collection].append(row)
        supervisors = {row["run_id"]: row for row in result["supervisors"]}
        for row in result["workers"]:
            supervisor = supervisors.get(row["run_id"])
            row["current"] = row["status"] not in ("stopped", "exited")
            if supervisor and (supervisor["fresh"] or supervisor["status"] == "stopped"):

                def matches(item):
                    return item["pid"] == row["pid"] and (
                        item.get("started_at") is None or abs(item["started_at"] - row["started_at"]) < 0.001
                    )

                slot = next((item for item in supervisor["slots"] if matches(item)), None)
                if slot:
                    row.update({key: slot[key] for key in ("slot", "restarts", "reloads")})
                    row["restart_tracking"] = "supervisor"
                retired = next((item for item in supervisor.get("retired", []) if matches(item)), None)
                if retired:
                    row.update({key: retired[key] for key in ("slot", "restarts", "reloads") if key in retired})
                if supervisor["status"] == "stopped" or retired:
                    row["status"] = "exited"
                    row["fresh"] = False
                    row["current"] = False
                elif supervisor["fresh"]:
                    row["current"] = slot is not None
            row["http_busy"] = bool(row["active_requests"]) if row["status"] == "running" else None
            row["transaction_busy"] = bool(row["active_transactions"]) if row["status"] == "running" else None
            row["busy"] = (
                bool(row["active_requests"] or row["active_transactions"])
                if row["status"] == "running"
                else (False if row["status"] in ("stopped", "exited") else None)
            )
        result["workers"].sort(key=lambda row: (row["instance_id"], row["run_id"], row.get("slot") or 0, row["pid"]))
        result["sampled_at"] = time.time()
        WorkerMonitor._build_ui_snapshot(result, window_seconds)
        return result

    @staticmethod
    def _build_ui_snapshot(result: dict, window_seconds: float) -> None:
        """Build UI-ready observations; a Redis read is not a globally atomic trace."""
        now = result["sampled_at"]
        selected = {}
        for manager in result["supervisors"]:
            previous = selected.get(manager["instance_id"])
            rank = (manager.get("started_at", 0), manager["sampled_at"])
            if previous is None or rank > (
                previous.get("started_at", 0),
                previous["sampled_at"],
            ):
                selected[manager["instance_id"]] = manager
        selected_runs = {identity: manager["run_id"] for identity, manager in selected.items()}
        singles = {}
        for row in result["workers"]:
            identity = row["instance_id"]
            if identity not in selected and row.get("restart_tracking") == "single_process":
                if identity not in singles or row["started_at"] > singles[identity]["started_at"]:
                    singles[identity] = row
        selected_runs.update({identity: row["run_id"] for identity, row in singles.items()})
        chosen_runs = set(selected_runs.values())
        managed_instances = set(selected)
        current = [
            row
            for row in result["workers"]
            if row["current"] and (row["run_id"] in chosen_runs or row["instance_id"] not in selected_runs)
        ]
        for manager in selected.values():
            if manager["status"] == "stopped":
                continue
            for slot in manager["slots"]:
                if any(row["run_id"] == manager["run_id"] and row["slot"] == slot["slot"] for row in current):
                    continue
                current.append(
                    {
                        "instance_id": manager["instance_id"],
                        "run_id": manager["run_id"],
                        "pid": slot["pid"],
                        "process_uid": None,
                        "slot": slot["slot"],
                        "status": "starting" if manager["fresh"] else "unknown",
                        "fresh": False,
                        "current": True,
                        "busy": None,
                        "http_busy": None,
                        "transaction_busy": None,
                        "cpu_percent": None,
                        "rss_bytes": None,
                        "uptime_seconds": None,
                        "active_requests": None,
                        "active_transactions": None,
                        "restarts": slot["restarts"],
                        "reloads": slot["reloads"],
                    }
                )
        live = [row for row in current if row["status"] == "running" and row["fresh"]]
        unmanaged = [row for row in current if row["instance_id"] not in managed_instances]
        expected = sum(manager["expected_workers"] for manager in selected.values())
        expected_known = bool(selected or unmanaged)
        for identity in {(row["instance_id"], row["run_id"]) for row in unmanaged}:
            group = [row for row in unmanaged if (row["instance_id"], row["run_id"]) == identity]
            target = group[0].get("server", {}).get("expected_workers")
            if target is None and group[0].get("restart_tracking") == "single_process":
                target = 1
            if target is None:
                expected_known = False
            else:
                expected += target
        events = {}
        for worker in result["workers"]:
            if worker["instance_id"] in selected_runs and worker["run_id"] not in chosen_runs:
                continue
            for request in worker.get("requests", []) + worker.get("recent_requests", []):
                if request.get("left_at") is not None and request["left_at"] < now - window_seconds:
                    continue
                row = dict(request)
                row.update(
                    slot=worker.get("slot"),
                    worker_status=worker["status"],
                    observed_at=worker["sampled_at"],
                    fresh=worker["fresh"],
                    location=(
                        "local"
                        if row.get("geo_status") == "non_public"
                        else " / ".join(row[key] for key in ("country_code", "region", "city") if row.get(key)) or None
                    ),
                )
                if row["status"] == "processing" and worker["status"] != "running":
                    row["status"] = "interrupted" if worker["status"] in ("exited", "stopped") else "unknown"
                    row["phase"] = row["status"]
                events[row["request_id"]] = row
        requests = sorted(events.values(), key=lambda row: (row["entered_at"], row["request_id"]), reverse=True)
        completed = [row for row in requests if row["status"] == "completed"]
        successful = [row for row in completed if row["http_status"] is not None and 200 <= row["http_status"] < 300]

        def average(rows):
            return sum(row["duration_ms"] for row in rows) / len(rows) if rows else None

        healthy = (
            expected_known
            and len(live) == expected
            and all(manager["status"] == "running" and manager["fresh"] for manager in selected.values())
        )
        stopped = bool(selected) and all(manager["status"] == "stopped" for manager in selected.values()) and not live
        result.update(
            current_workers=sorted(current, key=lambda row: (row["instance_id"], row["run_id"], row.get("slot") or 0)),
            requests=requests,
            request_window_seconds=window_seconds,
            consistency="per_worker_snapshots",
            health_basis="lifespan_heartbeat",
            http_health_probe=None,
        )
        result["summary"] = {
            "active_requests": sum(row["active_requests"] for row in live),
            "active_requests_complete": expected_known and len(live) == expected,
            "active_transactions": sum(row["active_transactions"] for row in live),
            "running_workers": len(live),
            "expected_workers": expected if expected_known else None,
            "busy_workers": sum(bool(row["active_requests"]) for row in live),
            "idle_workers": sum(not row["active_requests"] for row in live),
            "transaction_busy_workers": sum(bool(row["active_transactions"]) for row in live),
            "unknown_workers": max(0, expected - len(live)) if expected_known else None,
            "abnormal_workers": (
                max(0, expected - len(live)) if expected_known and not stopped else (0 if stopped else None)
            ),
            "health": "stopped" if stopped else ("healthy" if healthy else "unknown"),
            "restarts": (
                sum(manager["restarts"] for manager in selected.values())
                if selected
                else (
                    0
                    if unmanaged and all(row.get("restart_tracking") == "single_process" for row in unmanaged)
                    else None
                )
            ),
            "recent_completed_requests": len(completed),
            "recent_average_duration_ms": average(completed),
            "recent_max_duration_ms": max((row["duration_ms"] for row in completed), default=None),
            "recent_http_2xx": {
                "count": len(successful),
                "average_duration_ms": average(successful),
                "max_duration_ms": max((row["duration_ms"] for row in successful), default=None),
            },
            "request_details_truncated": any(
                row.get("active_details_truncated") or row.get("recent_details_truncated")
                for row in result["workers"]
                if row["run_id"] in chosen_runs or row["instance_id"] not in selected_runs
            ),
        }

    @staticmethod
    @contextmanager
    def supervise(*, workers: int, instance_id: str | None = None, prefix: str = MONITOR_PREFIX):
        """Keep uvicorn.run's import-string API and scope the 0.54.0 supervisor adapter.

        Only the launcher enters this context; spawned workers inherit the run identity.
        The original supervisor and environment are restored even on startup failure.
        """
        if workers > 1 and uvicorn.__version__ != UVICORN_VERSION:
            raise RuntimeError(f"Worker monitoring supervisor requires Uvicorn {UVICORN_VERSION}.")
        module = sys.modules[uvicorn.run.__module__]
        original = module.Multiprocess
        environment = {
            ENV_RUN: uuid4().hex,
            ENV_INSTANCE: instance_id or socket.gethostname(),
            ENV_PREFIX: prefix,
            ENV_WORKERS: str(workers),
        }
        previous = {key: os.environ.get(key) for key in environment}
        try:
            os.environ.update(environment)
            if workers > 1:
                module.Multiprocess = MonitorSupervisor
            yield
        finally:
            module.Multiprocess = original
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


class MonitorStream:
    """One publisher per instance, with process-local authorized Socket.IO subscribers.

    SYS Redis stores only expiring leases, presence and comparison state. The socket
    manager delivers rooms across workers; authorization is injected by APPs/Sys.
    Slow consumers receive bounded snapshots, never an unbounded request event log.
    """

    NAMESPACE = "/monitor"
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
            return False
        identity = await self._identity(environ)
        if identity is None:
            return False
        self.connections[sid] = {"environ": environ, "identity": identity, "topics": set(), "last_sync": 0.0}
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
                "monitor_snapshot",
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
            "monitor_status",
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
            async with self.redis.pipeline(transaction=True) as pipe:
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
        common = ("instance_id", "run_id", "process_uid", "slot", "pid", "status", "fresh", "started_at")
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
                "publish_failures_total",
                "sample_error",
            )
            if topic == "workers"
            else ("active_requests", "active_transactions")
        )
        summary_keys = (
            ("running_workers", "expected_workers", "abnormal_workers", "unknown_workers", "health", "restarts")
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

        raw = json.dumps(stable(payload["data"]), sort_keys=True, separators=(",", ":"), allow_nan=False)
        return hashlib.sha256(raw.encode()).hexdigest()

    async def _status(self, status: str) -> None:
        for sid in tuple(self.connections):
            await self.server.emit(
                "monitor_status",
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
                    "monitor_snapshot",
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


class MonitorSupervisor(Multiprocess):
    """Observe native worker replacements, retaining counters only for this manager run.

    Uvicorn owns spawn, health checks, shutdown, reload and scaling. A bounded
    publisher thread owns a separate SYS Redis connection so monitoring I/O never
    delays the process manager. Planned reloads and scale-up are not crash restarts.
    """

    def __init__(self, config, sockets):
        super().__init__(config, sockets)
        self.run_id = os.environ[ENV_RUN]
        self.prefix = os.environ.get(ENV_PREFIX, MONITOR_PREFIX)
        self.instance_id = os.environ.get(ENV_INSTANCE, socket.gethostname())
        self._monitor_lock = threading.RLock()
        self._slots: dict[int, dict[str, Any]] = {}
        self._retired: dict[int, dict[str, Any]] = {}
        self._restarts = 0
        self._reloads = 0
        self._publisher_stop = threading.Event()
        self._monitor_status = "running"
        self.started_at = time.time()

    def _observe(self, before: list, reason: str) -> None:
        with self._monitor_lock:
            current_objects = {id(process) for process in self.processes}
            for index, process in enumerate(before):
                if id(process) not in current_objects:
                    old_slot = self._slots.get(index + 1, {})
                    self._retired[process.pid] = {
                        "pid": process.pid,
                        "started_at": old_slot.get("started_at"),
                        "exited_at": time.time(),
                        "reason": reason,
                        "slot": index + 1,
                        "restarts": old_slot.get("restarts", 0),
                        "reloads": old_slot.get("reloads", 0),
                    }
            for index, process in enumerate(self.processes):
                slot = index + 1
                old = self._slots.get(slot)
                if index < len(before) and before[index] is process:
                    continue
                replacing = old is not None
                restart = int(replacing and reason == "unexpected")
                reload = int(replacing and reason == "reload")
                self._restarts += restart
                self._reloads += reload
                try:
                    started_at = psutil.Process(process.pid).create_time()
                except psutil.Error:
                    started_at = None
                self._slots[slot] = {
                    "slot": slot,
                    "pid": process.pid,
                    "started_at": started_at,
                    "restarts": (old["restarts"] if old else 0) + restart,
                    "reloads": (old["reloads"] if old else 0) + reload,
                    "reason": reason,
                    "previous_pid": old["pid"] if old else None,
                    "exit_code": before[index].exitcode if index < len(before) else None,
                }
            for slot in tuple(self._slots):
                if slot > len(self.processes):
                    del self._slots[slot]

    def init_processes(self) -> None:
        super().init_processes()
        self._observe([], "initial")

    def keep_subprocess_alive(self) -> None:
        before = list(self.processes)
        try:
            super().keep_subprocess_alive()
        finally:
            self._observe(before, "unexpected")

    def restart_all(self) -> None:
        before = list(self.processes)
        try:
            super().restart_all()
        finally:
            self._observe(before, "reload")

    def handle_ttin(self) -> None:
        before = list(self.processes)
        super().handle_ttin()
        self._observe(before, "scale_up")

    def handle_ttou(self) -> None:
        before = list(self.processes)
        super().handle_ttou()
        self._observe(before, "scale_down")

    def snapshot(self) -> dict[str, Any]:
        with self._monitor_lock:
            cutoff = time.time() - RETENTION_SECONDS
            self._retired = {pid: row for pid, row in self._retired.items() if row["exited_at"] > cutoff}
            return {
                "schema": 1,
                "run_id": self.run_id,
                "instance_id": self.instance_id,
                "pid": os.getpid(),
                "sampled_at": time.time(),
                "started_at": self.started_at,
                "status": self._monitor_status,
                "expected_workers": self.processes_num,
                "server": {
                    "host": self.config.host,
                    "port": self.config.port,
                    "application": self.config.app,
                    "factory": self.config.factory,
                    "expected_workers": self.processes_num,
                },
                "restarts": self._restarts,
                "reloads": self._reloads,
                "slots": [dict(row) for row in self._slots.values()],
                "retired": [dict(row) for row in self._retired.values()],
            }

    def _publisher(self) -> None:
        from SYSTEM.constants import EnumCache
        from SYSTEM.settings import CACHE_CONF, MONITOR_CYCLE_SEC

        conf = CACHE_CONF[EnumCache.SYS]
        client = SyncRedis(
            host=conf["HOST"],
            port=conf["PORT"],
            db=conf["DB"],
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            retry=Retry(NoBackoff(), 0),
        )
        failures = 0
        try:
            while True:
                row = self.snapshot()
                try:
                    with client.pipeline(transaction=True) as pipe:
                        pipe.set(_key(self.prefix, "supervisor", self.run_id), json.dumps(row), ex=RETENTION_SECONDS)
                        alive = _key(self.prefix, "alive:supervisor", self.run_id)
                        if row["status"] == "running":
                            pipe.set(alive, "1", ex=HEARTBEAT_SECONDS)
                        else:
                            pipe.delete(alive)
                        pipe.execute()
                except (RedisError, OSError) as exc:
                    failures += 1
                    if failures == 1 or failures % 30 == 0:
                        LOGGER.warning("Supervisor monitoring publish unavailable (%s).", type(exc).__name__)
                if row["status"] == "stopped":
                    return
                self._publisher_stop.wait(MONITOR_CYCLE_SEC)
        finally:
            client.close()

    def run(self) -> None:
        publisher = threading.Thread(target=self._publisher, name="worker-supervisor-monitor", daemon=True)
        publisher.start()
        try:
            super().run()
        finally:
            with self._monitor_lock:
                self._monitor_status = "stopped"
            self._publisher_stop.set()
            publisher.join(timeout=2)
