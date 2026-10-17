"""Socket.IO construction, conventional event discovery and process-local cleanup."""

import asyncio
import importlib
from contextlib import suppress
from pathlib import Path

import socketio
from starsessions.serializers import JsonSerializer
from starsessions.session import SessionHandler
from starsessions.stores.redis import RedisStore
from starlette.requests import Request
from starlette.types import ASGIApp

from .monitor_stream import MonitorStream

__all__ = (
    "socketio_init_app",
    "socketio_include_events",
    "socketio_shutdown",
    "socketio_start_monitor",
    "socketio_session_request",
)


async def socketio_session_request(environ: dict, redis, config: dict):
    """Reload the HTTP-only session from SYS Redis for each socket permission check.

    Socket.IO sits outside FastAPI's middleware. A new read-only session handler
    avoids retaining a logged-out identity for the lifetime of a WebSocket. This
    path never saves a session, extends its TTL, rotates it, or writes a cookie.
    """
    scope = dict(environ.get("asgi.scope", {}))
    scope.update(type="http", method="GET")
    scope.pop("session", None)
    scope.pop("session_handler", None)
    request = Request(scope)
    handler = SessionHandler(
        request,
        request.cookies.get(config["cookie_name"]),
        RedisStore(connection=redis, prefix="sess:"),
        JsonSerializer(),
        config["lifetime"],
    )
    request.scope["session_handler"] = handler
    await handler.load()
    return request


async def socketio_start_monitor(server, monitor):
    """Bind runtime resources after event discovery and lifespan resource setup."""
    stream = MonitorStream(monitor, server, authorize=getattr(server, "monitor_authorize", None))
    server.monitor_stream = stream
    await stream.start()
    return stream


def socketio_init_app(
    app: ASGIApp,
    *,
    server: socketio.AsyncServer,
    dir_app: str | Path | None = None,
    socketio_path: str = "/socket.io",
) -> ASGIApp:
    """Discover conventional event modules, then wrap the existing FastAPI app.

    SYSTEM.extension owns the single server in each interpreter. Reusing it keeps
    decorators and the ASGI transport attached to exactly the same instance.
    """
    socketio_include_events(dir_app=dir_app)
    return socketio.ASGIApp(server, other_asgi_app=app, socketio_path=socketio_path)


def socketio_include_events(
    dir_app: str | Path | None = None,
    file_pattern: str = "events",
    *,
    project_root: str | Path | None = None,
) -> tuple[str, ...]:
    """Import APPs/<project>/events*.py once per interpreter using package names.

    Relative paths are resolved against the backend directory, independent of cwd.
    The optional project_root supports another importable application root. Errors
    propagate so startup cannot silently succeed with missing event handlers.
    Files must start with file_pattern; chat_events.py is not an events*.py match.
    """
    root = Path(project_root).resolve() if project_root is not None else Path(__file__).resolve().parents[2]
    base = Path(dir_app) if dir_app is not None else Path("APPs")
    base = (base if base.is_absolute() else root / base).resolve()
    if not base.is_dir():
        raise FileNotFoundError(f"Socket.IO event directory does not exist: {base}")
    base.relative_to(root)
    if not file_pattern.isidentifier():
        raise ValueError("Socket.IO file_pattern must be a Python identifier prefix.")
    names = []
    for path in sorted(base.rglob(f"{file_pattern}*.py")):
        parts = path.resolve().relative_to(root).with_suffix("").parts
        if not all(part.isidentifier() for part in parts):
            raise ValueError(f"Socket.IO event file must have an importable package name: {path}")
        name = ".".join(parts)
        importlib.import_module(name)
        names.append(name)
    return tuple(names)


async def socketio_shutdown(server: socketio.AsyncServer) -> None:
    """Stop Engine.IO tasks and release this server's separate Redis manager resources.

    The manager owns a lazy Pub/Sub connection outside CONN_MANAGER. Never close
    the manager's Redis socket before cancelling its listener, which can reconnect.
    """
    manager = server.manager
    try:
        try:
            if stream := getattr(server, "monitor_stream", None):
                await stream.stop()
                server.monitor_stream = None
        finally:
            await server.shutdown()
    finally:
        try:
            listener = getattr(manager, "thread", None)
            if listener is not None:
                listener.cancel()
                with suppress(asyncio.CancelledError):
                    await listener
        finally:
            try:
                if (pubsub := getattr(manager, "pubsub", None)) is not None:
                    await pubsub.aclose()
            finally:
                if (redis := getattr(manager, "redis", None)) is not None:
                    await redis.aclose()
