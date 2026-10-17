# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.redis import RedisAsync
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import (
    EnumCache,
    EnumSess,
)
from SYSTEM.models import AuthRole, AuthUser
from SYSTEM.settings import SEC_SECRET_KEY

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Request

# ◆—< Pack >—————————————————————————————————◆ StarSessions
from starsessions import (
    get_session_handler,
    is_loaded,
    load_session,
    regenerate_session_id,
)

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.asyncio import Redis
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ AnyIO
from anyio import Lock

# ◆—< Pack >—————————————————————————————————◆ Python
from hashlib import sha256
from typing import Any
import hmac
import secrets

AUTH_CACHE_PREFIX = "auth:"

AUTH_CODE_TTL = 300

AUTH_TEMPORARY_CODE = "123"

AUTH_CODE_COOLDOWN = 60

AUTH_CODE_ATTEMPTS = 5

AUTH_SIGN_IN_LIMIT = 30

AUTH_SIGN_IN_WINDOW = 60

_DUMMY_ACCOUNT: AuthUser | None = None

_DUMMY_ACCOUNT_LOCK = Lock()


async def _dummy_account() -> AuthUser:
    """
    Prepare a process-local password hash for unknown login addresses.

    :return: Unpersisted account used only to perform the normal Argon2 verification.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    global _DUMMY_ACCOUNT
    if _DUMMY_ACCOUNT is None:
        # Publish only a fully hashed account; concurrent unknown logins share one initialization.
        async with _DUMMY_ACCOUNT_LOCK:
            if _DUMMY_ACCOUNT is None:
                account = AuthUser()
                await account.set_password(secrets.token_urlsafe(32))
                _DUMMY_ACCOUNT = account
    return _DUMMY_ACCOUNT


async def send_registration_email(email: str, code: str) -> None:
    """
    Define the SMTP delivery interface for a future configured mail provider.

    :param email: Exact login address receiving the verification message.
    :param code: Temporary verification code; never return or log it.
    :return: None after the configured provider accepts the message.
    :raises HTTPException: SMTP has not been connected to this delivery framework.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    raise HTTPException(status_code=503, detail="SMTP_NOT_CONFIGURED")


