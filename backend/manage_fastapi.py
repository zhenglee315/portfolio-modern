# ◆—< Pack >—————————————————————————————————◆ Core
from SYSTEM.lifespan import lifespan

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.middleware import *
from SYSTEM.settings import *
from SYSTEM.tools import *

# ◆—< Pack >—————————————————————————————————◆ Server
from socketio import ASGIApp
import uvicorn


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ MAIN-FastAPI
class FastApiServer:
    """
    Assemble the existing FastAPI server entry point and its optional integrations.

    The database lifespan manages worker-local SQL and Redis resources. Other optional
    middleware, Socket.IO, Celery, static, and monitoring integrations still require the
    application to provide their referenced symbols.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    def __init__(self):
        """
        Create the FastAPI application using the database lifespan and existing settings.

        :return: None; middleware and optional integration symbols must be supplied by the application.

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

    def __init_socketio(self):
        """
        Register the application's optional Socket.IO event handlers.

        :return: None; the existing Socket.IO helper must be supplied by the application.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        socketio_include_events(dir_app=self.dir_app)

    def start(self) -> ASGIApp:
        """
        Assemble existing integrations and return the Socket.IO ASGI wrapper.

        :return: ASGI application; optional integrations must be available before calling.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        self.__init_router()
        self.__init_static()
        self.__init_socketio()
        return socketio.ASGIApp(sio, other_asgi_app=self.app, socketio_path="/socket.io")


# ■—< INIT >——————————————————————————————————————————————————————————————————————————■ Run Server

if __name__ == "__main__":
    """
    [ORM Command]
        ●　Initial structure:        alembic init -t async SYSTEM/models/migrations

        ●　Initial migration:        alembic revision --autogenerate -m "Initial migration"

        ●　Migrate:                  alembic upgrade head

        ●　DuplicateObjectError:     DROP TYPE IF EXISTS "type_name" CASCADE;
    """

    try:
        uvicorn.run(
            app=FastApiServer().start(),
            host=SVR_HOST_CONF,
            port=SVR_PORT,
            workers=SVR_WORKERS,
            proxy_headers=True,
            forwarded_allow_ips="*",
            # log_config=LoggerSetup().get_logging_config(),
        )
    except KeyboardInterrupt:
        raise ValueError(f"HolmesPlatform({SVR_WORKERS}) has been gracefully terminated.")
