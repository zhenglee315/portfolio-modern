# ◆—< Pack >—————————————————————————————————◆ Tests
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock
import asyncio
import importlib
import logging
import sys
from enum import StrEnum

import pytest
from redis import Redis as SyncRedis
from redis.asyncio import Redis as AsyncRedis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import IntegrityError


# ■—< FIXTURE >———————————————————————————————————————————————————————————————————————■ Isolated Core
@pytest.fixture
def core(monkeypatch):
    """
    Load the real core with non-secret settings; no application config or service is accessed.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    settings = ModuleType("SYSTEM.settings")
    settings.SQLALCHEMY_ENGINE_CONF = {
        "pool_size": 2,
        "max_overflow": 1,
        "pool_timeout": 1,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_use_lifo": True,
    }
    monkeypatch.setitem(sys.modules, "SYSTEM.settings", settings)
    path = Path(__file__).resolve().parents[1] / "SYSTEM/database/database_core.py"
    spec = spec_from_file_location("database_core_under_test", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("url", ["sqlite:///:memory:", "sqlite+aiosqlite:///:memory:"])
def test_memory_sqlite_transactions_and_fresh_sessions(core, url):
    """
    Verify memory sqlite transactions and fresh sessions.

    :param core: Isolated database core module using non-secret test settings.

    :param url: Argument forwarded to this operation.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("db", url, "rdbms")
        assert manager.is_init
        if isinstance(manager.get_engine("db"), AsyncEngine):
            async with manager.get_session("db") as session:
                assert isinstance(session, AsyncSession)
                async with session.begin():
                    await session.execute(text("CREATE TABLE item (id INTEGER)"))
                    await session.execute(text("INSERT INTO item VALUES (1)"))
            async with manager.get_session("db") as first, manager.get_session("db") as second:
                assert first is not second
                assert await first.scalar(text("SELECT COUNT(*) FROM item")) == 1
        else:
            with manager.get_session("db") as session:
                assert isinstance(session, Session)
                with session.begin():
                    session.execute(text("CREATE TABLE item (id INTEGER)"))
                    session.execute(text("INSERT INTO item VALUES (1)"))
            with manager.get_session("db") as first, manager.get_session("db") as second:
                assert first is not second
                assert first.scalar(text("SELECT COUNT(*) FROM item")) == 1
        await manager.shutdown_all_connections()
        assert not manager.is_init
        with pytest.raises(KeyError):
            manager.get_engine("db")

    asyncio.run(run())


def test_sqlite_filename_does_not_select_async(core, tmp_path):
    """
    Verify sqlite filename does not select async.

    :param core: Isolated database core module using non-secret test settings.

    :param tmp_path: pytest temporary directory for local test databases.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("db", f"sqlite:///{tmp_path / 'async_aio_report.db'}", "rdbms")
    assert not isinstance(manager.get_engine("db"), AsyncEngine)
    with manager.get_session("db") as session:
        assert session.scalar(text("SELECT 1")) == 1
    asyncio.run(manager.shutdown_all_connections())


@pytest.mark.parametrize("url,mode", [("sqlite:///:memory:", True), ("sqlite+aiosqlite:///:memory:", False)])
def test_incompatible_explicit_modes_rejected(core, url, mode):
    """
    Verify incompatible explicit modes rejected.

    :param core: Isolated database core module using non-secret test settings.

    :param url: Argument forwarded to this operation.

    :param mode: Argument forwarded to this operation.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    with pytest.raises(ValueError, match="incompatible"):
        manager.add_connection("db", url, "rdbms", is_async=mode)
    assert manager._engines == {}


def test_poolclass_override_and_independent_configuration(core):
    """
    Verify poolclass override and independent configuration.

    :param core: Isolated database core module using non-secret test settings.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    first, second = core.SqlAlchemyConnManager(), core.SqlAlchemyConnManager()
    first.engine_conf["pool_size"] = 99
    assert second.engine_conf["pool_size"] == 2
    first.add_connection("db", "sqlite:///:memory:", "rdbms", engine_conf={"poolclass": NullPool})
    assert isinstance(first.get_engine("db").pool, NullPool)
    assert "poolclass" not in first.engine_conf
    asyncio.run(first.shutdown_all_connections())


def test_batch_failure_publishes_nothing_and_disposes_staged_engine(core, monkeypatch):
    """
    Verify batch failure publishes nothing and disposes staged engine.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    captured = []
    create = core.create_engine

    def record(*args, **kwargs):
        """
        Verify record.

        :param args: Argument forwarded to this operation.

        :param kwargs: Argument forwarded to this operation.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        engine = create(*args, **kwargs)
        engine.dispose = Mock(wraps=engine.dispose)
        captured.append(engine)
        return engine

    monkeypatch.setattr(core, "create_engine", record)
    with pytest.raises(TypeError, match="Unsupported"):
        manager.init_connections(
            {
                "db": {"url": "sqlite:///:memory:", "type_store": "rdbms"},
                "bad": {"url": "metadata", "type_store": "typo"},
            }
        )
    assert manager._engines == {} and manager._sessions == {}
    captured[0].dispose.assert_called_once()
    assert not manager.is_init
    manager.init_connections({})
    assert not manager.is_init


def test_duplicate_connection_preserves_existing_engine(core):
    """
    Verify duplicate connection preserves existing engine.

    :param core: Isolated database core module using non-secret test settings.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("db", "sqlite:///:memory:", "rdbms")
    original = manager.get_engine("db")
    with pytest.raises(ValueError, match="already exists"):
        manager.add_connection("db", "sqlite:///:memory:", "rdbms")
    assert manager.get_engine("db") is original
    asyncio.run(manager.shutdown_all_connections())


