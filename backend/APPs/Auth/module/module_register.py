# ◆—< Pack >—————————————————————————————————◆ Project
from .module_base import (
    AuthModule,
    AUTH_CACHE_PREFIX,
    AUTH_CODE_TTL,
    AUTH_TEMPORARY_CODE,
    AUTH_CODE_COOLDOWN,
    AUTH_CODE_ATTEMPTS,
    send_registration_email,
)

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.schema_user import public_user_candidate, validate_public_user
from COMMON.tools.storage.redis import RedisUpdate, RedisValue

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import (
    EnumDBType,
    EnumSess,
    AUTH_MANAGEMENT_WRITE_LOCK_KEY,
)
from SYSTEM.models import AuthRole, AuthUser, AUTH_ROLE_PERMISSION_COLUMNS

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import insert, literal, select, update, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException, Request

# ◆—< Pack >—————————————————————————————————◆ Redis
from redis.asyncio import Redis
from redis.exceptions import RedisError

# ◆—< Pack >—————————————————————————————————◆ AnyIO
from anyio import CancelScope

# ◆—< Pack >—————————————————————————————————◆ Python
from collections.abc import Awaitable, Callable
from typing import Any
import json
import re
import secrets


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
        super().__init__(
            request,
            email,
            session=session,
            redis=redis,
            manage_transaction=manage_transaction,
        )
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
        return (
            self._challenge_key(challenge_id),
            self._verification_key(),
            self._current_challenge_key(),
        )

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
        challenge = self.request.session.get(EnumSess.AUTH_REGISTRATION)
        if not isinstance(challenge, dict) or challenge.get(EnumSess.EMAIL) != self.email:
            raise HTTPException(status_code=400, detail="EMAIL_VERIFICATION_REQUIRED")
        challenge_id = challenge.get(EnumSess.CHALLENGE_ID)
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
        self.request.session[EnumSess.AUTH_REGISTRATION] = {
            EnumSess.EMAIL: self.email,
            EnumSess.CHALLENGE_ID: challenge_id,
        }
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
                    .values(
                        {
                            AuthRole.is_active: AuthRole.is_active,
                            AuthRole.updatetime: AuthRole.updatetime,
                        }
                    )
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
                        (
                            AuthUser.email,
                            AuthUser.user,
                            AuthUser.password,
                            AuthUser.role_id,
                            AuthUser.is_active,
                        ),
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
                            for field in (
                                AuthRole.role.key,
                                *(column.key for column in AUTH_ROLE_PERMISSION_COLUMNS),
                            )
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
