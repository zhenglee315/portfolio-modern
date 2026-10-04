"""Focused regression tests for the async SQLAlchemy CRUD helpers."""

from importlib import import_module
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType, SimpleNamespace
from enum import StrEnum
import asyncio
import sys
from uuid import uuid4

import pytest
from sqlalchemy import Column, Integer, MetaData, Table, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base


@pytest.fixture
def db_tools(monkeypatch, tmp_path):
    """Load the real helper and manager against one isolated SQLite database."""

    class EnumDBType(StrEnum):
        SQLLite = "sqlite"
        POSTGRESQL = "postgresql"

    system = ModuleType("SYSTEM")
    system.__path__ = []
    constants = ModuleType("SYSTEM.constants")
    constants.EnumDBType = EnumDBType
    settings = ModuleType("SYSTEM.settings")
    settings.CACHE_CONF = {}
    settings.DB_CONF = {}
    settings.SQLALCHEMY_ENGINE_CONF = {}
    database = ModuleType("SYSTEM.database")

    for name, module in (
        ("SYSTEM", system),
        ("SYSTEM.constants", constants),
        ("SYSTEM.settings", settings),
        ("SYSTEM.database", database),
    ):
        monkeypatch.setitem(sys.modules, name, module)

    backend = Path(__file__).resolve().parents[1]
    monkeypatch.syspath_prepend(str(backend))
    core_path = backend / "SYSTEM/database/database_core.py"
    spec = spec_from_file_location(f"isolated_crud_core_{uuid4().hex}", core_path)
    core = module_from_spec(spec)
    spec.loader.exec_module(core)

    manager = core.ConnectionManager()
    manager.db_conf = {"type": EnumDBType.SQLLite, "name": str(tmp_path / "crud.db"), "is_async": True}
    manager.engine_conf = {"echo": False, "future": True}
    manager.init_db()
    database.CONN_MANAGER = manager

    tools_path = backend / "COMMON/tools/storage/sqlalchemy"
    package_name = f"isolated_crud_tools_{uuid4().hex}"
    package = ModuleType(package_name)
    package.__path__ = [str(tools_path)]
    monkeypatch.setitem(sys.modules, package_name, package)
    async_module = import_module(f"{package_name}.tools_sqlalchemy_async")
    wrapper_module = import_module(f"{package_name}.tools_sqlalchemy_wrapper")

    yield SimpleNamespace(
        manager=manager,
        executor=async_module.SqlAlchemyExecAsync,
        wrapper=wrapper_module.SqlAlchemyExecWrapper,
    )

    asyncio.run(manager.shutdown_all_connections())
    for name in tuple(sys.modules):
        if name == package_name or name.startswith(f"{package_name}."):
            sys.modules.pop(name, None)


async def create_items(manager, values=()):
    """Create a tiny table, optionally with rows, using the manager's public session API."""
    async with manager.get_db() as session:
        await session.execute(text("CREATE TABLE item (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)"))
        for value in values:
            await session.execute(text("INSERT INTO item (value) VALUES (:value)"), {"value": value})
        await session.commit()


def test_keyless_uses_fresh_sessions_and_commits(db_tools, monkeypatch):
    async def run():
        await create_items(db_tools.manager)
        original_get_db = db_tools.manager.get_db
        sessions = []

        def tracked_get_db():
            session = original_get_db()
            sessions.append(session)
            return session

        monkeypatch.setattr(db_tools.manager, "get_db", tracked_get_db)
        executor = db_tools.executor()
        assert await executor.exec("INSERT INTO item (value) VALUES (:value)", {"value": 7})
        assert await executor.query_scalar("SELECT value FROM item") == 7
        assert len(sessions) == 2
        assert sessions[0] is not sessions[1]
        assert await executor.query_dict("SELECT value FROM item") == [{"value": 7}]

        # The historical key argument is an alias for this project's sole database.
        assert await db_tools.executor(key="legacy").query_scalar("SELECT COUNT(*) FROM item") == 1

    asyncio.run(run())


def test_external_session_keeps_transaction_ownership(db_tools):
    async def run():
        await create_items(db_tools.manager)
        async with db_tools.manager.get_db() as session:
            executor = db_tools.executor(session=session, manage_transaction=False)
            assert await executor.exec("INSERT INTO item (value) VALUES (11)")
            assert session.in_transaction()
            await session.rollback()

        assert await db_tools.executor().query_scalar("SELECT COUNT(*) FROM item") == 0

        async with db_tools.manager.get_db() as session:
            executor = db_tools.executor(session=session, manage_transaction=False)
            assert await executor.exec("INSERT INTO item (value) VALUES (12)")
            await session.commit()

        assert await db_tools.executor().query_scalar("SELECT value FROM item") == 12

    asyncio.run(run())


