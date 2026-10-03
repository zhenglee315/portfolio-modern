# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncEngine, AsyncSession
from sqlalchemy.engine import URL

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.asyncio import ConnectionPool as AsyncPool, Redis as AsyncRedis

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.settings import CACHE_CONF, DB_CONF, SQLALCHEMY_ENGINE_CONF
from SYSTEM.constants import EnumDBType

# ◆—< Pack >—————————————————————————————————◆ Python
from copy import deepcopy


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Connection Manager
class ConnectionManager:
    """
    Manage one asynchronous SQL database and the configured Redis cache clients.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(self) -> None:
        """
        Copy SQL and Redis settings without opening connections.

        :return: None; init_db() and init_cache() register resources separately.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.db_conf = DB_CONF.copy()
        self.engine_conf = SQLALCHEMY_ENGINE_CONF.copy()
        self.cache_conf = deepcopy(CACHE_CONF)
        self._aioredis: dict[str, AsyncRedis] = {}
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None

    # —< Internals >———————————————————————————————————————● Database URL
    def __url(self) -> URL:
        """
        Build an asynchronous SQLAlchemy URL from this instance's DB_CONF copy.

        :return: SQLite or PostgreSQL URL; the password is kept in the URL object.
        :raises TypeError: The stored database configuration is not a dictionary.
        :raises ValueError: The database type or required configuration is unsupported.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        db_conf = self.db_conf
        if not isinstance(db_conf, dict):
            raise TypeError("Database configuration must be a dictionary.")
        if db_conf.get("is_async") is not True:
            raise ValueError("ConnectionManager requires an asynchronous database driver.")

        db_type = db_conf.get("type")
        name = db_conf.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Database name must be a non-empty string.")

        match db_type:
            # ●--< Database >--------------------------------------------------------------● SQLite
            case EnumDBType.SQLLite:
                return URL.create("sqlite+aiosqlite", database=name)

            # ●--< Database >--------------------------------------------------------------● PostgreSQL
            case EnumDBType.POSTGRESQL:
                for field in ("host", "user", "password"):
                    if db_conf.get(field) is None:
                        raise ValueError(f"PostgreSQL configuration requires '{field}'.")
                return URL.create(
                    "postgresql+asyncpg",
                    username=db_conf["user"],
                    password=db_conf["password"],
                    host=db_conf["host"],
                    port=db_conf.get("port"),
                    database=name,
                )

            case _:
                raise ValueError(f"Unsupported database type: {db_type!r}.")

    # —< Init >————————————————————————————————————————————● Database
    def init_db(self) -> None:
        """
        Register one asynchronous database engine and session factory.

        File SQLite and PostgreSQL use the configured pool options. In-memory
        SQLite keeps the dialect's StaticPool defaults.

        :return: None; engine creation does not check database connectivity.
        :raises RuntimeError: A database engine has already been registered.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if self._engine is not None:
            raise RuntimeError("Database engine has already been initialized.")

        url = self.__url()
        engine_conf = self.engine_conf.copy()
        if url.get_backend_name() == EnumDBType.SQLLite and url.database == ":memory:":
            # StaticPool does not accept queue pool options.
            engine_conf = {
                "echo": self.engine_conf["echo"],
                "future": self.engine_conf["future"],
            }

        engine = create_async_engine(url, **engine_conf)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        self._engine = engine
        self._session_factory = session_factory
        print(f"[INFO] [ConnectionManager.init_db] Registered async {url.get_backend_name()} database engine.")

    # —< Init >————————————————————————————————————————————● Redis
    def init_cache(self) -> None:
        """
        Register an asynchronous Redis client for each configured cache slot.

        Cache keys and HOST, PORT, DB, and POOL_SIZE come from settings.CACHE_CONF.

        :return: None; creating clients does not connect to Redis.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        pending: dict[str, AsyncRedis] = {}
        for key, conf in self.cache_conf.items():
            if key in self._aioredis:
                raise ValueError(f"Cache client with key '{key}' already exists.")
            if not isinstance(conf, dict):
                raise TypeError(f"Cache configuration for '{key}' must be a dictionary.")

            pool = AsyncPool(
                host=conf["HOST"],
                port=conf["PORT"],
                db=conf["DB"],
                max_connections=conf.get("POOL_SIZE", 10),
                socket_timeout=5,
            )
            pending[key] = AsyncRedis(connection_pool=pool)

        self._aioredis.update(pending)
        print(f"[INFO] [ConnectionManager.init_cache] Registered {len(pending)} async Redis cache client(s).")

    # —< Access >——————————————————————————————————————————● Database
    def get_db(self) -> AsyncSession:
        """
        Create a new asynchronous session for the configured database.

        ● Guide:
            async with manager.get_db() as session:
                result = await session.execute(stmt)

        :return: New AsyncSession; the caller owns commit, rollback, and close.
        :raises RuntimeError: init_db() has not registered a session factory.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        if self._session_factory is None:
            raise RuntimeError("Database has not been initialized; call init_db() first.")
        return self._session_factory()

    # —< Access >——————————————————————————————————————————● Redis
    def get_cache(self, key: str) -> AsyncRedis:
        """
        Return the asynchronous Redis client registered for a cache key.

        :param key: Cache key defined in CACHE_CONF.
        :return: Registered Redis client; no connection is opened by this lookup.
        :raises KeyError: The cache key has not been registered.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return self._aioredis[key]

    # —< Shutdown >————————————————————————————————————————● Database + Redis
    async def shutdown_all_connections(self) -> None:
        """
        Close the SQL engine and all registered asynchronous Redis clients.

        Call after request sessions have finished. Successful resources are removed,
        so repeated shutdown calls are safe and failed closures can be retried.

        :return: None after all resources have closed.
        :raises ExceptionGroup: One or more resources could not be closed.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        errors: list[Exception] = []
        closed_db = 0
        closed_caches = 0

        if self._engine is not None:
            try:
                await self._engine.dispose()
            except Exception as exc:
                errors.append(exc)
            else:
                self._engine = None
                self._session_factory = None
                closed_db = 1

        for key, client in tuple(self._aioredis.items()):
            try:
                await client.aclose(close_connection_pool=True)
            except Exception as exc:
                errors.append(exc)
            else:
                del self._aioredis[key]
                closed_caches += 1

        if errors:
            raise ExceptionGroup("Failed to close all database and Redis connections.", errors)

        print(
            "[INFO] [ConnectionManager.shutdown_all_connections] "
            f"Closed {closed_db} database engine(s) and {closed_caches} async Redis cache client(s)."
        )


# ■—< GLOBAL >————————————————————————————————————————————————————————————————————————■ Instance - Connection Manager
# Process-local registry; construction alone does not open database or Redis connections.
CONN_MANAGER = ConnectionManager()