@pytest.mark.parametrize("mode", [True, False])
def test_redis_configuration_duplicate_and_shutdown(core, mode):
    """
    Verify redis configuration duplicate and shutdown.

    :param core: Isolated database core module using non-secret test settings.

    :param mode: Argument forwarded to this operation.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    conf = {
        "web": {
            "HOST": "127.0.0.1",
            "PORT": 6379,
            "DB": 0,
            "POOL_SIZE": 2,
            "USERNAME": "review",
            "PASSWORD": "fake-secret",
            "SSL": True,
        }
    }
    manager.init_cache(conf, is_async=mode)
    client = manager.get_cache("web")
    assert isinstance(client, AsyncRedis if mode else SyncRedis)
    assert client.connection_pool.connection_class.__name__ == "SSLConnection"
    assert client.connection_pool.connection_kwargs["password"] == "fake-secret"
    assert client.connection_pool.connection_kwargs["username"] == "review"
    assert client.connection_pool.max_connections == 2
    with pytest.raises(ValueError, match="already exists"):
        manager.init_cache(conf, is_async=mode)
    assert manager.get_cache("web") is client
    asyncio.run(manager.shutdown_all_connections())  # Closes unconnected clients only.
    assert not manager.is_init and manager._aioredis == {}


@pytest.mark.parametrize(
    "option", [{"POOL_SIZE": 0}, {"DECODE_RESPONSES": True}, {"SSL": "false"}, {"UNKNOWN_OPTION": 1}]
)
def test_invalid_cache_batch_is_not_partially_registered(core, option):
    """
    Verify invalid cache batch is not partially registered.

    :param core: Isolated database core module using non-secret test settings.

    :param option: Argument forwarded to this operation.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    base = {"HOST": "127.0.0.1", "PORT": 6379, "DB": 0}
    with pytest.raises((ValueError, TypeError)):
        manager.init_cache({"first": base, "bad": {**base, **option}})
    assert manager._aioredis == {} and not manager.is_init


def test_logs_do_not_contain_url_password_or_query_token(core, caplog):
    """
    Verify logs do not contain url password or query token.

    :param core: Isolated database core module using non-secret test settings.

    :param caplog: pytest fixture capturing selected log records.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    with caplog.at_level(logging.DEBUG, logger=core.logger.name):
        manager.add_connection("storage", "https://user:fake-password@example.invalid/path?token=fake-token", "storage")
    assert "fake-password" not in caplog.text and "fake-token" not in caplog.text
    assert "example.invalid" not in caplog.text
    assert "Registered" in caplog.text


def test_remove_failure_retains_engine_and_allows_retry(core, monkeypatch):
    """
    Verify remove failure retains engine and allows retry.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("db", "sqlite:///:memory:", "rdbms")
    original = manager.get_engine("db")
    dispose = manager._dispose_engine
    monkeypatch.setattr(manager, "_dispose_engine", AsyncMock(side_effect=RuntimeError("failed")))
    with pytest.raises(RuntimeError, match="failed"):
        asyncio.run(manager.remove_connection("db", "rdbms"))
    assert manager.get_engine("db") is original
    assert manager._removing == set()
    monkeypatch.setattr(manager, "_dispose_engine", dispose)
    asyncio.run(manager.remove_connection("db", "rdbms"))
    assert not manager.is_init and manager._engines == {}