def test_sqlite_schema_inspection_and_empty_results(db_tools):
    async def run():
        await create_items(db_tools.manager)
        executor = db_tools.executor()
        assert "item" in await executor.query_tables()
        assert await executor.query_table_exists("item")
        columns = await executor.query_schema("item")
        assert {column["name"] for column in columns} == {"id", "value"}
        assert all(isinstance(column["type"], str) for column in columns)
        assert await executor.query_first("SELECT 0 AS count") == 0
        assert await executor.query_scalar("SELECT value FROM item WHERE 1 = 0") is None

        with pytest.raises(IntegrityError):
            await executor.exec("INSERT INTO item (value) VALUES (NULL)")
        assert await executor.query_scalar("SELECT COUNT(*) FROM item") == 0

    asyncio.run(run())


def test_sqlite_raw_and_orm_pagination(db_tools):
    async def run():
        await create_items(db_tools.manager, values=range(5))
        executor = db_tools.executor()

        raw_page = await executor.paginate_query("SELECT value FROM item ORDER BY id", page=2, size=2)
        assert raw_page.total == 5
        assert raw_page.items == [[2], [3]]

        dict_page = await executor.paginate_query_dict("SELECT value FROM item ORDER BY id", page=2, size=2)
        assert dict_page.total == 5
        assert dict_page.items == [{"value": 2}, {"value": 3}]

        metadata = MetaData()
        item = Table("item", metadata, Column("id", Integer, primary_key=True), Column("value", Integer))
        orm_page = await executor.paginate_orm(select(item.c.value).order_by(item.c.id), page=2, size=2)
        assert orm_page.total == 5
        assert orm_page.items == [{"value": 2}, {"value": 3}]

    asyncio.run(run())


@pytest.mark.parametrize(
    ("method", "expected_items"),
    [
        ("paginate_query", [[3], [4]]),
        ("paginate_query_dict", [{"value": 3}, {"value": 4}]),
    ],
)
def test_raw_pagination_binds_filter_parameters(db_tools, method, expected_items):
    async def run():
        await create_items(db_tools.manager, values=range(6))
        executor = db_tools.executor()
        page = await getattr(executor, method)(
            "SELECT value FROM item WHERE value >= :minimum ORDER BY id;",
            page=2,
            size=2,
            sql_params={"minimum": 1},
        )
        assert page.total == 5
        assert page.items == expected_items

    asyncio.run(run())


def test_execute_commit_persists_orm_object(db_tools):
    async def run():
        base = declarative_base()

        class OrmItem(base):
            __tablename__ = "orm_item"
            id = Column(Integer, primary_key=True)
            value = Column(Integer, nullable=False)

        async with db_tools.manager.get_db() as session:
            conn = await session.connection()
            await conn.run_sync(base.metadata.create_all)
            await session.commit()

        obj = OrmItem(value=19)
        saved = await db_tools.executor().execute_commit(obj)
        assert saved is obj
        assert saved.id is not None
        assert (
            await db_tools.executor().query_scalar("SELECT value FROM orm_item WHERE id = :id", {"id": saved.id}) == 19
        )

    asyncio.run(run())


def test_paginate_orm_model_returns_dict_items(db_tools):
    async def run():
        base = declarative_base()

        class OrmItem(base):
            __tablename__ = "orm_item"
            id = Column(Integer, primary_key=True)
            value = Column(Integer, nullable=False)

        async with db_tools.manager.get_db() as session:
            conn = await session.connection()
            await conn.run_sync(base.metadata.create_all)
            session.add_all([OrmItem(value=value) for value in (4, 5, 6)])
            await session.commit()

        executor = db_tools.executor()
        stmt = select(OrmItem).order_by(OrmItem.id)
        page = await executor.paginate_orm(stmt, page=2, size=1)
        assert page.total == 3
        assert page.items == [{"id": 2, "value": 5}]

        all_page = await executor.paginate_orm(stmt, page="all")
        assert all_page.total == 3
        assert all_page.items == [
            {"id": 1, "value": 4},
            {"id": 2, "value": 5},
            {"id": 3, "value": 6},
        ]

    asyncio.run(run())


def test_full_fetch_allows_more_than_default_page_limit(db_tools):
    async def run():
        await create_items(db_tools.manager, values=range(101))
        executor = db_tools.executor()
        raw_page = await executor.paginate_query("SELECT value FROM item ORDER BY id", page="all")
        assert raw_page.total == 101
        assert len(raw_page.items) == 101

        metadata = MetaData()
        item = Table("item", metadata, Column("id", Integer, primary_key=True), Column("value", Integer))
        orm_page = await executor.paginate_orm(select(item.c.value).order_by(item.c.id), page="all")
        assert orm_page.total == 101
        assert len(orm_page.items) == 101

    asyncio.run(run())


def test_keyless_wrapper_forwards_async_calls(db_tools):
    async def run():
        await create_items(db_tools.manager, values=(3, 5))
        wrapper = db_tools.wrapper()
        assert await wrapper.query_scalar("SELECT SUM(value) FROM item") == 8
        rows = await wrapper.query("SELECT value FROM item ORDER BY id")
        assert rows == [[3], [5]]
        stream = await wrapper.query_large("SELECT value FROM item ORDER BY id")
        assert [row[0] async for row in stream] == [3, 5]

    asyncio.run(run())
