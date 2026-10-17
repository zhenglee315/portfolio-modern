"""Process-local request/resource sampling and bounded Redis publication.

Borrowed storage and observers are injected by lifespan and never closed here.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import threading
import time
from collections import OrderedDict, deque
from contextlib import suppress
from ipaddress import ip_address
from itertools import islice
from typing import Any, Callable
from uuid import uuid4
import psutil
from redis.exceptions import RedisError
from starlette.types import Scope
from .monitor_contracts import (
    LOGGER,
    MONITOR_PREFIX,
    HEARTBEAT_SECONDS,
    RETENTION_SECONDS,
    MAX_REQUEST_DETAILS,
    ENV_RUN,
    ENV_INSTANCE,
    ENV_PREFIX,
    ENV_WORKERS,
    _key,
    MonitorStorage,
    TransactionObserver,
)
from .monitor_snapshot import read_snapshot, _build_ui_snapshot
from .monitor_supervisor import supervise


class WorkerMonitor:
    """Own one worker's counters, SQL listeners, sampler and bounded Redis snapshots.

    The injected Redis client is borrowed, never closed here. Transaction counters
    cover outer logical Session transactions (including read autobegin), filtered
    to the supplied synchronous engine; they do not measure active SQL execution.
    """

    def __init__(
        self,
        redis: MonitorStorage,
        *,
        transactions: TransactionObserver | None = None,
        prefix: str | None = None,
        interval: float | None = None,
        heartbeat: int = HEARTBEAT_SECONDS,
        retention: int = RETENTION_SECONDS,
        publish_timeout: float = 1.0,
        geoip_reader=None,
        server_info: dict | None = None,
        max_requests: int = MAX_REQUEST_DETAILS,
        request_queue: str | None = None,
        request_batch_size: int = 500,
        request_buffer_size: int = 10000,
    ):
        if interval is None:
            from SYSTEM.settings import MONITOR_CYCLE_SEC

            interval = MONITOR_CYCLE_SEC
        if not 0 < interval < heartbeat < retention or publish_timeout <= 0:
            raise ValueError("Require 0 < interval < heartbeat < retention and a positive publish timeout.")
        if max_requests <= 0:
            raise ValueError("Request detail limit must be positive.")
        if not 1 <= request_batch_size <= 1000 or request_buffer_size < request_batch_size:
            raise ValueError("Invalid request-history buffer/batch limits.")
        self.redis = redis
        self.prefix = prefix or os.environ.get(ENV_PREFIX, MONITOR_PREFIX)
        self.interval, self.heartbeat, self.retention = interval, heartbeat, retention
        self.publish_timeout = publish_timeout
        self.geoip_reader = geoip_reader
        self.server_info = dict(server_info or {})
        self.max_requests = max_requests
        self.request_queue = request_queue
        self.request_batch_size = request_batch_size
        self.request_buffer_size = request_buffer_size
        self._history: deque[dict] = deque()
        self.history_enqueued_total = 0
        self.history_dropped_total = 0
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
        self._transaction_observer = transactions
        self._request_sequence = 0
        self.completed_requests_total = 0
        self.failed_requests_total = 0
        self.publish_failures_total = 0
        self._task: asyncio.Task | None = None
        self.on_publish: Callable[[], None] | None = None
        self.status = "starting"

    @property
    def running(self) -> bool:
        return self.status == "running"

    @property
    def completed_transactions_total(self) -> int:
        return self._transaction_snapshot()["completed_transactions_total"]

    def _transaction_snapshot(self) -> dict:
        if self._transaction_observer is not None:
            return self._transaction_observer.snapshot()
        return {
            "active_transactions": 0,
            "completed_transactions_total": 0,
            "oldest_transaction_seconds": 0.0,
        }

    async def start(self) -> None:
        """Register listeners and schedule reporting without waiting for Redis I/O."""
        if self._task is not None:
            raise RuntimeError("Monitor already started.")
        self.process.cpu_percent(interval=None)
        self._cpu_clock = time.monotonic()
        if self._transaction_observer is not None:
            self._transaction_observer.start()
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
        if self._transaction_observer is not None:
            self._transaction_observer.stop()
        with self._lock:
            self._requests.clear()
            self.status = "stopped"
        await self._safe_publish()
        deadline = time.monotonic() + 5
        while self._history and time.monotonic() < deadline:
            before = len(self._history)
            await self._safe_publish()
            if len(self._history) >= before:
                break
        if self._history:
            LOGGER.warning(
                "Worker exiting with %s request-history events not published",
                len(self._history),
            )

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
        return {
            "ip_address": value,
            "country_code": None,
            "region": None,
            "city": None,
            "geo_status": state,
        }

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
        self,
        token: int,
        *,
        failed: bool = False,
        http_status: int | None = None,
        outcome: str | None = None,
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
                if self.request_queue:
                    if len(self._history) < self.request_buffer_size:
                        self._history.append(dict(row))
                    else:
                        self.history_dropped_total += 1
                        if self.history_dropped_total == 1 or self.history_dropped_total % 1000 == 0:
                            LOGGER.error(
                                "Request-history buffer full; dropped=%s",
                                self.history_dropped_total,
                            )
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
            elapsed_ms=(max(0.0, (now - row["_clock"]) * 1000) if "_clock" in row else row["duration_ms"]),
        )
        if location := self._locations.get(result["ip_address"]):
            if location[0] > now:
                result.update(location[1])
        if result["geo_status"] == "pending" and self.geoip_reader is None:
            result["geo_status"] = "unavailable"
        return result

    async def _enrich_locations(self, history: list | None = None) -> None:
        if self.geoip_reader is None:
            return
        now = time.monotonic()
        with self._lock:
            self._locations = OrderedDict((key, value) for key, value in self._locations.items() if value[0] > now)
            if history is None:
                history = list(islice(self._history, self.request_batch_size))
            rows = history + list(self._requests.values())[: self.max_requests] + [row for _, row in self._recent]
            pending = list(
                dict.fromkeys(
                    row["ip_address"]
                    for row in rows
                    if row["geo_status"] == "pending" and row["ip_address"] not in self._locations
                )
            )[: self.request_batch_size + 64 if history else 64]
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
            # Freeze event enrichment independently of the bounded UI/IP caches.
            for row in self._history:
                if row["ip_address"] in locations:
                    row.update(locations[row["ip_address"]])

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
            transactions = self._transaction_snapshot()
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
                **transactions,
                "publish_failures_total": self.publish_failures_total,
                "history_pending_requests": len(self._history),
                "history_enqueued_total": self.history_enqueued_total,
                "history_dropped_total": self.history_dropped_total,
                "sample_error": sample_error,
                "slot": 1 if self.single_worker else None,
                "restarts": 0 if self.single_worker else None,
                "reloads": 0 if self.single_worker else None,
                "restart_tracking": ("single_process" if self.single_worker else "unavailable"),
            }

    async def publish(self) -> None:
        """Replace expiring snapshots and append completed events in one Redis transaction."""
        identity = f"{self.run_id}:{self.process_uid}"
        async with asyncio.timeout(self.publish_timeout):
            with self._lock:
                history = list(islice(self._history, self.request_batch_size))
            await self._enrich_locations(history)
            with self._lock:
                events = []
                for row in history:
                    event = self._request_view(row, time.monotonic())
                    event["schema"] = 1
                    if event["geo_status"] == "pending":
                        event["geo_status"] = "unavailable"
                    for field, limit in (
                        ("run_id", 128),
                        ("instance_id", 255),
                        ("process_uid", 128),
                    ):
                        event[field] = event[field][:limit]
                    events.append(json.dumps(event, allow_nan=False))
            async with await self.redis.pipeline() as pipe:
                # Snapshots outlive liveness so the UI can show a stale worker and
                # its recent events. This SET replaces state; readers do not consume it.
                pipe.set(
                    _key(self.prefix, "worker", identity),
                    json.dumps(self.snapshot()),
                    ex=self.retention,
                )
                alive = _key(self.prefix, "alive:worker", identity)
                if self.running:
                    pipe.set(alive, "1", ex=self.heartbeat)
                else:
                    pipe.delete(alive)
                for payload in events:
                    # No TTL/MAXLEN: uncommitted history must outlive the UI window.
                    pipe.xadd(self.request_queue, {"payload": payload})
                await pipe.execute()
            with self._lock:
                for row in history:
                    if self._history and self._history[0] is row:
                        self._history.popleft()
                        self.history_enqueued_total += 1
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

    read_snapshot = staticmethod(read_snapshot)
    _build_ui_snapshot = staticmethod(_build_ui_snapshot)
    supervise = staticmethod(supervise)
