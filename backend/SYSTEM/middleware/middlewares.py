# ◆—< Pack >—————————————————————————————————◆ Middlewares
from .utils import *

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.settings import SEC_CORS, SEC_SESSION_CONF
from SYSTEM.database import CONN_MANAGER
from SYSTEM.constants import EnumCache



# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ◆—< Pack >—————————————————————————————————◆ Star
from starsessions import SessionAutoloadMiddleware
from starsessions.stores.redis import RedisStore
from starlette.middleware import Middleware

# ■—< GLOBAL >————————————————————————————————————————————————————————————————————————■ Middleware - Registries
MIDDLEWARES = [
    # -< Middleware >--------------------------------● CORS
    Middleware(CORSMiddleware, **SEC_CORS),
    # -< Middleware >--------------------------------● Heartbeat
    Middleware(HeartbeatMiddleware),
    # -< Middleware >--------------------------------● SESSION
    Middleware(
        SessionMiddleware,
        store_factory=lambda: RedisStore(
            connection=CONN_MANAGER.get_cache(key=EnumCache.SYS),
            prefix='sess:',
        ),
        **SEC_SESSION_CONF
    ),
    # -< Middleware >--------------------------------● SESSION-AutoLoad
    Middleware(SessionAutoloadMiddleware),
]
