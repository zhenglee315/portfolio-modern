"""Authorized monitoring events, discovered through APPs/<project>/events*.py."""

from SYSTEM.extension import sio

import logging
import os

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from fastapi import HTTPException
from redis.exceptions import RedisError
from socketio.exceptions import ConnectionRefusedError as SocketConnectionRefusedError

LOGGER = logging.getLogger(__name__)
MONITOR_NAMESPACE = "/monitor"


class MonitorTestMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(default="monitor test", max_length=256, strict=True)


class MonitorSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topics: list[str] = Field(min_length=1, max_length=2)


async def authorize_monitor(environ):
    """Reuse current database-issued rights; monitoring itself stores no SQL rows."""
    from APPs.Auth.module import AuthSessionModule
    from SYSTEM.constants import EnumCache
    from SYSTEM.database import CONN_MANAGER
    from SYSTEM.settings import SEC_SESSION_CONF
    from SYSTEM.tools.tools_socketio import socketio_session_request

    redis = CONN_MANAGER.get_cache(key=EnumCache.SYS)
    request = await socketio_session_request(environ, redis, SEC_SESSION_CONF)
    async with CONN_MANAGER.get_db() as session:
        # Permission reads must not appear as application transaction activity.
        session.info["system.monitor.ignore"] = True
        account = await AuthSessionModule(
            request,
            session=session,
            redis=redis,
            manage_transaction=False,
        ).current_session()
    if account is None or account.get("is_manage_sites") is not True:
        return None
    return account["id"]


sio.monitor_authorize = authorize_monitor


@sio.event(namespace=MONITOR_NAMESPACE)
async def connect(sid, environ, auth=None):
    """The cookie selects identity; client auth fields never grant permissions."""
    stream = getattr(sio, "monitor_stream", None)
    if stream is None:
        raise SocketConnectionRefusedError("MONITOR_UNAVAILABLE", {"code": "MONITOR_UNAVAILABLE"})
    try:
        return await stream.connect(sid, environ)
    except (HTTPException, RedisError, TimeoutError, OSError, RuntimeError, ValueError, KeyError):
        raise SocketConnectionRefusedError("MONITOR_UNAVAILABLE", {"code": "MONITOR_UNAVAILABLE"}) from None


@sio.event(namespace=MONITOR_NAMESPACE)
async def disconnect(sid, reason=None):
    if stream := getattr(sio, "monitor_stream", None):
        await stream.disconnect(sid)
    LOGGER.debug("Monitor probe disconnected: %s (%s)", sid, reason)


async def _subscribe(sid, data, *, resync=False):
    try:
        value = MonitorSubscription.model_validate(data)
        stream = getattr(sio, "monitor_stream", None)
        if stream is None:
            return {"ok": False, "error": "MONITOR_UNAVAILABLE"}
        return await stream.subscribe(sid, value.topics, resync=resync)
    except ValidationError:
        return {"ok": False, "error": "INVALID_PAYLOAD"}
    except (HTTPException, RedisError, TimeoutError, OSError, RuntimeError):
        return {"ok": False, "error": "MONITOR_UNAVAILABLE"}


@sio.on("monitor_subscribe", namespace=MONITOR_NAMESPACE)
async def monitor_subscribe(sid, data=None):
    return await _subscribe(sid, data)


@sio.on("monitor_resync", namespace=MONITOR_NAMESPACE)
async def monitor_resync(sid, data=None):
    return await _subscribe(sid, data, resync=True)


@sio.on("monitor_unsubscribe", namespace=MONITOR_NAMESPACE)
async def monitor_unsubscribe(sid):
    if stream := getattr(sio, "monitor_stream", None):
        try:
            return await stream.unsubscribe(sid)
        except (RedisError, TimeoutError, OSError):
            return {"ok": False, "error": "MONITOR_UNAVAILABLE"}
    return {"ok": True}


@sio.on("monitor_test", namespace=MONITOR_NAMESPACE)
async def monitor_test(sid, data=None):
    """Reply only to this SID, as both a named event and an optional Socket.IO ACK."""
    try:
        message = MonitorTestMessage.model_validate({} if data is None else data).message
    except ValidationError:
        result = {"ok": False, "error": "INVALID_PAYLOAD"}
    else:
        result = {
            "ok": True,
            "message": message,
            "pid": os.getpid(),
            "sid": sid,
            "transport": sio.transport(sid, namespace=MONITOR_NAMESPACE),
        }
    await sio.emit("monitor_test_result", result, to=sid, namespace=MONITOR_NAMESPACE)
    return result
