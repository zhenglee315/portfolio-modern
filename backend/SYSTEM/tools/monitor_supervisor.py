"""Scoped Uvicorn supervisor adapter and synchronous heartbeat publisher."""

from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
from contextlib import contextmanager
from typing import Any, Callable
from uuid import uuid4
import psutil
import uvicorn
from redis.exceptions import RedisError
from uvicorn.supervisors import Multiprocess
from .monitor_contracts import (
    LOGGER,
    MONITOR_PREFIX,
    HEARTBEAT_SECONDS,
    RETENTION_SECONDS,
    UVICORN_VERSION,
    ENV_RUN,
    ENV_INSTANCE,
    ENV_PREFIX,
    ENV_WORKERS,
    _key,
)


@contextmanager
def supervise(
    *,
    workers: int,
    instance_id: str | None = None,
    prefix: str = MONITOR_PREFIX,
    storage_factory: Callable | None = None,
    interval: float = 2.0,
):
    """Keep uvicorn.run's import-string API and scope the 0.54.0 supervisor adapter.

    Only the launcher enters this context; spawned workers inherit the run identity.
    The original supervisor and environment are restored even on startup failure.
    """
    if workers > 1 and uvicorn.__version__ != UVICORN_VERSION:
        raise RuntimeError(f"Worker monitoring supervisor requires Uvicorn {UVICORN_VERSION}.")
    if workers > 1 and storage_factory is None:
        raise ValueError("Multi-worker monitoring requires an injected synchronous storage factory.")
    module = sys.modules[uvicorn.run.__module__]
    original = getattr(module, "Multiprocess")
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
            from functools import partial

            assert storage_factory is not None  # Checked before entering the scoped adapter.
            setattr(
                module,
                "Multiprocess",
                partial(
                    MonitorSupervisor,
                    storage_factory=storage_factory,
                    interval=interval,
                ),
            )
        yield
    finally:
        setattr(module, "Multiprocess", original)
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class MonitorSupervisor(Multiprocess):
    """Observe native worker replacements, retaining counters only for this manager run.

    Uvicorn owns spawn, health checks, shutdown, reload and scaling. A bounded
    publisher thread owns a separate SYS Redis connection so monitoring I/O never
    delays the process manager. Planned reloads and scale-up are not crash restarts.
    """

    def __init__(self, config, sockets, *, storage_factory: Callable, interval: float):
        super().__init__(config, sockets)
        self._storage_factory = storage_factory
        self._publisher_interval = interval
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
                    "exit_code": (before[index].exitcode if index < len(before) else None),
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
        client = self._storage_factory()
        failures = 0
        try:
            while True:
                row = self.snapshot()
                try:
                    with client.pipeline() as pipe:
                        pipe.set(
                            _key(self.prefix, "supervisor", self.run_id),
                            json.dumps(row),
                            ex=RETENTION_SECONDS,
                        )
                        alive = _key(self.prefix, "alive:supervisor", self.run_id)
                        if row["status"] == "running":
                            pipe.set(alive, "1", ex=HEARTBEAT_SECONDS)
                        else:
                            pipe.delete(alive)
                        pipe.execute()
                except (RedisError, OSError) as exc:
                    failures += 1
                    if failures == 1 or failures % 30 == 0:
                        LOGGER.warning(
                            "Supervisor monitoring publish unavailable (%s).",
                            type(exc).__name__,
                        )
                if row["status"] == "stopped":
                    return
                self._publisher_stop.wait(self._publisher_interval)
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
