# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools import EnumUtils


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Namespace
class NameSpace(EnumUtils):
    """Share Socket.IO namespaces between event registration and stream delivery.

    String values retain the leading slash used by client namespace connections.
    """

    MONITOR = "/monitor"


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Events - Monitor
class EventMonitor(EnumUtils):
    """Share monitoring event names between incoming handlers and outgoing messages.

    Group future event enums by purpose using Event<Purpose> class names.
    Values preserve the existing client protocol.
    """

    SUBSCRIBE = "monitor_subscribe"
    RESYNC = "monitor_resync"
    UNSUBSCRIBE = "monitor_unsubscribe"
    TEST = "monitor_test"
    TEST_RESULT = "monitor_test_result"
    SNAPSHOT = "monitor_snapshot"
    STATUS = "monitor_status"


__all__ = ("NameSpace", "EventMonitor")
