"""Exercise overview HTTP contracts, calendar aggregation, collection and event relocation."""

from datetime import datetime, timedelta, timezone
from importlib import import_module, util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
import os

from alembic.migration import MigrationContext
from alembic.operations import Operations
import httpx
import pytest
import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from APPs.Monitor.module import module_monitor as monitor
from APPs.Monitor.schema.parser.parser_monitor import MonitorPeriod
from APPs.Monitor.schema.resp.resp_monitor import RespMonitorAvailability, RespMonitorLogins, RespMonitorTraffic
from APPs.Monitor.views_monitor import router
from SYSTEM.models import RecordLogin, RecordMonitorCoverage, RecordMonitorHealth, RecordRequest
from test_auth_architecture import sign_in
from test_management_permission import change, expect_private

UTC = timezone.utc
QUERY = {"start": "2026-10-09", "end": "2026-10-15", "timezone": "Asia/Taipei"}


@pytest.fixture
def overview(auth_client):
    async def tables():
        engine = auth_client.app.state.sessions.kw["bind"]
        async with engine.begin() as connection:
            await connection.run_sync(auth_client.app.state.models.BASE.metadata.create_all)
        async with auth_client.app.state.sessions.begin() as session:
            session.add_all(
                [
                    RecordMonitorCoverage(
                        source=source,
                        started_at=datetime(2026, 1, 1, tzinfo=UTC),
                        through_at=datetime(2026, 10, 18, tzinfo=UTC),
                    )
                    for source in ("traffic", "logins")
                ]
            )

    auth_client.portal.call(tables)
    auth_client.app.include_router(router)
    return auth_client


@pytest.fixture
def overview_cache(overview):
    from SYSTEM.tools.tools_fastapi import fastapi_cache_key_builder

    backend = InMemoryBackend()
    FastAPICache.reset()
    FastAPICache.init(backend, prefix="monitor-test-" + uuid4().hex, key_builder=fastapi_cache_key_builder)
    overview.app.state.monitor_response_cache = backend
    try:
        yield overview
    finally:
        FastAPICache.reset()


def seed(client, *rows):
    async def write():
        async with client.app.state.sessions.begin() as session:
            session.add_all(rows)

    client.portal.call(write)


def request_row(at, path="/portfolio/site"):
    return RecordRequest(
        request_id=uuid4().hex,
        run_id="run",
        instance_id="node",
        process_uid="123-start",
        pid=123,
        method="GET",
        path=path,
        geo_status="unknown",
        entered_at=at,
        left_at=at,
        duration_ms=10,
        http_status=200,
        status="completed",
        failed=False,
    )


@pytest.mark.parametrize("resource", ["traffic", "logins", "availability", "services"])
def test_monitor_http_permission_rechecks_current_role(overview, resource):
    response = overview.get(f"/monitor/{resource}")
    assert response.status_code == 401
    expect_private(response)
    sign_in(overview)
    response = overview.get(f"/monitor/{resource}")
    assert response.status_code == 200, response.text
    expect_private(response)
    change(
        overview,
        update(overview.app.state.models.AuthRole)
        .where(overview.app.state.models.AuthRole.id == 1)
        .values(is_manage_sites=False),
    )
    response = overview.get(f"/monitor/{resource}")
    assert response.status_code == 403
    expect_private(response)


@pytest.mark.parametrize(
    "query",
    [
        "start=2026-10-09",
        "timezone=invalid",
        "timezone=../UTC",
        "start=2026-10-10&end=2026-10-09",
        "start=2026-01-01&end=2026-10-15",
        "start=9999-01-01&end=9999-01-02",
        "start=0001-01-01&end=0001-01-02",
        "start=2026-10-09T00:00&end=2026-10-15",
        "timezone=UTC&timezone=Asia/Taipei",
        "unexpected=true",
        "scope=unknown",
        "service_id=",
    ],
)
def test_monitor_rejects_malformed_ambiguous_and_unbounded_queries(overview, query):
    sign_in(overview)
    response = overview.get(f"/monitor/traffic?{query}")
    assert response.status_code == 400, response.text
    expect_private(response)


