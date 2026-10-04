# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help.help_sys import HELP_HEARTBEAT_ONLINE

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Heartbeat - Online
class RespSysHeartbeatOnline(BaseModel):
    online: int = Field(..., **HELP_HEARTBEAT_ONLINE)
