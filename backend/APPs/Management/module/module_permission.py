# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.module import AuthSessionModule
from APPs.Management.constants import MANAGEMENT_PRIVATE_HEADERS, EnumManagementError
from APPs.Auth.schema.resp import RespAuthUser

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import AuthRole

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy.orm import InstrumentedAttribute

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Request, Response

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import ValidationError

# ◆—< Pack >—————————————————————————————————◆ Python
from collections.abc import Callable


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Current Identity
class _ManagementIdentity:
    """
    Resolve one current database-backed identity for the request's permission dependencies.

    FastAPI shares this dependency's result within one request. No account or rights
    are stored on this instance, so subsequent requests recheck the database and
    concurrent requests never share an authenticated identity.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    async def __call__(self, request: Request, response: Response) -> RespAuthUser:
        """
        Restore the active account and role through the established SESSION reader.

        :param request: Current HTTP request; only its server-side SESSION selects the actor.
        :param response: FastAPI response receiving the private read headers.
        :return: Current account identity and the eight database-issued permission flags.
        :raises HTTPException: Missing or disabled identity returns 401; storage failures retain 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        # --------------------------------------------------● Step 1. Prevent private response caching.
        response.headers.update(MANAGEMENT_PRIVATE_HEADERS)
        # --------------------------------------------------● Step 2. Refresh account and role permissions.
        try:
            account = await AuthSessionModule(request=request).current_session()
        except HTTPException as error:
            error.headers = {**(error.headers or {}), **MANAGEMENT_PRIVATE_HEADERS}
            raise
        # --------------------------------------------------● Step 3. Reject absent or disabled identities.
        if account is None:
            raise HTTPException(
                status_code=401,
                detail=EnumManagementError.AUTH_REQUIRED,
                headers=MANAGEMENT_PRIVATE_HEADERS,
            )
        try:
            return RespAuthUser.model_validate(account, strict=True)
        except ValidationError:
            raise HTTPException(
                status_code=503,
                detail=EnumManagementError.AUTH_DATABASE_UNAVAILABLE,
                headers=MANAGEMENT_PRIVATE_HEADERS,
            ) from None


# One dependency instance enables FastAPI's request-local reuse across permission rules.
_CURRENT_IDENTITY = _ManagementIdentity()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Permission
class ManagementPermission:
    """
    Declare reusable permission conditions as a parameterized FastAPI dependency.

    Example: Depends(ManagementPermission(AuthRole.is_manage_roles)). Multiple columns
    combine with AND and require an explicit database boolean True. This class
    checks authorization only; resource ownership and transactional business rules
    remain with the resource module. Existing flags do not express per-module CRUD.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    # Each gate binds a real ORM permission to an explicit typed identity property.
    # External identity keys are parsed once by _ManagementIdentity, never indexed here.
    #                                                                                           ♂ ZhengLee 2026.10.16
    _CHECKS: dict[InstrumentedAttribute, Callable[[RespAuthUser], bool]] = {
        AuthRole.is_create: lambda account: account.is_create,
        AuthRole.is_read: lambda account: account.is_read,
        AuthRole.is_update: lambda account: account.is_update,
        AuthRole.is_delete: lambda account: account.is_delete,
        AuthRole.is_monitor: lambda account: account.is_monitor,
        AuthRole.is_manage_roles: lambda account: account.is_manage_roles,
        AuthRole.is_manage_users: lambda account: account.is_manage_users,
        AuthRole.is_manage_sites: lambda account: account.is_manage_sites,
    }

    def __init__(
        self, *required: InstrumentedAttribute, denied_detail: str = EnumManagementError.PERMISSION_DENIED
    ) -> None:
        """
        Validate explicitly referenced ORM permission columns when a route is registered.

        :param required: Allowlisted AuthRole boolean attributes; multiple gates combine with AND.
        :param denied_detail: Stable public error code, preserving the preview contract.
        :raises ValueError: No gates, duplicate gates, string names or non-permission columns were supplied.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        if not required:
            raise ValueError("At least one ORM permission is required.")
        if any(not isinstance(column, InstrumentedAttribute) or column not in self._CHECKS for column in required):
            raise ValueError("Only explicitly allowlisted AuthRole permission attributes are accepted.")
        if len(set(required)) != len(required):
            raise ValueError("Duplicate ORM permission conditions are not accepted.")
        if not isinstance(denied_detail, str) or not denied_detail.strip():
            raise ValueError("Permission denial detail must be a non-empty string.")
        self.required = tuple(self._CHECKS[column] for column in required)
        self.denied_detail = denied_detail

    async def __call__(self, account: RespAuthUser = Depends(_CURRENT_IDENTITY)) -> RespAuthUser:
        """
        Check typed identity properties refreshed from the database for this request.

        :param account: Validated current identity; stale SESSION flags never grant permission.
        :return: Authorized typed identity, available to handlers that need the actor.
        :raises HTTPException: A required permission that is not True returns 403.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        if any(check(account) is not True for check in self.required):
            raise HTTPException(
                status_code=403,
                detail=self.denied_detail,
                headers=MANAGEMENT_PRIVATE_HEADERS,
            )
        return account


__all__ = ("ManagementPermission", "MANAGEMENT_PRIVATE_HEADERS")