def test_shutdown_attempts_every_resource_and_retry_retains_only_failures(core, monkeypatch):
    """
    Verify shutdown attempts every resource and retry retains only failures.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    for name in ("good", "bad"):
        manager.add_connection(name, "sqlite:///:memory:", "rdbms")
    manager.init_cache({"cache": {"HOST": "127.0.0.1", "PORT": 6379, "DB": 0}})
    manager.add_center("center", {"url": "metadata"})
    manager.add_repositories("repo", "metadata")
    bad = manager.get_engine("bad")
    real_dispose = manager._dispose_engine
    calls = []

    async def dispose(engine):
        """
        Verify dispose.

        :param engine: SQLAlchemy engine whose resources are managed by this operation.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        calls.append(engine)
        if engine is bad:
            raise RuntimeError("failed")
        await real_dispose(engine)

    close_cache = AsyncMock(wraps=manager._close_cache)
    monkeypatch.setattr(manager, "_dispose_engine", dispose)
    monkeypatch.setattr(manager, "_close_cache", close_cache)
    with pytest.raises(ExceptionGroup):
        asyncio.run(manager.shutdown_all_connections())
    assert len(calls) == 2
    close_cache.assert_awaited_once()
    assert set(manager._engines) == {"bad"} and set(manager._sessions) == {"bad"}
    assert manager._aioredis == manager._centers == manager._repositories == {}
    assert not manager.is_init
    with pytest.raises(RuntimeError, match="retry"):
        manager.add_center("other", "metadata")
    monkeypatch.setattr(manager, "_dispose_engine", real_dispose)
    asyncio.run(manager.shutdown_all_connections())
    asyncio.run(manager.shutdown_all_connections())
    manager.add_center("new", "metadata")
    assert manager.is_init


def test_cache_disconnect_attempted_even_when_close_fails(core, monkeypatch):
    """
    Verify cache disconnect attempted even when close fails.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    client = AsyncRedis()
    monkeypatch.setattr(client, "aclose", AsyncMock(side_effect=RuntimeError("close failed")))
    disconnect = AsyncMock()
    monkeypatch.setattr(client.connection_pool, "disconnect", disconnect)
    with pytest.raises(ExceptionGroup):
        asyncio.run(core.SqlAlchemyConnManager._close_cache(client))
    disconnect.assert_awaited_once()


def test_shutdown_blocks_registration_reads_and_overlapping_cleanup(core, monkeypatch):
    """
    Verify shutdown blocks registration reads and overlapping cleanup.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("db", "sqlite:///:memory:", "rdbms")
    dispose = manager._dispose_engine

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        started, resume = asyncio.Event(), asyncio.Event()

        async def paused(engine):
            """
            Verify paused.

            :param engine: SQLAlchemy engine whose resources are managed by this operation.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            started.set()
            await resume.wait()
            await dispose(engine)

        monkeypatch.setattr(manager, "_dispose_engine", paused)
        task = asyncio.create_task(manager.shutdown_all_connections())
        await started.wait()
        with pytest.raises(RuntimeError):
            manager.add_connection("late", "sqlite:///:memory:", "rdbms")
        with pytest.raises(RuntimeError):
            manager.get_session("db")
        with pytest.raises(RuntimeError):
            await manager.shutdown_all_connections()
        with pytest.raises(RuntimeError):
            await manager.remove_connection("db", "rdbms")
        resume.set()
        await task
        assert manager._engines == {} and not manager.is_init

    asyncio.run(run())


@pytest.mark.parametrize("operation", ["shutdown", "remove"])
def test_cancellation_waits_for_cleanup_then_propagates(core, monkeypatch, operation):
    """
    Verify cancellation waits for cleanup then propagates.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :param operation: Argument forwarded to this operation.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("db", "sqlite:///:memory:", "rdbms")
    dispose = manager._dispose_engine

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        started, resume = asyncio.Event(), asyncio.Event()

        async def paused(engine):
            """
            Verify paused.

            :param engine: SQLAlchemy engine whose resources are managed by this operation.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            started.set()
            await resume.wait()
            await dispose(engine)

        monkeypatch.setattr(manager, "_dispose_engine", paused)
        coro = (
            manager.shutdown_all_connections() if operation == "shutdown" else manager.remove_connection("db", "rdbms")
        )
        task = asyncio.create_task(coro)
        await started.wait()
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done()
        with pytest.raises(RuntimeError):
            manager.get_engine("db")
        resume.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert manager._engines == {} and not manager.is_init
        assert not manager._shutting_down and not manager._removing

    asyncio.run(run())


def test_all_metadata_categories_and_center_copy(core):
    """
    Verify all metadata categories and center copy.

    :param core: Isolated database core module using non-secret test settings.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    for category in ("storage", "graph", "queue"):
        manager.add_connection(category, "metadata", category)
        assert getattr(manager, f"get_{category}")(category) == "metadata"
        asyncio.run(manager.remove_connection(category, category))
    manager.add_repositories("repo", "metadata")
    assert manager.get_repo("repo") == "metadata"
    asyncio.run(manager.remove_repositories("repo"))
    value = {"nested": {"option": 1}}
    manager.add_center("center", value)
    value["nested"]["option"] = 2
    returned = manager.get_center("center")
    returned["nested"]["option"] = 3
    assert manager.get_center("center")["nested"]["option"] == 1
    asyncio.run(manager.remove_center("center"))
    assert not manager.is_init
    with pytest.raises(TypeError):
        asyncio.run(manager.remove_connection("missing", "typo"))
    with pytest.raises(KeyError):
        manager.get_cache("missing")


