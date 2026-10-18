"""Verify independent monitoring permission migration and conservative new-role defaults."""

from importlib import util
from pathlib import Path
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

from alembic.migration import MigrationContext
from alembic.operations import Operations
import sqlalchemy as sa
import pytest

from APPs.Monitor.module import module_monitor
from SYSTEM.tools.monitor_stream import MonitorStream


def test_monitor_permission_migration_enables_all_existing_roles_and_preserves_data():
    """Include the registration default, preserve management rights, and reverse only the new column.

    Author: ZhengLee 2026.10.18
    """
    path = (
        Path(__file__).resolve().parents[1]
        / "SYSTEM/models/migrations/versions/d7a24e91b630_add_role_monitor_permission.py"
    )
    spec = util.spec_from_file_location("monitor_permission_migration", path)
    revision = util.module_from_spec(spec)
    spec.loader.exec_module(revision)
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "CREATE TABLE auth_role (id INTEGER PRIMARY KEY, role TEXT, is_default BOOLEAN, is_manage_sites BOOLEAN)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO auth_role VALUES (1, 'admin', false, true), (2, 'editor', true, false), (3, 'viewer', false, false)"
                )
            )
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                revision.upgrade()
            rows = connection.execute(
                sa.text("SELECT id, role, is_default, is_manage_sites, is_monitor FROM auth_role ORDER BY id")
            ).all()
            assert [tuple(row) for row in rows] == [
                (1, "admin", 0, 1, 1),
                (2, "editor", 1, 0, 1),
                (3, "viewer", 0, 0, 1),
            ]
            connection.execute(
                sa.text("INSERT INTO auth_role (id,role,is_default,is_manage_sites) VALUES (4,'new',false,false)")
            )
            assert connection.scalar(sa.text("SELECT is_monitor FROM auth_role WHERE id=4")) == 0
            with Operations.context(context):
                revision.downgrade()
            assert "is_monitor" not in {column["name"] for column in sa.inspect(connection).get_columns("auth_role")}
            assert connection.scalar(sa.text("SELECT COUNT(*) FROM auth_role")) == 4
            assert connection.scalar(sa.text("SELECT is_manage_sites FROM auth_role WHERE id=1")) == 1
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "monitor,sites,allowed",
    [
        (True, False, True),
        (False, True, False),
        (False, False, False),
        (True, True, True),
        ("true", True, False),
        (None, True, False),
    ],
)
async def test_socket_permission_is_independent_and_requires_boolean_true(monkeypatch, monitor, sites, allowed):
    """The shared socket authorizer gates on refreshed monitor rights, never site rights."""
    session = SimpleNamespace(info={})

    @asynccontextmanager
    async def transaction():
        yield SimpleNamespace(session=session)

    current_session = AsyncMock(return_value={"id": 41, "is_monitor": monitor, "is_manage_sites": sites})
    monkeypatch.setattr(module_monitor, "RedisAsync", lambda **_: SimpleNamespace(redis=object()))
    monkeypatch.setattr(module_monitor, "socketio_session_request", AsyncMock(return_value=object()))
    monkeypatch.setattr(module_monitor, "SqlAlchemyExecAsync", lambda: SimpleNamespace(transaction=transaction))
    monkeypatch.setattr(
        module_monitor, "AuthSessionModule", lambda *_, **__: SimpleNamespace(current_session=current_session)
    )
    assert await module_monitor.authorize_monitor({}) == (41 if allowed else None)
    current_session.assert_awaited_once()
    assert session.info["system.monitor.ignore"] is True


async def test_full_monitor_capacity_is_unavailable_instead_of_a_permission_denial():
    """A full worker must not redirect an authorized browser to Access denied.

    Author: ZhengLee 2026.10.18
    """
    monitor = SimpleNamespace(redis=object(), interval=0.5, instance_id="capacity-test", prefix="capacity-test")
    server = SimpleNamespace()
    authorize = AsyncMock(return_value=41)
    stream = MonitorStream(monitor, server, authorize=authorize)
    server.monitor_stream = stream
    stream.connections = {str(index): {} for index in range(128)}
    with pytest.raises(module_monitor.SocketConnectionRefusedError) as rejected:
        await module_monitor.MonitorEventModule(server).connect("overflow", {})
    assert rejected.value.error_args["data"] == {"code": "MONITOR_UNAVAILABLE"}
    authorize.assert_not_awaited()
    assert "overflow" not in stream.connections
