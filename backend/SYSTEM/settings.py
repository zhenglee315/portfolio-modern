# ◆—< Pack >—————————————————————————————————◆ System
# from .urls import Tags, PreFix, RouteAuth
from .constants import *

# ◆—< Pack >—————————————————————————————————◆ Extension
from .extension import *

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from .tools import net_primary_ip

# ◆—< Pack >—————————————————————————————————◆ Python
from datetime import UTC, datetime, timedelta
from pathlib import Path
import httpx

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Basic
BASE_DIR = Path(__file__).resolve().parent.parent

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Server
# -< System >----------------------------------● Network
SVR_HOST = net_primary_ip()
SVR_HOST_CONF = '127.0.0.1' if SVR_LOCALLY else SYS_CONF.get('SERVER', 'host', fallback=SVR_HOST)
SVR_PORT = int(SYS_CONF.get('SERVER', 'port', fallback='8080'))
SVR_URL = f'http://{SVR_HOST}:{SVR_PORT}'
# -< System >----------------------------------● Performance
SVR_ENCODE = SYS_CONF.get('SERVER', 'decode', fallback='utf-8')
SVR_WORKERS = int(SYS_CONF.get('SERVER', 'worker', fallback=1))
SVR_RELOAD = SYS_CONF.get('SERVER', 'reload', fallback=False)
SVR_HTTPS = SYS_CONF.get('SERVER', 'https', fallback=False)


# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Time
TIME_ZONE = 'UTC'
# These values are import-time snapshots, not a live clock.
TIME_DATETIME = datetime.now(UTC)
TIME_DATETIME_ISO = TIME_DATETIME.isoformat()
TIME_UTC = TIME_DATETIME
TIME_WORK = SYS_CONF.get('TIME', 'time_work', fallback='00:00:00')
TIME_FORMAT = SYS_CONF.get('TIME', 'time_format', fallback='%Y-%m-%dT%H:%M:%S%z')
TIME_START = TIME_DATETIME.strftime(f'%Y-%m-%dT{TIME_WORK}%z')
TIME_END = (TIME_DATETIME + timedelta(days=1)).strftime(f'%Y-%m-%dT{TIME_WORK}%z')
TIME_DATE_START = TIME_DATETIME.strftime('%Y-%m-%d')
TIME_DATE_END = (TIME_DATETIME + timedelta(days=1)).strftime('%Y-%m-%d')
TIME_MONTH_START = TIME_DATETIME.strftime('%Y-%m')
TIME_MONTH_END = (TIME_DATETIME + timedelta(days=1)).strftime('%Y-%m')

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ URL
URL_DOCS = SYS_CONF.get(section='URL', option='docs', fallback='/swagger')
URL_REDOC = SYS_CONF.get(section='URL', option='redoc', fallback='/redoc')
URL_OPENAPI = SYS_CONF.get(section='URL', option='openapi', fallback='/openapi')
URL_PROMETHEUS = SYS_CONF.get(section='URL', option='prometheus', fallback='/metrics')

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Security
# -< Security >--------------------------------● White
SEC_WHITELIST_PATH = [
    URL_DOCS,
    URL_REDOC,
    URL_OPENAPI,
    # f'/{PreFix.AUTH}{RouteAuth.LOGIN}/',
    # f'/{PreFix.AUTH}{RouteAuth.VERIFY}/',
    '/metrics',
    '/openapi.json',
]
# SEC_WHITELIST_PATH_METRIC = [*SEC_WHITELIST_PATH, f'/{PreFix.AUTH}', f'/{PreFix.SYS}', f'/{PreFix.SETUP}']
SEC_WHITELIST_IP = ["127.0.0.1", "127.0.0.*", "192.168.*", "0.0.0.0", SVR_HOST]
# -< Security >--------------------------------● Decryption Key
SEC_SECRET_KEY = SYS_CONF.get('SECURITY', 'secret_key')
if not isinstance(SEC_SECRET_KEY, str) or not SEC_SECRET_KEY.strip():
    raise ValueError('SECURITY.secret_key must be configured locally as a non-empty string.')
SEC_SESSION_TTL = SYS_CONF.get('SECURITY', 'session_ttl', fallback=1800)
# -< Security >--------------------------------● Session
SEC_SESSION_CONF = {
    # ---------------------------◎ TTL
    'lifetime': SEC_SESSION_TTL,
    'rolling': True,
    # ---------------------------◎ HTTP
    "cookie_domain": SYS_CONF.get('SECURITY', 'cookie_domain', fallback=None),
    'cookie_same_site': 'lax',  # strict,lax,none
    'cookie_name': 'session_id',
    'cookie_https_only': SVR_HTTPS,
}