def test_service_scope_is_explicit_and_unknown_service_is_rejected(overview):
    sign_in(overview)
    response = overview.get("/monitor/services")
    item = response.json()["items"][0]
    assert item["id"] == monitor.MONITOR_SERVICE_ID
    assert item["scope"] == "shared_database"
    assert item["versions"]["fastapi"]
    assert "probe_url" not in response.text and "password" not in response.text
    assert overview.get("/monitor/services?unexpected=1").status_code == 400
    for route in ("traffic", "logins", "availability"):
        result = overview.get(f"/monitor/{route}", params={**QUERY, "service_id": "missing"})
        assert result.status_code == 404 and result.json()["detail"] == "MONITOR_SERVICE_NOT_FOUND"


def test_request_totals_reads_current_run_redis_and_rechecks_permission(overview, monkeypatch):
    metrics = SimpleNamespace(
        read=AsyncMock(
            return_value=dict(
                run_id="boot-1",
                instance_id="node",
                basis="server_run",
                total=8,
                successful=5,
                failed=3,
                started_at="2026-10-18T00:00:00Z",
                sampled_at="2026-10-18T00:01:00Z",
            )
        )
    )
    overview.app.state.monitor = SimpleNamespace(request_metrics=metrics)
    response = overview.get("/monitor/request-totals")
    assert response.status_code == 401
    metrics.read.assert_not_awaited()
    sign_in(overview)

    def reject_history(*args, **kwargs):
        raise AssertionError("Request totals may not construct a history database reader")

    monkeypatch.setattr(monitor, "SqlAlchemyExecAsync", reject_history)
    response = overview.get("/monitor/request-totals")
    assert response.status_code == 200, response.text
    assert response.json()["successful"] == 5 and response.json()["failed"] == 3
    expect_private(response)
    assert overview.get("/monitor/request-totals?is_caching=true").status_code == 400
    assert overview.get("/monitor/request-totals?worker=1&worker=2").status_code == 400
    metrics.read.assert_awaited_once()
    change(overview, update(overview.app.state.models.AuthRole).values(is_manage_sites=False))
    response = overview.get("/monitor/request-totals")
    assert response.status_code == 403
    expect_private(response)
    metrics.read.assert_awaited_once()


def test_request_totals_unavailable_does_not_fabricate_zero_counts(overview):
    from redis.exceptions import RedisError

    sign_in(overview)
    overview.app.state.monitor = SimpleNamespace(request_metrics=None)
    response = overview.get("/monitor/request-totals")
    assert response.status_code == 503
    expect_private(response)
    overview.app.state.monitor.request_metrics = SimpleNamespace(read=AsyncMock(side_effect=RedisError()))
    response = overview.get("/monitor/request-totals")
    assert response.status_code == 503 and response.json()["detail"] == "MONITOR_UNAVAILABLE"
    expect_private(response)


def test_traffic_calendar_bounds_prior_comparison_and_scope(overview):
    sign_in(overview)
    seed(
        overview,
        request_row(datetime(2026, 10, 2, 0, tzinfo=UTC)),  # Prior local week.
        request_row(datetime(2026, 10, 8, 16, tzinfo=UTC)),  # Oct 9 midnight in Taipei.
        request_row(datetime(2026, 10, 9, 15, 59, tzinfo=UTC)),
        request_row(datetime(2026, 10, 9, 16, tzinfo=UTC), "/authority/session"),  # Oct 10.
        request_row(datetime(2026, 10, 15, 16, tzinfo=UTC)),  # Exclusive end.
        request_row(datetime(2026, 10, 10, tzinfo=UTC), "/monitor/traffic"),
    )
    result = overview.get("/monitor/traffic", params=QUERY).json()
    assert result["total"] == 3 and result["metric"] == "http_requests"
    assert [row["count"] for row in result["series"]] == [2, 1, 0, 0, 0, 0, 0]
    assert result["comparison"] == dict(
        start="2026-10-02", end="2026-10-08", total=1, complete=True, change_percent=200.0
    )
    assert result["coverage"]["complete"] is True
    result = overview.get("/monitor/traffic", params={**QUERY, "scope": "portfolio"}).json()
    assert result["total"] == 2


