"""Injected monitoring interfaces and shared wire constants; no connection ownership."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any, Protocol

# Retain the established logging namespace across the implementation split.
LOGGER = logging.getLogger("SYSTEM.tools.tools_monitor")
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


class MonitorStorage(Protocol):
    """Borrow the composition root's Redis wrapper; this interface owns no connection.

    Pipeline drivers retain their native command/results API. Reads return raw
    bytes or text unless deserialization is explicitly requested by the caller.
    """

    async def pipeline(self) -> Any: ...
    async def scan_iter(self, match: str, count: int = 100) -> list[str | bytes]: ...
    async def mget(self, keys: Sequence[str | bytes], deserialize: bool = False) -> list[Any]: ...
    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any: ...
    async def zrem(self, key: str, *members: str) -> int: ...


class TransactionObserver(Protocol):
    """Observe outer session scopes without executing SQL or taking session ownership."""

    def start(self) -> None: ...
    def stop(self) -> None: ...
    def snapshot(self) -> dict[str, Any]: ...


class RequestMetrics(Protocol):
    """Publish middleware outcomes using borrowed SYS storage.

    ♂ ZhengLee 2026.10.18
    """

    def record(self, *, failed: bool) -> None: ...
    async def flush(self) -> None: ...
