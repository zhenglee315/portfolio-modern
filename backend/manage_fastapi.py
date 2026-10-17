# ◆—< Pack >—————————————————————————————————◆ Core
from SYSTEM.lifespan import lifespan

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.middleware import *
from SYSTEM.settings import *
from SYSTEM.tools import *

# ◆—< Pack >—————————————————————————————————◆ Server
from starlette.types import ASGIApp
import uvicorn

# ◆—< Pack >—————————————————————————————————◆ Python
from pathlib import Path
from socket import gethostname


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ MAIN-FastAPI
class FastApiServer:
    """
    Assemble FastAPI routes, local docs, Socket.IO and request monitoring.

    The application factory runs inside each worker; lifespan owns that worker's
    SQL/Redis resources, sampling and monitor stream. The outer ASGI monitor also
    observes HTTP errors produced outside FastAPI's registered middleware stack.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(self):
        """
        Create the FastAPI application using the database lifespan and existing settings.

        :return: None; runtime connections are opened later by lifespan.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.app: FastAPI = FastAPI(middleware=MIDDLEWARES, lifespan=lifespan, **FASTAPI_CONF)
        self.dir_static = DIR_STATIC
        self.dir_app = DIR_APPS

    def __init_static(self):
        FastApiLocalDocs(
            self.app, dir_path="SYSTEM", dir_static=self.dir_static, docs_url=URL_DOCS, redoc_url=URL_REDOC
        ).load()

    def __init_router(self):
        """
        Register application routers using the existing discovery helper.

        :return: None; discovered routes are added to this server's FastAPI application.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        fastapi_include_routers(app=self.app, app_dir=self.dir_app)

    def __init_socketio(self) -> ASGIApp:
        """
        Discover the application's Socket.IO events and return its ASGI wrapper.

        :return: Socket.IO ASGI wrapper forwarding ordinary requests to FastAPI.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        return socketio_init_app(self.app, server=sio, dir_app=self.dir_app)

    def start(self) -> ASGIApp:
        """
        Assemble routes and docs, then wrap Socket.IO with HTTP monitoring.

        :return: ASGI application sharing the FastAPI state populated by lifespan.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.__init_router()
        self.__init_static()
        return MonitorMiddleware(self.__init_socketio(), state=self.app.state)


def create_app() -> ASGIApp:
    """Build the application inside each Uvicorn worker."""
    return FastApiServer().start()


# ■—< INIT >——————————————————————————————————————————————————————————————————————————■ Run Server

if __name__ == "__main__":
    """
    [ORM Command]
        ●　Initial structure:        uv run alembic init -t async SYSTEM/models/migrations

        ●　Initial migration:        uv run alembic revision --autogenerate -m "Initial migration"

        ●　Migrate:                  uv run alembic upgrade head

        ●　DuplicateObjectError:     DROP TYPE IF EXISTS "type_name" CASCADE;
    """

    try:
        with WorkerMonitor.supervise(workers=SVR_WORKERS, instance_id=f"{gethostname()}:{SVR_PORT}"):
            uvicorn.run(
                app=f"{Path(__file__).stem}:{create_app.__name__}",
                factory=True,
                host=SVR_HOST_CONF,
                port=SVR_PORT,
                workers=SVR_WORKERS,
                proxy_headers=True,
                forwarded_allow_ips=SVR_TRUSTED_PROXIES,
                # log_config=LoggerSetup().get_logging_config(),
            )
    except KeyboardInterrupt:
        raise ValueError(f"HolmesPlatform({SVR_WORKERS}) has been gracefully terminated.")
