# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools.tools_enum import EnumUtils, IntEnumUtils

__all__ = ["EnumCache", "CacheIdx", "CacheRedisRange", "CacheExpiry"]


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Cache roles
class EnumCache(EnumUtils):
    """
    Define string identifiers for application cache roles.

    These values identify entries in the cache configuration; they are not
    Redis database indexes or Redis Cluster hash slots.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    SYS = "System"
    WEB = "WebCache"
    SOCKET = "SocketIO"
    WORKER = "Worker"
    LOCKER = "Locker"
    SCHEDULER = "Scheduler"


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Cache database indexes
class CacheIdx(IntEnumUtils):
    """
    Define integer Redis logical database indexes used by cache configuration.

    Defining an index does not create a database or validate server support.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    INDEX_0 = 0
    INDEX_1 = 1
    INDEX_2 = 2
    INDEX_3 = 3
    INDEX_4 = 4
    INDEX_5 = 5


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Cache range
class CacheRedisRange(IntEnumUtils):
    """
    Preserve the application's default integer Redis range setting.

    The consuming operation defines what this range means; this enum does not
    implement Redis range commands or establish inclusive/exclusive boundaries.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    DEFAULT = 1


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Cache expiration
class CacheExpiry(IntEnumUtils):
    """
    Define fixed cache expiration durations as integer seconds.

    MONTH is exactly 31 days and YEAR is exactly 365 days. These are elapsed
    durations, not calendar intervals, and do not account for variable month
    lengths, leap years, or daylight-saving changes.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    SEC_2 = 2
    SEC_3 = 3
    SEC_5 = 5
    SEC_10 = 10
    SEC_30 = 30
    MIN = 60
    MIN_2 = MIN * 2
    MIN_5 = MIN * 5
    MIN_10 = MIN * 10
    MIN_30 = MIN * 30
    HOUR = MIN * 60
    HOUR_8 = HOUR * 8
    DAY = HOUR * 24
    WEEK = DAY * 7
    MONTH = DAY * 31
    YEAR = DAY * 365
