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
DB_KEEP_ALIVE = DB_OPTIONS.get('KEEP_ALIVE', {})


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Storage service identifiers
class EnumDBType(EnumUtils):
    """
    Identify database, messaging, graph, and storage services by string value.

    These identifiers do not install drivers, create clients, or guarantee
    SQLAlchemy compatibility. Actual service support depends on its integration.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    ORACLE = 'oracle'
    POSTGRESQL = 'postgresql'
    MYSQL = 'mysql'
    MARIADB = 'mariadb'
    MSSQL = 'mssql'
    RABBITMQ = 'rabbitmq'
    NEBULA = 'nebula'
    SEAWEED = 'seaweed'
    RUSTFS = 'rustfs'
    KAFKA = 'kafka'


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Storage categories
class EnumDBStoreType(EnumUtils):
    """
    Classify services as relational databases, queues, graphs, or storage.

    These string categories describe a service's role; they do not select a
    driver, validate configuration, or initialize resources.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    RDBMS = 'rdbms'
    QUEUE = 'queue'
    GRAPH = 'graph'
    STORAGE = 'storage'


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Data source identifiers
class EnumDBSource(EnumUtils):
    """
    Define application-specific identifiers for logical data sources.

    The consuming configuration or module defines each source's meaning.
    These string values are identifiers, not connection URLs or credentials.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    HOLMES = 'holmes'
    EDGE = 'edge'


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Source center identifiers
class EnumDBSourceCenter(EnumUtils):
    """
    Define application-specific identifiers for source centers.

    The consuming configuration or module defines how these labels are used.
    This enum does not establish routing, locations, or access permissions.

                                                                                               ♂ ZhengLee 2026.09.26
    """

    DFOC = 'dfoc'
    FACTORY_EAP = 'factory_eap'