def test_database_package_import_does_not_load_business_loader(core, monkeypatch):
    """
    Verify database package import does not load business loader.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    backend = str(Path(__file__).resolve().parents[1])
    parent = ModuleType("SYSTEM")
    parent.__path__ = [str(Path(backend) / "SYSTEM")]
    monkeypatch.setitem(sys.modules, "SYSTEM", parent)
    for name in ("SYSTEM.database", "SYSTEM.database.database_core", "SYSTEM.database.database_loader"):
        monkeypatch.delitem(sys.modules, name, raising=False)
    try:
        package = importlib.import_module("SYSTEM.database")
        assert package.CONN_MANAGER is not None
        assert "SYSTEM.database.database_loader" not in sys.modules
        assert "DatabaseLoader" in package.__all__
        fake_loader = ModuleType("SYSTEM.database.database_loader")
        fake_loader.DatabaseLoader = object()
        monkeypatch.setitem(sys.modules, "SYSTEM.database.database_loader", fake_loader)
        assert package.DatabaseLoader is fake_loader.DatabaseLoader
        with pytest.raises(AttributeError):
            package.unknown
    finally:
        sys.modules.pop("SYSTEM.database", None)
        sys.modules.pop("SYSTEM.database.database_core", None)


def test_asyncpg_engine_registration_is_lazy(core, caplog):
    """
    Verify asyncpg engine registration is lazy.

    :param core: Isolated database core module using non-secret test settings.

    :param caplog: pytest fixture capturing selected log records.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    with caplog.at_level(logging.DEBUG, logger=core.logger.name):
        manager.add_connection("pg", "postgresql+asyncpg://review:fake-password@localhost/review", "rdbms")
    assert isinstance(manager.get_engine("pg"), AsyncEngine)
    assert manager.get_engine("pg").pool.checkedout() == 0
    assert "fake-password" not in caplog.text
    asyncio.run(manager.shutdown_all_connections())


def test_removal_guard_prevents_overlapping_shutdown(core, monkeypatch):
    """
    Verify removal guard prevents overlapping shutdown.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("db", "sqlite:///:memory:", "rdbms")
    dispose = manager._dispose_engine

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        started, resume = asyncio.Event(), asyncio.Event()

        async def paused(engine):
            """
            Verify paused.

            :param engine: SQLAlchemy engine whose resources are managed by this operation.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            started.set()
            await resume.wait()
            await dispose(engine)

        monkeypatch.setattr(manager, "_dispose_engine", paused)
        task = asyncio.create_task(manager.remove_connection("db", "rdbms"))
        await started.wait()
        with pytest.raises(RuntimeError):
            await manager.shutdown_all_connections()
        with pytest.raises(RuntimeError):
            await manager.remove_connection("db", "rdbms")
        with pytest.raises(RuntimeError):
            manager.get_session("db")
        resume.set()
        await task

    asyncio.run(run())


def test_failed_cache_cleanup_is_retained_for_shutdown_retry(core, monkeypatch):
    """
    Verify failed cache cleanup is retained for shutdown retry.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    manager.init_cache({"web": {"HOST": "localhost", "PORT": 6379, "DB": 0}})
    client = manager.get_cache("web")
    real_close = client.aclose
    monkeypatch.setattr(client, "aclose", AsyncMock(side_effect=RuntimeError("close failed")))
    disconnect = AsyncMock(wraps=client.connection_pool.disconnect)
    monkeypatch.setattr(client.connection_pool, "disconnect", disconnect)
    with pytest.raises(ExceptionGroup):
        asyncio.run(manager.shutdown_all_connections())
    assert manager._aioredis["web"] is client
    disconnect.assert_awaited_once()
    with pytest.raises(RuntimeError):
        manager.get_cache("web")
    monkeypatch.setattr(client, "aclose", real_close)
    asyncio.run(manager.shutdown_all_connections())
    assert manager._aioredis == {} and not manager._shutdown_failed


# ■—< FIXTURE >———————————————————————————————————————————————————————————————————————■ Executor Integration
@pytest.fixture
def executors(core, monkeypatch):
    """
    Load actual executors with an isolated manager and no deployment configuration.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()
    system = ModuleType("SYSTEM")
    system.__path__ = []
    settings = sys.modules["SYSTEM.settings"]
    settings.TIME_ZONE = "UTC"
    settings.CACHE_CONF = {}
    system.settings = settings
    database = ModuleType("SYSTEM.database")
    database.CONN_MANAGER = manager
    database.SqlAlchemyConnManager = core.SqlAlchemyConnManager
    constants = ModuleType("SYSTEM.constants")
    constants.EnumDBType = StrEnum(
        "EnumDBType", {name: name.lower() for name in ("ORACLE", "POSTGRESQL", "MYSQL", "MARIADB", "MSSQL")}
    )
    monkeypatch.setitem(sys.modules, "SYSTEM", system)
    monkeypatch.setitem(sys.modules, "SYSTEM.database", database)
    monkeypatch.setitem(sys.modules, "SYSTEM.constants", constants)
    backend = Path(__file__).resolve().parents[1]
    common = ModuleType("COMMON")
    common.__path__ = [str(backend / "COMMON")]
    monkeypatch.setitem(sys.modules, "COMMON", common)
    package = ModuleType("storage_sqlalchemy_under_test")
    package.__path__ = [str(backend / "COMMON/tools/storage/sqlalchemy")]
    monkeypatch.setitem(sys.modules, package.__name__, package)
    for name in (
        "COMMON.decorator",
        "storage_sqlalchemy_under_test.tools_sqlalchemy_async",
        "storage_sqlalchemy_under_test.tools_sqlalchemy_utils",
        "storage_sqlalchemy_under_test.tools_sqlalchemy_wrapper",
    ):
        monkeypatch.delitem(sys.modules, name, raising=False)
    sql = importlib.import_module("storage_sqlalchemy_under_test.tools_sqlalchemy_async")
    wrapper = importlib.import_module("storage_sqlalchemy_under_test.tools_sqlalchemy_wrapper")
    spec = spec_from_file_location(
        "redis_executor_under_test", backend / "COMMON/tools/storage/redis/tools_redis_async.py"
    )
    redis_module = module_from_spec(spec)
    spec.loader.exec_module(redis_module)
    return SimpleNamespace(manager=manager, sql=sql, wrapper=wrapper, redis=redis_module, backend=backend)