def test_incomplete_coverage_and_zero_baseline_never_fabricate_growth(overview):
    sign_in(overview)
    seed(overview, request_row(datetime(2026, 10, 10, tzinfo=UTC)))
    result = overview.get("/monitor/traffic", params=QUERY).json()
    assert result["comparison"]["change_percent"] is None
    change(
        overview,
        update(RecordMonitorCoverage)
        .where(RecordMonitorCoverage.source == "traffic")
        .values(
            started_at=datetime(2026, 10, 10, tzinfo=UTC),
            through_at=None,
        ),
    )
    result = overview.get("/monitor/traffic", params=QUERY).json()
    assert result["coverage"]["complete"] is False and result["coverage"]["data_as_of"] is None
    assert not any(row["complete"] for row in result["series"])
    assert result["comparison"]["complete"] is False
    assert result["comparison"]["change_percent"] is None


def test_login_deduplication_last_location_unknown_and_timestamp_ties(overview):
    sign_in(overview)
    models = overview.app.state.models
    second = models.AuthUser(id=2, user="second", email="second@example.com", role_id=1)
    overview.portal.call(second.set_password, "12345678")
    seed(overview, second)
    # User 1 changes countries and finally has an unknown location; no fallback to GB.
    seed(
        overview,
        RecordLogin(
            id=100, user_id=1, logintime=datetime(2026, 10, 9, tzinfo=UTC), country_code="GB", geo_status="resolved"
        ),
        RecordLogin(
            id=101, user_id=1, logintime=datetime(2026, 10, 10, tzinfo=UTC), country_code="TW", geo_status="resolved"
        ),
        RecordLogin(id=102, user_id=1, logintime=datetime(2026, 10, 10, tzinfo=UTC), geo_status="unknown"),
        RecordLogin(
            id=103, user_id=2, logintime=datetime(2026, 10, 10, tzinfo=UTC), country_code="JP", geo_status="resolved"
        ),
        RecordLogin(
            id=104, user_id=2, logintime=datetime(2026, 10, 11, tzinfo=UTC), country_code="TW", geo_status="resolved"
        ),
        RecordLogin(id=105, user_id=1, logintime=datetime(2026, 10, 2, tzinfo=UTC)),
    )
    response = overview.get("/monitor/logins", params=QUERY)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["total"] == 2
    assert [row["count"] for row in result["series"]] == [1, 2, 1, 0, 0, 0, 0]
    assert result["unknown_users"] == 1 and result["country_count"] == 1
    assert result["local_users"] == 0
    assert result["countries"] == [dict(country_code="TW", users=1, percent=50.0)]
    assert result["comparison"]["total"] == 1 and result["comparison"]["change_percent"] == 100.0
    assert all(key not in response.text for key in ("email", "ip_address", "user_id"))


@pytest.mark.parametrize("address", ["127.0.0.1", "::1", "192.168.1.5"])
def test_local_logins_follow_latest_event_without_reclassifying_unknown_accounts(overview, address):
    sign_in(overview)
    second = overview.app.state.models.AuthUser(id=2, user="local", email="local@example.com", role_id=1)
    overview.portal.call(second.set_password, "12345678")
    seed(overview, second)
    seed(
        overview,
        RecordLogin(id=100, user_id=1, logintime=datetime(2026, 10, 10, tzinfo=UTC), geo_status="unknown"),
        RecordLogin(
            id=101, user_id=2, logintime=datetime(2026, 10, 10, tzinfo=UTC), country_code="GB", geo_status="resolved"
        ),
        RecordLogin(
            id=102, user_id=2, logintime=datetime(2026, 10, 11, tzinfo=UTC), ip_address=address, geo_status="non_public"
        ),
    )
    result = overview.get("/monitor/logins", params=QUERY).json()
    assert result["total"] == 2
    assert result["local_users"] == 1 and result["unknown_users"] == 1
    assert result["country_count"] == 0 and result["countries"] == []
    # A later known country replaces the same account's local marker, without double counting it.
    seed(
        overview,
        RecordLogin(
            id=103, user_id=2, logintime=datetime(2026, 10, 12, tzinfo=UTC), country_code="TW", geo_status="resolved"
        ),
    )
    result = overview.get("/monitor/logins", params=QUERY).json()
    assert result["total"] == 2 and result["local_users"] == 0 and result["unknown_users"] == 1
    assert result["countries"] == [dict(country_code="TW", users=1, percent=50.0)]


def test_storage_failure_returns_private_sanitized_503(overview):
    sign_in(overview)

    async def drop():
        async with overview.app.state.sessions.kw["bind"].begin() as connection:
            await connection.run_sync(RecordRequest.__table__.drop)

    overview.portal.call(drop)
    response = overview.get("/monitor/traffic", params=QUERY)
    assert response.status_code == 503 and response.json() == {"detail": "MONITOR_UNAVAILABLE"}
    expect_private(response)
    assert "record_request" not in response.text


