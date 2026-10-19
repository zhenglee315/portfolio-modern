# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, ConfigDict, Field, create_model, field_validator, model_validator

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Annotated, Literal
from datetime import date
import math
import re

# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Portfolio - Shared Contracts
Locale = Literal["en", "zh-Hans", "zh-Hant"]
Text = Annotated[str, Field(max_length=100000)]
Short = Annotated[str, Field(max_length=255)]
Identity = Annotated[str, Field(min_length=1, max_length=160)]
Identities = Annotated[list[Identity], Field(max_length=500)]
LOCALES = ("en", "zh-Hans", "zh-Hant")


class ProfileBody(BaseModel):
    """Strict, bounded owner input; error responses never echo submitted values.

    ♂ ZhengLee 2026.10.18
    """

    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)

    @field_validator("*", mode="before")
    @classmethod
    def storage_text(cls, value):
        def validate(item, depth=0):
            if depth > 32:
                raise ValueError("Content nesting exceeds the supported schema.")
            if isinstance(item, str) and (
                "\0" in item or any(0xD800 <= ord(character) <= 0xDFFF for character in item)
            ):
                raise ValueError("Invalid storage text.")
            if isinstance(item, dict):
                for key, child in item.items():
                    validate(key, depth + 1)
                    validate(child, depth + 1)
            elif isinstance(item, list):
                for child in item:
                    validate(child, depth + 1)

        validate(value)
        return value


class ProfileIntroduction(ProfileBody):
    firstName: Short
    familyName: Short
    nickName: Short
    intro: Text
    content: Text
    eduCode: Annotated[str, Field(max_length=128)]
    program: Short
    footer: Text
    chatTitle: Short
    chatSubtitle: Short
    chatContent: Text
    chatIcon: Annotated[str, Field(max_length=512)]


class ProfileSocial(ProfileBody):
    linkedin: Annotated[str, Field(max_length=2048)]
    github: Annotated[str, Field(max_length=2048)]
    medium: Annotated[str, Field(max_length=2048)]
    email: Annotated[str, Field(max_length=254)]

    @model_validator(mode="after")
    def safe_links(self):
        from urllib.parse import urlsplit
        from pydantic import AnyHttpUrl, TypeAdapter
        from APPs.Auth.schema.body import validate_auth_email

        for field in ("linkedin", "github", "medium"):
            value = getattr(self, field)
            if value:
                TypeAdapter(AnyHttpUrl).validate_python(value)
                parsed = urlsplit(value)
                if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError("Invalid public link.")
        if self.email:
            validate_auth_email(self.email)
        return self


class ProfileBrand(ProfileBody):
    title: Short
    titleSub: Short
    copyrightYear: Annotated[int, Field(ge=1900, le=9999)]


class ProfileSource(ProfileBody):
    siteId: Annotated[int, Field(gt=0)]
    user: str
    locales: list[Locale]


class ProfilePeriod(ProfileBody):
    startMonth: str
    endMonth: str
    endDay: str
    expected: bool

    @model_validator(mode="after")
    def valid_period(self):
        for value in (self.startMonth, self.endMonth):
            if value and not re.fullmatch(r"(?!0000)\d{4}-(0[1-9]|1[0-2])", value):
                raise ValueError("Invalid calendar month.")
        if (
            not self.startMonth
            or (self.endMonth and self.startMonth > self.endMonth)
            or (self.expected and not self.endMonth)
        ):
            raise ValueError("Invalid period.")
        if self.endDay:
            if not self.endMonth or not self.endDay.isascii() or not self.endDay.isdigit():
                raise ValueError("Invalid end day.")
            date.fromisoformat(f"{self.endMonth}-{int(self.endDay):02d}")
        return self


class ProfileDetail(ProfileBody):
    startMonth: str
    endMonth: str

    @model_validator(mode="after")
    def valid_period(self):
        ProfilePeriod(startMonth=self.startMonth, endMonth=self.endMonth, endDay="", expected=False)
        return self


class ProfileExperienceText(ProfileBody):
    organization: Short
    organizationCode: Short = ""
    title: Short
    city: Short
    country: Short
    content: Text
    detail: Text


class ProfileExperience(ProfilePeriod):
    id: Identity
    type: Literal["work", "education"]
    visible: bool
    countryCode: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
    latitude: str
    longitude: str
    detail: ProfileDetail | None
    skillIds: Identities
    translations: dict[Locale, ProfileExperienceText]

    @model_validator(mode="after")
    def valid_location(self):
        for value, limit in ((self.latitude, 90), (self.longitude, 180)):
            try:
                coordinate = float(value)
            except ValueError:
                raise ValueError("A map position is required.") from None
            if not math.isfinite(coordinate) or abs(coordinate) > limit:
                raise ValueError("Invalid map position.")
        return self


class ProfileProjectText(ProfileBody):
    name: Short
    organization: Short = ""
    organizationCode: Short = ""
    organizationTitle: Short = ""
    title: Short
    intro: Text
    workflow: Text
    flow: Annotated[list[Text], Field(max_length=30)]
    technical: Text
    contribution: Text
    outcome: Text


class ProfileProject(ProfilePeriod):
    id: Identity
    experienceId: Identity | None
    visible: bool
    skillIds: Identities
    translations: dict[Locale, ProfileProjectText]


class ProfileCategory(ProfileBody):
    id: Identity
    names: dict[Locale, Short]
    visible: bool
    skillIds: Identities


