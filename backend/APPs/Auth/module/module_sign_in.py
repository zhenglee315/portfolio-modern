# ◆—< Pack >—————————————————————————————————◆ Project
from .module_base import (
    AuthModule,
    AUTH_CACHE_PREFIX,
    AUTH_SIGN_IN_LIMIT,
    AUTH_SIGN_IN_WINDOW,
    _dummy_account,
)

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import EnumSess
from SYSTEM.models import AuthRole, AuthUser, RecordLogin
from SYSTEM.tools.tools_net import net_client_ip
from SYSTEM.tools.tools_geoip import GeoIpReader

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import insert, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Request

# ◆—< Pack >—————————————————————————————————◆ Starlette
from starlette.concurrency import run_in_threadpool

# ◆—< Pack >—————————————————————————————————◆ StarSessions
from starsessions import get_session_handler

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.asyncio import Redis
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any


class AuthSignInModule(AuthModule):
    """
    Verify account credentials and populate the server-side authorization session.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(
        self,
        request: Request,
        email: str,
        password: str,
        *,
        session: AsyncSession | None = None,
        redis: Redis | None = None,
        manage_transaction: bool = True,
    ) -> None:
        """
        Prepare the sign-in credentials and optional storage dependencies.

        :param request: Current request with the server-side session middleware.
        :param email: Validated, exact login address.
        :param password: Submitted plaintext password, never persisted in SESSION.
        :param session: Optional asynchronous database session.
        :param redis: Optional asynchronous Redis client.
        :param manage_transaction: Whether the module owns database transaction cleanup.
        :return: None; sign_in() performs verification and session initialization.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(
            request,
            email,
            session=session,
            redis=redis,
            manage_transaction=manage_transaction,
        )
        self.password = password

    async def _limit_attempts(self) -> None:
        """
        Limit sign-in attempts by the actual request peer, without trusting forwarded headers.

        :return: None while the fixed one-minute request allowance remains available.
        :raises HTTPException: Attempts exceed the allowance or Redis is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        peer = self.request.client.host if self.request.client is not None else "unknown"
        key = f"{AUTH_CACHE_PREFIX}sign-in:{self._digest(peer)}"
        try:
            count, remaining = await self._cache().incr_with_expiry(key, AUTH_SIGN_IN_WINDOW)
        except RedisError:
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
        if count > AUTH_SIGN_IN_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="TOO_MANY_SIGN_IN_ATTEMPTS",
                headers={"Retry-After": str(max(1, remaining))},
            )

    async def sign_in(self) -> dict[str, Any]:
        """
        Authenticate an enabled account and role, initialize SESSION, and record the login.

        :return: Account ID, email, public user, role, and the assigned CRUD/management permissions.
        :raises HTTPException: Credentials are invalid, rate-limited, or storage is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        await self._limit_attempts()
        stmt = (
            select(AuthUser, AuthRole)
            .join(AuthRole, AuthRole.id == AuthUser.role_id)
            .where(AuthUser.email == self.email)
        )
        try:
            row = (await self.execute_orm(stmt)).one_or_none()
            account, role = row if row is not None else (None, None)
            credential_account = account if account is not None else await _dummy_account()
            matches = await credential_account.get_password(self.password)
            if account is None or not matches or not account.is_active or not role.is_active:
                raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
            response = self._account_response(account, role)
        except SQLAlchemyError:
            raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None
        await self._start_session(response, account.password)
        # Capture only the trusted ASGI client after successful authentication. GeoIP
        # failures retain the IP/status without blocking an otherwise valid sign-in.
        #                                                                                       ♂ ZhengLee 2026.10.15
        geoip = getattr(self.request.app.state, "geoip_reader", None) or GeoIpReader()
        location = await run_in_threadpool(geoip.lookup, net_client_ip(request=self.request))
        stmt = insert(RecordLogin).values(user_id=response[EnumSess.ID], **location.record_values())
        try:
            await self.execute_orm(stmt)
        except (SQLAlchemyError, RuntimeError, OSError):
            # An error response must not persist the authenticated identity prepared above.
            self.request.session.clear()
            get_session_handler(self.request).session_id = None
            raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None
        return response
