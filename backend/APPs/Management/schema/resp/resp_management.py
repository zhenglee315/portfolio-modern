"""Describe role, account and platform rows within the common numbered response envelope."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from COMMON.schema.resp import RespRecords


class RespManagementRole(BaseModel):
    """Expose one role and its total assigned-account count, including soft-deleted accounts."""

    id: int = Field(..., gt=0, description="Role primary key.")
    role: str = Field(..., min_length=1, max_length=64, description="Unique role name.")
    description: str | None = Field(..., description="Optional role description; absent text remains null.")
    is_create: bool = Field(..., description="Allow creating portfolio content.")
    is_read: bool = Field(..., description="Allow reading portfolio management content.")
    is_update: bool = Field(..., description="Allow updating portfolio content.")
    is_delete: bool = Field(..., description="Allow deleting portfolio content.")
    is_manage_sites: bool = Field(..., description="Website management permission.")
    is_manage_users: bool = Field(..., description="Account management permission.")
    is_manage_roles: bool = Field(..., description="Role management permission.")
    is_default: bool = Field(..., description="Whether new registrations receive this role.")
    is_active: bool = Field(..., description="Whether this role allows assigned accounts to sign in.")
    createtime: datetime = Field(..., description="Role creation time, serialized in UTC ISO 8601.")
    updatetime: datetime = Field(..., description="Role update time, serialized in UTC ISO 8601.")
    user_count: int = Field(..., ge=0, description="All assigned accounts, including soft-deleted accounts.")

    @field_validator("createtime", "updatetime")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        """Preserve UTC timestamps when SQLite returns naive values for timezone-aware columns."""
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class RespManagementRoles(RespRecords[RespManagementRole]):
    """Return items/total/pages/page/size with one item per matching role."""


# ■—< RESP >——————————————————————————————————————————————————————————————————————————■ Management - Users
class RespManagementUser(BaseModel):
    """Expose one account with its role, optional website and successful sign-in statistics."""

    id: int = Field(..., gt=0, description="Account primary key.")
    email: str = Field(..., max_length=254, description="Account login email, independent of public contact email.")
    role_id: int = Field(..., gt=0, description="Assigned role primary key.")
    role: str = Field(..., min_length=1, max_length=64, description="Assigned role name.")
    is_active: bool = Field(..., description="Account state; false marks the account as soft-deleted.")
    role_is_active: bool = Field(..., description="Whether the assigned role allows its accounts to sign in.")
    site_id: int | None = Field(..., gt=0, description="Owned website primary key, or null when no website exists.")
    has_site: bool = Field(..., description="Whether the account owns a website record, regardless of publication.")
    login_count: int = Field(..., ge=0, description="Total successful sign-in records; zero when none exist.")
    last_login: datetime | None = Field(..., description="Latest successful sign-in time in UTC ISO 8601, or null.")
    createtime: datetime = Field(..., description="Account creation time, serialized in UTC ISO 8601.")
    updatetime: datetime = Field(..., description="Account update time, serialized in UTC ISO 8601.")

    @field_validator("last_login", "createtime", "updatetime")
    @classmethod
    def utc_timestamp(cls, value: datetime | None) -> datetime | None:
        """Keep absent sign-ins null and normalize timestamps returned by every database dialect."""
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class RespManagementUsers(RespRecords[RespManagementUser]):
    """Return items/total/pages/page/size with one item per matching account."""


# ■—< RESP >——————————————————————————————————————————————————————————————————————————■ Management - Platform
class RespManagementSite(BaseModel):
    """Keep the account ID as row identity even when no portfolio or translation exists."""

    id: int = Field(..., gt=0, description="Owner account ID; stable identity for this person-based row.")
    user: str = Field(..., description="Public portfolio URL handle; independent of login email.")
    owner_email: str = Field(..., max_length=254, description="Read-only login email, independent of contact email.")
    owner_is_active: bool = Field(..., description="Owner account state; independent of role login availability.")
    site_id: int | None = Field(..., description="Portfolio ID; null when this person has no portfolio.")
    has_site: bool = Field(..., description="Whether the owner has created a portfolio.")
    has_profile: bool = Field(
        ..., description="Whether this site has a work or education record in the requested active language."
    )
    is_published: bool | None = Field(..., description="Publication flag; null when no portfolio exists.")
    is_default: bool | None = Field(..., description="Default homepage flag; null when no portfolio exists.")
    copyright_year: int | None = Field(..., description="Portfolio copyright year; null without a portfolio.")
    linkedin: str | None = Field(..., description="Public LinkedIn URL; empty string hides the link.")
    github: str | None = Field(..., description="Public GitHub URL; empty string hides the link.")
    medium: str | None = Field(..., description="Public Medium URL; empty string hides the link.")
    email: str | None = Field(..., description="Public portfolio contact email; separate from the login email.")
    chat_icon: str | None = Field(..., description="Bundled contact-bubble icon path.")
    locale: Literal["en", "zh-Hans", "zh-Hant"] = Field(..., description="Requested management content language.")
    has_translation: bool = Field(..., description="Whether this portfolio has content in the requested language.")
    brand_title: str | None = Field(..., description="Localized brand title; null without the requested translation.")
    brand_title_sub: str | None = Field(..., description="Localized brand subtitle.")
    first_name: str | None = Field(..., description="Localized given name.")
    family_name: str | None = Field(..., description="Localized family name.")
    nick_name: str | None = Field(..., description="Localized nickname and accessible home label.")
    profile_content: str | None = Field(..., description="Localized personal introduction and meta description.")
    edu_code: str | None = Field(..., description="Localized education abbreviation.")
    program: str | None = Field(..., description="Localized education program.")
    intro_content: str | None = Field(..., description="Localized introduction above the name.")
    footer_content: str | None = Field(..., description="Localized footer tagline.")
    chat_title: str | None = Field(..., description="Localized contact-bubble title.")
    chat_title_sub: str | None = Field(..., description="Localized contact-bubble subtitle.")
    chat_content: str | None = Field(..., description="Localized contact-bubble copy with its original line breaks.")
    createtime: datetime = Field(..., description="Owner account creation time in UTC ISO 8601.")
    updatetime: datetime = Field(
        ...,
        description="Owner account update time in UTC ISO 8601; this is not a portfolio content timestamp.",
    )

    @field_validator("createtime", "updatetime")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        """Serialize account timestamps consistently, including owners without a site."""
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class RespManagementSites(RespRecords[RespManagementSite]):
    """Return one person per item in the shared numbered response envelope."""


__all__ = (
    "RespManagementRole",
    "RespManagementRoles",
    "RespManagementUser",
    "RespManagementUsers",
    "RespManagementSite",
    "RespManagementSites",
)
