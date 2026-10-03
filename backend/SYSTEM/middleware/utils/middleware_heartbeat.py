# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.tools import net_client_ip
from SYSTEM.constants import EnumCache

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.redis import RedisAsync

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Request

# ◆—< Pack >—————————————————————————————————◆ Starlette
from starlette.middleware.base import BaseHTTPMiddleware

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.exceptions import ConnectionError as RedisConnectionError, TimeoutError as RedisTimeoutError


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Middleware - Heartbeat
class HeartbeatMiddleware(BaseHTTPMiddleware):
    """
    Refresh the current client's heartbeat for the online visitor count.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    async def dispatch(self, request: Request, call_next):
        """
        Record the request IP and continue even if Redis is unavailable.

        :param request: Current HTTP request.
        :param call_next: The next request handler.
        :return: Response from the next handler.

                                                                                               ♂ ZhengLee 2026.10.03
        """
        client_ip = net_client_ip(request=request)
        try:
            await RedisAsync(key=EnumCache.SYS).heartbeat_client(identifier=client_ip)
        except (RedisConnectionError, RedisTimeoutError):
            print("[WARNING] [HeartbeatMiddleware] Redis heartbeat unavailable.")
        return await call_next(request)
