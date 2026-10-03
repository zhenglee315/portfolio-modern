# ◆—< Pack >—————————————————————————————————◆ Configuration
from SYSTEM.extension import SYS_CONF

# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools import EnumUtils

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Storage configuration sections
# Read configuration sections at import time; this does not create connections.
# Nested sections are expected to be mappings and are not validated here.
DB_CONF = SYS_CONF.get(section='DATABASE', fallback={})
DB_OPTIONS = DB_CONF.get('OPTIONS', {})
DB_POOL = DB_OPTIONS.get('POOL', {})
DB_META = DB_CONF.get('META', {})
DB_KEEP_ALIVE = DB_OPTIONS.get('KEEP_ALIVE', {})

# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Storage service identifiers
class EnumDBType(EnumUtils):
    """
    Identify database, messaging, graph, and storage services by string value.

    These identifiers do not install drivers, create clients, or guarantee
    SQLAlchemy compatibility. Actual service support depends on its integration.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    SQLLite = 'sqlite'
    POSTGRESQL = 'postgresql'
