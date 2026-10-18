"""Monitoring overview queries, collection checkpoints, probes and socket business logic."""

# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.module import AuthSessionModule
from APPs.Monitor.schema.parser.parser_monitor import (
    MONITOR_PRIVATE_HEADERS,
    MonitorPeriod,
    MonitorSubscription,
    MonitorTestMessage,
)

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.tools.storage.redis import RedisAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import CacheExpiry, EnumCache, EnumSess
from SYSTEM.events import EventMonitor, NameSpace
from SYSTEM.models import RecordLogin, RecordRequest, RecordMonitorCoverage, RecordMonitorHealth
from SYSTEM.settings import (
    SEC_SESSION_CONF,
    MONITOR_SERVICE_ID,
    MONITOR_SERVICE_NAME,
    MONITOR_ENVIRONMENT,
    MONITOR_REGION,
    MONITOR_PROBE_URL,
    MONITOR_SLO_PERCENT,
    MONITOR_CYCLE_SEC,
    MONITOR_REQUEST_QUEUE,
    SVR_HOST_CONF,
    SVR_PORT,
    SVR_WORKERS,
)
from SYSTEM.tools.tools_socketio import socketio_session_request

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import Column, and_, case, distinct, func, literal, select, union_all, update
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Socket.IO
from socketio.exceptions import ConnectionRefusedError as SocketConnectionRefusedError

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import ValidationError

# ◆—< Pack >—————————————————————————————————◆ HTTP
import httpx

# ◆—< Pack >—————————————————————————————————◆ Python
from datetime import datetime, timedelta, timezone
from importlib.metadata import version
import asyncio
import logging
import os
import platform
import time
import hashlib
import threading

LOGGER = logging.getLogger(__name__)
STORAGE_ERRORS = (SQLAlchemyError, RuntimeError, OSError, TimeoutError, RedisError, KeyError)


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


def _unavailable():
    return HTTPException(status_code=503, detail="MONITOR_UNAVAILABLE", headers=MONITOR_PRIVATE_HEADERS)


def _bucket(column, buckets):
    """SQL aggregation with explicit DST-aware UTC bounds on both supported dialects."""
    return case(*[(and_(column >= start, column < end), day.isoformat()) for day, start, end in buckets])


class MonitorRequestMetrics:
    """
    Accumulate middleware outcomes for one server run across every Worker in SYS Redis.

    Per-process checkpoints make retries and out-of-order publication idempotent.
    Worker replacement retains the run key; a new supervisor run starts a new key.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    _PUBLISH = """
        redis.call('HSETNX', KEYS[1], 'run_id', ARGV[1])
        redis.call('HSETNX', KEYS[1], 'instance_id', ARGV[2])
        redis.call('HSETNX', KEYS[1], 'started_at', ARGV[3])
        local success_key = 'success:' .. ARGV[4]
        local failed_key = 'failed:' .. ARGV[4]
        local previous_success = tonumber(redis.call('HGET', KEYS[1], success_key) or '0')
        local previous_failed = tonumber(redis.call('HGET', KEYS[1], failed_key) or '0')
        local success = math.max(previous_success, tonumber(ARGV[5]))
        local failed = math.max(previous_failed, tonumber(ARGV[6]))
        redis.call('HINCRBY', KEYS[1], 'successful', success - previous_success)
        redis.call('HINCRBY', KEYS[1], 'failed', failed - previous_failed)
        redis.call('HINCRBY', KEYS[1], 'total', success - previous_success + failed - previous_failed)
        redis.call('HSET', KEYS[1], success_key, success, failed_key, failed, 'sampled_at', ARGV[7])
        redis.call('EXPIRE', KEYS[1], ARGV[8])
        return 1
    """

    def __init__(self, *, cache, instance_id, run_id, process_uid):
        self.cache, self.instance_id, self.run_id = cache, instance_id, run_id
        self.process_uid = process_uid
        identity = hashlib.sha256(f"{instance_id}:{run_id}".encode()).hexdigest()[:32]
        self.key = f"system:monitor:metrics:requests:{identity}"
        self.started_at = time.time()
        self._successful = self._failed = 0
        self._flushed = None
        self._last_flush = float("-inf")
        self._lock = threading.RLock()

    def record(self, *, failed: bool):
        """Count one terminal outcome without Redis I/O in the HTTP response path."""
        with self._lock:
            if failed:
                self._failed += 1
            else:
                self._successful += 1

    async def flush(self):
        """Publish cumulative process counters on the existing sampling cycle; refresh idle keys every 30s."""
        with self._lock:
            values = (self._successful, self._failed)
        if values == self._flushed and time.monotonic() - self._last_flush < 30:
            return
        await self.cache.eval(
            self._PUBLISH,
            1,
            self.key,
            self.run_id,
            self.instance_id,
            self.started_at,
            self.process_uid,
            *values,
            time.time(),
            CacheExpiry.DAY,
        )
        self._flushed, self._last_flush = values, time.monotonic()

    async def read(self):
        """Read only the current run's shared Redis counters; never query request-history SQL."""
        fields = ("run_id", "instance_id", "started_at", "sampled_at", "successful", "failed", "total")
        raw = await self.cache.hash_mget(self.key, list(fields), deserialize=False)
        values = {
            key: value.decode() if isinstance(value, bytes) else value for key, value in zip(fields, raw, strict=True)
        }
        if values.get("run_id") != self.run_id or values.get("instance_id") != self.instance_id:
            raise ValueError("Current run metrics are unavailable")
        successful, failed, total = (int(values[key]) for key in ("successful", "failed", "total"))
        if min(successful, failed, total) < 0 or successful + failed != total:
            raise ValueError("Invalid request counters")
        return dict(
            run_id=self.run_id,
            instance_id=self.instance_id,
            basis="server_run",
            total=total,
            successful=successful,
            failed=failed,
            started_at=datetime.fromtimestamp(float(values["started_at"]), timezone.utc),
            sampled_at=datetime.fromtimestamp(float(values["sampled_at"]), timezone.utc),
        )


