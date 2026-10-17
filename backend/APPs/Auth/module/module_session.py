# ◆—< Pack >—————————————————————————————————◆ Project
from .module_base import AuthModule

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import (
    AUTH_PERMISSION_FIELDS,
    EnumSess,
)
from SYSTEM.models import AuthRole, AuthUser

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Request

# ◆—< Pack >—————————————————————————————————◆ StarSessions
from starsessions import get_session_handler

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.asyncio import Redis

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any
import hmac


class AuthSessionModule(AuthModule):
    """
    Restore the current account from its server-side SESSION and current database permissions.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(
        self,
        request: Request,
        *,
        session: AsyncSession | None = None,
        redis: Redis | None = None,
        manage_transaction: bool = True,
    ) -> None:
        """
        Prepare a read-only account lookup without accepting a client-supplied identity.

        :param request: Current request carrying its server-side authentication SESSION.
        :param session: Optional asynchronous database session.
        :param redis: Optional asynchronous System cache client.
        :param manage_transaction: Whether the module owns database transaction cleanup.
        :return: None; current_session() checks the stored account ID.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(
            request,
            "",
            session=session,
            redis=redis,
            manage_transaction=manage_transaction,
        )

    def _clear_identity(self) -> None:
        """
        Remove authentication fields while preserving unrelated registration session data.

        :return: None; session middleware persists the removal or expires an empty session.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        for field in (
            EnumSess.ID,
            EnumSess.EMAIL,
            EnumSess.USER,
            EnumSess.ROLE,
            EnumSess.PASSWORD,
            EnumSess.AUTH_IDENTITY,
            *AUTH_PERMISSION_FIELDS,
        ):
            self.request.session.pop(field, None)

    async def current_session(self) -> dict[str, Any] | None:
        """
        Return the enabled account/role for the bound SESSION generation, or None for guests.

        The database supplies email and permission values. Invalid or disabled
        identities are removed without rotating the session on ordinary reads.

        :return: Current public account identity and permissions, or None when unauthenticated.
        :raises HTTPException: Session storage or the account database is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        account_id = self.request.session.get(EnumSess.ID)
        identity = self.request.session.get(EnumSess.AUTH_IDENTITY)
        if (
            type(account_id) is not int
            or not 1 <= account_id <= 2_147_483_647
            or not isinstance(identity, str)
            or len(identity) != 64
            or any(character not in "0123456789abcdef" for character in identity)
        ):
            self._clear_identity()
            return None
        stmt = (
            select(AuthUser, AuthRole)
            .join(AuthRole, AuthRole.id == AuthUser.role_id)
            .where(
                AuthUser.id == account_id,
                AuthUser.is_active.is_(True),
                AuthRole.is_active.is_(True),
            )
        )
        try:
            row = (await self.execute_orm(stmt)).one_or_none()
            response = (
                self._account_response(*row)
                if row is not None and hmac.compare_digest(identity, self.session_identity(row[0].id, row[0].password))
                else None
            )
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None
        if response is None:
            self._clear_identity()
            return None
        self.request.session.pop(EnumSess.PASSWORD, None)
        self.request.session.update(response)
        return response


class AuthSignOutModule(AuthModule):
    """
    Destroy the current server-side SESSION and clear all of its stored fields.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(self, request: Request) -> None:
        """
        Prepare session invalidation without requiring credentials or a database query.

        :param request: Current request carrying the server-side session cookie.
        :return: None; sign_out() removes the session through its configured store.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(request, "")

    async def sign_out(self) -> dict[str, bool]:
        """
        Remove the stored session before clearing its identity and registration data.

        :return: Successful sign-out state, including requests that are already guests.
        :raises HTTPException: The session cannot be loaded or removed from storage.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        handler = get_session_handler(self.request)
        await self._destroy_session()

        self.request.session.clear()
        if handler.session_id:
            # Expire an incoming cookie even when its stored session was already absent.
            handler.initially_empty = False
        # The store was removed above; middleware only needs to expire the cookie now.
        handler.session_id = None
        return {"signed_out": True}