def test_availability_distinguishes_missing_checks_and_liveness(overview):
    assert overview.get("/monitor/health").json() == {"status": "ok"}
    sign_in(overview)
    at = datetime(2026, 10, 10, tzinfo=UTC)
    seed(
        overview,
        RecordMonitorHealth(
            service_id=monitor.MONITOR_SERVICE_ID,
            checked_at=at,
            http_ok=True,
            redis_ok=True,
            database_ok=True,
            http_status=200,
            duration_ms=1,
        ),
        RecordMonitorHealth(
            service_id=monitor.MONITOR_SERVICE_ID,
            checked_at=at + timedelta(minutes=1),
            http_ok=False,
            redis_ok=True,
            database_ok=True,
            http_status=503,
            duration_ms=2,
        ),
    )
    response = overview.get("/monitor/availability", params={"start": "2026-10-10", "end": "2026-10-10"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["expected"], result["observed"], result["successful"]) == (1440, 2, 1)
    assert result["availability_percent"] == 50
    assert result["coverage_percent"] < 1 and result["slo_met"] is None
    assert result["current_status"] == "unknown"  # Historical observation is stale.


def test_empty_availability_has_unknown_percentage_and_dst_day_length(overview):
    sign_in(overview)
    result = overview.get(
        "/monitor/availability", params={"start": "2026-03-29", "end": "2026-03-29", "timezone": "Europe/London"}
    ).json()
    assert result["expected"] == 1380  # Spring-forward day has 23 hours.
    assert result["availability_percent"] is None and result["coverage_percent"] == 0
    assert result["slo_met"] is None and result["latest"] is None


def test_fully_observed_day_can_evaluate_slo(overview):
    sign_in(overview)
    at = datetime(2026, 10, 10, tzinfo=UTC)
    seed(
        overview,
        *[
            RecordMonitorHealth(
                service_id=monitor.MONITOR_SERVICE_ID,
                checked_at=at + timedelta(minutes=offset),
                http_ok=True,
                redis_ok=True,
                database_ok=True,
                http_status=200,
                duration_ms=1,
            )
            for offset in range(1440)
        ],
    )
    result = overview.get("/monitor/availability", params={"start": "2026-10-10", "end": "2026-10-10"}).json()
    assert result["coverage_percent"] == result["availability_percent"] == 100
    assert result["slo_met"] is True


def test_health_collector_persists_once_per_minute_and_records_failures(overview, monkeypatch):
    client_type = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(503, json={"detail": "unavailable"}))
    monkeypatch.setattr(monitor.httpx, "AsyncClient", lambda **kwargs: client_type(transport=transport, **kwargs))
    cache = SimpleNamespace(ping=AsyncMock(return_value=False))

    async def collect():
        module = monitor.MonitorModule(cache=cache)
        await module.sample_health()
        await module.sample_health()
        async with overview.app.state.sessions() as session:
            return (await session.scalars(select(RecordMonitorHealth))).all()

    rows = overview.portal.call(collect)
    assert len(rows) == 1
    assert rows[0].http_ok is False and rows[0].redis_ok is False and rows[0].database_ok is True
    assert rows[0].http_status == 503


def test_ingestion_watermark_advances_only_after_queue_is_drained(overview):
    async def exercise():
        at = datetime(2026, 10, 18, 1, tzinfo=UTC)
        cache = SimpleNamespace(stream_length=AsyncMock(return_value=1))
        module = monitor.MonitorModule(cache=cache)
        await module.mark_ingested(at)
        async with overview.app.state.sessions() as session:
            before = (await session.get(RecordMonitorCoverage, "traffic")).through_at
        cache.stream_length.return_value = 0
        await module.mark_ingested(at)
        # A delayed older job may never regress the watermark.
        await module.mark_ingested(at - timedelta(hours=1))
        async with overview.app.state.sessions() as session:
            after = (await session.get(RecordMonitorCoverage, "traffic")).through_at
        return before, after

    before, after = overview.portal.call(exercise)
    assert before.replace(tzinfo=UTC) == datetime(2026, 10, 18, tzinfo=UTC)
    assert after.replace(tzinfo=UTC) == datetime(2026, 10, 18, 0, 59, 59, tzinfo=UTC)


