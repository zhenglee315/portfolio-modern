# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools import YamlConfig

# ◆—< Pack >—————————————————————————————————◆ Python
from pathlib import Path
import os


# ●—< Init >———————————————————————————————————————————————————————————————————● Configuration - Base
SYS_CONF = YamlConfig(file=os.path.join(Path(__file__).resolve().parent, 'config.yaml'))
SVR_LOCALLY = SYS_CONF.get('SERVER', 'locally', fallback=False)
SVR_DEBUG = SYS_CONF.get(section='SERVER', option='debug', fallback=False)