class ProfileSkill(ProfileBody):
    id: Identity
    label: Short
    labels: dict[Locale, Short] | None = None


class ProfileDocument(ProfileBody):
    """One entity per ID; orders and associations reference only this owner's entities."""

    version: Literal[1]
    source: ProfileSource | None = None
    brand: ProfileBrand | None = None
    profiles: dict[Locale, ProfileIntroduction]
    social: ProfileSocial
    experienceOrder: Identities
    experiences: dict[Identity, ProfileExperience]
    projectOrder: Identities
    projects: dict[Identity, ProfileProject]
    categoryOrder: Identities
    categories: dict[Identity, ProfileCategory]
    skills: dict[Identity, ProfileSkill]

    @model_validator(mode="after")
    def references(self):
        for order, entries in (
            (self.experienceOrder, self.experiences),
            (self.projectOrder, self.projects),
            (self.categoryOrder, self.categories),
        ):
            if (
                len(set(order)) != len(order)
                or set(order) != set(entries)
                or any(k != v.id for k, v in entries.items())
            ):
                raise ValueError("Invalid entity order.")
        if len(self.skills) > 2000 or any(k != v.id for k, v in self.skills.items()):
            raise ValueError("Invalid skill identities.")
        if set(self.profiles) != set(LOCALES):
            raise ValueError("All content-language slots are required.")
        for entry in (*self.experiences.values(), *self.projects.values(), *self.categories.values()):
            if len(set(entry.skillIds)) != len(entry.skillIds) or not set(entry.skillIds) <= self.skills.keys():
                raise ValueError("Invalid skill references.")
            translations = entry.names if isinstance(entry, ProfileCategory) else entry.translations
            if set(translations) != set(LOCALES):
                raise ValueError("All content-language slots are required.")
        for project in self.projects.values():
            if project.experienceId is not None and project.experienceId not in self.experiences:
                raise ValueError("Invalid experience reference.")
        return self


# ■—< BODY >————————————————————————————————————————————————————————————————————————————■ Portfolio - Revision / Writes
class BodyPortfolioRevision(ProfileBody):
    expected_revision: Annotated[int, Field(ge=0)]


class ProfileProjectScope(ProfileBody):
    """Loaded identities may be replaced/deleted; every unvisited identity is retained by the server."""

    loaded_ids: Identities
    order: Identities

    @field_validator("loaded_ids", "order")
    @classmethod
    def unique(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Repeated project scope identities.")
        return value


class BodyPortfolioSave(BodyPortfolioRevision):
    draft: ProfileDocument
    project_scope: ProfileProjectScope | None = None


class BodyPortfolioOrder(BodyPortfolioRevision):
    ids: Identities

    @field_validator("ids")
    @classmethod
    def unique(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Repeated order identities.")
        return value


class BodyPortfolioExperienceCreate(BodyPortfolioRevision):
    entry: ProfileExperience


class BodyPortfolioProjectCreate(BodyPortfolioRevision):
    entry: ProfileProject


class BodyPortfolioCategoryCreate(BodyPortfolioRevision):
    entry: ProfileCategory


class BodyPortfolioSkillCreate(BodyPortfolioRevision):
    entry: ProfileSkill


def _patch(name, model):
    """Omission differs from null; the merged entity is validated before any SQL write."""
    return create_model(
        name,
        __base__=ProfileBody,
        **{key: (field.annotation, Field(default=None)) for key, field in model.model_fields.items() if key != "id"},
    )


class BodyPortfolioExperiencePatch(BodyPortfolioRevision):
    changes: _patch("PortfolioExperienceChanges", ProfileExperience)


class BodyPortfolioProjectPatch(BodyPortfolioRevision):
    changes: _patch("PortfolioProjectChanges", ProfileProject)


class BodyPortfolioCategoryPatch(BodyPortfolioRevision):
    changes: _patch("PortfolioCategoryChanges", ProfileCategory)


class BodyPortfolioSkillPatch(BodyPortfolioRevision):
    changes: _patch("PortfolioSkillChanges", ProfileSkill)


class BodyPortfolioSitePatch(BodyPortfolioRevision):
    profiles: dict[Locale, ProfileIntroduction] | None = None
    social: ProfileSocial | None = None
    brand: ProfileBrand | None = None

    @model_validator(mode="after")
    def submitted_groups(self):
        if any(getattr(self, key) is None for key in self.model_fields_set if key != "expected_revision"):
            raise ValueError("Submitted site groups cannot be null.")
        return self


__all__ = (
    "ProfileBody",
    "ProfileIntroduction",
    "ProfileSocial",
    "ProfileBrand",
    "ProfileSource",
    "ProfilePeriod",
    "ProfileDetail",
    "ProfileExperienceText",
    "ProfileExperience",
    "ProfileProjectText",
    "ProfileProject",
    "ProfileCategory",
    "ProfileSkill",
    "ProfileDocument",
    "BodyPortfolioRevision",
    "BodyPortfolioSave",
    "ProfileProjectScope",
    "BodyPortfolioOrder",
    "BodyPortfolioExperienceCreate",
    "BodyPortfolioProjectCreate",
    "BodyPortfolioCategoryCreate",
    "BodyPortfolioSkillCreate",
    "BodyPortfolioExperiencePatch",
    "BodyPortfolioProjectPatch",
    "BodyPortfolioCategoryPatch",
    "BodyPortfolioSkillPatch",
    "BodyPortfolioSitePatch",
    "LOCALES",
)