class MonitorModule:
    """
    Borrow shared storage; overview queries never read identities or raw IP addresses.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    def __init__(self, *, db=None, cache=None):
        self.db = db if db is not None else SqlAlchemyExecAsync()
        self.cache = cache

    def _cache(self):
        return self.cache if self.cache is not None else RedisAsync(key=EnumCache.SYS)

    @staticmethod
    async def request_totals(metrics):
        """Return middleware totals for this supervisor run directly from its borrowed SYS Redis wrapper."""
        if metrics is None:
            raise _unavailable()
        try:
            return await metrics.read()
        except (*STORAGE_ERRORS, ValueError, TypeError, OverflowError):
            raise _unavailable() from None

    @staticmethod
    def _check_service(period):
        if period.service_id is not None and period.service_id != MONITOR_SERVICE_ID:
            raise HTTPException(status_code=404, detail="MONITOR_SERVICE_NOT_FOUND", headers=MONITOR_PRIVATE_HEADERS)

    @staticmethod
    def _period(period):
        return dict(start=period.start, end=period.end, timezone=period.timezone, service_id=MONITOR_SERVICE_ID)

    @staticmethod
    def _comparison(period, total, previous_total, complete, previous_complete):
        previous = period.previous
        return dict(
            start=previous.start,
            end=previous.end,
            total=previous_total,
            complete=previous_complete,
            change_percent=(
                round((total - previous_total) / previous_total * 100, 2)
                if complete and previous_complete and previous_total
                else None
            ),
        )

    async def _coverage(self, db, source, period, now):
        row = (
            await db.execute_orm(select(RecordMonitorCoverage).where(RecordMonitorCoverage.source == source))
        ).scalar_one_or_none()
        started = _utc(row.started_at) if row is not None else None
        through = (_utc(row.through_at) if row is not None else None) if source == "traffic" else now
        if through is not None:
            through = min(through, now)
        return dict(
            started_at=started,
            data_as_of=through,
            complete=self._complete(period.bounds, started, through),
            basis="best_effort_http_events" if source == "traffic" else "stored_successful_sign_ins",
        )

    @staticmethod
    def _complete(bounds, started, through):
        return started is not None and through is not None and bounds[0] >= started and bounds[1] <= through

    async def traffic(self, period: MonitorPeriod):
        """Count HTTP observations in SQL, including missing calendar days and prior-period coverage."""
        self._check_service(period)
        now = datetime.now(timezone.utc)
        current, prior = list(period.buckets()), list(period.previous.buckets())
        stamp: Column[datetime] = RecordRequest.entered_at
        bucket = _bucket(stamp, prior + current)
        stmt = select(bucket.label("day"), func.count()).where(
            stamp >= prior[0][1],
            stamp < current[-1][2],
            RecordRequest.path != "/monitor",
            ~RecordRequest.path.startswith("/monitor/"),
        )
        if period.scope == "portfolio":
            stmt = stmt.where(RecordRequest.path.startswith("/portfolio/"))
        try:
            async with self.db.transaction() as db:
                db.session.info["system.monitor.ignore"] = True
                counts = dict((await db.execute_orm(stmt.group_by(bucket))).all())
                coverage = await self._coverage(db, "traffic", period, now)
        except STORAGE_ERRORS:
            raise _unavailable() from None
        total = sum(counts.get(day.isoformat(), 0) for day, _, _ in current)
        previous_total = sum(counts.get(day.isoformat(), 0) for day, _, _ in prior)
        previous_complete = self._complete(period.previous.bounds, coverage["started_at"], coverage["data_as_of"])
        return dict(
            period=self._period(period),
            scope=period.scope,
            total=total,
            daily_average=round(total / period.days, 2),
            series=[
                dict(
                    date=day,
                    count=counts.get(day.isoformat(), 0),
                    complete=self._complete((start, end), coverage["started_at"], coverage["data_as_of"]),
                )
                for day, start, end in current
            ],
            comparison=self._comparison(period, total, previous_total, coverage["complete"], previous_complete),
            coverage=coverage,
            generated_at=now,
        )

    async def logins(self, period: MonitorPeriod):
        """Deduplicate each day and period independently; rank only each user's last in-period login."""
        self._check_service(period)
        now = datetime.now(timezone.utc)
        current = list(period.buckets())
        stamp: Column[datetime] = RecordLogin.logintime
        start, end = period.bounds
        previous_start, previous_end = period.previous.bounds
        bucket = _bucket(stamp, current)
        ranked = (
            select(
                RecordLogin.country_code,
                RecordLogin.geo_status,
                func.row_number()
                .over(partition_by=RecordLogin.user_id, order_by=(stamp.desc(), RecordLogin.id.desc()))
                .label("rank"),
            )
            .where(stamp >= start, stamp < end)
            .subquery()
        )
        country = case(
            (ranked.c.geo_status == "non_public", literal("local")),
            (ranked.c.geo_status == "resolved", ranked.c.country_code),
            else_=None,
        )
        # One statement keeps totals, daily counts and countries on the same SQL
        # snapshot even when sign-ins arrive while this overview is being read.
        statistics = union_all(
            select(literal("total"), literal("current"), func.count(distinct(RecordLogin.user_id))).where(
                stamp >= start, stamp < end
            ),
            select(literal("total"), literal("previous"), func.count(distinct(RecordLogin.user_id))).where(
                stamp >= previous_start, stamp < previous_end
            ),
            select(literal("day"), bucket, func.count(distinct(RecordLogin.user_id)))
            .where(stamp >= start, stamp < end)
            .group_by(bucket),
            select(literal("country"), country, func.count()).where(ranked.c.rank == 1).group_by(country),
        )
        try:
            async with self.db.transaction() as db:
                db.session.info["system.monitor.ignore"] = True
                rows = (await db.execute_orm(statistics)).all()
                coverage = await self._coverage(db, "logins", period, now)
        except STORAGE_ERRORS:
            raise _unavailable() from None
        totals = {key: count for kind, key, count in rows if kind == "total"}
        total, previous_total = totals["current"], totals["previous"]
        counts = {key: count for kind, key, count in rows if kind == "day"}
        regions = [(key, count) for kind, key, count in rows if kind == "country"]
        countries = sorted(
            [
                dict(country_code=code, users=count, percent=round(count / total * 100, 2))
                for code, count in regions
                if code is not None and code != "local"
            ],
            key=lambda row: (-row["users"], row["country_code"]),
        )
        previous_complete = self._complete(period.previous.bounds, coverage["started_at"], coverage["data_as_of"])
        return dict(
            period=self._period(period),
            total=total,
            series=[
                dict(
                    date=day,
                    count=counts.get(day.isoformat(), 0),
                    complete=self._complete((first, last), coverage["started_at"], coverage["data_as_of"]),
                )
                for day, first, last in current
            ],
            comparison=self._comparison(period, total, previous_total, coverage["complete"], previous_complete),
            countries=countries,
            country_count=len(countries),
            local_users=sum(count for code, count in regions if code == "local"),
            unknown_users=sum(count for code, count in regions if code is None),
            coverage=coverage,
            generated_at=now,
        )

    @staticmethod
    def _availability_counts(expected, observed, successful):
        return dict(
            expected=expected,
            observed=observed,
            successful=successful,
            availability_percent=round(successful / observed * 100, 4) if observed else None,
            coverage_percent=round(observed / expected * 100, 4) if expected else None,
        )

    async def availability(self, period: MonitorPeriod):
        """Missing scheduler/probe minutes stay unknown, even during a database outage."""
        self._check_service(period)
        now = datetime.now(timezone.utc)
        until = min(period.bounds[1], now.replace(second=0, microsecond=0))
        buckets = list(period.buckets())
        stamp: Column[datetime] = RecordMonitorHealth.checked_at
        bucket = _bucket(stamp, buckets)
        healthy = and_(RecordMonitorHealth.http_ok, RecordMonitorHealth.redis_ok, RecordMonitorHealth.database_ok)
        try:
            async with self.db.transaction() as db:
                db.session.info["system.monitor.ignore"] = True
                observations = (
                    await db.execute_orm(
                        select(bucket.label("day"), func.count(), func.sum(case((healthy, 1), else_=0)))
                        .where(
                            RecordMonitorHealth.service_id == MONITOR_SERVICE_ID,
                            stamp >= period.bounds[0],
                            stamp < until,
                        )
                        .group_by(bucket)
                    )
                ).all()
                latest = (
                    await db.execute_orm(
                        select(RecordMonitorHealth)
                        .where(RecordMonitorHealth.service_id == MONITOR_SERVICE_ID)
                        .order_by(stamp.desc())
                        .limit(1)
                    )
                ).scalar_one_or_none()
        except STORAGE_ERRORS:
            raise _unavailable() from None
        counts = {day: (observed, successful) for day, observed, successful in observations}
        series = [
            dict(
                date=day,
                **self._availability_counts(
                    max(0, int((min(last, until) - first).total_seconds() // 60)),
                    *counts.get(day.isoformat(), (0, 0)),
                ),
            )
            for day, first, last in buckets
        ]
        totals = self._availability_counts(
            *(sum(row[key] for row in series) for key in ("expected", "observed", "successful"))
        )
        full = period.bounds[1] <= now and totals["expected"] > 0 and totals["observed"] == totals["expected"]
        latest_view, current_status = None, "unknown"
        if latest is not None:
            latest_view = {
                key: getattr(latest, key)
                for key in ("checked_at", "http_ok", "redis_ok", "database_ok", "http_status", "duration_ms")
            }
            latest_view["checked_at"] = _utc(latest.checked_at)
            age = (now - latest_view["checked_at"]).total_seconds()
            if 0 <= age <= 120:
                current_status = "healthy" if latest.http_ok and latest.redis_ok and latest.database_ok else "unhealthy"
        return dict(
            period=self._period(period),
            **totals,
            slo_target_percent=MONITOR_SLO_PERCENT,
            slo_met=(totals["successful"] * 100 >= MONITOR_SLO_PERCENT * totals["observed"]) if full else None,
            series=series,
            latest=latest_view,
            current_status=current_status,
            generated_at=now,
        )

    @staticmethod
    async def services():
        """One logical service backed by the shared database; do not invent per-service login attribution."""
        return dict(
            items=[
                dict(
                    id=MONITOR_SERVICE_ID,
                    name=MONITOR_SERVICE_NAME,
                    environment=MONITOR_ENVIRONMENT,
                    region=MONITOR_REGION,
                    host=SVR_HOST_CONF,
                    port=SVR_PORT,
                    expected_workers=SVR_WORKERS,
                    versions={
                        "fastapi": version("fastapi"),
                        "uvicorn": version("uvicorn"),
                        "python": platform.python_version(),
                    },
                )
            ],
            worker_cycle_seconds=MONITOR_CYCLE_SEC,
        )

    @staticmethod
    async def health():
        """A minimal HTTP liveness response; the scheduler checks Redis and SQL separately."""
        return {"status": "ok"}

    async def mark_ingested(self, started_at):
        """Advance only after a successful drain with no remaining queue entries."""
        if await self._cache().stream_length(MONITOR_REQUEST_QUEUE):
            return
        through = started_at - timedelta(seconds=max(1, MONITOR_CYCLE_SEC * 2))
        async with self.db.transaction() as db:
            await db.execute_orm(
                update(RecordMonitorCoverage)
                .where(
                    RecordMonitorCoverage.source == "traffic",
                    (RecordMonitorCoverage.through_at.is_(None) | (RecordMonitorCoverage.through_at < through)),
                )
                .values(through_at=through)
            )

    async def sample_health(self):
        """Probe the configured HTTP endpoint and dependencies with bounded independent timeouts."""
        checked_at = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        clock = time.monotonic()

        async def http_probe():
            try:
                async with httpx.AsyncClient(timeout=3, trust_env=False, follow_redirects=False) as client:
                    response = await client.get(MONITOR_PROBE_URL)
            except httpx.HTTPError:
                return False, None
            try:
                healthy = response.status_code == 200 and response.json() == {"status": "ok"}
            except ValueError:
                healthy = False
            return healthy, response.status_code

        async def dependency(check):
            try:
                async with asyncio.timeout(2):
                    return bool(await check())
            except STORAGE_ERRORS:
                return False

        http_result, redis_ok, database_ok = await asyncio.gather(
            http_probe(),
            dependency(lambda: self._cache().ping()),
            dependency(lambda: self.db.query_scalar("SELECT 1")),
        )
        row = dict(
            service_id=MONITOR_SERVICE_ID,
            checked_at=checked_at,
            http_ok=http_result[0],
            http_status=http_result[1],
            redis_ok=redis_ok,
            database_ok=database_ok,
            duration_ms=(time.monotonic() - clock) * 1000,
        )
        async with self.db.transaction() as db:
            dialect = db.session.get_bind().dialect.name
            insert = postgres_insert if dialect == "postgresql" else sqlite_insert
            await db.execute_orm(
                insert(RecordMonitorHealth)
                .values(**row)
                .on_conflict_do_nothing(index_elements=["service_id", "checked_at"])
            )
        return row


async def authorize_monitor(environ):
    """Reload the cookie-selected server session and current database-issued socket permission."""
    # The Socket.IO session adapter borrows the client owned by the shared Redis wrapper.
    redis = RedisAsync(key=EnumCache.SYS).redis
    request = await socketio_session_request(environ, redis, SEC_SESSION_CONF)
    async with SqlAlchemyExecAsync().transaction() as db:
        db.session.info["system.monitor.ignore"] = True
        account = await AuthSessionModule(
            request, session=db.session, redis=redis, manage_transaction=False
        ).current_session()
    if account is None or account.get(EnumSess.IS_MANAGE_SITES) is not True:
        return None
    return account[EnumSess.ID]


class MonitorEventModule:
    """Socket event business logic with an injected server, separate from decorator registration."""

    def __init__(self, server):
        self.server = server

    async def connect(self, sid, environ):
        stream = getattr(self.server, "monitor_stream", None)
        if stream is None:
            raise SocketConnectionRefusedError("MONITOR_UNAVAILABLE", {"code": "MONITOR_UNAVAILABLE"})
        try:
            return await stream.connect(sid, environ)
        except (HTTPException, RedisError, TimeoutError, OSError, RuntimeError, ValueError, KeyError):
            raise SocketConnectionRefusedError("MONITOR_UNAVAILABLE", {"code": "MONITOR_UNAVAILABLE"}) from None

    async def disconnect(self, sid, reason=None):
        if stream := getattr(self.server, "monitor_stream", None):
            await stream.disconnect(sid)
        LOGGER.debug("Monitor disconnected: %s (%s)", sid, reason)

    async def subscribe(self, sid, data, *, resync=False):
        try:
            payload = MonitorSubscription.model_validate(data)
            stream = getattr(self.server, "monitor_stream", None)
            if stream is None:
                return {"ok": False, "error": "MONITOR_UNAVAILABLE"}
            return await stream.subscribe(sid, payload.topics, resync=resync)
        except ValidationError:
            return {"ok": False, "error": "INVALID_PAYLOAD"}
        except (HTTPException, RedisError, TimeoutError, OSError, RuntimeError):
            return {"ok": False, "error": "MONITOR_UNAVAILABLE"}

    async def unsubscribe(self, sid):
        if stream := getattr(self.server, "monitor_stream", None):
            try:
                return await stream.unsubscribe(sid)
            except (RedisError, TimeoutError, OSError):
                return {"ok": False, "error": "MONITOR_UNAVAILABLE"}
        return {"ok": True}

    async def test(self, sid, data=None):
        try:
            message = MonitorTestMessage.model_validate({} if data is None else data).message
        except ValidationError:
            result = {"ok": False, "error": "INVALID_PAYLOAD"}
        else:
            result = dict(
                ok=True,
                message=message,
                pid=os.getpid(),
                sid=sid,
                transport=self.server.transport(sid, namespace=NameSpace.MONITOR),
            )
        await self.server.emit(EventMonitor.TEST_RESULT, result, to=sid, namespace=NameSpace.MONITOR)
        return result
