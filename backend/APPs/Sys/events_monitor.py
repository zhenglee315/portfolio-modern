# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.module import AuthSessionModule

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.tools.tools_socketio import socketio_session_request
from SYSTEM.events import EventMonitor, NameSpace
from SYSTEM.constants import EnumCache, EnumSess
from SYSTEM.settings import SEC_SESSION_CONF
from SYSTEM.database import CONN_MANAGER
from SYSTEM.extension import sio

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Socket.IO
from socketio.exceptions import ConnectionRefusedError as SocketConnectionRefusedError

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, ConfigDict, Field, ValidationError

# ◆—< Pack >—————————————————————————————————◆ Python
import logging
import os

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Monitor - Logging
LOGGER = logging.getLogger(__name__)


# ■—< SCHEMA >————————————————————————————————————————————————————————————————————————■ Monitor - Test Message
class MonitorTestMessage(BaseModel):
    """
    Validate the optional message accepted by the monitoring connection probe.

    Only the message field is accepted; unknown fields are rejected before any
    response is constructed. An omitted message uses the default probe text.

    :param message: Strict string of at most 256 characters; empty strings are allowed.
    :raises ValidationError: The message type, length, or supplied field names are invalid.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    model_config = ConfigDict(extra="forbid")

    message: str = Field(default="monitor test", max_length=256, strict=True)


# ■—< SCHEMA >————————————————————————————————————————————————————————————————————————■ Monitor - Subscription
class MonitorSubscription(BaseModel):
    """
    Validate the common payload for subscription and resynchronization requests.

    This schema checks the object shape and topic count. MonitorStream checks
    topic uniqueness and its supported workers/requests allowlist separately.

    :param topics: One or two topic names identifying the requested monitoring views.
    :raises ValidationError: Topics are missing, have an invalid type/count, or extra fields are supplied.

                                                                                               ♂ ZhengLee 2026.10.18
    """

    model_config = ConfigDict(extra="forbid")
    topics: list[str] = Field(min_length=1, max_length=2)


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Monitor - Authorization
async def authorize_monitor(environ):
    """
    Resolve the current server-side identity and database-issued monitoring permission.

    Socket.IO operates outside the HTTP session middleware, so each check reloads
    the cookie-selected SESSION from SYS Redis. The lookup does not persist SESSION
    changes, refresh its TTL, or issue a cookie. AuthSessionModule verifies the
    account generation and reloads the enabled account/role before checking access.

    :param environ: Socket.IO connection environment containing the ASGI scope and cookie headers.
    :return: Authorized account ID, or None for a guest, invalid identity, or missing site-management permission.
    :raises HTTPException: Authentication session or account lookup is unavailable.
    :raises RedisError: Reloading the server-side session from Redis fails.
    :raises KeyError: The SYS cache connection has not been initialized.
    :raises RuntimeError: The database connection manager has not been initialized.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    # -< Auth >-----------------------------------● Reload Server Session
    redis = CONN_MANAGER.get_cache(key=EnumCache.SYS)
    request = await socketio_session_request(environ, redis, SEC_SESSION_CONF)
    # -< Auth >-----------------------------------● Read Current Account / Role
    async with SqlAlchemyExecAsync(session=CONN_MANAGER.get_db()).transaction() as db:
        # Permission reads must not appear as application transaction activity.
        db.session.info["system.monitor.ignore"] = True
        # The outer transaction owns commit/rollback/close; the module borrows its SQL and Redis resources.
        account = await AuthSessionModule(
            request,
            session=db.session,
            redis=redis,
            manage_transaction=False,
        ).current_session()
    # -< Auth >-----------------------------------● Require Explicit Database Permission
    if account is None or account.get(EnumSess.IS_MANAGE_SITES) is not True:
        return None
    return account[EnumSess.ID]


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Monitor - Authorization Binding
# Event discovery binds the callback before lifespan constructs MonitorStream.
# The stream invokes it during connect, subscription, and background permission checks.
sio.monitor_authorize = authorize_monitor


