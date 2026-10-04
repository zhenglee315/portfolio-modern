# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Sys.schema.resp.resp_sys import RespSysHeartbeatOnline
from APPs.Sys.module.module_sys import sys_heartbeat_online

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.parser import parser_caching
from COMMON.decorator import cache

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import CacheExpiry
from SYSTEM.tools import FastApiRouter
from SYSTEM.urls import *

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends
from fastapi_utils.cbv import cbv

router = FastApiRouter(prefix=PreFix.SYS, tags=Tags.SYS)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Heartbeat
@cbv(router)
class SysHeartbeat:
    path = RouteSys.HEARTBEAT

    @router.get(
        path,
        summary="Query Current Online User Count",
        description=(
            "Retrieve the current estimated number of people online on this website.\n\n"
            "👥 **Purpose:**\n"
            "- Shows how many visitors are currently considered online based on recent website activity.\n"
            "- Provides a count for dashboards, status displays, and system monitoring.\n\n"
            "⏱️ **How It Works:**\n"
            "- Each HTTP request refreshes the visitor's heartbeat before this endpoint reads the count.\n"
            "- A heartbeat remains valid for 60 seconds after the visitor's latest request.\n"
            "- When reading a fresh result, the endpoint counts unexpired heartbeats and removes expired records.\n\n"
            "⚡ **Caching:**\n"
            "- Add `is_caching=true` to reuse a result for up to 30 seconds.\n"
            "- Without this flag, each request reads the current count.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "online": 3\n'
            "}\n"
            "```\n\n"
            "🔒 **Privacy:**\n"
            "- Returns only the total; no visitor identity or personal details are included.\n\n"
            "📝 **Notes:**\n"
            "- The count is an estimate. Visitors sharing a network or changing networks can affect it.\n"
            "- A cached result can be up to 30 seconds behind the latest heartbeat activity.\n"
            "- The count does not represent logged-in accounts or open browser tabs.\n"
            "---\n\n"
            "🌟 **Typical use cases:**\n"
            "- 📈 Website online count dashboard\n"
            "- 🏢 System activity monitoring\n"
            "- 🚦 Online status display\n"
            "\n"
            "> _Returns an estimated number of people online without exposing visitor details._"
        ),
        response_model=RespSysHeartbeatOnline,
    )
    @cache(expire=CacheExpiry.SEC_30)
    async def get_online(self, _=Depends(parser_caching)) -> dict[str, int]:
        """
        Return the current estimated online count from the system module.

        :param _: Parsed caching flag for this request.
        :return: Dictionary containing the estimated number of people online.
        """
        return await sys_heartbeat_online()
