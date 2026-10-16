# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Auth.schema.body import validate_auth_email
from APPs.Management.constants import (
    SITE_CHAT_ICONS,
    SITE_TEXT_MAX_LENGTH,
    SITE_PATCH_COLUMNS,
    SITE_TRANSLATION_PATCH_COLUMNS,
)
from SYSTEM.constants import EnumLocal, HTTP_URL_SCHEMES, TEXT_ENCODING

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator

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
    PKs, FKs, account identity/state and projected facts are intentionally absent.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)

    # ---------------------------------------------------------------------● Site
    is_published: bool = Field(default=None, description="Public visibility; false also clears Default.")
    is_default: bool = Field(default=None, description="Global homepage; requires an active owner and publication.")
    copyright_year: int = Field(default=None, ge=1900, le=9999, description="Explicit integer copyright year.")
    linkedin: str = Field(default=None, max_length=2048, description="HTTP(S) URL; empty hides the link.")
    github: str = Field(default=None, max_length=2048, description="HTTP(S) URL; empty hides the link.")
    medium: str = Field(default=None, max_length=2048, description="HTTP(S) URL; empty hides the link.")
    email: str = Field(default=None, max_length=254, description="Public contact email; empty hides the link.")
    chat_icon: str = Field(default=None, max_length=512, description="Allowlisted bundled icon path.")
    # ---------------------------------------------------------------------● Selected Translation
    brand_title: str = Field(default=None, max_length=255)
    brand_title_sub: str = Field(default=None, max_length=255)
    first_name: str = Field(default=None, max_length=255)
    family_name: str = Field(default=None, max_length=255)
    nick_name: str = Field(default=None, max_length=255)
    profile_content: str = Field(default=None, max_length=SITE_TEXT_MAX_LENGTH)
    edu_code: str = Field(default=None, max_length=128, description="Education abbreviation, not a foreign key.")
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
        bindings = {**SITE_PATCH_COLUMNS, **SITE_TRANSLATION_PATCH_COLUMNS}
        return {bindings[field]: value for field, value in self.model_dump(exclude_unset=True).items()}


# ■—< BODY >——————————————————————————————————————————————————————————————————————————■ Management - Platform Request
class BodyManagementSitePatchRequest(BaseModel):
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


__all__ = ("BodyManagementSitePatch", "BodyManagementSitePatchRequest", "ManagementSitePatchParameters")