class AuthModule(SqlAlchemyExecAsync):
    """
    Share authentication storage, session rotation, and account serialization.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(
        self,
        request: Request,
        email: str,
        *,
        session: AsyncSession | None = None,
        redis: Redis | None = None,
        manage_transaction: bool = True,
    ) -> None:
        """
        Prepare the module without opening a database or Redis connection.

        :param request: Current request with the server-side session middleware.
        :param email: Validated login address; casing and content remain unchanged.
        :param session: Optional asynchronous session owned according to manage_transaction.
        :param redis: Optional asynchronous Redis client for isolated testing or delivery integration.
        :param manage_transaction: False leaves commit, rollback, and close to the injected session owner.
        :return: None; storage is used by the requested business operation.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(session=session, manage_transaction=manage_transaction)
        self.request = request
        self.email = email
        self._redis = redis
        self._redis_cache: RedisAsync | None = None

    def _cache(self) -> RedisAsync:
        """
        Resolve the shared Redis tool without taking ownership of its connection pool.

        :return: RedisAsync using the injected or configured System cache client.
        :raises HTTPException: The cache registry is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if self._redis_cache is None:
            try:
                self._redis_cache = RedisAsync(key=EnumCache.SYS, redis=self._redis)
            except (KeyError, RuntimeError):
                raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
        return self._redis_cache

    @staticmethod
    def _digest(value: str) -> str:
        """
        Produce a keyed digest for verification values and cache key identifiers.

        :param value: Server-generated verification input or an exact email/IP identifier.
        :return: SHA-256 HMAC encoded as hexadecimal, without the original input.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return hmac.new(SEC_SECRET_KEY.encode("utf-8"), value.encode("utf-8"), sha256).hexdigest()

    @staticmethod
    def _account_response(account: AuthUser, role: AuthRole) -> dict[str, Any]:
        """
        Select the account identity and assigned role permissions for responses and SESSION.

        :param account: Account selected or created in the current database transaction.
        :param role: Explicitly selected assigned role, without lazy relationship access.
        :return: JSON-compatible public identity and permission values; no password data.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return {
            EnumSess.ID: account.id,
            EnumSess.EMAIL: account.email,
            EnumSess.USER: account.user,
            EnumSess.ROLE: role.role,
            EnumSess.IS_CREATE: role.is_create,
            EnumSess.IS_READ: role.is_read,
            EnumSess.IS_UPDATE: role.is_update,
            EnumSess.IS_DELETE: role.is_delete,
            EnumSess.IS_MANAGE_ROLES: role.is_manage_roles,
            EnumSess.IS_MANAGE_USERS: role.is_manage_users,
            EnumSess.IS_MANAGE_SITES: role.is_manage_sites,
        }

    async def _load_session(self) -> None:
        """
        Load the request session if middleware has not already initialized it.

        :return: None when the server-side session is ready.
        :raises HTTPException: Session storage or middleware is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        try:
            if not is_loaded(self.request):
                await load_session(self.request)
        except (RedisError, KeyError):
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None

    async def _destroy_session(self) -> None:
        """
        Remove the current stored session through the configured middleware handler.

        :return: None after storage removal; the caller controls identity clearing and SID replacement.
        :raises HTTPException: The stored session cannot be removed from Redis.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        try:
            await get_session_handler(self.request).destroy()
        except RedisError:
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None

    @staticmethod
    def session_identity(account_id: int, password_hash: str) -> str:
        """Bind a server session to this account generation without exposing its password hash.

        A fresh registration has a fresh Argon2 salt, even when ID/email are reused.
        Password replacement also revokes old sessions. Only the keyed digest stays in SESSION.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        return AuthModule._digest(f"session-identity:{account_id}:{password_hash}")

    async def _start_session(self, account: dict[str, Any], password_hash: str) -> None:
        """
        Invalidate the previous server-side session and issue a new authenticated session.

        :param account: Public account identity and assigned role permissions.
        :param password_hash: Server-selected salted hash; used only for the private SESSION identity digest.
        :return: None; middleware persists the replacement session and cookie.
        :raises HTTPException: The previous session cannot be removed from storage.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        await self._destroy_session()
        self.request.session.clear()
        regenerate_session_id(self.request)
        self.request.session.update(account)
        self.request.session[EnumSess.AUTH_IDENTITY] = self.session_identity(account[EnumSess.ID], password_hash)

    async def _email_exists(self) -> bool:
        """
        Check email reservations across both active and soft-deleted accounts.

        :return: Whether any account already owns the exact login email.
        :raises HTTPException: The account database cannot be queried.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        stmt = select(AuthUser.id).where(AuthUser.email == self.email)
        try:
            return (await self.execute_orm(stmt)).scalar_one_or_none() is not None
        except SQLAlchemyError:
            raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None

    @staticmethod
    def _unique_conflict(error: IntegrityError, constraint: str, column: str) -> bool:
        """
        Identify one named uniqueness violation without treating other integrity failures as conflicts.

        :param error: SQLAlchemy exception raised by insertion or commit.
        :param constraint: PostgreSQL uniqueness constraint name.
        :param column: SQLite table-qualified column name used by isolated tests.
        :return: Whether the original database error identifies the selected unique key.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        for source in (error.orig, getattr(error.orig, "__cause__", None)):
            if getattr(source, "constraint_name", None) == constraint:
                return True
            if getattr(getattr(source, "diag", None), "constraint_name", None) == constraint:
                return True
        return f"UNIQUE constraint failed: {column}" in str(error.orig)

    @staticmethod
    def _email_conflict(error: IntegrityError) -> bool:
        """
        Identify the existing account email reservation.

        :param error: SQLAlchemy integrity exception.
        :return: Whether the email unique key rejected the operation.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return AuthModule._unique_conflict(error, "uq_auth_user_email", "auth_user.email")
