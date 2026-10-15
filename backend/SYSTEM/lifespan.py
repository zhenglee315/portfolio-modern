# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.constants import EnumCache
from SYSTEM.tools import *
from SYSTEM.tools.tools_geoip import GeoIpReader
from SYSTEM.settings import GEOIP_DATABASE_PATH

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

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
      - Opens one optional local GeoIP City reader per process.

    During shutdown:
      - Resets FastAPICache and closes the database and Redis clients.
      - Closes the GeoIP reader after requests finish.

    :param app: The FastAPI application instance.
                                                                                              ♂ Wilson 2025.02.10
    """
    # GeoIP enrichment is optional; missing data must not prevent authentication.
    #                                                                                       ♂ ZhengLee 2026.10.15
    app.state.geoip_reader = GeoIpReader(GEOIP_DATABASE_PATH)
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
        await run_in_threadpool(app.state.geoip_reader.open)

        yield  # Yield control back to the application. The app is now running.
    finally:
        # ----------------------------------------------------------------★ Shutdown
        FastAPICache.reset()
        try:
            await run_in_threadpool(app.state.geoip_reader.close)
        finally:
            await CONN_MANAGER.shutdown_all_connections()
