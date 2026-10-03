# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.constants import EnumCache
from SYSTEM.tools import *

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import FastAPI

# ◆—< Pack >—————————————————————————————————◆ Cache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache import FastAPICache

# ◆—< Pack >—————————————————————————————————◆ Python
from contextlib import asynccontextmanager


# ■—< Event >—————————————————————————————————————————————————————————————————————————■ System Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan function to manage application startup and shutdown.

    During startup:
      - Registers asynchronous Redis clients and configures FastAPICache.
      - Initializes the asynchronous SQLAlchemy engine.

    During shutdown:
      - Resets FastAPICache and closes the database and Redis clients.

    :param app: The FastAPI application instance.
                                                                                              ♂ Wilson 2025.02.10
    """
    try:
        # ----------------------------------------------------------------★ Startup
        CONN_MANAGER.init_cache()
        FastAPICache.init(
            RedisBackend(redis=CONN_MANAGER.get_cache(key=EnumCache.WEB)),
            prefix='fastapi-cache',
            key_builder=fastapi_cache_key_builder,
        )
        # -< Startup >-------------------------------● Database
        CONN_MANAGER.init_db()

        yield  # Yield control back to the application. The app is now running.
    finally:
        # ----------------------------------------------------------------★ Shutdown
        FastAPICache.reset()
        await CONN_MANAGER.shutdown_all_connections()
