"""Inspect SYS Redis monitoring snapshots without adding an HTTP endpoint.

From backend/: uv run python -m SYSTEM.scripts.check_monitor --watch
"""

import argparse
import asyncio
import json
from datetime import datetime, timezone

from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry

from SYSTEM.tools.tools_monitor import MONITOR_PREFIX, WorkerMonitor
from COMMON.tools.storage.redis import RedisAsync


def render(snapshot: dict, *, requests: bool = False) -> str:
    """Render one-word headings; stale gauges are unknown rather than zero."""
    lines = ["Worker PID State CPU RAM Uptime Req Tx Restart Reload RPS"]
    for row in snapshot["workers"]:
        live = row["status"] == "running"
        status = ("busy" if row["busy"] else "idle") if live else row["status"]
        cpu = f'{row["cpu_percent"]:.1f}%' if live and row["cpu_percent"] is not None else "?"
        ram = f'{row["rss_bytes"] / 1024**2:.1f}MiB' if live and row["rss_bytes"] is not None else "?"
        label = f'{row["instance_id"]}/{row.get("slot") or "?"}'
        values = [
            label,
            str(row["pid"]),
            status,
            cpu,
            ram,
            f'{row["uptime_seconds"]:.0f}s',
            str(row["active_requests"]) if live else "?",
            str(row["active_transactions"]) if live else "?",
            str(row["restarts"]) if row["restarts"] is not None else "?",
            str(row["reloads"]) if row["reloads"] is not None else "?",
            (f'{row["requests_per_second"]:.1f}' if row.get("requests_per_second") is not None else "?"),
        ]
        lines.append(" ".join(values))
    if not snapshot["workers"]:
        lines.append("No retained worker snapshots.")
    for manager in snapshot["supervisors"]:
        lines.append(
            f'Manager {manager["pid"]}: {manager["status"]}, '
            f'expected={manager["expected_workers"]}, restarts={manager["restarts"]}, reloads={manager["reloads"]}'
        )
    if summary := snapshot.get("summary"):
        lines.append(
            f'HTTP: active={summary["active_requests"]}, busy={summary["busy_workers"]}, '
            f'workers={summary["running_workers"]}/{summary["expected_workers"]}, '
            f'recent={summary["recent_completed_requests"]}, average={summary["recent_average_duration_ms"]}ms'
        )
    if requests:
        lines.append("Request Worker PID Method Path IP Country Region City State Enter Leave Elapsed HTTP")
        for row in snapshot.get("requests", []):

            def stamp(value):
                return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec="milliseconds") if value else "?"

            cells = [
                row["request_id"],
                row.get("slot"),
                row["pid"],
                row["method"],
                row["path"],
                row["ip_address"],
                row["country_code"],
                row["region"],
                row["city"],
                row["status"],
                stamp(row["entered_at"]),
                stamp(row["left_at"]),
                f'{row["elapsed_ms"]:.1f}ms',
                row["http_status"],
            ]
            lines.append(
                " ".join(json.dumps(value, ensure_ascii=False) if value is not None else "?" for value in cells)
            )
    return "\n".join(lines)


async def inspect(options) -> None:
    if options.redis_url:
        client = Redis.from_url(
            options.redis_url,
            socket_connect_timeout=1,
            socket_timeout=1,
            retry=Retry(NoBackoff(), 0),
        )
    else:
        from SYSTEM.constants import EnumCache
        from SYSTEM.settings import CACHE_CONF

        conf = CACHE_CONF[EnumCache.SYS]
        client = Redis(
            host=conf["HOST"],
            port=conf["PORT"],
            db=conf["DB"],
            socket_connect_timeout=1,
            socket_timeout=1,
            retry=Retry(NoBackoff(), 0),
        )
    previous = {}
    try:
        while True:
            snapshot = await WorkerMonitor.read_snapshot(RedisAsync(redis=client), prefix=options.prefix)
            for row in snapshot["workers"]:
                identity = (row["run_id"], row["process_uid"])
                before = previous.get(identity)
                row["requests_per_second"] = None
                if before and row["status"] == "running" and row["sampled_at"] > before[0]:
                    row["requests_per_second"] = max(
                        0.0,
                        (row["completed_requests_total"] - before[1]) / (row["sampled_at"] - before[0]),
                    )
                previous[identity] = (
                    row["sampled_at"],
                    row["completed_requests_total"],
                )
            identities = {(row["run_id"], row["process_uid"]) for row in snapshot["workers"]}
            previous = {key: value for key, value in previous.items() if key in identities}
            print(
                (
                    json.dumps(snapshot, ensure_ascii=False)
                    if options.json
                    else render(snapshot, requests=options.requests)
                ),
                flush=True,
            )
            if not options.watch:
                return
            await asyncio.sleep(options.interval)
    finally:
        await client.aclose()


def main() -> None:
    from SYSTEM.settings import MONITOR_CYCLE_SEC

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Read periodically; otherwise print once.")
    parser.add_argument("--json", action="store_true", help="Print snapshots as JSON.")
    parser.add_argument(
        "--requests",
        action="store_true",
        help="Include short-lived request events, client IP and location.",
    )
    parser.add_argument("--interval", type=float, default=MONITOR_CYCLE_SEC)
    parser.add_argument("--prefix", default=MONITOR_PREFIX)
    parser.add_argument(
        "--redis-url",
        help="Optional isolated test Redis; default is the configured SYS client.",
    )
    options = parser.parse_args()
    if options.interval <= 0:
        parser.error("--interval must be positive")
    try:
        asyncio.run(inspect(options))
    except RedisError as exc:
        parser.exit(1, f"Redis monitoring read unavailable ({type(exc).__name__}).\n")
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