# ■—< EVENT >—————————————————————————————————————————————————————————————————————————■ Monitor - Connect
@sio.event(namespace=NameSpace.MONITOR)
async def connect(sid, environ, auth=None):
    """
    Authorize a connection to the monitoring namespace and register its local state.

    Socket.IO derives the built-in connect event name from this function name.
    The server SESSION selects the identity; the optional client auth object is
    ignored. Topic rooms are joined only after a separate subscription request.

    :param sid: Connection identifier assigned by Socket.IO within the monitoring namespace.
    :param environ: Connection environment used to reload the server-side session and current permissions.
    :param auth: Optional client-supplied authentication payload; never used to grant access.
    :return: True when accepted, or False when identity is denied or stream connection capacity is reached.
    :raises SocketConnectionRefusedError: The stream is absent or authorization/storage checks fail.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    # -< Connect >--------------------------------● Require an Initialized Stream
    stream = getattr(sio, "monitor_stream", None)
    if stream is None:
        raise SocketConnectionRefusedError("MONITOR_UNAVAILABLE", {"code": "MONITOR_UNAVAILABLE"})
    try:
        return await stream.connect(sid, environ)
    except (
        HTTPException,
        RedisError,
        TimeoutError,
        OSError,
        RuntimeError,
        ValueError,
        KeyError,
    ):
        # Storage/configuration errors reject the handshake without exposing internal exception details.
        raise SocketConnectionRefusedError("MONITOR_UNAVAILABLE", {"code": "MONITOR_UNAVAILABLE"}) from None


# ■—< EVENT >—————————————————————————————————————————————————————————————————————————■ Monitor - Disconnect
@sio.event(namespace=NameSpace.MONITOR)
async def disconnect(sid, reason=None):
    """
    Remove the disconnected client's local monitoring state and record a debug message.

    Socket.IO manages namespace room cleanup. MonitorStream removes its own
    connection record; the publisher refreshes topic presence on subsequent cycles.

    :param sid: Identifier of the connection leaving the monitoring namespace.
    :param reason: Optional Socket.IO disconnect reason, used only for debug logging.
    :return: None; cleanup is also safe when the stream has already been removed.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    if stream := getattr(sio, "monitor_stream", None):
        await stream.disconnect(sid)
    LOGGER.debug("Monitor probe disconnected: %s (%s)", sid, reason)


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Monitor - Subscription Dispatch
async def _subscribe(sid, data, *, resync=False):
    """
    Validate a topic request and delegate authorization, room updates, and snapshots.

    MonitorStream validates supported topics and current identity before joining
    rooms. Subscription and resynchronization requests share this validation/error
    contract and remain subject to the stream's existing update cadence.

    :param sid: Monitoring connection requesting a topic subscription or refresh.
    :param data: Payload containing only topics, such as {"topics": ["workers", "requests"]}.
    :param resync: Whether this is a client resynchronization request; forwarded to MonitorStream.
    :return: ACK dictionary with ok/topics, or an INVALID_PAYLOAD, AUTH_REQUIRED,
             PERMISSION_DENIED, or MONITOR_UNAVAILABLE error.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    try:
        # -< Subscribe >--------------------------● Validate Payload / Resolve Stream
        value = MonitorSubscription.model_validate(data)
        stream = getattr(sio, "monitor_stream", None)
        if stream is None:
            return {"ok": False, "error": "MONITOR_UNAVAILABLE"}
        # MonitorStream owns allowlist checks, permission rechecks, rooms, and targeted snapshot delivery.
        return await stream.subscribe(sid, value.topics, resync=resync)
    except ValidationError:
        # Return a stable public error without echoing rejected client values or validation details.
        return {"ok": False, "error": "INVALID_PAYLOAD"}
    except (HTTPException, RedisError, TimeoutError, OSError, RuntimeError):
        return {"ok": False, "error": "MONITOR_UNAVAILABLE"}


# ■—< EVENT >—————————————————————————————————————————————————————————————————————————■ Monitor - Subscribe
@sio.on(EventMonitor.SUBSCRIBE, namespace=NameSpace.MONITOR)
async def monitor_subscribe(sid, data=None):
    """
    Apply the client's requested monitoring topics through the shared subscription flow.

    The stream delivers permitted initial snapshots through EventMonitor.SNAPSHOT.
    Returning the result also supplies an ACK when the client requested one.

    :param sid: Connection subscribing within NameSpace.MONITOR.
    :param data: Required topics payload; missing or malformed data returns INVALID_PAYLOAD.
    :return: Subscription ACK containing the accepted topics or a stable error code.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    return await _subscribe(sid, data)


