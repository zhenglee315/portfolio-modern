"""Observe HTTP request lifecycles through the worker monitor owned by lifespan."""

import asyncio

from starlette.types import ASGIApp, Message, Receive, Scope, Send

MONITOR_SCOPE_KEY = "system.monitor.request"


class MonitorMiddleware:
    """Count FastAPI HTTP requests through final body/trailers, with cancellation cleanup.

    WebSocket, Socket.IO and post-response background work are separate workloads.
    Request-specific state stays inside __call__, never on the shared middleware.
    An outer wrapper with the FastAPI state observes generated 500 responses;
    its scope marker prevents an inner registration counting twice.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        state=None,
        exclude: tuple[str, ...] = (
            "/system/heartbeat",
            "/system/workers",
            "/health",
            "/healthz",
            "/ready",
            "/readyz",
            "/swagger",
            "/redoc",
            "/openapi",
        ),
    ):
        self.app = app
        self.state = state
        self.exclude = frozenset(exclude)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if MONITOR_SCOPE_KEY in scope:
            await self.app(scope, receive, send)
            return
        app = scope.get("app")
        monitor = getattr(self.state if self.state is not None else getattr(app, "state", None), "monitor", None)
        path = scope.get("path", "")
        if (
            scope["type"] != "http"
            or path in self.exclude
            or path == "/socket.io"
            or path.startswith("/socket.io/")
            or not monitor
            or not monitor.running
        ):
            await self.app(scope, receive, send)
            return
        token = monitor.begin_request(scope)
        scope[MONITOR_SCOPE_KEY] = token
        completed, trailers, status, disconnected = False, False, None, False

        async def monitored_receive() -> Message:
            nonlocal disconnected
            message = await receive()
            if message["type"] == "http.disconnect":
                disconnected = True
            return message

        async def monitored_send(message: Message) -> None:
            nonlocal completed, trailers, status, disconnected
            try:
                # Record completion only after the ASGI server accepts the final
                # message, not when the route merely returns a Response object.
                await send(message)
            except OSError:
                disconnected = True
                raise
            if message["type"] == "http.response.start":
                status = message["status"]
                trailers = message.get("trailers", False)
                monitor.response_started(token, status)
            final_body = message["type"] == "http.response.body" and not message.get("more_body", False)
            final_trailers = message["type"] == "http.response.trailers" and not message.get("more_trailers", False)
            if (final_body and not trailers) or final_trailers or message["type"] == "http.response.pathsend":
                monitor.end_request(token, failed=status is None or status >= 500, http_status=status)
                completed = True

        try:
            await self.app(scope, monitored_receive, monitored_send)
        except asyncio.CancelledError:
            if not completed:
                monitor.end_request(
                    token, failed=True, http_status=status, outcome="disconnected" if disconnected else "cancelled"
                )
                completed = True
            raise
        except OSError:
            if not completed:
                monitor.end_request(
                    token, failed=True, http_status=status, outcome="disconnected" if disconnected else "error"
                )
                completed = True
            raise
        finally:
            if not completed:
                monitor.end_request(
                    token, failed=True, http_status=status, outcome="disconnected" if disconnected else "error"
                )
            scope.pop(MONITOR_SCOPE_KEY, None)
