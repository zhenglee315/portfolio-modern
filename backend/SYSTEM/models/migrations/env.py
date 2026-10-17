# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.database.migration_policy import require_migration_backend
from SYSTEM import models

# ◆—< Pack >—————————————————————————————————◆ SqlAlchemy
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy.engine import Connection, make_url
from sqlalchemy import pool

# ◆—< Pack >—————————————————————————————————◆ Alembic
from alembic import context

# ◆—< Pack >—————————————————————————————————◆ Python
from logging.config import fileConfig
import asyncio

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Sqlalchemy - URL
config = context.config
url = config.attributes.get("database_url") or CONN_MANAGER.get_db_url()

url = make_url(url)
require_migration_backend(url.get_backend_name())
database_url = url.render_as_string(hide_password=False).replace("%", "%%")
config.set_main_option("sqlalchemy.url", database_url)

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Sqlalchemy - Logging
if config.config_file_name is not None:
    """
    Interpret the config file for Python logging.
    This line sets up loggers basically.
    """
    fileConfig(config.config_file_name)

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Sqlalchemy - Models
"""
    add your model's MetaData object here
    for 'autogenerate' support
    from myapp import MyModel
    target_metadata = MyModel.Base.metadata
"""
target_metadata = models.BASE.metadata


# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # Deployment opens its own engine; migration tests borrow a schema-scoped connection.
    connection = config.attributes.get("connection")
    if connection is not None:
        do_run_migrations(connection)
    else:
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