# ■—< EVENT >—————————————————————————————————————————————————————————————————————————■ Monitor - Resynchronize
@sio.on(EventMonitor.RESYNC, namespace=NameSpace.MONITOR)
async def monitor_resync(sid, data=None):
    """
    Forward an explicit client resynchronization request through the subscription flow.

    Topics and permissions are checked again. Snapshot delivery follows the stream's
    subscription cadence, so repeated requests within that interval may be coalesced.

    :param sid: Connection requesting current monitoring data.
    :param data: Required topics payload, using the same schema as EventMonitor.SUBSCRIBE.
    :return: Subscription ACK containing the accepted topics or a stable error code.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    return await _subscribe(sid, data, resync=True)


# ■—< EVENT >—————————————————————————————————————————————————————————————————————————■ Monitor - Unsubscribe
@sio.on(EventMonitor.UNSUBSCRIBE, namespace=NameSpace.MONITOR)
async def monitor_unsubscribe(sid):
    """
    Leave all monitoring topic rooms while keeping the namespace connection open.

    The stream clears this connection's topic selection and updates worker presence
    in Redis. Repeated requests, unknown connections, and an absent stream succeed.

    :param sid: Connection whose monitoring subscriptions should be removed.
    :return: {"ok": True}, or MONITOR_UNAVAILABLE when room/presence cleanup fails.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    if stream := getattr(sio, "monitor_stream", None):
        try:
            return await stream.unsubscribe(sid)
        except (RedisError, TimeoutError, OSError):
            return {"ok": False, "error": "MONITOR_UNAVAILABLE"}
    return {"ok": True}


# ■—< EVENT >—————————————————————————————————————————————————————————————————————————■ Monitor - Connection Probe
@sio.on(EventMonitor.TEST, namespace=NameSpace.MONITOR)
async def monitor_test(sid, data=None):
    """
    Return a connection probe to its requesting SID through an event and optional ACK.

    Accepted replies include the message, serving process ID, namespace SID, and
    transport. Invalid payloads return only a stable error. This probe uses the
    namespace's accepted connection and does not perform a separate permission lookup.

    :param sid: Requesting connection; the named reply is addressed only to this SID.
    :param data: Optional message payload; None uses the schema's default probe message.
    :return: The same result sent through EventMonitor.TEST_RESULT, also used for a requested ACK.

                                                                                               ♂ ZhengLee 2026.10.18
    """
    # -< Probe >----------------------------------● Validate Only the Supported Message Field
    try:
        message = MonitorTestMessage.model_validate({} if data is None else data).message
    except ValidationError:
        result = {"ok": False, "error": "INVALID_PAYLOAD"}
    else:
        # -< Probe >------------------------------● Identify the Serving Worker / Connection
        result = {
            "ok": True,
            "message": message,
            "pid": os.getpid(),
            "sid": sid,
            "transport": sio.transport(sid, namespace=NameSpace.MONITOR),
        }
    # -< Probe >----------------------------------● Send a SID-Targeted Event / Return ACK Data
    await sio.emit(EventMonitor.TEST_RESULT, result, to=sid, namespace=NameSpace.MONITOR)
    return result
