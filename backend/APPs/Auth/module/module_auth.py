# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.schema_user import public_user_candidate, validate_public_user
from COMMON.tools.storage.redis import RedisAsync, RedisUpdate, RedisValue
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import (
    AUTH_PERMISSION_FIELDS,
    EnumCache,
    EnumDBType,
    AUTH_MANAGEMENT_WRITE_LOCK_KEY,
    AUTH_SESSION_IDENTITY_KEY,
)
from SYSTEM.models import AuthRole, AuthUser, RecordLogin, AUTH_ROLE_PERMISSION_COLUMNS
from SYSTEM.settings import SEC_SECRET_KEY
from SYSTEM.tools.tools_net import net_client_ip
from SYSTEM.tools.tools_geoip import GeoIpReader

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import insert, literal, select, update, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

# ◆—< Pack >—————————————————————————————————◆ Session
from starsessions import get_session_handler, is_loaded, load_session, regenerate_session_id

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.asyncio import Redis
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ AnyIO
from anyio import CancelScope, Lock

# ◆—< Pack >—————————————————————————————————◆ Python
from collections.abc import Awaitable, Callable
from hashlib import sha256
from typing import Any
import hmac
import json
import re
import secrets

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Auth
AUTH_CACHE_PREFIX = "auth:"
AUTH_CODE_TTL = 300
AUTH_TEMPORARY_CODE = "123"
AUTH_CODE_COOLDOWN = 60
AUTH_CODE_ATTEMPTS = 5
AUTH_SIGN_IN_LIMIT = 30
AUTH_SIGN_IN_WINDOW = 60
_DUMMY_ACCOUNT: AuthUser | None = None
_DUMMY_ACCOUNT_LOCK = Lock()
_REGISTRATION_SESSION_KEY = "auth_registration"


# ■—< SECURITY >——————————————————————————————————————————————————————————————————————■ Auth - Password Timing
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