def test_legacy_executor_reuses_pool_with_fresh_concurrent_sessions(executors, tmp_path):
    """
    Repeated and concurrent key-based calls preserve results and return every connection.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :param tmp_path: pytest temporary directory for local test databases.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", f"sqlite+aiosqlite:///{tmp_path / 'pool.db'}", "rdbms")
        db = executors.sql.SqlAlchemyExecAsync(key="main")
        assert await db.exec("CREATE TABLE item (id INTEGER PRIMARY KEY)")
        assert await db.exec("INSERT INTO item VALUES (1)")
        assert await db.query("SELECT id FROM item") == [[1]]
        assert await db.query_dict("SELECT id FROM item") == [{"id": 1}]
        values = await asyncio.gather(*(db.query_scalar("SELECT COUNT(*) FROM item") for _ in range(12)))
        assert values == [1] * 12
        pool = manager.get_engine("main").pool
        assert pool.checkedout() == 0 and pool.size() == 2
        assert manager._active_sessions == {}
        with pytest.raises(Exception):
            await db.exec("INSERT INTO missing_table VALUES (1)")
        assert pool.checkedout() == 0 and manager._active_sessions == {}
        await manager.shutdown_all_connections()

    asyncio.run(run())


def test_legacy_injected_session_still_commits_and_closes(executors):
    """
    Existing session= calls keep their original auto-commit and close behavior.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", "sqlite+aiosqlite:///:memory:", "rdbms")
        session = manager.get_session("main")
        commit, close = AsyncMock(wraps=session.commit), AsyncMock(wraps=session.close)
        session.commit, session.close = commit, close
        db = executors.sql.SqlAlchemyExecAsync(session=session)
        await db.exec("CREATE TABLE item (id INTEGER)")
        await db.exec("INSERT INTO item VALUES (1)")
        assert commit.await_count == 2 and close.await_count == 2
        assert "item" in await db.query_tables(schema=None)
        assert (await db.query_schema("item", schema=None))[0]["name"] == "id"
        assert commit.await_count == 2 and close.await_count == 2
        assert await db.query_table_exists("item")
        assert commit.await_count == 3 and close.await_count == 3
        async with manager.session_scope("main") as check:
            assert await check.scalar(text("SELECT COUNT(*) FROM item")) == 1
        keyed = executors.sql.SqlAlchemyExecAsync(key="main")
        assert keyed.session is keyed.session
        assert await keyed.query_scalar("SELECT COUNT(*) FROM item") == 1
        await keyed.session.close()
        await manager.shutdown_all_connections()

    asyncio.run(run())