def test_new_migration_preserves_existing_rows_and_reverses_new_tables():
    path = (
        Path(__file__).resolve().parents[1] / "SYSTEM/models/migrations/versions/c6f37a92d104_add_monitor_overview.py"
    )
    spec = util.spec_from_file_location("monitor_overview_revision", path)
    revision = util.module_from_spec(spec)
    spec.loader.exec_module(revision)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE record_request (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO record_request VALUES (7)"))
        with Operations.context(MigrationContext.configure(connection)):
            revision.upgrade()
            assert connection.scalar(sa.text("SELECT count(*) FROM record_monitor_coverage")) == 2
            assert connection.scalar(sa.text("SELECT id FROM record_request")) == 7
            revision.downgrade()
        assert set(sa.inspect(connection).get_table_names()) == {"record_request"}
    engine.dispose()


def test_events_are_discovered_only_under_monitor():
    from SYSTEM.tools.tools_socketio import socketio_include_events

    loaded = socketio_include_events()
    assert "APPs.Monitor.events_monitor" in loaded
    assert "APPs.Sys.events_monitor" not in loaded
    assert import_module("APPs.Monitor.events_monitor").authorize_monitor is monitor.authorize_monitor


def test_scheduler_http_probe_does_not_create_an_online_visitor(monkeypatch):
    middleware = import_module("SYSTEM.middleware.utils.middleware_heartbeat")
    heartbeat = AsyncMock()
    monkeypatch.setattr(middleware, "RedisAsync", lambda **_: SimpleNamespace(heartbeat_client=heartbeat))
    app = FastAPI()
    app.add_middleware(middleware.HeartbeatMiddleware)
    app.include_router(router)

    @app.get("/ordinary")
    async def ordinary():
        return {"ok": True}

    with TestClient(app) as client:
        assert client.get("/monitor/health").status_code == 200
        heartbeat.assert_not_awaited()
        assert client.get("/ordinary").status_code == 200
        heartbeat.assert_awaited_once()


@pytest.mark.parametrize("resource", ["traffic", "logins", "availability"])
def test_one_minute_cache_reuses_aggregates_and_preserves_private_headers(overview_cache, monkeypatch, resource):
    client = overview_cache
    sign_in(client)
    calls = []
    original = getattr(monitor.MonitorModule, resource)

    async def observed(self, period):
        calls.append(period)
        return await original(self, period)

    monkeypatch.setattr(monitor.MonitorModule, resource, observed)
    backend = client.app.state.monitor_response_cache
    write = AsyncMock(wraps=backend.set)
    monkeypatch.setattr(backend, "set", write)
    parameters = {**QUERY, "is_caching": "true"}
    first = client.get(f"/monitor/{resource}", params=parameters)
    second = client.get(f"/monitor/{resource}", params=parameters)
    assert first.status_code == second.status_code == 200, second.text
    assert first.headers["X-FastAPI-Cache"] == "MISS"
    assert second.headers["X-FastAPI-Cache"] == "HIT"
    assert first.json() == second.json() and len(calls) == 1
    expect_private(first)
    expect_private(second)
    assert write.await_args.args[2] == 60 and ":monitor:" in write.await_args.args[0]
    assert client.get(f"/monitor/{resource}", params={**QUERY, "is_caching": "false"}).status_code == 200
    assert client.get(f"/monitor/{resource}", params=QUERY).status_code == 200
    assert len(calls) == 3  # Opt-out and omitted flag each query storage.
    conditional = client.get(
        f"/monitor/{resource}", params=parameters, headers={"If-None-Match": second.headers["etag"]}
    )
    assert conditional.status_code == 304
    expect_private(conditional)


@pytest.mark.parametrize("resource", ["traffic", "logins", "availability"])
def test_cached_overview_never_bypasses_current_database_permission(overview_cache, monkeypatch, resource):
    client = overview_cache
    sign_in(client)
    parameters = {**QUERY, "is_caching": "true"}
    assert client.get(f"/monitor/{resource}", params=parameters).status_code == 200
    cached = client.get(f"/monitor/{resource}", params=parameters)
    assert cached.headers["X-FastAPI-Cache"] == "HIT"
    models = client.app.state.models
    change(client, update(models.AuthRole).where(models.AuthRole.id == 1).values(is_manage_sites=False))
    backend = client.app.state.monitor_response_cache
    lookup = AsyncMock(wraps=backend.get_with_ttl)
    monkeypatch.setattr(backend, "get_with_ttl", lookup)
    response = client.get(f"/monitor/{resource}", params=parameters, headers={"If-None-Match": cached.headers["etag"]})
    assert response.status_code == 403
    expect_private(response)
    lookup.assert_not_awaited()


def test_cached_default_period_rolls_at_local_midnight(overview_cache, monkeypatch):
    parser = import_module("APPs.Monitor.schema.parser.parser_monitor")
    clock = [datetime(2026, 10, 16, 12, tzinfo=UTC)]

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0].astimezone(tz)

    monkeypatch.setattr(parser, "datetime", Clock)
    sign_in(overview_cache)
    first = overview_cache.get("/monitor/traffic?is_caching=true")
    assert first.status_code == 200 and first.json()["period"]["start"] == "2026-10-09"
    clock[0] += timedelta(days=1)
    second = overview_cache.get("/monitor/traffic?is_caching=true")
    assert second.status_code == 200 and second.json()["period"]["start"] == "2026-10-10"
    assert second.headers["X-FastAPI-Cache"] == "MISS"


