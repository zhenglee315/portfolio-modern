# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database import CONN_MANAGER
from SYSTEM.extension import sio
from SYSTEM.constants import EnumCache
from SYSTEM.tools import *
from SYSTEM.settings import GEOIP_DATABASE_PATH, SVR_HOST_CONF, SVR_PORT, SVR_WORKERS, MONITOR_CYCLE_SEC

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
      - Registers one worker monitor and its transaction listeners, publishing to SYS Redis.
      - Binds the authorized Socket.IO monitor stream after its sampler is ready.

    During shutdown:
      - Resets FastAPICache and closes the database and Redis clients.
      - Closes the GeoIP reader after requests finish.
      - Stops worker monitoring before closing its borrowed Redis connection.
      - Stops Socket.IO background tasks and closes its separate Redis resources.

    :param app: The FastAPI application instance.
                                                                                              ♂ Wilson 2025.02.10
    """
    # GeoIP enrichment is optional; missing data must not prevent authentication.
    #
    # ----< Startup >--------------------------------● Init                                                                             ♂ ZhengLee 2026.10.15
    app.state.geoip_reader = GeoIpReader(GEOIP_DATABASE_PATH)
    app.state.monitor = None
    app.state.monitor_stream = None
    try:
        # ----------------------------------------------------------------★ Startup
        CONN_MANAGER.init_cache()
        FastAPICache.init(
            RedisBackend(redis=CONN_MANAGER.get_cache(key=EnumCache.WEB)),
            prefix="fastapi-cache",
            key_builder=fastapi_cache_key_builder,
        )
        # -< Startup >-------------------------------● Database
        CONN_MANAGER.init_db()
        await run_in_threadpool(app.state.geoip_reader.open)
        # -< Startup >-------------------------------● Monitor
        # Borrow existing connections. The synchronous engine identifies SQLAlchemy
        # event sources only; monitoring does not open a Session or persist SQL rows.
        app.state.monitor = WorkerMonitor(
            redis=CONN_MANAGER.get_cache(key=EnumCache.SYS),
            interval=MONITOR_CYCLE_SEC,
            engine=CONN_MANAGER.get_engine().sync_engine,
            geoip_reader=app.state.geoip_reader,
            server_info={"host": SVR_HOST_CONF, "port": SVR_PORT, "expected_workers": SVR_WORKERS},
        )
        await app.state.monitor.start()
        app.state.monitor_stream = await socketio_start_monitor(sio, app.state.monitor)

        yield  # Yield control back to the application. The app is now running.
    finally:
        # ----------------------------------------------------------------★ Shutdown
        try:
            try:
                if app.state.monitor_stream is not None:
                    await app.state.monitor_stream.stop()
                    sio.monitor_stream = None
            finally:
                if app.state.monitor is not None:
                    await app.state.monitor.stop()
        finally:
            try:
                await socketio_shutdown(sio)
            finally:
                FastAPICache.reset()
                try:
                    await run_in_threadpool(app.state.geoip_reader.close)
                finally:
                    await CONN_MANAGER.shutdown_all_connections()
