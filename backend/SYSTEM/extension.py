# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools import YamlConfig

# ◆—< Pack >—————————————————————————————————◆ SocketIO
import socketio

# ◆—< Pack >—————————————————————————————————◆ Python
from pathlib import Path
import os


# ●—< Init >———————————————————————————————————————————————————————————————————● Configuration - Base
SYS_CONF = YamlConfig(file=os.path.join(Path(__file__).resolve().parent, 'config.yaml'))
SVR_LOCALLY = SYS_CONF.get('SERVER', 'locally', fallback=False)
SVR_DEBUG = SYS_CONF.get(section='SERVER', option='debug', fallback=False)

# ●—< Init >———————————————————————————————————————————————————————————————————● SocketIO - Initialization
sio = socketio.AsyncServer(
    async_mode='asgi',
    client_manager=socketio.AsyncRedisManager(
        f"redis://{'localhost' if SVR_LOCALLY else SYS_CONF.get('CACHE', 'host', fallback='localhost')}"
        f":{6379 if SVR_LOCALLY else SYS_CONF.get('CACHE', 'port', fallback=6379)}/0"
    ),
)