def test_cache_parser_is_shared_strict_and_private(overview_cache):
    sign_in(overview_cache)
    invalid = overview_cache.get("/monitor/traffic?is_caching=invalid")
    assert invalid.status_code == 422
    expect_private(invalid)
    repeated = overview_cache.get("/monitor/traffic?is_caching=true&is_caching=true")
    assert repeated.status_code == 400
    expect_private(repeated)
    parameters = overview_cache.app.openapi()["paths"]["/monitor/traffic"]["get"]["parameters"]
    assert next(row for row in parameters if row["name"] == "is_caching")["schema"]["type"] == "boolean"


@pytest.mark.skipif(not os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"), reason="Requires isolated PostgreSQL")
async def test_overview_aggregates_on_postgres_with_the_same_response_contract():
    """Exercise the real dialect, window ranking, UNION statistics and timezone boundaries."""
    url = os.environ["PLATFORM_PATCH_TEST_POSTGRES_URL"]
    schema = "monitor_overview_" + uuid4().hex
    owner = create_async_engine(url)
    engine = None
    try:
        async with owner.begin() as connection:
            await connection.execute(CreateSchema(schema))
        engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
        models = import_module("SYSTEM.models")
        async with engine.begin() as connection:
            await connection.run_sync(models.BASE.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        account = models.AuthUser(id=1, user="postgres-monitor", email="monitor@example.com", role_id=1)
        await account.set_password("test-monitor-password")
        async with sessions.begin() as session:
            session.add(models.AuthRole(id=1, role="monitor"))
            await session.flush()
            session.add(account)
            await session.flush()
            session.add_all(
                [
                    request_row(datetime(2026, 10, 8, 16, tzinfo=UTC)),
                    RecordLogin(
                        user_id=1, logintime=datetime(2026, 10, 9, tzinfo=UTC), country_code="JP", geo_status="resolved"
                    ),
                    RecordMonitorCoverage(
                        source="traffic",
                        started_at=datetime(2026, 1, 1, tzinfo=UTC),
                        through_at=datetime(2026, 10, 18, tzinfo=UTC),
                    ),
                    RecordMonitorCoverage(source="logins", started_at=datetime(2026, 1, 1, tzinfo=UTC)),
                ]
            )
        period = MonitorPeriod(datetime(2026, 10, 9).date(), datetime(2026, 10, 15).date(), "Asia/Taipei")
        async with sessions() as session:
            module = monitor.MonitorModule(db=monitor.SqlAlchemyExecAsync(session=session, manage_transaction=False))
            traffic = RespMonitorTraffic.model_validate(await module.traffic(period))
            logins = RespMonitorLogins.model_validate(await module.logins(period))
            health = RespMonitorAvailability.model_validate(await module.availability(period))
            assert traffic.total == 1 and traffic.series[0].count == 1
            assert traffic.coverage.complete is True
            assert logins.total == 1 and logins.countries[0].country_code == "JP"
            assert health.observed == 0 and health.expected == 7 * 1440
            assert health.availability_percent is None and health.slo_met is None
    finally:
        if engine is not None:
            await engine.dispose()
        async with owner.begin() as connection:
            await connection.execute(DropSchema(schema, cascade=True))
        await owner.dispose()
