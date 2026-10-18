"""Verify the deployment support boundary and real PostgreSQL migration history."""

import asyncio
import os
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema
import pytest

from SYSTEM.database.migration_policy import require_migration_backend
from SYSTEM.models import AuthUser

BACKEND = Path(__file__).resolve().parents[1]
POSTGRES = os.environ.get("PLATFORM_PATCH_TEST_POSTGRES_URL")


def migration_config(url, connection=None):
    """Borrow a test connection without reading or editing deployment configuration."""
    config = Config()
    config.set_main_option("script_location", str(BACKEND / "SYSTEM/models/migrations"))
    config.attributes.update(database_url=url, connection=connection)
    return config


def test_sqlite_full_migration_is_rejected_before_creating_a_file(tmp_path):
    filename = tmp_path / "unsupported.sqlite"
    with pytest.raises(ValueError, match="Full application migrations require PostgreSQL"):
        command.upgrade(migration_config(f"sqlite+aiosqlite:///{filename}"), "head")
    assert not filename.exists()


@pytest.mark.parametrize("backend", ["sqlite", "mysql", "unknown"])
def test_unsupported_migration_backends_are_explicit(backend):
    with pytest.raises(ValueError, match="SQLite is supported only"):
        require_migration_backend(backend)


@pytest.mark.skipif(not POSTGRES, reason="Requires an isolated PLATFORM_PATCH_TEST_POSTGRES_URL")
@pytest.mark.parametrize("existing", [False, True], ids=["fresh", "preserve-existing"])
def test_full_postgres_migration_chain(existing):
    async def exercise():
        schema = "migration_" + uuid4().hex
        owner = create_async_engine(POSTGRES)
        engine = None
        try:
            async with owner.begin() as connection:
                await connection.execute(CreateSchema(schema))
            engine = create_async_engine(POSTGRES, connect_args={"server_settings": {"search_path": schema}})
            account = AuthUser()
            await account.set_password("migration-sentinel-password")
            password_hash = account.password
            async with engine.begin() as connection:

                def upgrade(sync_connection, revision):
                    command.upgrade(migration_config(POSTGRES, sync_connection), revision)

                if existing:
                    await connection.run_sync(upgrade, "3b85f19e2a60")
                    await connection.execute(text("INSERT INTO auth_role (id, role) VALUES (17, 'viewer')"))
                    await connection.execute(
                        text("INSERT INTO auth_user (id,email,password,role_id) VALUES (23,:email,:password,17)"),
                        {"email": "sentinel@example.com", "password": password_hash},
                    )
                    await connection.execute(
                        text(
                            "INSERT INTO portfolio_site "
                            "(id,user_id,copyright_year,linkedin,github,medium,email,chat_icon) "
                            "VALUES (29,23,2026,'','','','public@example.com','cow')"
                        )
                    )
                    await connection.run_sync(upgrade, "159af2dc7898")
                    await connection.execute(
                        text(
                            "INSERT INTO record_login (id,user_id,logintime) "
                            "VALUES (31,23,'2026-01-02T03:04:05+00:00')"
                        )
                    )
                await connection.run_sync(upgrade, "head")
                assert await connection.scalar(text("SELECT version_num FROM alembic_version")) == "d7a24e91b630"
                tables = await connection.run_sync(lambda conn: inspect(conn).get_table_names())
                assert {"record_request", "record_login", "auth_user", "portfolio_site"} <= set(tables)
                if existing:
                    row = (
                        await connection.execute(
                            text('SELECT email,password,"user",role_id FROM auth_user WHERE id=23')
                        )
                    ).one()
                    assert tuple(row) == ("sentinel@example.com", password_hash, "sentinel", 17)
                    site = (
                        await connection.execute(
                            text("SELECT user_id,email,is_published,is_default FROM portfolio_site WHERE id=29")
                        )
                    ).one()
                    assert tuple(site) == (23, "public@example.com", True, True)
                    login = (
                        await connection.execute(
                            text("SELECT id,user_id,logintime,ip_address,geo_status FROM record_login")
                        )
                    ).one()
                    assert tuple(login[:2]) == (31, 23)
                    assert login.logintime.isoformat() == "2026-01-02T03:04:05+00:00"
                    assert login.ip_address is None and login.geo_status == "unknown"
                    # Re-running head must be idempotent and retain the historical record.
                    await connection.run_sync(upgrade, "head")
                    assert await connection.scalar(text("SELECT count(*) FROM record_login")) == 1
        finally:
            if engine is not None:
                await engine.dispose()
            async with owner.begin() as connection:
                await connection.execute(DropSchema(schema, cascade=True))
            await owner.dispose()

    asyncio.run(exercise())