def test_external_transaction_rolls_back_all_executor_writes(executors):
    """
    A later failing operation rolls back earlier writes without executor commits.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", "sqlite+aiosqlite:///:memory:", "rdbms")
        await executors.sql.SqlAlchemyExecAsync(key="main").exec("CREATE TABLE item (id INTEGER PRIMARY KEY)")
        with pytest.raises(IntegrityError):
            async with manager.transaction("main") as session:
                session.commit = AsyncMock(wraps=session.commit)
                session.rollback = AsyncMock(wraps=session.rollback)
                close = AsyncMock(wraps=session.close)
                session.close = close
                db = executors.sql.SqlAlchemyExecAsync(session=session, manage_transaction=False)
                await db.exec("INSERT INTO item VALUES (1)")
                assert await db.query_scalar("SELECT COUNT(*) FROM item") == 1
                assert await db.query_table_exists("item")
                session.commit.assert_not_awaited()
                close.assert_not_awaited()
                with pytest.raises(RuntimeError, match="externally managed"):
                    await db.execute_commit(object())
                await db.exec("INSERT INTO item VALUES (1)")
        session.commit.assert_not_awaited()
        session.rollback.assert_not_awaited()
        close.assert_awaited_once()
        assert await executors.sql.SqlAlchemyExecAsync(key="main").query_scalar("SELECT COUNT(*) FROM item") == 0
        async with manager.transaction("main") as session:
            db = executors.sql.SqlAlchemyExecAsync(session=session, manage_transaction=False)
            await db.exec("INSERT INTO item VALUES (2)")
            await db.exec("INSERT INTO item VALUES (3)")
        assert await executors.sql.SqlAlchemyExecAsync(key="main").query_scalar("SELECT COUNT(*) FROM item") == 2
        assert manager._active_sessions == {}
        await manager.shutdown_all_connections()

    asyncio.run(run())


def test_large_results_and_inspection_preserve_session_lifetime(executors):
    """
    Buffered row iteration and inspector methods preserve results and release sessions.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", "sqlite+aiosqlite:///:memory:", "rdbms")
        db = executors.sql.SqlAlchemyExecAsync(key="main")
        await db.exec("CREATE TABLE item (id INTEGER)")
        await db.exec("INSERT INTO item VALUES (1), (2)")
        assert await db.query_table_exists("item")
        assert not await db.query_table_exists("item' OR 1=1 --")
        assert "item" in await db.query_tables(schema=None)
        assert (await db.query_schema("item", schema=None))[0]["name"] == "id"
        stream = db.query_large("SELECT id FROM item", mapping=True)
        assert dict(await anext(stream)) == {"id": 1}
        assert manager._active_sessions == {}
        await stream.aclose()
        assert manager._active_sessions == {}
        manager.add_repositories("repo", "sqlite+aiosqlite:///:memory:")
        repo = executors.wrapper.SqlAlchemyExecWrapper("repo")
        assert repo.engine is manager.get_engine("main")
        assert await repo.query("SELECT id FROM item") == [[1], [2]]
        rows = await repo.query_large("SELECT id FROM item")
        assert [list(row) async for row in rows] == [[1], [2]]
        assert manager._active_sessions == {}
        engine = repo.engine
        dispose = AsyncMock(wraps=manager._dispose_engine)
        manager._dispose_engine = dispose
        await manager.shutdown_all_connections()
        dispose.assert_awaited_once_with(engine)

    asyncio.run(run())


def test_cancelled_query_releases_its_connection(executors, monkeypatch, tmp_path):
    """
    Cancellation after acquiring a connection returns it and releases scope tracking.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :param tmp_path: pytest temporary directory for local test databases.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", f"sqlite+aiosqlite:///{tmp_path / 'cancel.db'}", "rdbms")
        started = asyncio.Event()
        execute = AsyncSession.execute

        async def paused(session, *args, **kwargs):
            """
            Verify paused.

            :param session: Argument forwarded to this operation.

            :param args: Argument forwarded to this operation.

            :param kwargs: Argument forwarded to this operation.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            result = await execute(session, *args, **kwargs)
            started.set()
            await asyncio.Event().wait()
            return result

        monkeypatch.setattr(AsyncSession, "execute", paused)
        task = asyncio.create_task(executors.sql.SqlAlchemyExecAsync(key="main").query("SELECT 1"))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert manager.get_engine("main").pool.checkedout() == 0
        assert manager._active_sessions == {}
        await manager.shutdown_all_connections()

    asyncio.run(run())


def test_shutdown_waits_for_active_managed_transaction(core):
    """
    Shutdown blocks new access while allowing an existing managed scope to finish.

    :param core: Isolated database core module using non-secret test settings.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", "sqlite+aiosqlite:///:memory:", "rdbms")
        async with manager.transaction("main") as session:
            await session.execute(text("SELECT 1"))
            shutdown = asyncio.create_task(manager.shutdown_all_connections())
            await asyncio.sleep(0)
            assert not shutdown.done()
            with pytest.raises(RuntimeError):
                manager.get_session("main")
            assert await session.scalar(text("SELECT 2")) == 2
        await shutdown
        assert manager._active_sessions == {} and manager._engines == {}

    asyncio.run(run())


def test_repository_replacement_is_resolved_and_retired_pool_closed(executors, tmp_path):
    """
    Existing wrappers follow URL changes and all engine generations close at shutdown.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :param tmp_path: pytest temporary directory for local test databases.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_repositories("repo", f"sqlite+aiosqlite:///{tmp_path / 'first.db'}")
        repo = executors.wrapper.SqlAlchemyExecWrapper("repo")
        first = repo.engine
        manager.add_repositories("repo", f"sqlite+aiosqlite:///{tmp_path / 'second.db'}")
        second = repo.engine
        assert first is not second and first in manager._retired_engines
        assert await repo.query("SELECT 1") == [[1]]
        async with manager.session_scope("repo", repository=True) as session:
            await manager.remove_repositories("repo")
            assert second in manager._retired_engines
            assert await session.scalar(text("SELECT 2")) == 2
        await manager.shutdown_all_connections()
        assert not manager._repository_engines and not manager._retired_engines

    asyncio.run(run())


