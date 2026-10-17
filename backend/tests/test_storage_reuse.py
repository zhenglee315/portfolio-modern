"""Shared storage contracts, import-order safety and real Redis/SQL integration."""

import asyncio
import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import AsyncMock, Mock, patch
from urllib.parse import urlparse
from uuid import uuid4

from redis import Redis as DriverSyncRedis
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from COMMON.tools.storage.redis import RedisAsync, RedisSync
from COMMON.tools.storage.sqlalchemy import (
    SqlAlchemyExecAsync,
    SqlAlchemyTransactionObserver,
)

BACKEND = Path(__file__).resolve().parents[1]


class ImportTests(unittest.TestCase):
    def test_fresh_import_orders_without_connections_or_circular_dependencies(self):
        roots = (
            "SYSTEM.events",
            "SYSTEM.constants.constant_session",
            "SYSTEM.settings",
            "SYSTEM.database",
            "SYSTEM.tools.tools_monitor",
            "SYSTEM.tools.tools_socketio",
            "COMMON.tools.storage.redis",
            "COMMON.tools.storage.sqlalchemy",
            "APPs.Auth.module",
            "APPs.Management.module",
            "manage_fastapi",
            "SCHEDULER.SYSTEM.extension",
            "APPs.Sys.events_monitor",
        )
        for first in roots:
            order = (first, *(name for name in roots if name != first))
            code = (
                "import importlib\n"
                f"for name in {order!r}: importlib.import_module(name)\n"
                "from SYSTEM.database import CONN_MANAGER\n"
                "assert CONN_MANAGER._engine is None\n"
                "assert CONN_MANAGER._aioredis == {}\n"
            )
            with self.subTest(first=first):
                result = subprocess.run(
                    [sys.executable, "-c", code],
                    cwd=BACKEND,
                    capture_output=True,
                    text=True,
                    timeout=8,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_system_tools_have_no_common_imports(self):
        folders = (BACKEND / "SYSTEM/tools", BACKEND / "SCHEDULER/SYSTEM/tools")
        for folder in folders:
            for path in folder.rglob("*.py"):
                for node in ast.walk(ast.parse(path.read_text())):
                    if isinstance(node, ast.ImportFrom):
                        self.assertFalse((node.module or "").startswith("COMMON"), str(path))
                    elif isinstance(node, ast.Import):
                        self.assertFalse(
                            any(alias.name.startswith("COMMON") for alias in node.names),
                            str(path),
                        )
        code = (
            "import sys\n"
            "import SYSTEM.tools\n"
            "assert not any(name.startswith('COMMON.tools.storage') for name in sys.modules)\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=BACKEND,
            capture_output=True,
            text=True,
            timeout=8,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


class RedisAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = Redis()
        self.cache = RedisAsync(redis=self.client)

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_injected_client_is_used_without_manager_lookup(self):
        with patch(
            "SYSTEM.database.CONN_MANAGER.get_cache",
            side_effect=AssertionError("unexpected lookup"),
        ):
            cache = RedisAsync(redis=self.client)
            self.assertIs(cache.redis, self.client)

    async def test_raw_json_mget_does_not_attempt_pickle_decoding(self):
        value = b'{"worker": 1}'
        with (
            patch.object(self.client, "mget", AsyncMock(return_value=[value, None])),
            patch(
                "COMMON.tools.storage.redis.tools_redis_async.pickle.loads",
                side_effect=AssertionError("pickle"),
            ),
        ):
            self.assertEqual(
                await self.cache.mget(["snapshot", "missing"], deserialize=False),
                [value, None],
            )

    async def test_ping_eval_and_zrem_forward_raw_results_and_errors(self):
        with (
            patch.object(self.client, "ping", AsyncMock(return_value=True)) as ping,
            patch.object(self.client, "eval", AsyncMock(return_value=b"revision")) as evaluate,
            patch.object(self.client, "zrem", AsyncMock(return_value=1)) as remove,
        ):
            self.assertTrue(await self.cache.ping())
            self.assertEqual(await self.cache.eval("return ARGV[1]", 0, "raw"), b"revision")
            self.assertEqual(await self.cache.zrem("watch", "owner"), 1)
            self.assertEqual(await self.cache.zrem("watch"), 0)
            ping.assert_awaited_once()
            evaluate.assert_awaited_once_with("return ARGV[1]", 0, "raw")
            remove.assert_awaited_once_with("watch", "owner")

    async def test_lock_returns_underlying_token_lease_without_acquiring_it(self):
        lease = object()
        with patch.object(self.client, "lock", return_value=lease) as create:
            self.assertIs(self.cache.lock("job", timeout=30), lease)
            create.assert_called_once_with("job", timeout=30, blocking=False, thread_local=False)

    async def test_sync_adapter_never_closes_borrowed_client(self):
        client = DriverSyncRedis()
        try:
            cache = RedisSync(client)
            with patch.object(client, "close") as close:
                cache.close()
                close.assert_not_called()
            with cache.pipeline() as pipe:
                self.assertIs(pipe.connection_pool, client.connection_pool)
        finally:
            client.close()

    async def test_sync_factory_owns_client_and_keeps_bounded_io(self):
        cache = RedisSync.from_config({"HOST": "127.0.0.1", "PORT": 16389, "DB": 0})
        self.assertTrue(cache.owns_client)
        self.assertEqual(cache.redis.connection_pool.connection_kwargs["socket_timeout"], 0.5)
        with patch.object(cache.redis, "close") as close:
            cache.close()
            close.assert_called_once()
        cache.redis.close()


class SqlAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine)
        self.observer = SqlAlchemyTransactionObserver(self.engine, ignore_key="ignore-test")
        self.observer.start()

    async def asyncTearDown(self):
        self.observer.stop()
        await self.engine.dispose()

    async def test_injected_session_avoids_manager_and_preserves_owner(self):
        async with self.sessions() as session:
            with patch(
                "SYSTEM.database.CONN_MANAGER.get_db",
                side_effect=AssertionError("unexpected lookup"),
            ):
                db = SqlAlchemyExecAsync(session=session, manage_transaction=False)
                async with session.begin():
                    self.assertEqual(await db.query_scalar("SELECT 1"), 1)
                    self.assertTrue(session.in_transaction())
                    self.assertEqual(self.observer.snapshot()["active_transactions"], 1)
            self.assertEqual(self.observer.snapshot()["active_transactions"], 0)

    async def test_observer_counts_root_transactions_and_excludes_savepoints(self):
        async with self.sessions() as session:
            db = SqlAlchemyExecAsync(session=session, manage_transaction=False)
            async with session.begin():
                await db.execute_orm(select(1))
                async with session.begin_nested():
                    await db.query_scalar("SELECT 2")
                    self.assertEqual(self.observer.snapshot()["active_transactions"], 1)
                self.assertEqual(self.observer.snapshot()["active_transactions"], 1)
            self.assertEqual(self.observer.snapshot()["completed_transactions_total"], 1)
            with self.assertRaises(ValueError):
                async with session.begin():
                    await db.query_scalar("SELECT 3")
                    raise ValueError("rollback")
        self.assertEqual(self.observer.snapshot()["completed_transactions_total"], 2)

    async def test_observer_ignores_selected_sessions_and_detaches(self):
        async with self.sessions() as session:
            session.info["ignore-test"] = True
            db = SqlAlchemyExecAsync(session=session, manage_transaction=False)
            self.assertEqual(await db.query_scalar("SELECT 1"), 1)
            self.assertEqual(self.observer.snapshot()["active_transactions"], 0)
        self.assertEqual(self.observer.snapshot()["completed_transactions_total"], 0)
        self.observer.stop()
        self.assertFalse(self.observer.listening)
        async with self.sessions() as session:
            await SqlAlchemyExecAsync(session=session, manage_transaction=False).query_scalar("SELECT 1")
        self.assertEqual(self.observer.snapshot()["completed_transactions_total"], 0)

    async def test_default_helper_resolves_manager_only_at_execution(self):
        with patch("SYSTEM.database.CONN_MANAGER.get_db", side_effect=self.sessions) as get_db:
            db = SqlAlchemyExecAsync()
            get_db.assert_not_called()
            self.assertEqual(await db.query_scalar("SELECT 1"), 1)
            get_db.assert_called_once()
        self.assertEqual(self.observer.snapshot()["active_transactions"], 0)


class GeoIpInjectionTests(unittest.TestCase):
    def test_preparation_is_injected_and_runs_before_opening_city_file(self):
        from SYSTEM.tools.tools_geoip import GeoIpReader

        order = []
        driver = Mock()
        driver.metadata.return_value.database_type = "GeoIP2-City"

        def prepare(path):
            order.append(("prepare", path))

        def open_file(path):
            order.append(("open", Path(path)))
            return driver

        path = Path("injected-city.mmdb")
        reader = GeoIpReader(path, prepare_database=prepare)
        with patch("SYSTEM.tools.tools_geoip.Reader", side_effect=open_file):
            self.assertTrue(reader.open())
        self.assertEqual(order, [("prepare", path), ("open", path)])
        reader.close()
        driver.close.assert_called_once()

    def test_preparation_failure_still_allows_existing_city_database(self):
        from SYSTEM.tools.tools_geoip import GeoIpReader

        driver = Mock()
        driver.metadata.return_value.database_type = "GeoIP2-City"
        prepare = Mock(side_effect=ValueError("invalid replacement archive"))
        reader = GeoIpReader("existing-city.mmdb", prepare_database=prepare)
        with patch("SYSTEM.tools.tools_geoip.Reader", return_value=driver):
            self.assertTrue(reader.open())
        prepare.assert_called_once_with(Path("existing-city.mmdb"))
        reader.close()


@unittest.skipUnless(os.environ.get("SCHEDULER_TEST_REDIS_URL"), "isolated Redis URL not supplied")
class RedisIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_and_sync_tools_share_raw_snapshots_and_atomic_lua(self):
        url = os.environ["SCHEDULER_TEST_REDIS_URL"]
        client = Redis.from_url(url)
        cache = RedisAsync(redis=client)
        parsed = urlparse(url)
        sync = RedisSync.from_config(
            {
                "HOST": parsed.hostname,
                "PORT": parsed.port,
                "DB": int(parsed.path.strip("/") or "0"),
            }
        )
        prefix = f"storage-reuse:{uuid4().hex}"
        try:

            def publish():
                with sync.pipeline() as pipe:
                    pipe.set(f"{prefix}:worker", json.dumps({"pid": 123}), ex=10)
                    pipe.set(f"{prefix}:alive", "1", ex=5)
                    pipe.execute()

            await asyncio.to_thread(publish)
            raw = await cache.mget([f"{prefix}:worker", f"{prefix}:alive"], deserialize=False)
            self.assertEqual(json.loads(raw[0]), {"pid": 123})
            self.assertEqual(raw[1], b"1")
            self.assertEqual(
                set(await cache.scan_iter(match=f"{prefix}:*")),
                {f"{prefix}:worker", f"{prefix}:alive"},
            )
            await cache.eval(
                "redis.call('ZADD',KEYS[1],1,ARGV[1]); return 1",
                1,
                f"{prefix}:watch",
                "owner",
            )
            self.assertEqual(await cache.zrem(f"{prefix}:watch", "owner"), 1)
            lock = cache.lock(f"{prefix}:lease", timeout=1)
            self.assertTrue(await lock.acquire())
            await lock.reacquire()
            await lock.release()
        finally:
            keys = await cache.scan_iter(match=f"{prefix}:*")
            if keys:
                await cache.delete(*keys)
            sync.close()
            await client.aclose()


@unittest.skipUnless(
    os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL"),
    "isolated PostgreSQL URL not supplied",
)
class PostgresIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_shared_sql_tools_commit_and_rollback_with_real_postgresql(self):
        engine = create_async_engine(os.environ["PLATFORM_PATCH_TEST_POSTGRES_URL"])
        sessions = async_sessionmaker(engine)
        observer = SqlAlchemyTransactionObserver(engine)
        observer.start()
        try:
            with patch("SYSTEM.database.CONN_MANAGER.get_db", side_effect=sessions):
                db = SqlAlchemyExecAsync()
                self.assertEqual(await db.query_scalar("SELECT 1"), 1)
                self.assertEqual(
                    await db.query_dict("SELECT CAST(:value AS INTEGER) AS value", {"value": 7}),
                    [{"value": 7}],
                )
                with self.assertRaises(RuntimeError):
                    async with db.transaction() as transaction:
                        self.assertEqual(await transaction.query_scalar("SELECT 3"), 3)
                        raise RuntimeError("rollback")
            self.assertEqual(observer.snapshot()["active_transactions"], 0)
            self.assertEqual(observer.snapshot()["completed_transactions_total"], 3)
        finally:
            observer.stop()
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
