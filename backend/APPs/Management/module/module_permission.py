# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.module import AuthSessionModule
from APPs.Management.constants import MANAGEMENT_PRIVATE_HEADERS

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import AUTH_PERMISSION_FIELDS

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Request, Response


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Current Identity
class _ManagementIdentity:
    """
    Resolve one current database-backed identity for the request's permission dependencies.

    FastAPI shares this dependency's result within one request. No account or rights
    are stored on this instance, so subsequent requests recheck the database and
    concurrent requests never share an authenticated identity.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    async def __call__(self, request: Request, response: Response) -> dict:
        """
        Restore the active account and role through the established SESSION reader.

        :param request: Current HTTP request; only its server-side SESSION selects the actor.
        :param response: FastAPI response receiving the private read headers.
        :return: Current account identity and the seven database-issued permission flags.
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
            raise HTTPException(status_code=401, detail="AUTH_REQUIRED", headers=MANAGEMENT_PRIVATE_HEADERS)
        return account


# One dependency instance enables FastAPI's request-local reuse across permission rules.
_CURRENT_IDENTITY = _ManagementIdentity()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Management - Permission
class ManagementPermission:
    """
    Declare reusable permission conditions as a parameterized FastAPI dependency.

    Example: Depends(ManagementPermission(is_manage_roles=True)). Multiple flags
    combine with AND and require an explicit database boolean True. This class
    checks authorization only; resource ownership and transactional business rules
    remain with the resource module. Existing flags do not express per-module CRUD.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    def __init__(self, *, denied_detail: str = "PERMISSION_DENIED", **required: bool) -> None:
        """
        Validate a server-declared rule when the API is registered.

        :param denied_detail: Stable 403 code; preview routes may retain their existing error contract.
        :param required: Recognized permission names set to True; every specified permission is required.
        :return: None; immutable conditions are retained without any request-specific state.
        :raises ValueError: Conditions are empty, unknown, non-True, or the denial code is invalid.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        # --------------------------------------------------● Step 1. Reject incomplete or misspelled rules.
        if not required:
            raise ValueError("At least one permission condition is required.")
        unknown = set(required).difference(AUTH_PERMISSION_FIELDS)
        if unknown:
            raise ValueError(f"Unknown permission conditions: {', '.join(sorted(unknown))}.")
        if any(expected is not True for expected in required.values()):
            raise ValueError("Permission conditions must be the boolean True.")
        if not isinstance(denied_detail, str) or not denied_detail.strip():
            raise ValueError("Permission denial detail must be a non-empty string.")
        # --------------------------------------------------● Step 2. Retain server-side configuration only.
        self.required = tuple(required)
        self.denied_detail = denied_detail

    async def __call__(self, account: dict = Depends(_CURRENT_IDENTITY)) -> dict:
        """
        Enforce every declared permission before the protected API executes.

        :param account: Current identity supplied by the shared FastAPI sub-dependency.
        :return: Authorized account, available to APIs that declare this dependency as a parameter.
        :raises HTTPException: A missing, false, or non-boolean permission returns 403.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        if any(account.get(field) is not True for field in self.required):
            raise HTTPException(status_code=403, detail=self.denied_detail, headers=MANAGEMENT_PRIVATE_HEADERS)
        return account


__all__ = ("ManagementPermission", "MANAGEMENT_PRIVATE_HEADERS")
