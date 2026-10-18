# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.schema.body import validate_auth_email
from APPs.Management.constants import (
    SITE_CHAT_ICONS,
    SITE_TEXT_MAX_LENGTH,
    SITE_PATCH_COLUMNS,
    SITE_TRANSLATION_PATCH_COLUMNS,
    SITE_ACCOUNT_PATCH_COLUMNS,
    ROLE_PATCH_COLUMNS,
    USER_PATCH_COLUMNS,
    MANAGEMENT_DELETE_MAX_TARGETS,
)
from SYSTEM.constants import EnumLocal, HTTP_URL_SCHEMES, TEXT_ENCODING

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
    model_validator,
)

# ◆—< Pack >—————————————————————————————————◆ Python
from urllib.parse import urlsplit
from dataclasses import dataclass
from typing import Any

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy.orm import InstrumentedAttribute

_HTTP_URL = TypeAdapter(AnyHttpUrl)


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Management - Platform Patch
class BodyManagementSitePatch(BaseModel):
    """
    Accept only mutable platform settings and the selected language's plain text.

    Defaults represent omission only and are excluded with exclude_unset=True.
    Submitted values are strictly typed and non-null; defaults are never persisted.
    PKs, FKs, account identity and projected facts are intentionally absent.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)

    # ---------------------------------------------------------------------● Account State
    owner_is_active: bool = Field(
        default=None,
        description="Account activation; a Default website's owner must remain active.",
    )
    # ---------------------------------------------------------------------● Site
    is_published: bool = Field(default=None, description="Public visibility; false also clears Default.")
    is_default: bool = Field(
        default=None,
        description="Global homepage; requires an active owner and publication.",
    )
    copyright_year: int = Field(default=None, ge=1900, le=9999, description="Explicit integer copyright year.")
    linkedin: str = Field(default=None, max_length=2048, description="HTTP(S) URL; empty hides the link.")
    github: str = Field(default=None, max_length=2048, description="HTTP(S) URL; empty hides the link.")
    medium: str = Field(default=None, max_length=2048, description="HTTP(S) URL; empty hides the link.")
    email: str = Field(
        default=None,
        max_length=254,
        description="Public contact email; empty hides the link.",
    )
    chat_icon: str = Field(default=None, max_length=512, description="Allowlisted bundled icon path.")
    # ---------------------------------------------------------------------● Selected Translation
    brand_title: str = Field(default=None, max_length=255)
    brand_title_sub: str = Field(default=None, max_length=255)
    first_name: str = Field(default=None, max_length=255)
    family_name: str = Field(default=None, max_length=255)
    nick_name: str = Field(default=None, max_length=255)
    profile_content: str = Field(default=None, max_length=SITE_TEXT_MAX_LENGTH)
    edu_code: str = Field(
        default=None,
        max_length=128,
        description="Education abbreviation, not a foreign key.",
    )
    program: str = Field(default=None, max_length=255)
    intro_content: str = Field(default=None, max_length=SITE_TEXT_MAX_LENGTH)
    footer_content: str = Field(default=None, max_length=SITE_TEXT_MAX_LENGTH)
    chat_title: str = Field(default=None, max_length=255)
    chat_title_sub: str = Field(default=None, max_length=255)
    chat_content: str = Field(default=None, max_length=SITE_TEXT_MAX_LENGTH)

    @field_validator("*")
    @classmethod
    def validate_storage_text(cls, value):
        """
        Reject database-invalid text while preserving whitespace and ordinary markup as plain text.

        :param value: One strictly validated scalar; omitted defaults do not run validators.
        :return: Original value, including false and empty strings.
        :raises ValueError: Text contains NUL or invalid Unicode surrogate characters.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        if isinstance(value, str):
            if "\x00" in value:
                raise ValueError("Text must not contain NUL characters.")
            try:
                value.encode(TEXT_ENCODING)
            except UnicodeEncodeError:
                raise ValueError("Text must contain valid Unicode characters.") from None
        return value

    @field_validator("linkedin", "github", "medium")
    @classmethod
    def validate_url(cls, value: str) -> str:
        """
        Accept explicit HTTP(S) links without credentials, whitespace or browser-normalized controls.

        :param value: Public social URL, or empty text to hide the link.
        :return: Original URL without normalization.
        :raises ValueError: The URL has an unsafe scheme or malformed authority.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        if value == "":
            return value
        try:
            _HTTP_URL.validate_python(value)
            parsed = urlsplit(value)
            if (
                any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value)
                or "\\" in value
                or parsed.scheme not in HTTP_URL_SCHEMES
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.port == 0
            ):
                raise ValueError
        except ValueError:
            raise ValueError("Link must be a valid HTTP(S) URL without credentials or whitespace.") from None
        return value

    @field_validator("email")
    @classmethod
    def validate_contact_email(cls, value: str) -> str:
        """
        Reuse address syntax validation without invoking login-email verification or changing identity.

        :param value: Public contact address; an empty string hides it.
        :return: Original validated address.
        :raises ValueError: A nonempty address has an unsupported format.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return validate_auth_email(value) if value else value

    @field_validator("chat_icon")
    @classmethod
    def validate_chat_icon(cls, value: str) -> str:
        """
        Restrict icons to the same bundled paths trusted by the public contact component.

        :param value: Existing bundled asset path.
        :return: Allowlisted path; arbitrary URLs and traversal paths are rejected.
        :raises ValueError: The icon is not bundled and trusted.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        if value not in SITE_CHAT_ICONS:
            raise ValueError("Icon must be a supported bundled asset.")
        return value

    @model_validator(mode="after")
    def require_changes(self):
        """
        Reject empty updates while retaining explicit false and empty-string assignments.

        :return: Validated patch containing at least one supplied field.
        :raises ValueError: No mutable field was submitted.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        if not self.model_fields_set:
            raise ValueError("Submit at least one mutable field.")
        return self

    def orm_changes(self) -> dict[InstrumentedAttribute, Any]:
        """
        Translate validated wire names once into explicitly allowlisted ORM attributes.

        :return: Attribute-keyed assignments, including explicit false and empty text.
        :raises KeyError: A developer added a DTO field without declaring its ORM binding.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        bindings = {
            **SITE_ACCOUNT_PATCH_COLUMNS,
            **SITE_PATCH_COLUMNS,
            **SITE_TRANSLATION_PATCH_COLUMNS,
        }
        return {bindings[field]: value for field, value in self.model_dump(exclude_unset=True).items()}


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Management - Role/User Patch
class BodyManagementRolePatch(BaseModel):
    """Explicit writable role values; description alone permits an explicit null.

    ♂ ZhengLee 2026.10.16
    """

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)
    role: str = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=SITE_TEXT_MAX_LENGTH)
    is_create: bool = None
    is_read: bool = None
    is_update: bool = None
    is_delete: bool = None
    is_monitor: bool = None
    is_manage_roles: bool = None
    is_manage_users: bool = None
    is_manage_sites: bool = None
    is_default: bool = None
    is_active: bool = None

    @field_validator("*")
    @classmethod
    def valid_text(cls, value):
        return BodyManagementSitePatch.validate_storage_text(value)

    @field_validator("role")
    @classmethod
    def valid_role(cls, value):
        if value != value.strip():
            raise ValueError("Role name must not have leading or trailing whitespace.")
        return value

    @model_validator(mode="after")
    def nonempty(self):
        if not self.model_fields_set:
            raise ValueError("Submit at least one mutable field.")
        return self

    def orm_changes(self):
        return {ROLE_PATCH_COLUMNS[field]: value for field, value in self.model_dump(exclude_unset=True).items()}


class BodyManagementUserPatch(BaseModel):
    """Allow activation and explicit role assignment; login identity and other relations stay immutable.

    Role existence, availability, grant authority and final-manager rules belong to the transaction.
                                                                                               ♂ ZhengLee 2026.10.16
    """

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)
    is_active: bool = Field(default=None)
    role_id: int = Field(default=None, gt=0, le=2147483647)

    @model_validator(mode="after")
    def nonempty(self):
        if not self.model_fields_set:
            raise ValueError("Submit at least one mutable field.")
        return self

    def orm_changes(self):
        return {USER_PATCH_COLUMNS[field]: value for field, value in self.model_dump(exclude_unset=True).items()}


class ManagementPatchRequest(BaseModel):
    """Require one original scalar for every changed field, separate from mutable assignments."""

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)
    expected: dict[str, bool | int | str | None] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def same_fields(self):
        if set(self.expected) != self.changes.model_fields_set:
            raise ValueError("Original values must match the changed fields exactly.")
        return self


class BodyManagementRolePatchRequest(ManagementPatchRequest):
    expected_role: str = Field(min_length=1, max_length=64)
    changes: BodyManagementRolePatch
    _role_text = field_validator("expected_role")(BodyManagementSitePatch.validate_storage_text)


class BodyManagementUserPatchRequest(ManagementPatchRequest):
    expected_email: str = Field(min_length=5, max_length=254)
    changes: BodyManagementUserPatch
    _email = field_validator("expected_email")(validate_auth_email)


@dataclass(frozen=True)
class ManagementRolePatchParameters:
    role_id: int
    expected_role: str
    changes: dict[str, Any]
    expected: dict[str, Any]


@dataclass(frozen=True)
class ManagementUserPatchParameters:
    account_id: int
    expected_email: str
    changes: dict[str, Any]
    expected: dict[str, Any]


# ■—< BODY >——————————————————————————————————————————————————————————————————————————■ Management - Platform Request
class BodyManagementSitePatchRequest(ManagementPatchRequest):
    """
    Separate immutable target confirmation from mutable portfolio assignments.

    :param expected_owner_email: Existing verified login email, used only with the path account ID.
    :param changes: Strict allowlist of mutable website/translation fields.

                                                                                               ♂ ZhengLee 2026.10.16
    """

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)

    expected_owner_email: str = Field(
        ...,
        min_length=5,
        max_length=254,
        description="Existing verified login email; confirmation only, never written.",
    )
    changes: BodyManagementSitePatch

    @field_validator("expected_owner_email")
    @classmethod
    def validate_owner_email(cls, value: str) -> str:
        """
        Validate the exact confirmation address without normalization or identity changes.

        :param value: Existing account email, preserved exactly as registered.
        :return: Validated confirmation address; authorization remains session-based.
        :raises ValueError: The address does not satisfy the account email contract.

                                                                                               ♂ ZhengLee 2026.10.16
        """
        return validate_auth_email(value)


# ■—< PARAM >——————————————————————————————————————————————————————————————————————————■ Management - Platform Patch
@dataclass(frozen=True)
class ManagementSitePatchParameters:
    """
    Carry validated request data between parser and CBV without untyped dictionary indexing.

                                                                                               ♂ ZhengLee 2026.10.16
    """

    account_id: int
    expected_owner_email: str
    locale: EnumLocal
    changes: dict[str, Any]
    expected: dict[str, Any]


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Management - Platform Delete
class _ManagementDeleteConfirmation(BaseModel):
    """Share strict, immutable identity contracts across management resources."""

    model_config = ConfigDict(
        strict=True,
        extra="forbid",
        hide_input_in_errors=True,
        frozen=True,
        revalidate_instances="always",
    )


class _ManagementDeleteBatch(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)


class BodyManagementSiteDeleteConfirmation(_ManagementDeleteConfirmation):
    """Confirm an immutable owner and website; never accept mutable account assignments.

    ♂ ZhengLee 2026.10.16
    """

    expected_owner_email: str = Field(min_length=5, max_length=254)
    expected_site_id: int = Field(gt=0, le=2147483647)
    _email = field_validator("expected_owner_email")(validate_auth_email)


class BodyManagementSiteDeleteTarget(BodyManagementSiteDeleteConfirmation):
    account_id: int = Field(gt=0, le=2147483647)


class BodyManagementSiteBulkDelete(_ManagementDeleteBatch):
    """Bound one atomic batch; repeated owners or websites are input errors, never silently deduplicated."""

    targets: list[BodyManagementSiteDeleteTarget] = Field(min_length=1, max_length=MANAGEMENT_DELETE_MAX_TARGETS)

    @model_validator(mode="after")
    def unique_targets(self):
        if len({target.account_id for target in self.targets}) != len(self.targets) or len(
            {target.expected_site_id for target in self.targets}
        ) != len(self.targets):
            raise ValueError("Delete targets must have unique owners and websites.")
        return self


@dataclass(frozen=True)
class ManagementSiteDeleteParameters:
    targets: tuple[BodyManagementSiteDeleteTarget, ...]


class BodyManagementRoleDeleteConfirmation(_ManagementDeleteConfirmation):
    """Use the original role name as identity confirmation, never as permission authority.

    ♂ ZhengLee 2026.10.16
    """

    expected_role: str = Field(min_length=1, max_length=64)
    _text = field_validator("expected_role")(BodyManagementSitePatch.validate_storage_text)


class BodyManagementRoleDeleteTarget(BodyManagementRoleDeleteConfirmation):
    role_id: int = Field(gt=0, le=2147483647)


class BodyManagementRoleBulkDelete(_ManagementDeleteBatch):
    targets: list[BodyManagementRoleDeleteTarget] = Field(min_length=1, max_length=MANAGEMENT_DELETE_MAX_TARGETS)

    @model_validator(mode="after")
    def unique_targets(self):
        if len({target.role_id for target in self.targets}) != len(self.targets):
            raise ValueError("Delete targets must have unique roles.")
        return self


class BodyManagementUserDeleteConfirmation(_ManagementDeleteConfirmation):
    """Confirm login identity and the selected website, including an explicit absent-site snapshot."""

    expected_email: str = Field(min_length=5, max_length=254)
    expected_site_id: int | None = Field(..., gt=0, le=2147483647)
    _email = field_validator("expected_email")(validate_auth_email)


class BodyManagementUserDeleteTarget(BodyManagementUserDeleteConfirmation):
    account_id: int = Field(gt=0, le=2147483647)


class BodyManagementUserBulkDelete(_ManagementDeleteBatch):
    targets: list[BodyManagementUserDeleteTarget] = Field(min_length=1, max_length=MANAGEMENT_DELETE_MAX_TARGETS)

    @model_validator(mode="after")
    def unique_targets(self):
        if len({target.account_id for target in self.targets}) != len(self.targets):
            raise ValueError("Delete targets must have unique accounts.")
        sites = [target.expected_site_id for target in self.targets if target.expected_site_id is not None]
        if len(set(sites)) != len(sites):
            raise ValueError("Delete targets must have unique websites.")
        return self


@dataclass(frozen=True)
class ManagementRoleDeleteParameters:
    targets: tuple[BodyManagementRoleDeleteTarget, ...]


@dataclass(frozen=True)
class ManagementUserDeleteParameters:
    targets: tuple[BodyManagementUserDeleteTarget, ...]


__all__ = (
    "BodyManagementRoleDeleteConfirmation",
    "BodyManagementRoleDeleteTarget",
    "BodyManagementRoleBulkDelete",
    "ManagementRoleDeleteParameters",
    "BodyManagementUserDeleteConfirmation",
    "BodyManagementUserDeleteTarget",
    "BodyManagementUserBulkDelete",
    "ManagementUserDeleteParameters",
    "BodyManagementSiteDeleteConfirmation",
    "BodyManagementSiteDeleteTarget",
    "BodyManagementSiteBulkDelete",
    "ManagementSiteDeleteParameters",
    "BodyManagementSitePatch",
    "BodyManagementSitePatchRequest",
    "ManagementSitePatchParameters",
    "BodyManagementRolePatch",
    "BodyManagementRolePatchRequest",
    "ManagementRolePatchParameters",
    "BodyManagementUserPatch",
    "BodyManagementUserPatchRequest",
    "ManagementUserPatchParameters",
)