# -< Security >--------------------------------● CORS
SEC_CORS = {
    'allow_origins': [
        'http://127.0.0.1',
        f'http://127.0.0.1:{SVR_PORT}',
        'http://localhost',
        f'http://localhost:{SVR_PORT}',
    ],
    'allow_credentials': SYS_CONF.get('SECURITY', 'cors_allow_creds', fallback=False),
    'allow_methods': ['*'],
    'allow_headers': ['*'],
    'expose_headers': ["Content-Disposition"],
}

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Redis
REDIS_HOST = SVR_HOST_CONF if SVR_LOCALLY else SYS_CONF.get('CACHE', 'host', fallback='127.0.0.1')
REDIS_PORT = 6379 if SVR_LOCALLY else SYS_CONF.get('CACHE', 'port', fallback=6379)
REDIS_DEFAULT_CONNS = 1000
# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Redis
CACHE_CONF = {
    # -< Redis >-------------------------------● System
    EnumCache.SYS: {'HOST': REDIS_HOST, 'PORT': REDIS_PORT, 'DB': int(CacheIdx.INDEX_0), 'POOL_SIZE': 50},
    # -< Redis >-------------------------------● Cache
    EnumCache.WEB: {'HOST': REDIS_HOST, 'PORT': REDIS_PORT, 'DB': int(CacheIdx.INDEX_1), 'POOL_SIZE': 50},
    # -< Redis >-------------------------------● SocketIO
    EnumCache.SOCKET: {'HOST': REDIS_HOST, 'PORT': REDIS_PORT, 'DB': int(CacheIdx.INDEX_2), 'POOL_SIZE': 20},
    # -< Redis >-------------------------------● Worker
    EnumCache.WORKER: {'HOST': REDIS_HOST, 'PORT': REDIS_PORT, 'DB': int(CacheIdx.INDEX_3), 'POOL_SIZE': 10},
    # -< Redis >-------------------------------● Locker
    EnumCache.LOCKER: {'HOST': REDIS_HOST, 'PORT': REDIS_PORT, 'DB': int(CacheIdx.INDEX_4), 'POOL_SIZE': 10},
    # -< Redis >-------------------------------● Scheduler
    EnumCache.SCHEDULER: {'HOST': REDIS_HOST, 'PORT': REDIS_PORT, 'DB': int(CacheIdx.INDEX_5), 'POOL_SIZE': 10},
}


# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ Info
INFO_VER = f"{datetime.now().strftime('%Y.%m.%d')}"
INFO_MAIL = SYS_CONF.get(section='CONTACT', option='mail')

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ FastAPI
FASTAPI_CONF = {
    # -< Info >--------------------------------● Basic
    'title': SYS_CONF.get(section='INFO', option='title', fallback='Holmes-Base'),
    'summary': SYS_CONF.get(section='INFO', option='summary'),
    'description': SYS_CONF.get(section='INFO', option='description'),
    'version': INFO_VER,
    # -< Contact >-----------------------------● Terms, Maintainer
    'terms_of_service': SYS_CONF.get(section='INFO', option='terms'),
    'contact': {
        'name': SYS_CONF.get(section='CONTACT', option='name'),
        'url': SYS_CONF.get(section='CONTACT', option='url'),
        'email': INFO_MAIL,
    },
    # 'license_info': {'name': 'Apache 2.0', 'url': 'https://www.apache.org/licenses/LICENSE-2.0.html'},
    # -< Url >---------------------------------● Direct Link
    'docs_url': None,
    'redoc_url': None,
    'openapi_url': URL_OPENAPI,
    'openapi_version': '3.1.0',
    # 'openapi_tags': [i for i in Tags.values() if i['schema'].value],
    # -< Server >------------------------------● Development
    'debug': SVR_DEBUG,
    # "default_response_class": FastApiJSONResponse,  # Custom JSON response
    # -< Static >------------------------------● Swagger / Redoc
}

# ■—< CONFIG >————————————————————————————————————————————————————————————————————————■ HTTPx
HTTPX_CONF = {
    # -< Http >--------------------------------● Feature
    'http2': SYS_CONF.get(section='HTTP', option='http2', fallback=True),
    'verify': SYS_CONF.get(section='HTTP', option='verify', fallback=True),
    'follow_redirects': True,
    # -< Http >--------------------------------● Connection-pool
    'limits': httpx.Limits(  #
        max_connections=SYS_CONF.get(section='HTTP', option='max_connections', fallback=20),
        max_keepalive_connections=SYS_CONF.get(section='HTTP', option='max_keepalive_connections', fallback=10),
        keepalive_expiry=SYS_CONF.get(section='HTTP', option='keepalive_expiry', fallback=60),
    ),
    'timeout': SYS_CONF.get(section='HTTP', option='timeout', fallback=60),
}

# ■—< DataBase >——————————————————————————————————————————————————————————————————————■ SqlAlchemy
SQLALCHEMY_ENGINE_CONF = {
    # -< sqlalchemy >--------------------------● Options
    "echo": SVR_DEBUG,
    "future": DB_OPTIONS.get('future', True),  # For sqlAlchemy 2.x
    # -< sqlalchemy >--------------------------● Pools
    "max_overflow": DB_POOL.get('max_overflow', 40),
    "pool_size": DB_POOL.get('size', 20),
    "pool_timeout": DB_POOL.get('timeout_sec', 20),
    "pool_recycle": DB_POOL.get('recycle_sec', 1800),
    "pool_pre_ping": DB_POOL.get('pre_ping', True),
    "pool_use_lifo": DB_POOL.get('use_lifo', True),
}