def test_prebuilt_pool_does_not_receive_default_factory_options(core):
    """
    An explicit pool remains usable without conflicting QueuePool factory defaults.

    :param core: Isolated database core module using non-secret test settings.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    import sqlite3

    pool = NullPool(lambda: sqlite3.connect(":memory:"))
    manager = core.SqlAlchemyConnManager()
    manager.add_connection("main", "sqlite://", "rdbms", engine_conf={"pool": pool})
    assert manager.get_engine("main").pool is pool
    with manager.session_scope_sync("main") as session:
        assert session.scalar(text("SELECT 1")) == 1
    assert manager._active_sessions == {}
    asyncio.run(manager.shutdown_all_connections())


def test_cleanup_timeout_retains_running_task_and_resources(core, monkeypatch):
    """
    A timeout reports unfinished cleanup without declaring the engine successfully closed.

    :param core: Isolated database core module using non-secret test settings.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager(cleanup_timeout=0.02)
    manager.add_connection("main", "sqlite:///:memory:", "rdbms")
    dispose = manager._dispose_engine

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        resume = asyncio.Event()

        async def paused(engine):
            """
            Verify paused.

            :param engine: SQLAlchemy engine whose resources are managed by this operation.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            await resume.wait()
            await dispose(engine)

        monkeypatch.setattr(manager, "_dispose_engine", paused)
        with pytest.raises(TimeoutError, match="still running"):
            await manager.shutdown_all_connections()
        assert manager._engines and manager._cleanup_tasks and manager._shutting_down
        resume.set()
        await asyncio.gather(*manager._cleanup_tasks)
        assert not manager._engines and not manager._cleanup_tasks and not manager._shutting_down

    asyncio.run(run())


def test_cancelled_cleanup_preserves_failure_cause(core):
    """
    Caller cancellation retains the actual cleanup failure as the cancellation cause.

    :param core: Isolated database core module using non-secret test settings.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        started, resume = asyncio.Event(), asyncio.Event()

        async def fail():
            """
            Verify fail.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            started.set()
            await resume.wait()
            raise RuntimeError("cleanup failed")

        task = asyncio.create_task(manager._complete_cleanup(fail()))
        await started.wait()
        task.cancel()
        await asyncio.sleep(0)
        resume.set()
        with pytest.raises(asyncio.CancelledError) as caught:
            await task
        assert isinstance(caught.value.__cause__, RuntimeError)

    asyncio.run(run())


def test_redis_injected_client_uses_one_command_and_preserves_error(executors, monkeypatch):
    """
    Injected clients bypass manager lookup and commands avoid an unrelated leased client.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :param monkeypatch: pytest fixture for replacing selected dependencies.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    client = AsyncRedis(max_connections=1)
    unrelated_client = Mock(side_effect=AssertionError("extra connection"))
    monkeypatch.setattr(client, "client", unrelated_client)
    monkeypatch.setattr(client, "get", AsyncMock(return_value=b"raw"))
    cache = executors.redis.RedisAsync(key="missing", redis=client)

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        assert await cache.get("key", deserialize=False) == b"raw"
        error = executors.redis.ResponseError("original failure")
        client.get.side_effect = error
        with pytest.raises(executors.redis.ResponseError) as caught:
            await cache.get("key")
        assert caught.value is error
        unrelated_client.assert_not_called()
        await client.aclose()
        await client.connection_pool.disconnect()

    asyncio.run(run())