# ■—< SMTP >——————————————————————————————————————————————————————————————————————————■ Auth - Registration Delivery
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


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Auth - Shared Module
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
            "id": account.id,
            "email": account.email,
            "user": account.user,
            "role": role.role,
            "is_create": role.is_create,
            "is_read": role.is_read,
            "is_update": role.is_update,
            "is_delete": role.is_delete,
            "is_manage_roles": role.is_manage_roles,
            "is_manage_users": role.is_manage_users,
            "is_manage_sites": role.is_manage_sites,
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
        self.request.session[AUTH_SESSION_IDENTITY_KEY] = self.session_identity(account["id"], password_hash)

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


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Auth - Session
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
        super().__init__(request, "", session=session, redis=redis, manage_transaction=manage_transaction)

    def _clear_identity(self) -> None:
        """
        Remove authentication fields while preserving unrelated registration session data.

        :return: None; session middleware persists the removal or expires an empty session.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        for field in ("id", "email", "user", "role", "password", AUTH_SESSION_IDENTITY_KEY, *AUTH_PERMISSION_FIELDS):
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
        account_id = self.request.session.get("id")
        identity = self.request.session.get(AUTH_SESSION_IDENTITY_KEY)
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
            .where(AuthUser.id == account_id, AuthUser.is_active.is_(True), AuthRole.is_active.is_(True))
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
        self.request.session.pop("password", None)
        self.request.session.update(response)
        return response


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Auth - Sign In
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
        super().__init__(request, email, session=session, redis=redis, manage_transaction=manage_transaction)
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
        stmt = insert(RecordLogin).values(user_id=response["id"], **location.record_values())
        try:
            await self.execute_orm(stmt)
        except (SQLAlchemyError, RuntimeError, OSError):
            # An error response must not persist the authenticated identity prepared above.
            self.request.session.clear()
            get_session_handler(self.request).session_id = None
            raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None
        return response


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Auth - Sign Out
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


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Auth - Register
class AuthRegisterModule(AuthModule):
    """
    Check email availability, verify temporary codes, and register with the default role.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(
        self,
        request: Request,
        email: str,
        password: str | None = None,
        code: str | None = None,
        *,
        user: str | None = None,
        session: AsyncSession | None = None,
        redis: Redis | None = None,
        sender: Callable[[str, str], Awaitable[None]] | None = None,
        manage_transaction: bool = True,
    ) -> None:
        """
        Prepare a registration operation with replaceable storage and a future SMTP delivery hook.

        :param request: Current request carrying the registration challenge in SESSION.
        :param email: Validated, exact login address.
        :param password: Registration password when creating the account.
        :param code: Temporary three-digit verification code when verifying the registration email.
        :param user: Optional public identifier; omitted values are allocated from the email prefix.
        :param session: Optional asynchronous database session.
        :param redis: Optional asynchronous Redis client.
        :param sender: Reserved SMTP function; temporary fixed-code mode does not call it.
        :param manage_transaction: False leaves database submission to the injected session owner.
        :return: None; the selected operation uses these validated parameters.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(request, email, session=session, redis=redis, manage_transaction=manage_transaction)
        self.password = password
        self.code = code
        self.user = user
        self.sender = sender if sender is not None else send_registration_email

    @staticmethod
    def _challenge_key(challenge_id: str) -> str:
        """
        Build the server-generated registration challenge key.

        :param challenge_id: Random hexadecimal challenge identifier stored in SESSION.
        :return: Redis key under the authentication prefix.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return f"{AUTH_CACHE_PREFIX}registration:{challenge_id}"

    def _verification_key(self) -> str:
        """
        Build the raw System-cache verification key requested by the registration flow.

        :return: Redis key verify_<email>, preserving the exact account email.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return f"verify_{self.email}"

    def _current_challenge_key(self) -> str:
        """
        Identify the latest challenge allowed to use this email's cached code.

        :return: Ownership key preventing superseded sessions from registering.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return f"{AUTH_CACHE_PREFIX}registration:current:{self._digest(self.email)}"

    def _challenge_keys(self, challenge_id: str) -> tuple[str, str, str]:
        """
        List every key whose state determines verification and registration ownership.

        :param challenge_id: Server-generated registration challenge identifier.
        :return: Challenge proof, raw email code, and latest-owner keys.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return self._challenge_key(challenge_id), self._verification_key(), self._current_challenge_key()

    @staticmethod
    def _read_challenge(raw: Any) -> dict[str, Any] | None:
        """
        Decode an existing JSON proof without applying pickle deserialization.

        :param raw: Raw bytes or string returned by the Redis tool.
        :return: Challenge fields, or None when the proof is missing or malformed.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        try:
            proof = json.loads(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None
        return proof if isinstance(proof, dict) else None

    def _matching_challenge(self, values: dict[str, Any], challenge_id: str) -> dict[str, Any] | None:
        """
        Check the raw proof, code presence, and current owner against this session.

        :param values: Snapshot of all keys returned by the Redis tool.
        :param challenge_id: Registration identifier stored in the current HTTP session.
        :return: Matching challenge fields, or None for an expired or superseded proof.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        challenge_key, code_key, current_key = self._challenge_keys(challenge_id)
        proof = self._read_challenge(values[challenge_key])
        if (
            proof is None
            or values[code_key] is None
            or values[current_key] not in (challenge_id, challenge_id.encode("ascii"))
            or proof.get("email") != self.email
            or proof.get("challenge_id") != challenge_id
        ):
            return None
        return proof

    def _challenge_id(self) -> str:
        """
        Retrieve only the current session's challenge for the exact requested email.

        :return: Valid server-generated challenge identifier.
        :raises HTTPException: SESSION has no corresponding email verification challenge.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        challenge = self.request.session.get(_REGISTRATION_SESSION_KEY)
        if not isinstance(challenge, dict) or challenge.get("email") != self.email:
            raise HTTPException(status_code=400, detail="EMAIL_VERIFICATION_REQUIRED")
        challenge_id = challenge.get("challenge_id")
        if not isinstance(challenge_id, str) or re.fullmatch(r"[a-f0-9]{32}", challenge_id) is None:
            raise HTTPException(status_code=400, detail="EMAIL_VERIFICATION_REQUIRED")
        return challenge_id

    async def _verified_challenge(self, challenge_id: str) -> None:
        """
        Check the verified session-bound proof before creating a registration claim.

        :param challenge_id: Current session's random registration identifier.
        :return: None when the proof is verified, unexpired, and unclaimed.
        :raises HTTPException: The proof cannot be used or Redis is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        keys = self._challenge_keys(challenge_id)
        try:
            values = await self._cache().mget(keys, deserialize=False)
        except RedisError:
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
        proof = self._matching_challenge(dict(zip(keys, values, strict=True)), challenge_id)
        if proof is None or proof.get("verified") is not True or proof.get("claim_id"):
            raise HTTPException(status_code=400, detail="EMAIL_VERIFICATION_REQUIRED")

    async def email_available(self) -> dict[str, Any]:
        """
        Report whether active or inactive accounts already reserve the email.

        :return: Exact email and an availability boolean.
        :raises HTTPException: The account database is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        return {"email": self.email, "available": not await self._email_exists()}

    async def _cleanup_code(self, challenge_id: str, cooldown_key: str) -> None:
        """
        Remove only this delivery's keys after a failed cache operation.

        :param challenge_id: Identifier generated for the failed delivery.
        :param cooldown_key: This email's resend cooldown key.
        :return: None; newer deliveries retain their code, owner, and cooldown.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        challenge_key, code_key, current_key = self._challenge_keys(challenge_id)
        keys = (challenge_key, cooldown_key, code_key, current_key)

        def cleanup(values: dict[str, Any]) -> RedisUpdate:
            deletes = [challenge_key]
            owner = (challenge_id, challenge_id.encode("ascii"))
            if values[cooldown_key] in owner:
                deletes.append(cooldown_key)
            if values[current_key] in owner:
                deletes.extend((code_key, current_key))
            return RedisUpdate(deletes=tuple(deletes))

        with CancelScope(shield=True):
            try:
                await self._cache().transaction(keys, cleanup, serialize=False, deserialize=False)
            except (RedisError, HTTPException):
                pass

    async def send_code(self) -> dict[str, int]:
        """
        Store the temporary fixed code and session proof in one System-cache transaction.

        :return: Code validity and resend delay in seconds; the code itself is never returned.
        :raises HTTPException: Email is reserved, resend is rate-limited, or storage is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        if await self._email_exists():
            raise HTTPException(status_code=409, detail="EMAIL_ALREADY_EXISTS")
        challenge_id = secrets.token_hex(16)
        challenge_key, code_key, current_key = self._challenge_keys(challenge_id)
        cooldown_key = f"{AUTH_CACHE_PREFIX}registration:cooldown:{self._digest(self.email)}"
        keys = (challenge_key, code_key, current_key, cooldown_key)
        challenge = {
            "email": self.email,
            "challenge_id": challenge_id,
            "attempts": 0,
            "verified": False,
        }

        def issue(values: dict[str, Any]) -> RedisUpdate:
            if values[cooldown_key] is not None:
                return RedisUpdate(result=False)
            return RedisUpdate(
                result=True,
                writes={
                    challenge_key: RedisValue(json.dumps(challenge), ex=AUTH_CODE_TTL),
                    code_key: RedisValue(AUTH_TEMPORARY_CODE, ex=AUTH_CODE_TTL),
                    current_key: RedisValue(challenge_id, ex=AUTH_CODE_TTL),
                    cooldown_key: RedisValue(challenge_id, ex=AUTH_CODE_COOLDOWN),
                },
            )

        cache = self._cache()
        try:
            reserved = await cache.transaction(keys, issue, serialize=False, deserialize=False)
            if not reserved:
                remaining = await cache.ttl(cooldown_key)
                raise HTTPException(
                    status_code=429,
                    detail="CODE_REQUEST_TOO_FREQUENT",
                    headers={"Retry-After": str(max(1, remaining))},
                )
        except RedisError:
            await self._cleanup_code(challenge_id, cooldown_key)
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
        self.request.session[_REGISTRATION_SESSION_KEY] = {"email": self.email, "challenge_id": challenge_id}
        return {"expires_in": AUTH_CODE_TTL, "retry_after": AUTH_CODE_COOLDOWN}

    async def verify_email(self) -> dict[str, Any]:
        """
        Check the raw System-cache code and atomically confirm its session-bound proof.

        :return: Exact email and successful verification state.
        :raises HTTPException: The code is wrong, expired, claimed, superseded, or storage is unavailable.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        challenge_id = self._challenge_id()
        if not isinstance(self.code, str) or re.fullmatch(r"[0-9]{3}", self.code) is None:
            raise HTTPException(status_code=400, detail="INVALID_VERIFICATION_CODE")
        keys = self._challenge_keys(challenge_id)
        challenge_key, code_key, _ = keys

        def verify(values: dict[str, Any]) -> RedisUpdate:
            proof = self._matching_challenge(values, challenge_id)
            if proof is None or proof.get("claim_id"):
                return RedisUpdate(result=0)
            matches = values[code_key] in (self.code, self.code.encode("ascii"))
            if proof.get("verified") is True:
                return RedisUpdate(result=1 if matches else 0)
            attempts = proof.get("attempts")
            if type(attempts) is not int or attempts < 0:
                return RedisUpdate(result=0)
            if not matches:
                proof["attempts"] = attempts + 1
                if proof["attempts"] >= AUTH_CODE_ATTEMPTS:
                    return RedisUpdate(result=-1, deletes=keys)
            else:
                proof["verified"] = True
            return RedisUpdate(
                result=1 if matches else -1,
                writes={challenge_key: RedisValue(json.dumps(proof), keepttl=True)},
            )

        try:
            verified = await self._cache().transaction(keys, verify, serialize=False, deserialize=False)
        except RedisError:
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
        if verified != 1:
            raise HTTPException(status_code=400, detail="INVALID_VERIFICATION_CODE")
        return {"email": self.email, "verified": True}

    async def _claim_challenge(self, challenge_id: str, claim_id: str) -> bool:
        """
        Reserve a verified proof for exactly one account-creation attempt.

        :param challenge_id: Verified registration identifier stored in SESSION.
        :param claim_id: Ownership marker generated for this registration attempt.
        :return: True when this attempt atomically reserves the unclaimed proof.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        keys = self._challenge_keys(challenge_id)
        challenge_key = keys[0]

        def claim(values: dict[str, Any]) -> RedisUpdate:
            proof = self._matching_challenge(values, challenge_id)
            if proof is None or proof.get("verified") is not True or proof.get("claim_id"):
                return RedisUpdate(result=False)
            proof["claim_id"] = claim_id
            return RedisUpdate(
                result=True,
                writes={challenge_key: RedisValue(json.dumps(proof), keepttl=True)},
            )

        return await self._cache().transaction(keys, claim, serialize=False, deserialize=False)

    async def _complete_challenge(self, challenge_id: str, claim_id: str) -> None:
        """
        Consume this attempt's proof after the account has been created.

        :param challenge_id: Challenge used for the successfully created account.
        :param claim_id: This registration attempt's ownership marker.
        :return: None; a later delivery's raw code and owner remain untouched.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        keys = self._challenge_keys(challenge_id)
        challenge_key, code_key, current_key = keys

        def complete(values: dict[str, Any]) -> RedisUpdate:
            proof = self._read_challenge(values[challenge_key])
            if proof is None or proof.get("claim_id") != claim_id:
                return RedisUpdate()
            deletes = [challenge_key]
            if values[current_key] in (challenge_id, challenge_id.encode("ascii")):
                deletes.extend((code_key, current_key))
            return RedisUpdate(deletes=tuple(deletes))

        await self._cache().transaction(keys, complete, serialize=False, deserialize=False)

    async def _release_claim(self, challenge_id: str, claim_id: str) -> None:
        """
        Release only this registration attempt's claim after a failed database transaction.

        :param challenge_id: Verified challenge reserved by the failed attempt.
        :param claim_id: Random ownership marker created for this attempt.
        :return: None; proof expiry is unchanged, and cache failures retain the original error.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        challenge_key = self._challenge_key(challenge_id)

        def release(values: dict[str, Any]) -> RedisUpdate:
            proof = self._read_challenge(values[challenge_key])
            if proof is None or proof.get("claim_id") != claim_id:
                return RedisUpdate()
            proof.pop("claim_id")
            return RedisUpdate(writes={challenge_key: RedisValue(json.dumps(proof), keepttl=True)})

        with CancelScope(shield=True):
            try:
                await self._cache().transaction((challenge_key,), release, serialize=False, deserialize=False)
            except (RedisError, HTTPException):
                pass

    async def _insert_registration(self, stmt):
        """Lock before the INSERT statement obtains its default-role snapshot.

        Role edits acquire the same transaction lock. Taking it in a separate statement
        inside this transaction prevents a waiting signup from retaining a stale default
        snapshot. External-session mode leaves the transaction lifetime with its owner.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        async with self.transaction() as transaction:
            dialect = transaction.session.get_bind().dialect.name
            if dialect == EnumDBType.POSTGRESQL:
                await transaction.execute_orm(select(func.pg_advisory_xact_lock(AUTH_MANAGEMENT_WRITE_LOCK_KEY)))
            elif dialect == EnumDBType.SQLLite:
                await transaction.execute_orm(
                    update(AuthRole)
                    .where(AuthRole.id == -1)
                    .values({AuthRole.is_active: AuthRole.is_active, AuthRole.updatetime: AuthRole.updatetime})
                )
            return (await transaction.execute_orm(stmt)).mappings().one_or_none()

    async def register(self) -> dict[str, Any]:
        """
        Create a verified account with the active default role and initialize its SESSION.

        Managed mode commits before consuming the proof and starting the authenticated
        session. In external mode, the injected session's owner must commit before
        releasing the response and owns rollback if any operation fails.

        :return: Account ID, exact email, public user, default role, and its CRUD/management permissions.
        :raises HTTPException: Email is reserved, verification/default role is unavailable, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        await self._load_session()
        challenge_id = self._challenge_id()
        await self._verified_challenge(challenge_id)
        if not isinstance(self.password, str) or len(self.password) < 8:
            raise HTTPException(status_code=400, detail="PASSWORD_TOO_SHORT")
        claim_id = secrets.token_hex(16)
        claimed = False
        try:
            if await self._email_exists():
                raise HTTPException(status_code=409, detail="EMAIL_ALREADY_EXISTS")
            account = AuthUser(email=self.email, is_active=True)
            try:
                await account.set_password(self.password)
            except (UnicodeError, ValueError):
                raise HTTPException(status_code=400, detail="INVALID_PASSWORD") from None
            claimed = await self._claim_challenge(challenge_id, claim_id)
            if not claimed:
                raise HTTPException(status_code=400, detail="EMAIL_VERIFICATION_REQUIRED")
            # The locked role supplies both the insert and returned permissions in one atomic statement.
            role = (
                select(
                    AuthRole.id.label(AuthUser.role_id.key),
                    AuthRole.role,
                    *AUTH_ROLE_PERMISSION_COLUMNS,
                )
                .where(
                    AuthRole.is_default.is_(True),
                    AuthRole.is_active.is_(True),
                    AuthRole.is_manage_roles.is_(False),
                    AuthRole.is_manage_users.is_(False),
                    AuthRole.is_manage_sites.is_(False),
                )
                .with_for_update(read=True)
                .subquery("registration_role")
            )
            if self.user is not None:
                try:
                    validate_public_user(self.user)
                except ValueError:
                    raise HTTPException(status_code=400, detail="INVALID_USER") from None
            response = None
            for attempt in range(1, 101):
                user = self.user if self.user is not None else public_user_candidate(self.email, attempt)
                if (await self.execute_orm(select(AuthUser.id).where(AuthUser.user == user))).first() is not None:
                    if self.user is not None:
                        raise HTTPException(status_code=409, detail="USER_ALREADY_EXISTS")
                    continue
                stmt = (
                    insert(AuthUser)
                    .from_select(
                        (AuthUser.email, AuthUser.user, AuthUser.password, AuthUser.role_id, AuthUser.is_active),
                        select(
                            literal(self.email),
                            literal(user),
                            literal(account.password),
                            role.c[AuthUser.role_id.key],
                            literal(True),
                        ),
                    )
                    .returning(
                        AuthUser.id,
                        AuthUser.email,
                        AuthUser.user,
                        *(
                            select(role.c[field]).scalar_subquery().label(field)
                            for field in (AuthRole.role.key, *(column.key for column in AUTH_ROLE_PERMISSION_COLUMNS))
                        ),
                    )
                )
                try:
                    row = await self._insert_registration(stmt)
                except IntegrityError as error:
                    if not self._unique_conflict(error, "uq_auth_user_user", "auth_user.user"):
                        raise
                    if self.user is not None or not self.manage_transaction:
                        raise HTTPException(status_code=409, detail="USER_ALREADY_EXISTS") from None
                    # A concurrent registration reserved this candidate; the tool rolled back before retrying.
                    continue
                if row is None:
                    raise HTTPException(status_code=503, detail="REGISTRATION_UNAVAILABLE")
                response = dict(row)
                break
            if response is None:
                raise HTTPException(status_code=409, detail="USER_ALLOCATION_UNAVAILABLE")
        except BaseException as error:
            if claimed:
                await self._release_claim(challenge_id, claim_id)
            if isinstance(error, IntegrityError):
                if self._email_conflict(error):
                    raise HTTPException(status_code=409, detail="EMAIL_ALREADY_EXISTS") from None
                raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None
            if isinstance(error, SQLAlchemyError):
                raise HTTPException(status_code=503, detail="AUTH_DATABASE_UNAVAILABLE") from None
            if isinstance(error, RedisError):
                raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
            raise

        try:
            await self._complete_challenge(challenge_id, claim_id)
        except RedisError:
            raise HTTPException(status_code=503, detail="AUTH_STORAGE_UNAVAILABLE") from None
        await self._start_session(response, account.password)
        return response


__all__ = (
    "AuthSessionModule",
    "AuthSignInModule",
    "AuthSignOutModule",
    "AuthRegisterModule",
    "send_registration_email",
)
