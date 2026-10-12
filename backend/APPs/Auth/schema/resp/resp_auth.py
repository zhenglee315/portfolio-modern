# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Auth - User
class RespAuthUser(BaseModel):
    id: int = Field(..., gt=0, description="Authenticated account primary key.")
    email: str = Field(..., description="Exact login email address.")
    user: str = Field(..., description="Stable public identifier used by the portfolio URL.")
    role: str = Field(..., description="Assigned role name.")
    is_create: bool = Field(..., description="Allow creating portfolio content.")
    is_read: bool = Field(..., description="Allow reading portfolio management content.")
    is_update: bool = Field(..., description="Allow updating portfolio content.")
    is_delete: bool = Field(..., description="Allow deleting portfolio content.")
    is_manage_roles: bool = Field(..., description="Allow managing roles and the registration default.")
    is_manage_users: bool = Field(..., description="Allow managing accounts and assigned roles.")
    is_manage_sites: bool = Field(..., description="Allow managing portfolio publication and the default site.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Auth - Sign Out
class RespAuthSignOut(BaseModel):
    signed_out: bool = Field(..., description="Whether the current server-side session has been cleared.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Auth - Email Availability
class RespAuthEmailAvailability(BaseModel):
    email: str = Field(..., description="Exact email checked for registration availability.")
    available: bool = Field(..., description="Whether no account currently reserves this email.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Auth - Verification Code
class RespAuthCode(BaseModel):
    expires_in: int = Field(..., gt=0, description="Verification code validity in seconds.")
    retry_after: int = Field(..., ge=0, description="Delay in seconds before requesting another code.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Auth - Verified Email
class RespAuthEmailVerified(BaseModel):
    email: str = Field(..., description="Exact email verified for registration.")
    verified: bool = Field(..., description="Whether the email verification succeeded.")


__all__ = ("RespAuthUser", "RespAuthSignOut", "RespAuthEmailAvailability", "RespAuthCode", "RespAuthEmailVerified")