def test_database_lifespan_initializes_and_closes_worker_resources(executors):
    """
    The FastAPI lifecycle initializes explicit settings and closes SQL and Redis resources.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    from fastapi import FastAPI

    spec = spec_from_file_location("database_lifespan_under_test", executors.backend / "SYSTEM/lifespan.py")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    conf = {"main": {"url": "sqlite+aiosqlite:///:memory:", "type_store": "rdbms"}}
    cache_conf = {"web": {"HOST": "127.0.0.1", "PORT": 6379, "DB": 0, "POOL_SIZE": 1}}
    app = FastAPI(
        lifespan=module.create_database_lifespan(conn_conf=conf, cache_conf=cache_conf, manager=executors.manager)
    )

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        async with app.router.lifespan_context(app):
            assert app.state.conn_manager is executors.manager
            assert await executors.sql.SqlAlchemyExecAsync(key="main").query_scalar("SELECT 1") == 1
            assert isinstance(executors.manager.get_cache("web"), AsyncRedis)
        assert not executors.manager.is_init
        assert executors.manager._engines == executors.manager._aioredis == {}

    asyncio.run(run())


def test_execute_commit_and_pagination_preserve_legacy_results(executors):
    """
    Explicit ORM commits and all pagination methods retain their result contracts.

    :param executors: Isolated manager and real SQLAlchemy/Redis executor modules.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
    from sqlalchemy import Integer, select

    class Base(DeclarativeBase):
        """
        Define isolated ORM metadata for the commit compatibility scenario.

                                                                                               ♂ ZhengLee 2026.10.03
        """

    class Item(Base):
        """
        Map one test table without importing application business models.

                                                                                               ♂ ZhengLee 2026.10.03
        """

        __tablename__ = "item"
        id: Mapped[int] = mapped_column(Integer, primary_key=True)

    manager = executors.manager

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", "sqlite+aiosqlite:///:memory:", "rdbms")
        async with manager.get_engine("main").begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        db = executors.sql.SqlAlchemyExecAsync(key="main")
        obj = Item(id=1)
        assert await db.execute_commit(obj) is obj and obj.id == 1
        await db.execute_commit(Item(id=2))
        orm_result = await db.execute_orm(select(Item.id))
        assert orm_result.scalars().all() == [1, 2]
        assert (await db.paginate_query("SELECT id FROM item ORDER BY id", page=1, size=1)).items == [[1]]
        assert (await db.paginate_query("SELECT id FROM item ORDER BY id", page="all")).items == [[1], [2]]
        assert (await db.paginate_query_dict("SELECT id FROM item ORDER BY id", page=1, size=1)).items == [{"id": 1}]
        assert (await db.paginate_orm(select(Item.id), page=1, size=1)).items == [{"id": 1}]
        async with manager.transaction("main") as session:
            close = AsyncMock(wraps=session.close)
            session.close = close
            borrowed = executors.sql.SqlAlchemyExecAsync(session=session, manage_transaction=False)
            assert (await borrowed.paginate_query("SELECT id FROM item ORDER BY id", page=1, size=1)).items == [[1]]
            close.assert_not_awaited()
        close.assert_awaited_once()
        assert manager._active_sessions == {}
        await manager.shutdown_all_connections()

    asyncio.run(run())


def test_repeated_cancellation_keeps_scope_active_until_close(core, tmp_path):
    """
    Repeated cancellation cannot release scope tracking before connection cleanup completes.

    :param core: Isolated database core module using non-secret test settings.

    :param tmp_path: pytest temporary directory for local test databases.

    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()

    async def run():
        """
        Run the enclosing regression scenario using isolated resources.

        :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", f"sqlite+aiosqlite:///{tmp_path / 'close.db'}", "rdbms")
        started, resume = asyncio.Event(), asyncio.Event()

        async def operation():
            """
            Verify operation.

            :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
            """
            async with manager.session_scope("main") as session:
                await session.execute(text("SELECT 1"))
                close = session.close

                async def paused_close():
                    """
                    Verify paused close.

                    :return: None after the isolated regression operation completes.

                                                                                               ♂ ZhengLee 2026.10.03
                    """
                    started.set()
                    await resume.wait()
                    await close()

                session.close = paused_close

        task = asyncio.create_task(operation())
        await started.wait()
        for _ in range(2):
            task.cancel()
            await asyncio.sleep(0)
        assert manager._active_sessions and not task.done()
        resume.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert manager._active_sessions == {}
        assert manager.get_engine("main").pool.checkedout() == 0
        await manager.shutdown_all_connections()

    asyncio.run(run())


def test_failed_session_close_is_retained_and_retried_before_dispose(core, tmp_path):
    """
    Keep failed session cleanup tracked until shutdown can return its connection.

    :param core: Isolated core module using non-secret settings.
    :param tmp_path: Temporary directory for the local SQLite database.
    :return: None after verifying cleanup retry and pool release.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    manager = core.SqlAlchemyConnManager()

    async def run():
        """
        Run the failed-close scenario on one application event loop.

        :return: None after the retained session closes and the engine is disposed.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        manager.add_connection("main", f"sqlite+aiosqlite:///{tmp_path / 'failed-close.db'}", "rdbms")
        engine = manager.get_engine("main")
        with pytest.raises(RuntimeError, match="close failed"):
            async with manager.session_scope("main") as session:
                await session.execute(text("SELECT 1"))
                close = session.close
                session.close = AsyncMock(side_effect=RuntimeError("close failed"))
        assert manager._failed_sessions[session] is engine
        assert manager._active_sessions[engine] == 1 and engine.pool.checkedout() == 1
        session.close = close
        await manager.shutdown_all_connections()
        assert not manager._failed_sessions and not manager._active_sessions
        assert engine.pool.checkedout() == 0

    asyncio.run(run())
