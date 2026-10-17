"""Durable request-history integration; only disposable Redis/PostgreSQL URLs."""

from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
import httpx
from fastapi import FastAPI
from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from COMMON.tools.storage.redis import RedisAsync
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from SCHEDULER.JOBs.Sys.module.module_monitor import MonitorRequestModule, RequestEvent
from SYSTEM.middleware import MonitorMiddleware
from SYSTEM.models.models_record import RecordRequest
from SYSTEM.tools.tools_monitor import WorkerMonitor


def event_payload(**changes):
    now = datetime.now(timezone.utc).timestamp()
    return {
        "schema": 1,
        "request_id": uuid4().hex,
        "run_id": "run",
        "instance_id": "node",
        "process_uid": "123-start",
        "pid": 123,
        "method": "GET",
        "path": "/hello",
        "ip_address": "127.0.0.1",
        "country_code": None,
        "region": None,
        "city": None,
        "geo_status": "non_public",
        "entered_at": now,
        "response_started_at": now,
        "left_at": now + 0.01,
        "duration_ms": 10,
        "http_status": 200,
        "status": "completed",
        "failed": False,
        **changes,
    }


class EventSchemaTests(unittest.TestCase):
    def test_queue_epoch_values_become_utc_database_values(self):
        row = RequestEvent.model_validate_json(json.dumps(event_payload())).record_values()
        self.assertEqual(row["entered_at"].tzinfo, timezone.utc)
        self.assertNotIn("schema_version", row)

    def test_invalid_events_are_rejected_before_sql(self):
        for changes in (
            {"schema": 2},
            {"duration_ms": -1},
            {"duration_ms": float("nan")},
            {"geo_status": "pending"},
            {"http_status": 999},
            {"failed": "false"},
            {"entered_at": float("inf")},
            {"request_id": "bad"},
            {"ip_address": "bad"},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                RequestEvent.model_validate_json(json.dumps(event_payload(**changes)))


class RequestHistoryCases:
    database_url = "sqlite+aiosqlite:///:memory:"

    async def asyncSetUp(self):
        self.client = Redis.from_url(os.environ["SCHEDULER_TEST_REDIS_URL"])
        self.cache = RedisAsync(redis=self.client)
        self.prefix = f"request-history-test:{uuid4().hex}"
        self.queue = f"{self.prefix}:queue"
        self.engine = create_async_engine(self.database_url)
        async with self.engine.begin() as connection:
            await connection.run_sync(lambda conn: RecordRequest.__table__.create(conn, checkfirst=True))
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.database_patch = patch(
            "COMMON.tools.storage.sqlalchemy.tools_sqlalchemy_async.CONN_MANAGER.get_db",
            side_effect=self.sessions,
        )
        self.database_patch.start()
        self.db = SqlAlchemyExecAsync()
        self.monitors = []

    async def asyncTearDown(self):
        for monitor in self.monitors:
            await monitor.stop()
        self.database_patch.stop()
        async with self.engine.begin() as connection:
            await connection.run_sync(lambda conn: RecordRequest.__table__.drop(conn, checkfirst=True))
        await self.engine.dispose()
        keys = await self.cache.scan_iter(match=f"{self.prefix}:*")
        if keys:
            await self.cache.delete(*keys)
        await self.client.aclose()

    def publisher(self, **kwargs):
        options = {"request_batch_size": 500, "request_buffer_size": 10000, **kwargs}
        monitor = WorkerMonitor(
            self.cache,
            prefix=self.prefix,
            request_queue=self.queue,
            **options,
        )
        monitor.status = "running"
        self.monitors.append(monitor)
        return monitor

    def consumer(self, **kwargs):
        return MonitorRequestModule(
            cache=self.cache,
            db=self.db,
            stream=self.queue,
            group="history-test",
            **kwargs,
        )

    def complete(self, monitor, *, path="/hello", ip="127.0.0.1", status=200):
        token = monitor.begin_request({"method": "GET", "path": path, "client": (ip, 123)})
        request_id = monitor.snapshot()["requests"][-1]["request_id"]
        monitor.response_started(token, status)
        monitor.end_request(token, http_status=status, failed=status >= 500)
        return request_id

    async def rows(self):
        return (await self.db.execute_orm(select(RecordRequest).order_by(RecordRequest.id))).scalars().all()

    async def test_completion_queues_once_and_preserves_ui_snapshot(self):
        monitor = self.publisher()
        token = monitor.begin_request({"method": "GET", "path": "/active", "client": ("127.0.0.1", 1)})
        await monitor.publish()
        self.assertEqual(await self.client.xlen(self.queue), 0)
        monitor.end_request(token, http_status=200)
        monitor.end_request(token, http_status=200)
        await monitor.publish()
        self.assertEqual(await self.client.xlen(self.queue), 1)
        self.assertEqual(await self.client.ttl(self.queue), -1)
        result = await self.consumer().flush()
        self.assertEqual(result["inserted"], 1)
        self.assertEqual(await self.client.xlen(self.queue), 0)
        self.assertEqual((await self.client.xpending(self.queue, "history-test"))["pending"], 0)
        snapshot = await WorkerMonitor.read_snapshot(self.cache, prefix=self.prefix)
        self.assertEqual(len(snapshot["requests"]), 1)
        self.assertEqual((await self.rows())[0].request_id, snapshot["requests"][0]["request_id"])

    async def test_history_keeps_more_than_two_hundred_ui_details(self):
        monitor = self.publisher()
        for number in range(525):
            self.complete(monitor, path=f"/history/{number}")
        self.assertEqual(len(monitor.snapshot()["recent_requests"]), 200)
        await monitor.publish()
        await monitor.publish()
        self.assertEqual(await self.client.xlen(self.queue), 525)
        self.assertEqual(monitor.history_enqueued_total, 525)
        self.assertEqual((await self.consumer(batch_size=128).flush())["inserted"], 525)
        self.assertEqual(len(await self.rows()), 525)

    async def test_geoip_is_frozen_for_more_than_sixty_four_unique_ips(self):
        class Geo:
            def lookup(self, address):
                return SimpleNamespace(
                    record_values=lambda: {
                        "ip_address": address,
                        "country_code": "US",
                        "region": "California",
                        "city": "Mountain View",
                        "geo_status": "resolved",
                    }
                )

        monitor = self.publisher(geoip_reader=Geo())
        for number in range(1, 101):
            self.complete(monitor, ip=f"8.8.4.{number}")
        await monitor.publish()
        await self.consumer().flush()
        rows = await self.rows()
        self.assertEqual(len(rows), 100)
        self.assertTrue(all(row.country_code == "US" and row.geo_status == "resolved" for row in rows))

    async def test_publish_outage_keeps_buffer_for_retry(self):
        monitor = self.publisher()
        self.complete(monitor)
        with patch.object(self.client, "pipeline", side_effect=RedisConnectionError("offline")):
            with self.assertRaises(RedisConnectionError):
                await monitor.publish()
        self.assertEqual(len(monitor._history), 1)
        await monitor.publish()
        self.assertEqual((await self.consumer().flush())["inserted"], 1)
        self.assertFalse(monitor._history)

    async def test_full_memory_buffer_reports_drops_without_discarding_older_events(
        self,
    ):
        monitor = self.publisher(request_batch_size=2, request_buffer_size=2)
        first = self.complete(monitor)
        second = self.complete(monitor)
        with self.assertLogs("SYSTEM.tools.tools_monitor", level="ERROR"):
            self.complete(monitor)
        self.assertEqual(monitor.snapshot()["history_dropped_total"], 1)
        await monitor.publish()
        await self.consumer().flush()
        self.assertEqual({row.request_id for row in await self.rows()}, {first, second})

    async def test_shutdown_drains_more_than_one_publication_batch(self):
        monitor = self.publisher(request_batch_size=2)
        for _ in range(5):
            self.complete(monitor)
        await monitor.stop()
        self.assertFalse(monitor._history)
        self.assertEqual((await self.consumer().flush())["inserted"], 5)

    async def test_completion_during_enrichment_waits_for_the_next_batch(self):
        monitor = self.publisher()
        first = self.complete(monitor)
        enrich = monitor._enrich_locations

        async def finish_another_request(history):
            self.complete(monitor, path="/arrived-during-enrichment")
            await enrich(history)

        with patch.object(monitor, "_enrich_locations", side_effect=finish_another_request):
            await monitor.publish()
        self.assertEqual(len(monitor._history), 1)
        await self.consumer().flush()
        self.assertEqual([row.request_id for row in await self.rows()], [first])
        await monitor.publish()
        await self.consumer().flush()
        self.assertEqual(len(await self.rows()), 2)

    async def test_new_migration_round_trip_preserves_other_tables_and_matches_model(
        self,
    ):
        migration_path = (
            Path(__file__).resolve().parents[1]
            / "SYSTEM/models/migrations/versions/8e2b9c4f6a10_add_request_history.py"
        )
        spec = importlib.util.spec_from_file_location("request_history_migration", migration_path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)

        def exercise(connection):
            RecordRequest.__table__.drop(connection)
            connection.execute(text("CREATE TABLE request_history_sentinel (value INTEGER NOT NULL)"))
            connection.execute(text("INSERT INTO request_history_sentinel VALUES (42)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                actual = inspect(connection)
                columns = {column["name"]: column for column in actual.get_columns("record_request")}
                self.assertEqual(set(columns), set(RecordRequest.__table__.columns.keys()))
                for column in RecordRequest.__table__.columns:
                    self.assertEqual(columns[column.name]["nullable"], column.nullable)
                self.assertEqual(
                    {
                        index["name"]
                        for index in actual.get_indexes("record_request")
                        if not index.get("duplicates_constraint")
                    },
                    {index.name for index in RecordRequest.__table__.indexes},
                )
                self.assertEqual(
                    actual.get_unique_constraints("record_request")[0]["column_names"],
                    ["request_id"],
                )
                migration.downgrade()
                self.assertFalse(inspect(connection).has_table("record_request"))
                self.assertEqual(
                    connection.execute(text("SELECT value FROM request_history_sentinel")).scalar(),
                    42,
                )
                migration.upgrade()
            connection.execute(text("DROP TABLE request_history_sentinel"))

        async with self.engine.begin() as connection:
            await connection.run_sync(exercise)
        monitor = self.publisher()
        self.complete(monitor)
        await monitor.publish()
        self.assertEqual((await self.consumer().flush())["inserted"], 1)

    async def test_ambiguous_publish_can_redeliver_without_duplicate_sql_rows(self):
        monitor = self.publisher()
        self.complete(monitor)
        create_pipeline = self.client.pipeline

        def lost_reply(*args, **kwargs):
            pipe = create_pipeline(*args, **kwargs)
            execute = pipe.execute

            async def commit_then_disconnect(*args, **kwargs):
                await execute(*args, **kwargs)
                raise RedisConnectionError("reply lost after EXEC")

            pipe.execute = commit_then_disconnect
            return pipe

        with patch.object(self.client, "pipeline", side_effect=lost_reply):
            with self.assertRaises(RedisConnectionError):
                await monitor.publish()
        await monitor.publish()
        self.assertEqual(await self.client.xlen(self.queue), 2)
        result = await self.consumer().flush()
        self.assertEqual((result["inserted"], result["duplicates"]), (1, 1))
        self.assertEqual(len(await self.rows()), 1)

    async def test_sql_failure_leaves_pending_event_until_recovery(self):
        monitor = self.publisher()
        self.complete(monitor)
        await monitor.publish()
        with patch.object(
            SqlAlchemyExecAsync,
            "execute_orm",
            AsyncMock(side_effect=RuntimeError("database outage")),
        ):
            with self.assertRaisesRegex(RuntimeError, "database outage"):
                await self.consumer().flush()
        self.assertEqual((await self.client.xpending(self.queue, "history-test"))["pending"], 1)
        self.assertEqual(len(await self.rows()), 0)
        self.assertEqual((await self.consumer(consumer="recovered").flush())["inserted"], 1)

    async def test_commit_failure_does_not_ack_or_keep_partial_sql_rows(self):
        monitor = self.publisher()
        self.complete(monitor)
        await monitor.publish()
        with patch.object(AsyncSession, "commit", AsyncMock(side_effect=RuntimeError("commit failed"))):
            with self.assertRaisesRegex(RuntimeError, "commit failed"):
                await self.consumer().flush()
        self.assertEqual(await self.client.xlen(self.queue), 1)
        self.assertEqual(len(await self.rows()), 0)
        self.assertEqual((await self.consumer().flush())["inserted"], 1)

    async def test_ack_failure_after_commit_retries_idempotently(self):
        monitor = self.publisher()
        self.complete(monitor)
        await monitor.publish()
        with patch.object(
            self.cache,
            "stream_ack_delete",
            AsyncMock(side_effect=RedisConnectionError("ack lost")),
        ):
            with self.assertRaises(RedisConnectionError):
                await self.consumer().flush()
        self.assertEqual(len(await self.rows()), 1)
        self.assertEqual((await self.client.xpending(self.queue, "history-test"))["pending"], 1)
        result = await self.consumer().flush()
        self.assertEqual((result["inserted"], result["duplicates"]), (0, 1))
        self.assertEqual(await self.client.xlen(self.queue), 0)

    async def test_dead_consumer_pending_events_are_reclaimed(self):
        monitor = self.publisher()
        self.complete(monitor)
        await monitor.publish()
        await self.cache.stream_group_create(self.queue, "history-test")
        entries = await self.cache.stream_read(self.queue, "history-test", "dead-consumer", count=10)
        self.assertEqual(len(entries), 1)
        self.assertEqual((await self.consumer().flush())["inserted"], 1)

    async def test_poison_event_is_quarantined_without_blocking_valid_requests(self):
        await self.client.xadd(self.queue, {"payload": "broken JSON"})
        monitor = self.publisher()
        self.complete(monitor)
        await monitor.publish()
        result = await self.consumer().flush()
        self.assertEqual((result["inserted"], result["rejected"]), (1, 1))
        self.assertEqual(await self.client.xlen(self.queue), 0)
        dead = await self.client.xrange(f"{self.queue}:dead")
        self.assertEqual(len(dead), 1)
        self.assertEqual(dead[0][1][b"payload"], b"broken JSON")

    async def test_batch_budget_leaves_remaining_events_for_next_minute(self):
        monitor = self.publisher()
        for _ in range(5):
            self.complete(monitor)
        await monitor.publish()
        self.assertEqual((await self.consumer(batch_size=2, max_batches=1).flush())["processed"], 2)
        self.assertEqual(await self.client.xlen(self.queue), 3)
        self.assertEqual((await self.consumer().flush())["processed"], 3)

    async def test_asgi_middleware_events_reach_sql_with_response_status(self):
        monitor = self.publisher()
        app = FastAPI()
        app.state.monitor = monitor

        @app.get("/business")
        async def route():
            return {"ok": True}

        wrapped = MonitorMiddleware(app, state=app.state)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=wrapped), base_url="http://test") as client:
            self.assertEqual((await client.get("/business")).status_code, 200)
        await monitor.publish()
        await self.consumer().flush()
        row = (await self.rows())[0]
        self.assertEqual(
            (row.method, row.path, row.http_status, row.status),
            ("GET", "/business", 200, "completed"),
        )


@unittest.skipUnless(os.environ.get("SCHEDULER_TEST_REDIS_URL"), "isolated Redis required")
class SQLiteRequestHistoryTests(RequestHistoryCases, unittest.IsolatedAsyncioTestCase):
    pass


@unittest.skipUnless(
    os.environ.get("SCHEDULER_TEST_REDIS_URL") and os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"),
    "isolated Redis and PostgreSQL required",
)
class PostgresRequestHistoryTests(RequestHistoryCases, unittest.IsolatedAsyncioTestCase):
    @property
    def database_url(self):
        return os.environ["PLATFORM_PATCH_TEST_POSTGRES_URL"]


if __name__ == "__main__":
    unittest.main()
