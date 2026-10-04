# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.redis import RedisAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumCache


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Heartbeat
async def sys_heartbeat_online() -> dict[str, int]:
    """
    Count client IP addresses with an unexpired heartbeat in the system cache.

    :return: Dictionary containing the estimated recent active IP count.
    """
    return {"online": await RedisAsync(key=EnumCache.SYS).heartbeat_total()}
