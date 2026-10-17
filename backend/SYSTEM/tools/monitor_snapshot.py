"""Read worker/supervisor snapshots and derive UI aggregates without SQL access."""

from __future__ import annotations

import json
import time
from typing import Any
from .monitor_contracts import MONITOR_PREFIX, RETENTION_SECONDS, MonitorStorage


async def read_snapshot(
    redis: MonitorStorage,
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
        keys = await redis.scan_iter(match=f"{prefix}:{kind}:*", count=100)
        if not keys:
            continue
        names = [key.decode() if isinstance(key, bytes) else key for key in keys]
        alive = [name.replace(f"{prefix}:{kind}:", f"{prefix}:alive:{kind}:", 1) for name in names]
        values = await redis.mget(names + alive, deserialize=False)
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
    result["workers"].sort(
        key=lambda row: (
            row["instance_id"],
            row["run_id"],
            row.get("slot") or 0,
            row["pid"],
        )
    )
    result["sampled_at"] = time.time()
    _build_ui_snapshot(result, window_seconds)
    return result


def _build_ui_snapshot(result: dict, window_seconds: float) -> None:
    """Build UI-ready observations; a Redis read is not a globally atomic trace."""
    now = result["sampled_at"]
    selected: dict[str, dict[str, Any]] = {}
    for manager in result["supervisors"]:
        previous = selected.get(manager["instance_id"])
        rank = (manager.get("started_at", 0), manager["sampled_at"])
        if previous is None or rank > (
            previous.get("started_at", 0),
            previous["sampled_at"],
        ):
            selected[manager["instance_id"]] = manager
    selected_runs = {identity: manager["run_id"] for identity, manager in selected.items()}
    singles: dict[str, dict[str, Any]] = {}
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
    requests = sorted(
        events.values(),
        key=lambda row: (row["entered_at"], row["request_id"]),
        reverse=True,
    )
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
        current_workers=sorted(
            current,
            key=lambda row: (row["instance_id"], row["run_id"], row.get("slot") or 0),
        ),
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
                0 if unmanaged and all(row.get("restart_tracking") == "single_process" for row in unmanaged) else None
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
