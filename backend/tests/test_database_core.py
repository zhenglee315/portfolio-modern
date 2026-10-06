"""Verify the current single async database manager without local configuration or services."""

# ◆—< Pack >—————————————————————————————————◆ Tests
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock
from enum import StrEnum
import asyncio
import sys

import pytest
from fastapi import FastAPI
from fastapi_cache import FastAPICache
from redis.asyncio import Redis as AsyncRedis
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.pool import StaticPool


# ■—< FIXTURE >————————————————————————————————————————————————————————————————————————■ Isolated Core
@pytest.fixture
def core(monkeypatch, tmp_path):
    """
    Load the real manager with memory SQLite and unconnected Redis clients.

    :param monkeypatch: Isolate settings and constants without loading application YAML.
    :param tmp_path: pytest directory below the caller's agent-owned --basetemp.
    :return: Real database core module backed by non-secret test settings.
    """
    settings = ModuleType("SYSTEM.settings")
    settings.DB_CONF = {
        "type": "sqlite",
        "name": ":memory:",
        "is_async": True,
        "sqlite": str(tmp_path),
    }
    settings.SQLALCHEMY_ENGINE_CONF = {
        "echo": False,
        "future": True,
        "pool_size": 2,
        "max_overflow": 1,
        "pool_timeout": 1,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_use_lifo": True,
    }
    settings.CACHE_CONF = {
        "System": {"HOST": "127.0.0.1", "PORT": 6379, "DB": 0, "POOL_SIZE": 2},
        "WebCache": {"HOST": "127.0.0.1", "PORT": 6379, "DB": 1, "POOL_SIZE": 3},
    }
    constants = ModuleType("SYSTEM.constants")

    class EnumDBType(StrEnum):
        """Match the two supported database identifiers without importing YAML-backed constants."""

        SQLLite = "sqlite"
        POSTGRESQL = "postgresql"

    class EnumCache(StrEnum):
        """Match the application's cache keys for isolated lifespan verification."""

        SYS = "System"
        WEB = "WebCache"

    constants.EnumDBType = EnumDBType
    constants.EnumCache = EnumCache
    monkeypatch.setitem(sys.modules, "SYSTEM.settings", settings)
    monkeypatch.setitem(sys.modules, "SYSTEM.constants", constants)
    path = Path(__file__).resolve().parents[1] / "SYSTEM/database/database_core.py"
    spec = spec_from_file_location("database_core_under_test", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ SQL Sessions


def test_uninitialized_resources_raise_without_connecting(core):
    """Require explicit initialization before handing out SQL sessions or Redis clients."""
    manager = core.ConnectionManager()
    with pytest.raises(RuntimeError, match="init_db"):
        manager.get_db()
    with pytest.raises(KeyError):
        manager.get_cache("WebCache")
    asyncio.run(manager.shutdown_all_connections())


def test_memory_sqlite_transactions_and_fresh_sessions(core):
    """Commit successful writes, roll back failed transactions, and reuse one engine with fresh sessions."""
    manager = core.ConnectionManager()
    manager.init_db()
    assert isinstance(manager._engine, AsyncEngine)
    assert isinstance(manager._engine.pool, StaticPool)

    async def exercise():
        """Execute real memory SQLite transactions and release resources even on assertion failure."""
        try:
            async with manager.get_db() as session:
                assert isinstance(session, AsyncSession)
                async with session.begin():
                    await session.execute(text("CREATE TABLE item (id INTEGER PRIMARY KEY)"))
                    await session.execute(text("INSERT INTO item VALUES (1)"))
            with pytest.raises(RuntimeError, match="rollback"):
                async with manager.get_db() as session:
                    async with session.begin():
                        await session.execute(text("INSERT INTO item VALUES (2)"))
                        raise RuntimeError("rollback")
            async with manager.get_db() as first, manager.get_db() as second:
                assert first is not second
                assert await first.scalar(text("SELECT COUNT(*) FROM item")) == 1
                assert await second.scalar(text("SELECT id FROM item")) == 1
        finally:
            await manager.shutdown_all_connections()

    asyncio.run(exercise())
    with pytest.raises(RuntimeError, match="init_db"):
        manager.get_db()


def test_sqlite_connections_enforce_foreign_keys(core):
    """Reject orphan rows through the manager's real SQLite connection event."""
    manager = core.ConnectionManager()
    manager.init_db()

    async def exercise():
        """Verify both PRAGMA enforcement and a constraint failure against real tables."""
        try:
            async with manager.get_db() as session:
                assert await session.scalar(text("PRAGMA foreign_keys")) == 1
                await session.execute(text("CREATE TABLE parent (id INTEGER PRIMARY KEY)"))
                await session.execute(text("CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))"))
                await session.commit()
            with pytest.raises(IntegrityError):
                async with manager.get_db() as session:
                    async with session.begin():
                        await session.execute(text("INSERT INTO child VALUES (99)"))
            async with manager.get_db() as session:
                assert await session.scalar(text("SELECT COUNT(*) FROM child")) == 0
        finally:
            await manager.shutdown_all_connections()

    asyncio.run(exercise())


def test_relative_sqlite_uses_configured_directory_and_is_lazy(core, tmp_path):
    """Resolve relative SQLite names under the configured test directory without opening a file early."""
    manager = core.ConnectionManager()
    manager.db_conf.update(name="async_aio_report", sqlite=str(tmp_path / "nested"))
    target = tmp_path / "nested" / "async_aio_report"
    assert manager.get_db_url().database == str(target)
    assert target.parent.is_dir() and not target.exists()
    manager.init_db()
    assert isinstance(manager._engine, AsyncEngine)
    assert manager._engine.pool.size() == 2
    assert not target.exists()

    async def exercise():
        """Open only the agent-owned SQLite file and close its engine before returning."""
        try:
            async with manager.get_db() as session:
                assert await session.scalar(text("SELECT 1")) == 1
            assert target.is_file()
        finally:
            await manager.shutdown_all_connections()

    asyncio.run(exercise())


def test_absolute_sqlite_name_preserves_location(core, tmp_path):
    """Keep an explicit file location instead of appending the relative SQLite directory."""
    manager = core.ConnectionManager()
    target = tmp_path / "absolute" / "portfolio.sqlite"
    unused = tmp_path / "unused"
    manager.db_conf.update(name=str(target), sqlite=str(unused))
    assert manager.get_db_url().database == str(target)
    assert target.parent.is_dir() and not target.exists()
    assert not unused.exists()


def test_duplicate_initialization_and_reconfiguration_after_shutdown(core, tmp_path):
    """Preserve an initialized engine and allow a new configuration after complete disposal."""
    manager = core.ConnectionManager()
    manager.init_db()
    original = manager._engine
    with pytest.raises(RuntimeError, match="already been initialized"):
        manager.init_db()
    assert manager._engine is original

    async def exercise():
        """Dispose the old memory database, then initialize and query a separate test file."""
        try:
            await manager.shutdown_all_connections()
            assert manager._engine is None and manager._session_factory is None
            manager.db_conf["name"] = str(tmp_path / "replacement.sqlite")
            manager.init_db()
            assert manager._engine is not original
            async with manager.get_db() as session:
                assert await session.scalar(text("SELECT 2")) == 2
        finally:
            await manager.shutdown_all_connections()
        await manager.shutdown_all_connections()

    asyncio.run(exercise())


def test_each_manager_owns_independent_configuration(core):
    """Copy scalar SQL settings and nested cache mappings so instances do not alter one another."""
    first, second = core.ConnectionManager(), core.ConnectionManager()
    first.db_conf["name"] = "changed.sqlite"
    first.engine_conf["pool_size"] = 99
    first.cache_conf["WebCache"]["POOL_SIZE"] = 99
    assert second.db_conf["name"] == ":memory:"
    assert second.engine_conf["pool_size"] == 2
    assert second.cache_conf["WebCache"]["POOL_SIZE"] == 3
    assert core.DB_CONF["name"] == ":memory:"
    assert core.CACHE_CONF["WebCache"]["POOL_SIZE"] == 3


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ Configuration Validation


@pytest.mark.parametrize("mode", [False, None, 0, "true"])
def test_only_explicit_async_database_mode_is_supported(core, mode):
    """Reject synchronous or ambiguous driver modes before registering an engine."""
    manager = core.ConnectionManager()
    manager.db_conf["is_async"] = mode
    with pytest.raises(ValueError, match="asynchronous"):
        manager.init_db()
    assert manager._engine is None and manager._session_factory is None


@pytest.mark.parametrize("name", [None, "", "  ", 7])
def test_database_name_must_be_nonblank_string(core, name):
    """Reject unusable database names before constructing an engine or touching a file."""
    manager = core.ConnectionManager()
    manager.db_conf["name"] = name
    with pytest.raises(ValueError, match="non-empty string"):
        manager.get_db_url()
    assert manager._engine is None


def test_unsupported_database_type_and_non_mapping_configuration(core):
    """Keep configuration errors explicit for unsupported drivers and malformed mappings."""
    manager = core.ConnectionManager()
    manager.db_conf["type"] = "unsupported"
    with pytest.raises(ValueError, match="Unsupported database type"):
        manager.get_db_url()
    manager.db_conf = []
    with pytest.raises(TypeError, match="dictionary"):
        manager.get_db_url()


@pytest.mark.parametrize("missing", ["host", "user", "password"])
def test_postgresql_requires_connection_fields_without_connecting(core, missing):
    """Validate required PostgreSQL fields without contacting a PostgreSQL service."""
    manager = core.ConnectionManager()
    manager.db_conf.update(type="postgresql", name="test", host="example.invalid", user="test", password="test-only")
    manager.db_conf[missing] = None
    with pytest.raises(ValueError, match=missing):
        manager.get_db_url()
    assert manager._engine is None


def test_postgresql_url_escaping_and_engine_registration_are_lazy(core, capsys):
    """Keep test credentials in structured URLs and avoid connecting or printing them during registration."""
    manager = core.ConnectionManager()
    manager.db_conf.update(
        type="postgresql", name="test", host="example.invalid", port=5432, user="test@user", password="test:pass@word"
    )
    url = manager.get_db_url()
    assert url.drivername == "postgresql+asyncpg"
    assert url.username == "test@user" and url.password == "test:pass@word"
    assert "test:pass@word" not in url.render_as_string()
    manager.init_db()
    assert isinstance(manager._engine, AsyncEngine)
    assert manager._engine.pool.checkedout() == 0
    asyncio.run(manager.shutdown_all_connections())
    output = capsys.readouterr().out
    assert "test:pass@word" not in output and "example.invalid" not in output


def test_failed_engine_construction_publishes_no_session_factory(core, monkeypatch):
    """Leave the manager uninitialized when the engine factory rejects its configuration."""
    manager = core.ConnectionManager()

    def reject(*_args, **_kwargs):
        """Represent a factory error without constructing a driver or opening a connection."""
        raise ValueError("test factory rejected configuration")

    monkeypatch.setattr(core, "create_async_engine", reject)
    with pytest.raises(ValueError, match="factory rejected"):
        manager.init_db()
    assert manager._engine is None and manager._session_factory is None


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ Redis Registration


def test_redis_clients_are_async_lazy_and_disposed_with_their_pools(core):
    """Register configured cache roles without connecting and remove closed clients after shutdown."""
    manager = core.ConnectionManager()
    manager.init_cache()
    web = manager.get_cache("WebCache")
    assert isinstance(web, AsyncRedis)
    assert web.connection_pool.max_connections == 3
    assert web.connection_pool.connection_kwargs["db"] == 1
    assert web.connection_pool.connection_kwargs["socket_timeout"] == 5
    assert web.connection_pool._available_connections == []
    assert manager.get_cache("WebCache") is web
    assert manager._engine is None
    asyncio.run(manager.shutdown_all_connections())
    assert manager._aioredis == {}
    with pytest.raises(KeyError):
        manager.get_cache("WebCache")
    asyncio.run(manager.shutdown_all_connections())


def test_duplicate_cache_registration_preserves_original_clients(core):
    """Reject duplicate cache roles while retaining their existing unconnected clients."""
    manager = core.ConnectionManager()
    manager.init_cache()
    original = manager.get_cache("System")
    try:
        with pytest.raises(ValueError, match="already exists"):
            manager.init_cache()
        assert manager.get_cache("System") is original
        assert set(manager._aioredis) == {"System", "WebCache"}
    finally:
        asyncio.run(manager.shutdown_all_connections())


@pytest.mark.parametrize("invalid", [None, [], "invalid"])
def test_invalid_cache_batch_does_not_publish_partial_clients(core, invalid):
    """Keep previously staged lazy clients out of the registry when another mapping is malformed."""
    manager = core.ConnectionManager()
    manager.cache_conf = {"first": manager.cache_conf["WebCache"], "bad": invalid}
    with pytest.raises(TypeError, match="dictionary"):
        manager.init_cache()
    assert manager._aioredis == {}


@pytest.mark.parametrize("missing", ["HOST", "PORT", "DB"])
def test_cache_requires_its_connection_fields(core, missing):
    """Reject absent Redis host, port, or database fields before publishing a client."""
    manager = core.ConnectionManager()
    conf = manager.cache_conf["WebCache"]
    del conf[missing]
    manager.cache_conf = {"WebCache": conf}
    with pytest.raises(KeyError, match=missing):
        manager.init_cache()
    assert manager._aioredis == {}


def test_cache_pool_capacity_has_a_default(core):
    """Use the documented default pool capacity when POOL_SIZE is omitted."""
    manager = core.ConnectionManager()
    del manager.cache_conf["WebCache"]["POOL_SIZE"]
    manager.init_cache()
    try:
        assert manager.get_cache("WebCache").connection_pool.max_connections == 10
    finally:
        asyncio.run(manager.shutdown_all_connections())


# ■—< TEST >——————————————————————————————————————————————————————————————————————————■ Shutdown and Lifespan


def test_shutdown_attempts_every_resource_and_retries_only_failures(core):
    """Retain failed resources for retry while releasing every successfully closed resource."""
    manager = core.ConnectionManager()
    engine = SimpleNamespace(dispose=AsyncMock(side_effect=RuntimeError("database close failed")))
    failed = SimpleNamespace(aclose=AsyncMock(side_effect=RuntimeError("cache close failed")))
    successful = SimpleNamespace(aclose=AsyncMock())
    factory = object()
    manager._engine, manager._session_factory = engine, factory
    manager._aioredis = {"failed": failed, "successful": successful}

    async def exercise():
        """Verify aggregate errors, retained state, retry behavior, and idempotent cleanup."""
        with pytest.raises(ExceptionGroup) as raised:
            await manager.shutdown_all_connections()
        assert len(raised.value.exceptions) == 2
        assert manager._engine is engine and manager._session_factory is factory
        assert manager._aioredis == {"failed": failed}
        engine.dispose.assert_awaited_once()
        failed.aclose.assert_awaited_once_with(close_connection_pool=True)
        successful.aclose.assert_awaited_once_with(close_connection_pool=True)
        engine.dispose.side_effect = None
        failed.aclose.side_effect = None
        await manager.shutdown_all_connections()
        assert manager._engine is None and manager._session_factory is None
        assert manager._aioredis == {}
        assert engine.dispose.await_count == failed.aclose.await_count == 2
        assert successful.aclose.await_count == 1
        await manager.shutdown_all_connections()
        assert engine.dispose.await_count == failed.aclose.await_count == 2

    asyncio.run(exercise())


@pytest.fixture
def lifecycle(core, monkeypatch):
    """Load the actual application lifespan with only the isolated manager and cache-key dependency."""
    database = ModuleType("SYSTEM.database")
    database.CONN_MANAGER = core.ConnectionManager()
    tools = ModuleType("SYSTEM.tools")
    tools.fastapi_cache_key_builder = lambda *_args, **_kwargs: "test-key"
    monkeypatch.setitem(sys.modules, "SYSTEM.database", database)
    monkeypatch.setitem(sys.modules, "SYSTEM.tools", tools)
    path = Path(__file__).resolve().parents[1] / "SYSTEM/lifespan.py"
    spec = spec_from_file_location("database_lifespan_under_test", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    FastAPICache.reset()
    yield module, database.CONN_MANAGER
    FastAPICache.reset()


def test_application_lifespan_registers_and_closes_worker_resources(lifecycle):
    """Use the real lifecycle to initialize SQL/cache resources and reset them on normal shutdown."""
    module, manager = lifecycle

    async def exercise():
        """Query memory SQLite during the lifespan without issuing any Redis command."""
        async with module.lifespan(FastAPI()):
            assert isinstance(manager._engine, AsyncEngine)
            assert isinstance(manager.get_cache("WebCache"), AsyncRedis)
            assert FastAPICache.get_backend() is not None
            async with manager.get_db() as session:
                assert await session.scalar(text("SELECT 1")) == 1
        assert manager._engine is None and manager._session_factory is None
        assert manager._aioredis == {}
        with pytest.raises(AssertionError):
            FastAPICache.get_backend()

    asyncio.run(exercise())


def test_application_lifespan_cleans_cache_after_database_startup_failure(lifecycle, monkeypatch):
    """Close already registered lazy cache clients when SQL initialization fails before yield."""
    module, manager = lifecycle

    def reject():
        """Fail before registering any SQL resource to exercise startup cleanup."""
        raise RuntimeError("database startup failed")

    monkeypatch.setattr(manager, "init_db", reject)

    async def exercise():
        """Ensure startup failure propagates only after the cache registry and backend reset."""
        with pytest.raises(RuntimeError, match="startup failed"):
            async with module.lifespan(FastAPI()):
                pytest.fail("A failed startup must not yield an application")
        assert manager._engine is None and manager._aioredis == {}
        with pytest.raises(AssertionError):
            FastAPICache.get_backend()

    asyncio.run(exercise())
