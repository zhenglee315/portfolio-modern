# ◆—< Pack >—————————————————————————————————◆ Middlewares
from .utils import *

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.settings import SEC_CORS

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ◆—< Pack >—————————————————————————————————◆ Star
from starlette.middleware import Middleware

# ■—< GLOBAL >————————————————————————————————————————————————————————————————————————■ Middleware - Registries
MIDDLEWARES = [
    # -< Middleware >--------------------------------● CORS
    Middleware(CORSMiddleware, **SEC_CORS),
    # -< Middleware >--------------------------------● Heartbeat
    Middleware(HeartbeatMiddleware),
]
