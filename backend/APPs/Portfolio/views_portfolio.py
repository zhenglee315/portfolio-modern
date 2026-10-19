# ◆—< Pack >—————————————————————————————————◆ Dependencies
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords
from APPs.Management.constants import MANAGEMENT_PRIVATE_HEADERS
from SYSTEM.models import (
    AuthUser,
    PortfolioCareer,
    PortfolioCareerLocale,
    PortfolioLocale,
    PortfolioProject,
    PortfolioProjectLocale,
    PortfolioSite as PortfolioSiteRecord,
    PortfolioSiteLocale,
    PortfolioSkillCategory,
    PortfolioSkillCategoryLocale,
    PortfolioCategorySkill,
    PortfolioSkill,
    PortfolioSkillLocale,
    PortfolioCareerSkill,
    PortfolioProjectSkill,
    AuthRole,
)
from sqlalchemy import Select, and_, func, select, update, delete
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from fastapi import HTTPException
from pydantic import ValidationError
from datetime import date
from uuid import uuid5, NAMESPACE_URL
from APPs.Portfolio.schema.body.body_portfolio import (
    ProfileDocument,
    ProfileIntroduction,
    ProfileExperienceText,
    ProfileProjectText,
    LOCALES,
    BodyPortfolioRevision,
    BodyPortfolioSave,
    BodyPortfolioOrder,
    BodyPortfolioSitePatch,
    BodyPortfolioExperienceCreate,
    BodyPortfolioExperiencePatch,
    BodyPortfolioProjectCreate,
    BodyPortfolioProjectPatch,
    BodyPortfolioCategoryCreate,
    BodyPortfolioCategoryPatch,
    BodyPortfolioSkillCreate,
    BodyPortfolioSkillPatch,
)
from APPs.Auth.schema.resp import RespAuthUser
from APPs.Management.module.module_permission import ManagementPermission
from APPs.Management.module.module_state import ManagementWriteState
from APPs.Portfolio.module.module_portfolio_manage import PortfolioManagementModule
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, TypeVar
from APPs.Portfolio.schema.parser import (
    parser_portfolio_site,
    parser_portfolio_content,
    parser_portfolio_records,
    parser_portfolio_skills,
    PortfolioEditRoute,
)
from APPs.Portfolio.schema.resp import (
    RespPortfolioSite,
    RespPortfolioJourneyItem,
    RespPortfolioExperiences,
    RespPortfolioProjects,
    RespPortfolioSkills,
    RespPortfolioSkillCategories,
    RespPortfolioEditSite,
    RespPortfolioEditExperiences,
    RespPortfolioEditProjects,
    RespPortfolioEditCategories,
    RespPortfolioEditSkills,
    RespPortfolioSaved,
)
from COMMON.decorator import cache
from SYSTEM.constants import CacheExpiry, EnumCacheNamespace
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, RoutePortfolio, Tags
from fastapi import Depends, Path as ApiPath

# ◆—< Pack >—————————————————————————————————◆ Common

# ◆—< Pack >—————————————————————————————————◆ Project

# ◆—< Pack >—————————————————————————————————◆ System

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy

# ◆—< Pack >—————————————————————————————————◆ FastAPI

# ◆—< Pack >—————————————————————————————————◆ Python

_PreviewResponse = TypeVar("_PreviewResponse")


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Language Visibility
def _localized_query(statement: Select, *, include_inactive: bool = False) -> Select:
    """
    Apply active-language visibility only to public reads; authorized preview passes an internal override.

    :param statement: Owner/language-scoped ORM statement shared by public and management readers.
    :param include_inactive: Server-selected preview policy, never bound from a client query parameter.
    :return: Public reads exclude disabled languages; management reads retain existing inactive data.

                                                                                               ♂ ZhengLee 2026.10.16
    """
    return statement if include_inactive else statement.where(PortfolioLocale.is_active.is_(True))


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Career Query
def _career_query(locale: str, site_id: int, *columns: Any, include_inactive: bool = False) -> Select:
    """
    Build the localized, owner-scoped career projection shared by Journey and Experiences.

    :param locale: Supported content language selected by the request parser.
    :param site_id: Published portfolio ID resolved before querying or caching content.
    :param columns: Additional columns required by one career representation.
    :param include_inactive: Internal management/preview policy; public calls keep the default False.
    :return: ORM statement with the common career fields, translation and explicit public/management visibility policy.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    statement = (
        select(
            PortfolioCareer.id,
            PortfolioCareer.type,
            PortfolioCareer.country_code,
            PortfolioCareer.start_month,
            PortfolioCareer.end_month,
            PortfolioCareer.end_day,
            PortfolioCareer.expected,
            PortfolioCareer.detail_start_month,
            PortfolioCareer.detail_end_month,
            PortfolioCareer.detail_end_day,
            PortfolioCareerLocale.country_name,
            PortfolioCareerLocale.city,
            PortfolioCareerLocale.organization_name,
            PortfolioCareerLocale.organization_code,
            PortfolioCareerLocale.organization_title,
            PortfolioCareerLocale.detail_content,
            *columns,
        )
        .join(PortfolioCareerLocale, PortfolioCareerLocale.career_id == PortfolioCareer.id)
        .join(PortfolioLocale, PortfolioLocale.code == PortfolioCareerLocale.locale)
        .where(
            PortfolioCareer.site_id == site_id,
            PortfolioCareerLocale.locale == locale,
        )
    )
    if not include_inactive:
        statement = statement.where(PortfolioCareer.visible.is_(True))
    return _localized_query(statement, include_inactive=include_inactive)


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Career Detail
def _career_detail_response(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """
    Map shared career detail columns to the Journey and Experiences response shape.

    :param row: ORM mapping or dictionary with localized detail content and date columns.
    :return: None when content is None; otherwise month strings and an optional endDay.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    if row["detail_content"] is None:
        return None

    detail = {
        "startMonth": row["detail_start_month"].strftime("%Y-%m"),
        "endMonth": (row["detail_end_month"].strftime("%Y-%m") if row["detail_end_month"] else None),
        "content": row["detail_content"],
    }
    if row["detail_end_day"] is not None:
        detail["endDay"] = row["detail_end_day"]
    return detail


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Career Response
def _career_response(row: Mapping[str, Any]) -> dict[str, Any]:
    """
    Format the common career identity, localized text and periods in one place.

    :param row: ORM mapping containing the shared career projection.
    :return: Journey/Experience fields with supplementary detail and an optional actual end day.

                                                                                               ♂ ZhengLee 2026.10.11
    """
    item = {
        "id": row["id"],
        "type": row["type"],
        "countryCode": row["country_code"],
        "countryName": row["country_name"],
        "city": row["city"],
        "organizationName": row["organization_name"],
        "organizationCode": row["organization_code"],
        "organizationTitle": row["organization_title"],
        "startMonth": row["start_month"].strftime("%Y-%m"),
        "endMonth": row["end_month"].strftime("%Y-%m") if row["end_month"] else None,
        "detail": _career_detail_response(row),
    }
    if row["end_day"] is not None:
        item["endDay"] = row["end_day"]
    return item


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Shared Scope
class _PortfolioScopedModule(SqlAlchemyExecAsync):
    """
    Share the resolved portfolio identity and requested language without opening storage.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(self, locale: str = "en", site_id: int = 0, **_: object) -> None:
        """
        Prepare the ORM executor and immutable request selection for a public module.

        :param locale: Supported portfolio content language.
        :param site_id: Resolved portfolio ID supplied by the public visibility dependency.
        :param _: Shared parser values, such as is_caching, not used by the ORM query.
        :return: None; shared ORM helpers open storage when a statement is executed.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        super().__init__()
        self.locale = locale
        self.site_id = site_id

    async def require_site(self) -> None:
        """
        Confirm the selected portfolio exists without imposing publication or owner activation.

        The protected preview calls this after its router authorizes the actor. Public
        routes retain their existing published/active selector before content queries.
        This method checks the target's existence, not the actor's permissions.

        :return: None when the selected site and its owner exist.
        :raises HTTPException: Missing targets return 404; unavailable storage returns 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        statement = (
            select(PortfolioSiteRecord.id)
            .join(AuthUser, AuthUser.id == PortfolioSiteRecord.user_id)
            .where(PortfolioSiteRecord.id == self.site_id)
        )
        try:
            exists = (await self.execute_orm(statement)).scalar_one_or_none()
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE") from None
        if exists is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

    async def _read_preview(self, read: Callable[..., Awaitable[_PreviewResponse]]) -> _PreviewResponse:
        """
        Run an authorized preview read while retaining private domain errors.

        ManagementPermission authorizes the HTTP request before the view calls a
        preview method. This module owns existence checks and content reads; no
        role checks or response-cache lookup are performed here. The internal read
        override includes disabled language records without changing public defaults.

        :param read: Bound content query method; never a client-supplied method name.
        :return: The original response produced by the selected content query.
        :raises HTTPException: Preserve domain errors; unavailable storage returns private 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        try:
            await self.require_site()
            return await read(include_inactive=True)
        except HTTPException as error:
            error.headers = {**(error.headers or {}), **MANAGEMENT_PRIVATE_HEADERS}
            raise
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(
                status_code=503,
                detail="PORTFOLIO_DATABASE_UNAVAILABLE",
                headers=MANAGEMENT_PRIVATE_HEADERS,
            ) from None

    async def _normalized_skill_labels(self, model, identity, ids):
        """Resolve translated labels in one batch; persisted references never copy names."""
        if not ids:
            return {}
        query = (
            select(identity, PortfolioSkillLocale.label)
            .join(
                PortfolioSkillLocale,
                and_(PortfolioSkillLocale.site_id == model.site_id, PortfolioSkillLocale.skill_id == model.skill_id),
            )
            .where(
                model.site_id == self.site_id,
                identity.in_(ids),
                PortfolioSkillLocale.locale == self.locale,
                func.trim(PortfolioSkillLocale.label) != "",
            )
            .order_by(model.position)
        )
        result = {key: [] for key in ids}
        for key, label in (await self.execute_orm(query)).all():
            result[key].append(label)
        return result

    @classmethod
    async def for_owner(cls, actor: RespAuthUser):
        """Resolve /me from the current server identity; client selectors never choose an owner.

        :param actor: Database-refreshed authenticated account supplied by the route dependency.
        :return: This same resource class, pinned to the caller's site.
        :raises HTTPException: The caller has no existing portfolio.
                                                                                               ♂ ZhengLee 2026.10.18
        """
        executor = SqlAlchemyExecAsync()
        identity = (
            await executor.execute_orm(select(PortfolioSiteRecord.id).where(PortfolioSiteRecord.user_id == actor.id))
        ).scalar_one_or_none()
        if identity is None:
            raise HTTPException(404, "PORTFOLIO_SITE_NOT_FOUND", headers=MANAGEMENT_PRIVATE_HEADERS)
        return cls(locale="en", site_id=identity)

    async def _owner_row(self, transaction, actor):
        row = (
            await transaction.execute_orm(
                select(PortfolioSiteRecord)
                .where(PortfolioSiteRecord.id == self.site_id, PortfolioSiteRecord.user_id == actor.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(404, "PORTFOLIO_SITE_NOT_FOUND")
        return row

    async def _document(self, transaction, site):
        """Project normalized tables into one editable snapshot under the site's revision lock.

        :param transaction: Caller-owned transaction; this method never commits or opens another session.
        :param site: Locked owner site row.
        :return: Complete, localized ID-based draft; legacy fixture/import rows remain readable.
                                                                                               ♂ ZhengLee 2026.10.18
        """

        async def rows(model):
            return (await transaction.execute_orm(select(model).where(model.site_id == site.id))).scalars().all()

        text_rows = await rows(PortfolioSiteLocale)
        user = (await transaction.execute_orm(select(AuthUser.user).where(AuthUser.id == site.user_id))).scalar_one()
        profiles = {locale: {key: "" for key in ProfileIntroduction.model_fields} for locale in LOCALES}
        mapping = {
            "firstName": "first_name",
            "familyName": "family_name",
            "nickName": "nick_name",
            "intro": "intro_content",
            "content": "profile_content",
            "eduCode": "edu_code",
            "program": "program",
            "footer": "footer_content",
            "chatTitle": "chat_title",
            "chatSubtitle": "chat_title_sub",
            "chatContent": "chat_content",
        }
        for row in text_rows:
            profiles[row.locale].update({key: getattr(row, column) for key, column in mapping.items()})
        for profile in profiles.values():
            profile["chatIcon"] = site.chat_icon
        first = next((row for row in text_rows if row.locale == "en"), text_rows[0] if text_rows else None)
        draft = dict(
            version=1,
            source=dict(
                siteId=site.id,
                user=user,
                locales=[language for language in LOCALES if any(r.locale == language for r in text_rows)],
            ),
            brand=dict(
                title=first.brand_title if first else user,
                titleSub=first.brand_title_sub if first else "",
                copyrightYear=site.copyright_year,
            ),
            profiles=profiles,
            social={key: getattr(site, key) for key in ("linkedin", "github", "medium", "email")},
            experienceOrder=[],
            experiences={},
            projectOrder=[],
            projects={},
            categoryOrder=[],
            categories={},
            skills={},
        )
        skill_rows, skill_text = await rows(PortfolioSkill), await rows(PortfolioSkillLocale)
        labels = {}
        for row in skill_rows:
            key = f"skill:{row.id}"
            translations = {
                language: next((r.label for r in skill_text if r.skill_id == row.id and r.locale == language), "")
                for language in LOCALES
            }
            draft["skills"][key] = dict(
                id=key, label=next((value for value in translations.values() if value), row.id), labels=translations
            )
            for locale, value in translations.items():
                if value:
                    labels.setdefault((locale, value), key)

        def legacy(values, locale):
            result = []
            for label in values or []:
                key = labels.get((locale, label))
                if key is None:
                    key = "skill:legacy-" + uuid5(NAMESPACE_URL, f"portfolio:{site.id}:skill:{label}").hex
                    item = draft["skills"].setdefault(
                        key, dict(id=key, label=label, labels={language: "" for language in LOCALES})
                    )
                    item["labels"][locale] = label
                    labels[locale, label] = key
                if key not in result:
                    result.append(key)
            return result

        def period(row):
            return dict(
                startMonth=row.start_month.isoformat()[:7],
                endMonth=row.end_month.isoformat()[:7] if row.end_month else "",
                endDay=str(row.end_day) if row.end_day else "",
                expected=row.expected,
            )

        career_rows = sorted(await rows(PortfolioCareer), key=lambda row: (-row.experience_order, row.id))
        career_text = (
            (
                await transaction.execute_orm(
                    select(PortfolioCareerLocale).join(PortfolioCareer).where(PortfolioCareer.site_id == site.id)
                )
            )
            .scalars()
            .all()
        )
        career_links = await rows(PortfolioCareerSkill)
        for row in career_rows:
            key = f"experience:{row.id}"
            translations = {language: {name: "" for name in ProfileExperienceText.model_fields} for language in LOCALES}
            skill_ids = []
            for text in career_text:
                if text.career_id != row.id:
                    continue
                translations[text.locale] = dict(
                    organization=text.organization_name,
                    organizationCode=text.organization_code,
                    title=text.organization_title,
                    city=text.city,
                    country=text.country_name,
                    content=text.content,
                    detail=text.detail_content or "",
                )
                if not row.skills_normalized:
                    skill_ids.extend(k for k in legacy(text.skills, text.locale) if k not in skill_ids)
            if row.skills_normalized:
                skill_ids = [
                    f"skill:{r.skill_id}"
                    for r in sorted(career_links, key=lambda r: r.position)
                    if r.career_id == row.id
                ]
            draft["experienceOrder"].append(key)
            draft["experiences"][key] = dict(
                id=key,
                type=row.type,
                visible=row.visible,
                **period(row),
                countryCode=row.country_code,
                latitude=str(row.latitude),
                longitude=str(row.longitude),
                detail=(
                    dict(
                        startMonth=row.detail_start_month.isoformat()[:7],
                        endMonth=row.detail_end_month.isoformat()[:7] if row.detail_end_month else "",
                    )
                    if row.detail_start_month
                    else None
                ),
                skillIds=skill_ids,
                translations=translations,
            )
        projects = sorted(await rows(PortfolioProject), key=lambda row: row.position)
        project_text = (
            (
                await transaction.execute_orm(
                    select(PortfolioProjectLocale).join(PortfolioProject).where(PortfolioProject.site_id == site.id)
                )
            )
            .scalars()
            .all()
        )
        project_links = await rows(PortfolioProjectSkill)
        for row in projects:
            key = f"project:{row.id}"
            translations = {
                language: {name: ([] if name == "flow" else "") for name in ProfileProjectText.model_fields}
                for language in LOCALES
            }
            skill_ids = []
            for text in project_text:
                if text.project_id != row.id:
                    continue
                translations[text.locale] = dict(
                    name=text.project_name,
                    title=text.project_title,
                    organization=text.organization_name,
                    organizationCode=text.organization_code,
                    organizationTitle=text.organization_title,
                    intro=text.intro,
                    workflow=text.workflow_description or "",
                    flow=text.flow or [],
                    technical=text.technical_description or "",
                    contribution=text.contribution or "",
                    outcome=text.outcome or "",
                )
                if not row.skills_normalized:
                    skill_ids.extend(k for k in legacy(text.skills, text.locale) if k not in skill_ids)
            if row.skills_normalized:
                skill_ids = [
                    f"skill:{r.skill_id}"
                    for r in sorted(project_links, key=lambda r: r.position)
                    if r.project_id == row.id
                ]
            draft["projectOrder"].append(key)
            draft["projects"][key] = dict(
                id=key,
                experienceId=f"experience:{row.experience_id}" if row.experience_id else None,
                visible=row.visible,
                **period(row),
                skillIds=skill_ids,
                translations=translations,
            )
        category_text = await rows(PortfolioSkillCategoryLocale)
        category_links = await rows(PortfolioCategorySkill)
        for row in sorted(await rows(PortfolioSkillCategory), key=lambda row: row.position):
            key = f"category:{row.id}"
            draft["categoryOrder"].append(key)
            draft["categories"][key] = dict(
                id=key,
                visible=row.visible,
                names={
                    language: next(
                        (r.label for r in category_text if r.category_id == row.id and r.locale == language), ""
                    )
                    for language in LOCALES
                },
                skillIds=[
                    f"skill:{r.skill_id}"
                    for r in sorted(category_links, key=lambda r: r.position)
                    if r.category_id == row.id
                ],
            )
        return draft

    async def select_for_edit(self, actor: RespAuthUser, resource: str):
        """Read this owner's hidden/unpublished content without public caching or language fallback."""
        try:
            async with self.transaction() as transaction:
                site = await self._owner_row(transaction, actor)
                draft = await self._document(transaction, site)
                if resource == "site":
                    return dict(
                        revision=site.revision,
                        site={key: draft[key] for key in ("version", "source", "brand", "profiles", "social")},
                    )
                order = {
                    "experiences": "experienceOrder",
                    "projects": "projectOrder",
                    "categories": "categoryOrder",
                }.get(resource)
                return dict(
                    revision=site.revision,
                    items=list(draft[resource].values()),
                    **({"order": draft[order]} if order else {}),
                )
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(503, "PORTFOLIO_DATABASE_UNAVAILABLE") from None

    @staticmethod
    def _merge(entry, changes):
        """Merge submitted fields; translated language slots preserve all unsubmitted languages."""
        if not changes:
            raise HTTPException(422, "EMPTY_PORTFOLIO_CHANGES")
        for key, value in changes.items():
            if key in ("translations", "names", "profiles", "labels", "social") and isinstance(value, dict):
                entry[key] = {**(entry.get(key) or {}), **value}
            else:
                entry[key] = value

    async def _edit(self, actor, expected_revision, mutate, permission=AuthRole.is_update):
        """One revision-checked transaction owns every resource write and optional batch.

        :param mutate: Resource method changing a detached draft, never performing HTTP or commits.
        :return: Committed canonical IDs and the next revision; cache errors report committed state.
        :raises HTTPException: Stale revisions, forbidden operations, invalid references or database failures.
                                                                                               ♂ ZhengLee 2026.10.18
        """
        try:
            async with self.transaction() as transaction:
                await ManagementWriteState(transaction).begin(actor.id, permission)
                site = await self._owner_row(transaction, actor)
                if site.revision != expected_revision:
                    raise HTTPException(409, "PORTFOLIO_EDIT_CONFLICT")
                before = await self._document(transaction, site)
                from copy import deepcopy

                draft = deepcopy(before)
                mutate(draft)
                try:
                    parsed = ProfileDocument.model_validate(draft)
                except (ValidationError, ValueError):
                    raise HTTPException(422, "INVALID_PORTFOLIO_INPUT") from None
                draft = parsed.model_dump(exclude_none=False)
                for resource, field, display in (
                    ("experiences", "translations", "organization"),
                    ("projects", "translations", "name"),
                    ("categories", "names", None),
                ):
                    for identity, entry in draft[resource].items():
                        values = entry[field]
                        present = any((value[display] if display else value).strip() for value in values.values())
                        old = before[resource].get(identity)
                        if not present and (old is None or values != old[field]):
                            raise HTTPException(422, "PORTFOLIO_NAME_REQUIRED")
                # Added/removed identities require their own operation rights even in an atomic save.
                account = (
                    await transaction.execute_orm(
                        select(AuthRole).join(AuthUser, AuthUser.role_id == AuthRole.id).where(AuthUser.id == actor.id)
                    )
                ).scalar_one()
                for entity in ("experiences", "projects", "categories", "skills"):
                    if set(draft[entity]) - set(before[entity]) and not account.is_create:
                        raise HTTPException(403, "PERMISSION_DENIED")
                    if set(before[entity]) - set(draft[entity]) and not account.is_delete:
                        raise HTTPException(403, "PERMISSION_DENIED")
                if draft.get("source") and (
                    draft["source"]["siteId"] != site.id or draft["source"]["user"] != actor.user
                ):
                    raise HTTPException(403, "PORTFOLIO_OWNER_MISMATCH")
                from APPs.Management.constants import SITE_CHAT_ICONS

                icons = {profile["chatIcon"] for profile in draft["profiles"].values()}
                if len(icons) != 1 or (
                    next(iter(icons)) != before["profiles"]["en"]["chatIcon"]
                    and not icons <= {*SITE_CHAT_ICONS, "chat", "robot", "cupHot", "briefcase"}
                ):
                    raise HTTPException(422, "INVALID_PORTFOLIO_ICON")
                await self._persist_document(transaction, site, draft)
                await transaction.execute_orm(
                    update(PortfolioSiteRecord)
                    .where(PortfolioSiteRecord.id == site.id)
                    .values(revision=site.revision + 1)
                )
                await transaction.session.flush()
                next_revision = (
                    await transaction.execute_orm(
                        select(PortfolioSiteRecord.revision).where(PortfolioSiteRecord.id == site.id)
                    )
                ).scalar_one()
                saved = await self._document(transaction, site)
        except IntegrityError:
            raise HTTPException(409, "PORTFOLIO_CONSTRAINT_CONFLICT") from None
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(503, "PORTFOLIO_DATABASE_UNAVAILABLE") from None
        try:
            await PortfolioManagementModule.invalidate_cache()
        except (HTTPException, AssertionError):
            raise HTTPException(
                503, "PORTFOLIO_UPDATE_COMMITTED_CACHE_UNAVAILABLE", headers={"X-Portfolio-Update-State": "committed"}
            ) from None
        return dict(revision=next_revision, draft=saved)

    async def _persist_document(self, transaction, site, draft):
        """Persist identities once; association tables hold ordering and translated labels stay shared.

        All statements use the supplied session. Positive temporary positions avoid
        uniqueness collisions during swaps; the final revision is submitted only by _edit.
                                                                                               ♂ ZhengLee 2026.10.18
        """
        session = transaction.session

        def raw(key, prefix):
            value = key.removeprefix(prefix + ":")
            if not value.strip() or len(value) > 120 or value.strip() != value:
                raise HTTPException(422, "INVALID_PORTFOLIO_ID")
            return value

        async def all_rows(model):
            return (await transaction.execute_orm(select(model).where(model.site_id == site.id))).scalars().all()

        async def offset(model, column):
            maximum = (
                await transaction.execute_orm(select(func.max(column)).where(model.site_id == site.id))
            ).scalar_one() or 0
            await transaction.execute_orm(
                update(model).where(model.site_id == site.id).values({column: column + maximum + 1001})
            )

        async def clear_missing(model, identities):
            await transaction.execute_orm(delete(model).where(model.site_id == site.id, model.id.not_in(identities)))

        skills = {row.id: row for row in await all_rows(PortfolioSkill)}
        skill_text = {(row.skill_id, row.locale): row for row in await all_rows(PortfolioSkillLocale)}
        for key, item in draft["skills"].items():
            identity = raw(key, "skill")
            if identity not in skills:
                session.add(PortfolioSkill(site_id=site.id, id=identity, label_key=f"profile.{identity}"))
        await session.flush()
        for key, item in draft["skills"].items():
            identity = raw(key, "skill")
            labels = item.get("labels") or {locale: item["label"] for locale in LOCALES}
            for locale in LOCALES:
                row = skill_text.get((identity, locale))
                if row is None and not labels.get(locale, ""):
                    continue
                if row is None:
                    row = PortfolioSkillLocale(
                        site_id=site.id, skill_id=identity, locale=locale, label=labels.get(locale, "")
                    )
                    session.add(row)
                else:
                    row.label = labels.get(locale, "")
        # Clear associations before removing/replacing parents; category deletion never deletes skills.
        for model in (PortfolioCareerSkill, PortfolioProjectSkill, PortfolioCategorySkill):
            await transaction.execute_orm(delete(model).where(model.site_id == site.id))
        careers = {f"experience:{row.id}": row for row in await all_rows(PortfolioCareer)}
        projects = {f"project:{row.id}": row for row in await all_rows(PortfolioProject)}
        await offset(PortfolioCareer, PortfolioCareer.journey_position)
        await offset(PortfolioProject, PortfolioProject.position)
        await offset(PortfolioSkillCategory, PortfolioSkillCategory.position)

        def month(value):
            return date.fromisoformat(value + "-01") if value else None

        career_map = {}
        chronological = sorted(draft["experienceOrder"], key=lambda key: (draft["experiences"][key]["startMonth"], key))
        for index, key in enumerate(draft["experienceOrder"]):
            item = draft["experiences"][key]
            row = careers.get(key)
            if row is None:
                if key.startswith("experience:") and key.removeprefix("experience:").isdigit():
                    raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
                row = PortfolioCareer(site_id=site.id)
                session.add(row)
            for name, value in dict(
                type=item["type"],
                country_code=item["countryCode"],
                latitude=float(item["latitude"]),
                longitude=float(item["longitude"]),
                start_month=month(item["startMonth"]),
                end_month=month(item["endMonth"]),
                end_day=int(item["endDay"]) if item["endDay"] else None,
                expected=item["expected"],
                visible=item["visible"],
                skills_normalized=True,
                experience_order=float(len(draft["experienceOrder"]) - index),
                journey_position=chronological.index(key),
                detail_start_month=month(item["detail"]["startMonth"]) if item["detail"] else None,
                detail_end_month=month(item["detail"]["endMonth"]) if item["detail"] else None,
                detail_end_day=None,
            ).items():
                setattr(row, name, value)
            await session.flush()
            career_map[key] = row.id
            translations = (
                (
                    await transaction.execute_orm(
                        select(PortfolioCareerLocale).where(PortfolioCareerLocale.career_id == row.id)
                    )
                )
                .scalars()
                .all()
            )
            for locale, text in item["translations"].items():
                target = next((r for r in translations if r.locale == locale), None)
                if target is None and not any(text.values()):
                    continue
                if target is None:
                    target = PortfolioCareerLocale(career_id=row.id, locale=locale)
                    session.add(target)
                for name, value in dict(
                    organization_name=text["organization"],
                    organization_code=text["organizationCode"],
                    organization_title=text["title"],
                    city=text["city"],
                    country_name=text["country"],
                    content=text["content"],
                    detail_content=text["detail"] or None,
                    skills=[],
                ).items():
                    setattr(target, name, value)
        # A removed career clears project links before its parent row is deleted.
        await transaction.execute_orm(
            update(PortfolioProject).where(PortfolioProject.site_id == site.id).values(experience_id=None)
        )
        project_map = {}
        for index, key in enumerate(draft["projectOrder"]):
            item = draft["projects"][key]
            row = projects.get(key)
            if row is None:
                if key.startswith("project:") and key.removeprefix("project:").isdigit():
                    raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
                row = PortfolioProject(site_id=site.id)
                session.add(row)
            for name, value in dict(
                start_month=month(item["startMonth"]),
                end_month=month(item["endMonth"]),
                end_day=int(item["endDay"]) if item["endDay"] else None,
                expected=item["expected"],
                visible=item["visible"],
                skills_normalized=True,
                position=index,
                experience_id=career_map.get(item["experienceId"]),
            ).items():
                setattr(row, name, value)
            await session.flush()
            project_map[key] = row.id
            translations = (
                (
                    await transaction.execute_orm(
                        select(PortfolioProjectLocale).where(PortfolioProjectLocale.project_id == row.id)
                    )
                )
                .scalars()
                .all()
            )
            for locale, text in item["translations"].items():
                target = next((r for r in translations if r.locale == locale), None)
                if target is None and not any(text.values()):
                    continue
                if target is None:
                    target = PortfolioProjectLocale(project_id=row.id, locale=locale, detail_kind="object")
                    session.add(target)
                for name, value in dict(
                    organization_name=text["organization"],
                    organization_code=text["organizationCode"],
                    organization_title=text["organizationTitle"],
                    project_name=text["name"],
                    project_title=text["title"],
                    intro=text["intro"],
                    workflow_description=text["workflow"],
                    flow=text["flow"],
                    technical_description=text["technical"],
                    contribution=text["contribution"],
                    outcome=text["outcome"],
                    skills=[],
                ).items():
                    setattr(target, name, value)
                if any(text[k] for k in ("workflow", "flow", "technical", "contribution", "outcome")):
                    target.detail_kind = "object"
        categories = {row.id: row for row in await all_rows(PortfolioSkillCategory)}
        category_text = {(row.category_id, row.locale): row for row in await all_rows(PortfolioSkillCategoryLocale)}
        for index, key in enumerate(draft["categoryOrder"]):
            item = draft["categories"][key]
            identity = raw(key, "category")
            row = categories.get(identity)
            if row is None:
                row = PortfolioSkillCategory(site_id=site.id, id=identity, label_key=f"profile.{identity}")
                session.add(row)
            row.position = index
            row.visible = item["visible"]
        await session.flush()
        for key, item in draft["categories"].items():
            identity = raw(key, "category")
            for locale, label in item["names"].items():
                row = category_text.get((identity, locale))
                if row is None and not label:
                    continue
                if row is None:
                    session.add(
                        PortfolioSkillCategoryLocale(site_id=site.id, category_id=identity, locale=locale, label=label)
                    )
                else:
                    row.label = label
        await session.flush()
        for resource, model, parent, column in (
            ("experiences", PortfolioCareerSkill, career_map, "career_id"),
            ("projects", PortfolioProjectSkill, project_map, "project_id"),
            ("categories", PortfolioCategorySkill, None, "category_id"),
        ):
            for key, item in draft[resource].items():
                identity = parent[key] if parent is not None else raw(key, "category")
                for index, skill_id in enumerate(item["skillIds"]):
                    session.add(
                        model(site_id=site.id, **{column: identity}, skill_id=raw(skill_id, "skill"), position=index)
                    )
        await session.flush()
        await clear_missing(PortfolioProject, list(project_map.values()))
        await clear_missing(PortfolioCareer, list(career_map.values()))
        await clear_missing(PortfolioSkillCategory, [raw(key, "category") for key in draft["categories"]])
        await clear_missing(PortfolioSkill, [raw(key, "skill") for key in draft["skills"]])
        site_text = await all_rows(PortfolioSiteLocale)
        brand = draft["brand"]
        first = next((r for r in site_text if r.locale == "en"), site_text[0] if site_text else None)
        brand_changed = first is None or (brand["title"], brand["titleSub"]) != (
            first.brand_title,
            first.brand_title_sub,
        )
        for locale, profile in draft["profiles"].items():
            row = next((r for r in site_text if r.locale == locale), None)
            if row is None and not any(value for key, value in profile.items() if key != "chatIcon"):
                continue
            if row is None:
                row = PortfolioSiteLocale(
                    site_id=site.id, locale=locale, brand_title=brand["title"], brand_title_sub=brand["titleSub"]
                )
                session.add(row)
            if brand_changed:
                row.brand_title = brand["title"]
                row.brand_title_sub = brand["titleSub"]
            for name, key in (
                ("first_name", "firstName"),
                ("family_name", "familyName"),
                ("nick_name", "nickName"),
                ("intro_content", "intro"),
                ("profile_content", "content"),
                ("edu_code", "eduCode"),
                ("program", "program"),
                ("footer_content", "footer"),
                ("chat_title", "chatTitle"),
                ("chat_title_sub", "chatSubtitle"),
                ("chat_content", "chatContent"),
            ):
                setattr(row, name, profile[key])
        await transaction.execute_orm(
            update(PortfolioSiteRecord)
            .where(PortfolioSiteRecord.id == site.id)
            .values(
                **draft["social"], copyright_year=brand["copyrightYear"], chat_icon=draft["profiles"]["en"]["chatIcon"]
            )
        )
        await session.flush()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Shared Page
class _PortfolioPageModule(_PortfolioScopedModule):
    """
    Share numbered page configuration across Experiences, Projects and skill collections.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(self, locale: str = "en", page: int = 1, size: int = 6, site_id: int = 0, **_: object) -> None:
        """
        Prepare one owner-scoped language and the shared numbered pagination values.

        :param locale: Supported portfolio content language.
        :param page: Positive one-based page number.
        :param size: Fixed public page size of six.
        :param site_id: Resolved portfolio ID supplied by the public visibility dependency.
        :param _: Parser values, such as is_caching, not used by the ORM query.
        :return: None; pagination and statements use the inherited ORM execution helpers.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(locale=locale, site_id=site_id)
        self.page = page
        self.size = size


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Site
class PortfolioSiteModule(_PortfolioScopedModule):
    """
    Read one resolved portfolio and its requested language row through ORM.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    async def preview(self) -> dict:
        """
        Read localized site content for an authorized management preview.

        :return: Existing site response, including an unpublished site or disabled owner.
        :raises HTTPException: Missing content returns 404; storage failures return private 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await self._read_preview(self.select)

    async def select(self, *, include_inactive: bool = False) -> dict:
        """
        Return the complete /site response for the selected language.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: Resolved site_id/user and the four localized site content groups.
        :raises HTTPException: The site/translation is missing, or its language is disabled in public mode.
        :raises SQLAlchemyError: The owner-scoped site query fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        stmt = (
            select(PortfolioSiteRecord, PortfolioSiteLocale, AuthUser.user)
            .join(AuthUser, AuthUser.id == PortfolioSiteRecord.user_id)
            .join(PortfolioSiteLocale, PortfolioSiteLocale.site_id == PortfolioSiteRecord.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSiteLocale.locale)
            .where(
                PortfolioSiteRecord.id == self.site_id,
                PortfolioSiteLocale.locale == self.locale,
            )
            .order_by(PortfolioSiteRecord.id)
            .limit(1)
        )
        stmt = _localized_query(stmt, include_inactive=include_inactive)
        row = (await self.execute_orm(stmt)).first()
        if row is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

        site, language, user = row
        return {
            "site_id": site.id,
            "user": user,
            "brand": {
                "title": language.brand_title,
                "titleSub": language.brand_title_sub,
                "copyrightYear": site.copyright_year,
            },
            "profile": {
                "firstName": language.first_name,
                "familyName": language.family_name,
                "nickName": language.nick_name,
                "content": language.profile_content,
                "eduCode": language.edu_code,
                "program": language.program,
                "introContent": language.intro_content,
                "footerContent": language.footer_content,
            },
            "social": {
                "linkedin": site.linkedin,
                "github": site.github,
                "medium": site.medium,
                "email": site.email,
            },
            "chatme": {
                "title": language.chat_title,
                "titleSub": language.chat_title_sub,
                "content": language.chat_content,
                "icon": site.chat_icon,
            },
        }

    async def update(self, actor, body: BodyPortfolioSitePatch):
        """Patch submitted site groups; all other languages and fields retain their current values.

        :param body: Expected revision and explicitly supplied, strictly validated content groups.
        :return: Canonical snapshot after one successful commit.
                                                                                               ♂ ZhengLee 2026.10.18
        """

        def change(draft):
            values = body.model_dump(exclude_unset=True)
            values.pop("expected_revision")
            self._merge(draft, values)
            if values.get("profiles"):
                icons = {profile["chatIcon"] for profile in values["profiles"].values()}
                if len(icons) != 1:
                    raise HTTPException(422, "INVALID_PORTFOLIO_ICON")
                for profile in draft["profiles"].values():
                    profile["chatIcon"] = next(iter(icons))

        return await self._edit(actor, body.expected_revision, change)

    async def save_changes(self, actor, body: BodyPortfolioSave):
        """Commit all editor sections in one transaction; any failed reference rolls back every change.

        :param body: Complete normalized working copy and the revision originally read by the owner.
        :return: Saved draft with database-assigned career/project IDs and the next revision.
                                                                                               ♂ ZhengLee 2026.10.18
        """

        def change(draft):
            source, brand = draft["source"], draft["brand"]
            replacement = body.draft.model_dump()
            if replacement.get("source") and replacement["source"] != source:
                # Source is identity metadata, never a writable owner/language selector.
                if (
                    replacement["source"]["siteId"] != source["siteId"]
                    or replacement["source"]["user"] != source["user"]
                ):
                    raise HTTPException(403, "PORTFOLIO_OWNER_MISMATCH")
            draft.clear()
            draft.update(replacement)
            draft["source"] = source
            draft["brand"] = replacement.get("brand") or brand

        return await self._edit(actor, body.expected_revision, change)


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Journey
class PortfolioJourneyModule(_PortfolioScopedModule):
    """
    Read the ordered career journey in the requested content language.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    async def preview(self) -> list[dict]:
        """
        Read the recorded career journey for an authorized management preview.

        :return: Existing ordered journey response for the selected portfolio and language.
        :raises HTTPException: Missing sites return 404; storage failures return private 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await self._read_preview(self.select)

    async def select(self, *, include_inactive: bool = False) -> list[dict]:
        """
        Return journey records in their stored playback order.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: Localized journey items, or an empty list when there are none.
        :raises SQLAlchemyError: The shared owner-scoped career query fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        stmt = _career_query(
            self.locale,
            self.site_id,
            PortfolioCareer.latitude,
            PortfolioCareer.longitude,
            include_inactive=include_inactive,
        ).order_by(PortfolioCareer.journey_position, PortfolioCareer.id)
        rows = (await self.execute_orm(stmt)).mappings().all()
        journey = []
        for row in rows:
            item = {
                **_career_response(row),
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "expected": row["expected"],
            }
            journey.append(item)

        return journey


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Experiences
class PortfolioExperiencesModule(_PortfolioPageModule):
    """
    Read one page of localized career experiences through ORM pagination.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    async def preview(self) -> dict:
        """
        Read one experience page for an authorized management preview.

        :return: Existing numbered experience response for the selected portfolio and language.
        :raises HTTPException: Missing sites return 404; storage failures return private 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await self._read_preview(self.select)

    async def select(self, *, include_inactive: bool = False) -> dict:
        """
        Return an ordered experience page with total and page counts.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: Page metadata and localized experience items.
        :raises SQLAlchemyError: The career page or its count query fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        stmt = _career_query(
            self.locale,
            self.site_id,
            PortfolioCareer.experience_order,
            PortfolioCareerLocale.content,
            PortfolioCareerLocale.skills,
            PortfolioCareer.skills_normalized,
            include_inactive=include_inactive,
        ).order_by(PortfolioCareer.experience_order.desc(), PortfolioCareer.id.desc())
        result = await self.paginate_orm(stmt, page=self.page, size=self.size, unique=False)
        labels = await self._normalized_skill_labels(
            PortfolioCareerSkill,
            PortfolioCareerSkill.career_id,
            [row["id"] for row in result.items if row["skills_normalized"]],
        )
        items = []
        for row in result.items:
            order = row["experience_order"]
            item = {
                **_career_response(row),
                "order": int(order) if order.is_integer() else order,
                "content": row["content"],
                "skills": labels.get(row["id"], row["skills"]),
            }
            if row["expected"]:
                item["expected"] = True
            items.append(item)

        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()

    async def create(self, actor, body: BodyPortfolioExperienceCreate):
        """Create one owner record with its translations; shared identities are validated before commit.

        ♂ ZhengLee 2026.10.18
        """

        def change(draft):
            entry = body.entry.model_dump()
            if entry["id"] in draft["experiences"]:
                raise HTTPException(409, "PORTFOLIO_ID_EXISTS")
            draft["experiences"][entry["id"]] = entry
            draft["experienceOrder"].insert(0, entry["id"])

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_create)

    async def update(self, actor, item_id: int, body: BodyPortfolioExperiencePatch):
        """Update one existing owner record; immutable IDs and other owners remain untouched."""

        def change(draft):
            key = "experience:" + str(item_id)
            if key not in draft["experiences"]:
                raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
            self._merge(draft["experiences"][key], body.changes.model_dump(exclude_unset=True))

        return await self._edit(actor, body.expected_revision, change)

    async def delete(self, actor, item_id: int, body: BodyPortfolioRevision):
        """Delete one record atomically; its shared skill library is preserved."""

        def change(draft):
            key = "experience:" + str(item_id)
            if key not in draft["experiences"]:
                raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
            del draft["experiences"][key]
            draft["experienceOrder"].remove(key)
            for project in draft["projects"].values():
                if project["experienceId"] == key:
                    project["experienceId"] = None

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_delete)

    async def reorder(self, actor, body: BodyPortfolioOrder):
        """Replace the complete display order; omitted, repeated and foreign IDs are rejected."""

        def change(draft):
            if set(body.ids) != set(draft["experienceOrder"]):
                raise HTTPException(422, "INVALID_PORTFOLIO_ORDER")
            draft["experienceOrder"] = body.ids

        return await self._edit(actor, body.expected_revision, change)


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Projects
class PortfolioProjectsModule(_PortfolioPageModule):
    """
    Read one page of localized projects in their stored display order.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    async def preview(self) -> dict:
        """
        Read one project page for an authorized management preview.

        :return: Existing numbered project response for the selected portfolio and language.
        :raises HTTPException: Missing sites return 404; storage failures return private 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await self._read_preview(self.select)

    async def select(self, *, include_inactive: bool = False) -> dict:
        """
        Return an ordered project page with complete localized details.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: Page metadata and project items, including nullable details and skills.
        :raises SQLAlchemyError: The project page or its count query fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        stmt = (
            select(
                PortfolioProject.id,
                PortfolioProject.start_month,
                PortfolioProject.end_month,
                PortfolioProject.expected,
                PortfolioProject.end_day,
                PortfolioProject.skills_normalized,
                func.coalesce(PortfolioCareerLocale.organization_name, PortfolioProjectLocale.organization_name).label(
                    "organization_name"
                ),
                func.coalesce(PortfolioCareerLocale.organization_code, PortfolioProjectLocale.organization_code).label(
                    "organization_code"
                ),
                func.coalesce(
                    PortfolioCareerLocale.organization_title, PortfolioProjectLocale.organization_title
                ).label("organization_title"),
                PortfolioProjectLocale.project_name,
                PortfolioProjectLocale.project_title,
                PortfolioProjectLocale.intro,
                PortfolioProjectLocale.skills,
                PortfolioProjectLocale.detail_kind,
                PortfolioProjectLocale.workflow_description,
                PortfolioProjectLocale.flow,
                PortfolioProjectLocale.technical_description,
                PortfolioProjectLocale.contribution,
                PortfolioProjectLocale.outcome,
            )
            .join(
                PortfolioProjectLocale,
                PortfolioProjectLocale.project_id == PortfolioProject.id,
            )
            .outerjoin(
                PortfolioCareerLocale,
                and_(
                    PortfolioCareerLocale.career_id == PortfolioProject.experience_id,
                    PortfolioCareerLocale.locale == self.locale,
                ),
            )
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioProjectLocale.locale)
            .where(
                PortfolioProject.site_id == self.site_id,
                PortfolioProjectLocale.locale == self.locale,
            )
            .order_by(PortfolioProject.position, PortfolioProject.id)
        )
        if not include_inactive:
            stmt = stmt.where(PortfolioProject.visible.is_(True))
        stmt = _localized_query(stmt, include_inactive=include_inactive)
        result = await self.paginate_orm(stmt, page=self.page, size=self.size, unique=False)
        labels = await self._normalized_skill_labels(
            PortfolioProjectSkill,
            PortfolioProjectSkill.project_id,
            [row["id"] for row in result.items if row["skills_normalized"]],
        )
        items = []
        for row in result.items:
            detail = (
                {
                    "workflowDescription": row["workflow_description"],
                    "flow": row["flow"],
                    "technicalDescription": row["technical_description"],
                    "contribution": row["contribution"],
                    "outcome": row["outcome"],
                }
                if row["detail_kind"] == "object"
                else None
            )

            items.append(
                {
                    "id": row["id"],
                    "organizationName": row["organization_name"],
                    "organizationCode": row["organization_code"],
                    "organizationTitle": row["organization_title"],
                    "startMonth": row["start_month"].strftime("%Y-%m"),
                    "endMonth": (row["end_month"].strftime("%Y-%m") if row["end_month"] else None),
                    "expected": row["expected"],
                    **({"endDay": row["end_day"]} if row["end_day"] else {}),
                    "projectName": row["project_name"],
                    "projectTitle": row["project_title"],
                    "intro": row["intro"],
                    "detail": detail,
                    "skills": labels.get(row["id"], row["skills"]),
                }
            )

        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()

    async def create(self, actor, body: BodyPortfolioProjectCreate):
        """Create one owner record with its translations; shared identities are validated before commit.

        ♂ ZhengLee 2026.10.18
        """

        def change(draft):
            entry = body.entry.model_dump()
            if entry["id"] in draft["projects"]:
                raise HTTPException(409, "PORTFOLIO_ID_EXISTS")
            draft["projects"][entry["id"]] = entry
            draft["projectOrder"].insert(0, entry["id"])

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_create)

    async def update(self, actor, item_id: int, body: BodyPortfolioProjectPatch):
        """Update one existing owner record; immutable IDs and other owners remain untouched."""

        def change(draft):
            key = "project:" + str(item_id)
            if key not in draft["projects"]:
                raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
            self._merge(draft["projects"][key], body.changes.model_dump(exclude_unset=True))

        return await self._edit(actor, body.expected_revision, change)

    async def delete(self, actor, item_id: int, body: BodyPortfolioRevision):
        """Delete one record atomically; its shared skill library is preserved."""

        def change(draft):
            key = "project:" + str(item_id)
            if key not in draft["projects"]:
                raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
            del draft["projects"][key]
            draft["projectOrder"].remove(key)

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_delete)

    async def reorder(self, actor, body: BodyPortfolioOrder):
        """Replace the complete display order; omitted, repeated and foreign IDs are rejected."""

        def change(draft):
            if set(body.ids) != set(draft["projectOrder"]):
                raise HTTPException(422, "INVALID_PORTFOLIO_ORDER")
            draft["projectOrder"] = body.ids

        return await self._edit(actor, body.expected_revision, change)


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
class PortfolioSkillsModule(_PortfolioPageModule):
    """
    Read category and skill collections with the shared numbered response.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(
        self,
        locale: str = "en",
        page: int = 1,
        size: int = 6,
        site_id: int = 0,
        owner_type: str | None = None,
        owner_id: str | None = None,
        **_: object,
    ) -> None:
        """
        Prepare the requested language, numbered page, and optional category owner.

        :param site_id: Resolved portfolio ID supplied by the public visibility dependency.
        :param locale: Supported content language.
        :param page: Positive one-based page number.
        :param size: Shared fixed page size of six, also used for skill previews.
        :param owner_type: Skill owner kind; only category is supported.
        :param owner_id: Category slug when querying its skills.
        :param _: Parser values, such as is_caching, not used by the ORM query.
        :return: None; each ORM query opens its own session when executed.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        super().__init__(locale=locale, page=page, size=size, site_id=site_id)
        self.owner_type = owner_type
        self.owner_id = owner_id

    async def preview_categories(self) -> dict:
        """
        Read one category page and nested skills for an authorized management preview.

        :return: Existing numbered category response with its bounded nested skill pages.
        :raises HTTPException: Missing sites return 404; storage failures return private 503.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await self._read_preview(self.select_categories)

    async def preview_skills(self) -> dict:
        """
        Read one category-owned skill page for an authorized management preview.

        :return: Existing numbered skill response for the selected category and language.
        :raises HTTPException: Invalid owners, missing content, or unavailable storage retain private errors.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return await self._read_preview(self.select_skills)

    def _skill_query(self, *, include_inactive: bool = False) -> Select:
        """
        Select ordered category membership with one localized label per skill.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: A SQLAlchemy Select with category, skill, ordering and label columns.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        statement = (
            select(
                PortfolioCategorySkill.category_id.label("category_id"),
                PortfolioCategorySkill.skill_id.label("id"),
                PortfolioCategorySkill.position.label("position"),
                PortfolioSkillLocale.label.label("label"),
            )
            .join(
                PortfolioSkill,
                and_(
                    PortfolioSkill.site_id == PortfolioCategorySkill.site_id,
                    PortfolioSkill.id == PortfolioCategorySkill.skill_id,
                ),
            )
            .join(
                PortfolioSkillLocale,
                and_(
                    PortfolioSkillLocale.site_id == PortfolioSkill.site_id,
                    PortfolioSkillLocale.skill_id == PortfolioSkill.id,
                ),
            )
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSkillLocale.locale)
            .where(
                PortfolioCategorySkill.site_id == self.site_id,
                PortfolioSkillLocale.locale == self.locale,
                func.trim(PortfolioSkillLocale.label) != "",
            )
        )
        return _localized_query(statement, include_inactive=include_inactive)

    def _category_query(self, *, include_inactive: bool = False) -> Select:
        """
        Build the localized category projection used by listing and owner validation.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: ORM statement with composite owner joins and one requested-language label per category.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        statement = (
            select(
                PortfolioSkillCategory.id.label("id"),
                PortfolioSkillCategory.position.label("position"),
                PortfolioSkillCategoryLocale.label.label("label"),
            )
            .join(
                PortfolioSkillCategoryLocale,
                and_(
                    PortfolioSkillCategoryLocale.site_id == PortfolioSkillCategory.site_id,
                    PortfolioSkillCategoryLocale.category_id == PortfolioSkillCategory.id,
                ),
            )
            .join(
                PortfolioLocale,
                PortfolioLocale.code == PortfolioSkillCategoryLocale.locale,
            )
            .where(
                PortfolioSkillCategory.site_id == self.site_id,
                PortfolioSkillCategoryLocale.locale == self.locale,
            )
        )
        if not include_inactive:
            statement = statement.where(PortfolioSkillCategory.visible.is_(True))
        return _localized_query(statement, include_inactive=include_inactive)

    async def select_categories(self, *, include_inactive: bool = False) -> dict:
        """
        Return a numbered category page with the first skill page in each item.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: The common items/total/pages/page/size response, including nested skill pages.
        :raises SQLAlchemyError: The category page, count or batched skill preview query fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        category_query = self._category_query(include_inactive=include_inactive).order_by(
            PortfolioSkillCategory.position, PortfolioSkillCategory.id
        )
        result = await self.paginate_orm(category_query, page=self.page, size=self.size, unique=False)
        category_rows = result.items
        items = []
        if category_rows:
            category_ids = [row["id"] for row in category_rows]
            membership = self._skill_query(include_inactive=include_inactive).where(
                PortfolioCategorySkill.category_id.in_(category_ids)
            )
            ranked = membership.add_columns(
                func.row_number()
                .over(
                    partition_by=(
                        PortfolioCategorySkill.site_id,
                        PortfolioCategorySkill.category_id,
                    ),
                    order_by=(
                        PortfolioCategorySkill.position,
                        PortfolioCategorySkill.skill_id,
                    ),
                )
                .label("row_number"),
                func.count()
                .over(
                    partition_by=(
                        PortfolioCategorySkill.site_id,
                        PortfolioCategorySkill.category_id,
                    )
                )
                .label("total"),
            ).subquery()
            preview_rows = (
                (
                    await self.execute_orm(
                        select(ranked)
                        .where(ranked.c.row_number <= self.size)
                        .order_by(ranked.c.category_id, ranked.c.row_number)
                    )
                )
                .mappings()
                .all()
            )
            previews = {category_id: [] for category_id in category_ids}
            for row in preview_rows:
                previews[row["category_id"]].append(row)
            for category in category_rows:
                members = previews[category["id"]]
                skills = [{"id": member["id"], "label": member["label"]} for member in members]
                items.append(
                    {
                        "id": category["id"],
                        "label": category["label"],
                        "skills": RespRecords.from_records(
                            skills,
                            total=members[0]["total"] if members else 0,
                            page=1,
                            size=self.size,
                        ).model_dump(),
                    }
                )
        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()

    async def select_skills(self, *, include_inactive: bool = False) -> dict:
        """
        Return a numbered skill page in the requested category's membership order.

        :param include_inactive: Internal management/preview policy; public calls keep the default False.

        :return: The common items/total/pages/page/size response with localized skill labels.
        :raises HTTPException: The owner is unsupported, empty, or absent in this language.
        :raises SQLAlchemyError: Category validation, skill pagination or its count query fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if self.owner_type != "category" or not self.owner_id:
            raise HTTPException(status_code=400, detail="INVALID_OWNER")
        owner = (
            self._category_query(include_inactive=include_inactive)
            .where(PortfolioSkillCategory.id == self.owner_id)
            .limit(1)
        )
        if (await self.execute_orm(owner)).first() is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")
        query = (
            self._skill_query(include_inactive=include_inactive)
            .where(PortfolioCategorySkill.category_id == self.owner_id)
            .order_by(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id)
        )
        result = await self.paginate_orm(query, page=self.page, size=self.size, unique=False)
        items = [{"id": row["id"], "label": row["label"]} for row in result.items]
        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()

    @staticmethod
    def _entry_key(entries, item_id, prefix):
        key = item_id if item_id in entries else f"{prefix}:{item_id}"
        if key not in entries:
            raise HTTPException(404, "PORTFOLIO_ENTRY_NOT_FOUND")
        return key

    async def create_category(self, actor, body: BodyPortfolioCategoryCreate):
        """Create a translated category; memberships reference this owner's existing skills."""

        def change(draft):
            entry = body.entry.model_dump()
            if entry["id"] in draft["categories"]:
                raise HTTPException(409, "PORTFOLIO_ID_EXISTS")
            draft["categories"][entry["id"]] = entry
            draft["categoryOrder"].append(entry["id"])

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_create)

    async def update_category(self, actor, item_id, body: BodyPortfolioCategoryPatch):
        """Patch category text or visibility without duplicating the skill library."""

        def change(draft):
            key = self._entry_key(draft["categories"], item_id, "category")
            self._merge(draft["categories"][key], body.changes.model_dump(exclude_unset=True))

        return await self._edit(actor, body.expected_revision, change)

    async def delete_category(self, actor, item_id, body: BodyPortfolioRevision):
        """Delete the category and its memberships; preserve every referenced skill identity."""

        def change(draft):
            key = self._entry_key(draft["categories"], item_id, "category")
            del draft["categories"][key]
            draft["categoryOrder"].remove(key)

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_delete)

    async def reorder_categories(self, actor, body: BodyPortfolioOrder):
        """Store an exact, owner-scoped category order in one transaction."""

        def change(draft):
            if set(body.ids) != set(draft["categoryOrder"]):
                raise HTTPException(422, "INVALID_PORTFOLIO_ORDER")
            draft["categoryOrder"] = body.ids

        return await self._edit(actor, body.expected_revision, change)

    async def create_skill(self, actor, body: BodyPortfolioSkillCreate):
        """Create one reusable translated skill, independently of category membership."""

        def change(draft):
            entry = body.entry.model_dump()
            if entry["id"] in draft["skills"]:
                raise HTTPException(409, "PORTFOLIO_ID_EXISTS")
            draft["skills"][entry["id"]] = entry

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_create)

    async def update_skill(self, actor, item_id, body: BodyPortfolioSkillPatch):
        """Rename the shared identity; every public experience/project/category reads its labels."""

        def change(draft):
            key = self._entry_key(draft["skills"], item_id, "skill")
            changes = body.changes.model_dump(exclude_unset=True)
            if "label" in changes and "labels" not in changes:
                changes["labels"] = {**(draft["skills"][key].get("labels") or {}), "en": changes["label"]}
            self._merge(draft["skills"][key], changes)

        return await self._edit(actor, body.expected_revision, change)

    async def delete_skill(self, actor, item_id, body: BodyPortfolioRevision):
        """Reject deletion while a category, career or project still references the skill."""

        def change(draft):
            key = self._entry_key(draft["skills"], item_id, "skill")
            if any(
                key in item["skillIds"]
                for resource in ("categories", "experiences", "projects")
                for item in draft[resource].values()
            ):
                raise HTTPException(409, "PORTFOLIO_SKILL_IN_USE")
            del draft["skills"][key]

        return await self._edit(actor, body.expected_revision, change, AuthRole.is_delete)

    async def set_category_skills(self, actor, item_id, body: BodyPortfolioOrder):
        """Replace ordered membership; removal affects only this category, never the skill itself."""

        def change(draft):
            key = self._entry_key(draft["categories"], item_id, "category")
            if not set(body.ids) <= draft["skills"].keys():
                raise HTTPException(422, "INVALID_PORTFOLIO_REFERENCES")
            draft["categories"][key]["skillIds"] = body.ids

        return await self._edit(actor, body.expected_revision, change)


__all__ = (
    "PortfolioSiteModule",
    "PortfolioJourneyModule",
    "PortfolioExperiencesModule",
    "PortfolioProjectsModule",
    "PortfolioSkillsModule",
)


# ◆—< Pack >—————————————————————————————————◆ Project

# ◆—< Pack >—————————————————————————————————◆ Common

# ◆—< Pack >—————————————————————————————————◆ System

# ◆—< Pack >—————————————————————————————————◆ FastAPI

router = FastApiRouter(prefix=PreFix.PORTFOLIO, tags=Tags.PORTFOLIO, route_class=PortfolioEditRoute)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Public Scope
_PUBLIC_VISIBILITY_DESCRIPTION = (
    "- Drafts, disabled accounts, unknown portfolios, and a missing default return 404 without fallback.\n"
    "- Owner and language activation plus publication are checked before every cache lookup; role login status does not unpublish content.\n\n"
)

_SITE_SCOPE_DESCRIPTION = (
    "👤 **Portfolio Selection:**\n"
    "- Omit `user` and `site_id` to read the published default portfolio, regardless of your login SESSION.\n"
    "- Use `user=zhenglee315` for a public account, or `site_id=1` to pin the Site API identity.\n"
    "- Supply only one selector; supplying both returns 400 `INVALID_SITE_SELECTOR`.\n"
    "- Return `site_id` once, then use that ID on the other five content APIs.\n" + _PUBLIC_VISIBILITY_DESCRIPTION
)

_CONTENT_SCOPE_DESCRIPTION = (
    "👤 **Portfolio Selection:**\n"
    "- Omit `site_id` to read the published default portfolio, regardless of your login SESSION.\n"
    "- Use `site_id=1` from the Site API response to pin the portfolio on every content request.\n"
    "- This endpoint accepts only `site_id`; supplying `user` returns 400 `INVALID_SITE_SELECTOR`.\n"
    + _PUBLIC_VISIBILITY_DESCRIPTION
)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Caching
_PUBLIC_CACHING_DESCRIPTION = (
    "⚡ **Caching:**\n"
    "- Set `is_caching=true` to allow a response cached for up to 60 seconds.\n"
    "- Omit the flag or set it to `false` to read the database for this request.\n\n"
)

# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Numbered Collections
_NUMBERED_PAGE_DESCRIPTION = (
    "📄 **Pagination:**\n"
    "- `page` starts at 1 and defaults to 1.\n"
    "- `size` defaults to and must equal 6; `all` is not supported.\n"
    "- `total` counts matching items in the selected portfolio and language; `pages` counts available pages.\n"
    "- Empty collections have `items=[]` and `pages=0`.\n"
    "- A page beyond the end returns an empty `items` array and retains the requested page.\n\n"
)


# ■—< DESC >——————————————————————————————————————————————————————————————————————————■ Portfolio - Owner Editing
_OWNER_READ_DESCRIPTION = (
    "👤 **Portfolio Selection:**\n"
    "- Requires a current enabled SESSION with is_read=true; /me resolves only the signed-in owner's existing site.\n"
    "- No user, site_id, locale, page or cache selector is accepted; all three language slots are returned.\n\n"
    "🗂️ **How It Works:**\n"
    "- Returns complete ID-based content, including hidden items and unpublished portfolios.\n"
    "- Missing translations remain empty; each shared skill is stored once.\n"
    "- revision identifies the content snapshot; read all five resources at the same revision.\n\n"
    "📦 **Response & Cache:**\n"
    "- Site returns revision/site; collections return revision/items and their order where applicable.\n"
    "- Private, no-store, Vary: Cookie; these responses never populate public portfolio caches.\n"
)
_OWNER_WRITE_RESPONSES = {
    400: {"description": "Invalid query, origin/body transport or JSON."},
    401: {"description": "Current enabled SESSION is required."},
    403: {"description": "Operation permission or ownership is denied."},
    404: {"description": "The owner's existing site or resource is missing."},
    409: {"description": "Stale revision, identity/order conflict or skill still in use."},
    413: {"description": "Uncompressed JSON exceeds 2,000,000 bytes."},
    415: {"description": "Uncompressed application/json is required."},
    422: {"description": "Invalid fields, dates, coordinates, identities or references."},
    503: {"description": "Storage unavailable; a committed cache failure is explicitly identified."},
}


def _owner_example(kind, identity):
    """Provide executable Swagger request examples, using synthetic content only."""
    if kind == "skill":
        return dict(id=identity, label="Python", labels={language: "Python" for language in LOCALES})
    if kind == "category":
        return dict(id=identity, names={language: "Backend" for language in LOCALES}, visible=True, skillIds=[])
    period = dict(startMonth="2024-01", endMonth="2024-12", endDay="", expected=False)
    if kind == "experience":
        text = {key: "" for key in ProfileExperienceText.model_fields}
        text.update(
            organization="Example Studio",
            title="Engineer",
            city="London",
            country="United Kingdom",
            content="Delivered useful systems.",
        )
        return dict(
            id=identity,
            type="work",
            visible=True,
            **period,
            countryCode="GBR",
            latitude="51.5",
            longitude="-0.1",
            detail=None,
            skillIds=[],
            translations={language: text.copy() for language in LOCALES},
        )
    text = {key: ([] if key == "flow" else "") for key in ProfileProjectText.model_fields}
    text.update(name="Example project", intro="A useful application.")
    return dict(
        id=identity,
        experienceId=None,
        visible=True,
        **period,
        skillIds=[],
        translations={language: text.copy() for language in LOCALES},
    )


def _owner_write_description(permission, behavior, example):
    """Share the established description sections; each route adds its concrete operation contract."""
    import json

    if "entry" in example and set(example["entry"]) == {"id"}:
        identity = example["entry"]["id"]
        example = {**example, "entry": _owner_example(identity.split("-", 1)[0], identity)}
    if isinstance(example.get("draft"), str):
        profile = {key: "" for key in ProfileIntroduction.model_fields}
        profile.update(firstName="Alex", content="Build useful systems.", chatIcon="chat")
        example = {
            **example,
            "draft": dict(
                version=1,
                profiles={language: profile.copy() for language in LOCALES},
                social={key: "" for key in ("linkedin", "github", "medium", "email")},
                experienceOrder=[],
                experiences={},
                projectOrder=[],
                projects={},
                categoryOrder=[],
                categories={},
                skills={},
            ),
        }

    return (
        "👤 **Portfolio Selection & Permission:**\n"
        f"- Requires the current enabled SESSION with {permission}=true; writes target only its owner's site.\n"
        "- PK ownership, global Default/publication, account settings and request-selected owners are not writable.\n\n"
        "📨 **Write Content:**\n" + behavior + "\n"
        "- Send uncompressed application/json, up to 2,000,000 bytes; unknown fields, duplicate JSON keys, coercion and non-finite numbers are rejected.\n"
        "- Shared values and ID associations are language-independent; translations contain en/zh-Hans/zh-Hant slots.\n"
        "- Text is plain text, links use HTTP(S), and contact artwork must be bundled/allowlisted.\n\n"
        "🔄 **Transaction & Revision:**\n"
        "- expected_revision must equal the owner's current content revision; otherwise 409 PORTFOLIO_EDIT_CONFLICT changes nothing.\n"
        "- All statements commit once or roll back together; shared references must belong to the same site.\n"
        "- A successful write increments revision and returns the complete canonical draft; new career/project IDs are assigned by the database.\n"
        "- Replacing order uses the complete unique ID array, never individual index swaps.\n\n"
        "📦 **Response & Cache:**\n"
        "- Returns {revision, draft}; private/no-store. Public portfolio caches are invalidated after commit.\n"
        "- A post-commit cache failure returns 503 PORTFOLIO_UPDATE_COMMITTED_CACHE_UNAVAILABLE and X-Portfolio-Update-State: committed; do not retry automatically.\n"
        "- Input/storage errors omit submitted content and internal database details.\n\n"
        "📝 **Request Example:**\n```json\n" + json.dumps(example, ensure_ascii=False, indent=2) + "\n```"
    )


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Site
@cbv(router)
class PortfolioSite:
    """
    Serve the localized public site content through a class-based view.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    path = RoutePortfolio.SITE

    @router.get(
        path,
        summary="Query Portfolio Site Content",
        description=(
            _SITE_SCOPE_DESCRIPTION
            + "Retrieve the website's localized brand, profile, social links, and chat entry.\n\n"
            "🌐 **Language:**\n"
            "- Use `locale=en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- All text is returned in the requested language.\n\n"
            "🗂️ **How It Works:**\n"
            "- Reads the resolved portfolio settings and one matching translation through the ORM.\n"
            "- Returns the four content groups `brand`, `profile`, `social`, and `chatme`.\n"
            "- This endpoint returns one site record and does not use pagination.\n\n"
            + _PUBLIC_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "site_id": 1, "user": "zhenglee315",\n'
            '  "brand": {"title": "ZL", "titleSub": "WILSON", "copyrightYear": 2026},\n'
            '  "profile": {"firstName": "Zheng", "familyName": "Lee", "nickName": "Wilson",\n'
            '    "content": "Profile introduction", "eduCode": "UCL", "program": "MSc Software Systems Engineering",\n'
            '    "introContent": "Introductory line", "footerContent": "Footer tagline"},\n'
            '  "social": {"linkedin": "https://www.linkedin.com/in/zhenglee315",\n'
            '    "github": "https://github.com/zhenglee315", "medium": "", "email": "zhenglee315@gmail.com"},\n'
            '  "chatme": {"title": "London", "titleSub": "OPEN TO INTERNSHIPS",\n'
            '    "content": "Chat copy", "icon": "assets/icons/cow-engineer.svg"}\n'
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- Social links can be empty strings; the website hides those links.\n"
            "- Chat copy is plain text and keeps its line breaks.\n"
            "- An unsupported locale returns 400; missing site content returns 404."
        ),
        response_model=RespPortfolioSite,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.PORTFOLIO)
    async def get_site(self, query_string: dict = Depends(parser_portfolio_site)) -> dict:
        """
        Return the localized site content assembled by the portfolio module.

        :param query_string: Resolved visible site ID, language and caching parameters.
        :return: Resolved site_id/user and the four localized site content groups.
        :raises HTTPException: Selectors, language, portfolio visibility or localized site content are invalid.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        return await PortfolioSiteModule(**query_string).select()

    @router.get(
        "/me/site",
        summary="Query My Portfolio Site",
        description=_OWNER_READ_DESCRIPTION,
        response_model=RespPortfolioEditSite,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def get_owned_site(self, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_read))) -> dict:
        """Read all owner content through the same class used for the established public projection.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSiteModule.for_owner(actor)
        return await resource.select_for_edit(actor, "site")

    @router.patch(
        "/site",
        summary="Update My Portfolio Site Content",
        description=_owner_write_description(
            "is_update",
            "- Patch only submitted profiles/social/brand groups. Unsubmitted language slots retain their values.",
            {
                "expected_revision": 7,
                "social": {
                    "linkedin": "",
                    "github": "https://github.com/example",
                    "medium": "",
                    "email": "hello@example.com",
                },
            },
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def patch_site(
        self, body: BodyPortfolioSitePatch, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update))
    ) -> dict:
        """Keep site writes and the existing public Site query in their original CBV."""
        resource = await PortfolioSiteModule.for_owner(actor)
        return await resource.update(actor, body)

    @router.post(
        "/site/save",
        summary="Save My Complete Portfolio Content",
        description=_owner_write_description(
            "is_update",
            "- Submit the complete normalized working copy as draft. Every section commits together or rolls back together.\n- Added identities also require is_create; removed identities also require is_delete. Existing saved fields must pass the current revision check.",
            {
                "expected_revision": 7,
                "draft": "Use the complete normalized draft assembled from the five /me reads; see the request schema.",
            },
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def save_site(
        self, body: BodyPortfolioSave, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update))
    ) -> dict:
        """Save the whole editor with one shared transaction, never separately committed HTTP calls."""
        resource = await PortfolioSiteModule.for_owner(actor)
        return await resource.save_changes(actor, body)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Journey
@cbv(router)
class PortfolioJourney:
    """
    Serve the localized career journey in its recorded playback order.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    path = RoutePortfolio.JOURNEY

    @router.get(
        path,
        summary="Query Portfolio Journey",
        description=(
            _CONTENT_SCOPE_DESCRIPTION
            + "Retrieve the complete journey used by the portfolio map and career timeline.\n\n"
            "🌐 **Language:**\n"
            "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- Country, city, organization, role, and detail text use the requested language.\n\n"
            "🗺️ **Order and Map:**\n"
            "- Records follow the stored journey order, from the earliest stop onward.\n"
            "- The frontend uses this order for map playback and does not sort the array.\n"
            "- `countryCode`, `latitude`, and `longitude` identify each map stop.\n"
            "- The same career `id` is used by the Experiences API.\n\n"
            "📅 **Periods and Details:**\n"
            "- `startMonth` and `endMonth` use `YYYY-MM`; a null `endMonth` means ongoing.\n"
            "- `endDay` appears only when an actual end day is recorded.\n"
            "- `expected` marks a planned period; it is not inferred from today's date.\n"
            "- `detail` is null when there is no supplementary period or text.\n\n"
            + _PUBLIC_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "[\n"
            "  {\n"
            '    "id": 1, "countryCode": "TWN", "countryName": "Taiwan", "city": "New Taipei",\n'
            '    "latitude": 25.03, "longitude": 121.432, "type": "education",\n'
            '    "startMonth": "2017-09", "endMonth": "2019-07", "expected": false,\n'
            '    "organizationName": "Fu Jen Catholic University",\n'
            '    "organizationCode": "Fu Jen University",\n'
            '    "organizationTitle": "MS Information Management",\n'
            '    "detail": {"startMonth": "2017-09", "endMonth": "2019-06",\n'
            '      "content": "Python Instructor / Teaching Assistant"}\n'
            "  }\n"
            "]\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- The response is a direct array with no pagination or response envelope.\n"
            "- An empty journey returns `[]`; an unsupported locale returns 400."
        ),
        response_model=list[RespPortfolioJourneyItem],
        response_model_exclude_unset=True,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.PORTFOLIO)
    async def get_journey(self, query_string: dict = Depends(parser_portfolio_content)) -> list[dict]:
        """
        Return all localized journey stops in their stored order.

        :param query_string: Resolved visible site ID, language and caching parameters.
        :return: Journey items as a direct array.
        :raises HTTPException: The site ID or language are invalid, or the public portfolio is missing.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        return await PortfolioJourneyModule(**query_string).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Experiences
@cbv(router)
class PortfolioExperiences:
    """
    Serve localized career experiences as numbered pages.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    path = RoutePortfolio.EXPERIENCES

    @router.get(
        path,
        summary="Query Portfolio Experiences",
        description=(
            _CONTENT_SCOPE_DESCRIPTION + "Retrieve one page of localized work and education experiences.\n\n"
            "🌐 **Language:**\n"
            "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- Titles, descriptions, locations, details, and skill labels use the selected language.\n\n"
            + _NUMBERED_PAGE_DESCRIPTION
            + "🗂️ **How It Works:**\n"
            "- Results follow experience display order, with career ID breaking ties.\n"
            "- Each item includes its complete localized `skills` list and any supplementary `detail`.\n"
            "- The career `id` matches the corresponding Journey item.\n\n"
            + _PUBLIC_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "total": 6, "pages": 1, "page": 1, "size": 6,\n'
            '  "items": [{\n'
            '    "id": 6, "order": 5, "type": "education",\n'
            '    "countryCode": "GBR", "countryName": "United Kingdom", "city": "London",\n'
            '    "organizationCode": "UCL", "organizationName": "University College London",\n'
            '    "organizationTitle": "MSc Software Systems Engineering",\n'
            '    "startMonth": "2026-09", "endMonth": "2027-08", "expected": true,\n'
            '    "content": "A new chapter focused on software systems engineering.",\n'
            '    "skills": ["Software architecture", "Distributed systems"],\n'
            '    "detail": null\n'
            "  }]\n"
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- The response has no `data`, `included`, `meta`, or `revision` envelope.\n"
            "- Invalid pages return 400 `INVALID_PAGE`; invalid sizes return 400 `INVALID_SIZE`."
        ),
        response_model=RespPortfolioExperiences,
        response_model_exclude_unset=True,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.PORTFOLIO)
    async def get_experiences(self, query_string: dict = Depends(parser_portfolio_records)) -> dict:
        """
        Return the requested localized experience page.

        :param query_string: Resolved visible site ID, locale, page, size and caching parameters.
        :return: Page metadata and experience items.
        :raises HTTPException: The site ID, language or pagination is invalid, or the public portfolio is missing.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        return await PortfolioExperiencesModule(**query_string).select()

    @router.get(
        "/me/experiences",
        summary="Query My Portfolio Experiences",
        description=_OWNER_READ_DESCRIPTION,
        response_model=RespPortfolioEditExperiences,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def get_owned_experiences(
        self, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_read))
    ) -> dict:
        """Read all owner content through the same class used for the established public projection.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioExperiencesModule.for_owner(actor)
        return await resource.select_for_edit(actor, "experiences")

    @router.post(
        "/experiences",
        summary="Create My Portfolio Experience",
        description=_owner_write_description(
            "is_create",
            "- Create one resource with entry and its translations. IDs are owner-scoped; career/project draft IDs are replaced by database IDs.",
            {"expected_revision": 7, "entry": {"id": "experience-new"}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def create_experience(
        self,
        body: BodyPortfolioExperienceCreate,
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_create)),
    ) -> dict:
        """Delegate experience create to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioExperiencesModule.for_owner(actor)
        return await resource.create(actor, body)

    @router.patch(
        "/experiences/{item_id}",
        summary="Update My Portfolio Experience",
        description=_owner_write_description(
            "is_update",
            "- Send nonempty changes. Omitted fields and languages remain unchanged; id is immutable.",
            {"expected_revision": 7, "changes": {"visible": False}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def update_experience(
        self,
        body: BodyPortfolioExperiencePatch,
        item_id: int = ApiPath(..., ge=1, le=9007199254740991),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update)),
    ) -> dict:
        """Delegate experience update to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioExperiencesModule.for_owner(actor)
        return await resource.update(actor, item_id, body)

    @router.delete(
        "/experiences/{item_id}",
        summary="Delete My Portfolio Experience",
        description=_owner_write_description(
            "is_delete",
            "- Delete the confirmed current-revision resource. Category deletion preserves skills; career deletion clears project links; an in-use skill returns 409.",
            {"expected_revision": 7},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def delete_experience(
        self,
        body: BodyPortfolioRevision,
        item_id: int = ApiPath(..., ge=1, le=9007199254740991),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_delete)),
    ) -> dict:
        """Delegate experience delete to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioExperiencesModule.for_owner(actor)
        return await resource.delete(actor, item_id, body)

    @router.put(
        "/experiences/order",
        summary="Reorder My Portfolio Experience",
        description=_owner_write_description(
            "is_update",
            "- Replace the full display order. Every current resource ID must appear exactly once.",
            {"expected_revision": 7, "ids": ["experience:1", "experience:2"]},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def reorder_experience(
        self, body: BodyPortfolioOrder, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update))
    ) -> dict:
        """Persist drag and keyboard reorder through the same normalized ID order."""
        resource = await PortfolioExperiencesModule.for_owner(actor)
        return await resource.reorder(actor, body)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Projects
@cbv(router)
class PortfolioProjects:
    """
    Serve localized portfolio projects as numbered pages.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    path = RoutePortfolio.PROJECTS

    @router.get(
        path,
        summary="Query Portfolio Projects",
        description=(
            _CONTENT_SCOPE_DESCRIPTION
            + "Retrieve one page of localized portfolio projects with their full details and skills.\n\n"
            "🌐 **Language:**\n"
            "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- Organization, project, detail, and skill text use the selected language.\n\n"
            + _NUMBERED_PAGE_DESCRIPTION
            + "🗂️ **How It Works:**\n"
            "- Results follow the stored project display order, with project ID breaking ties.\n"
            "- Each item includes its complete `detail` and `skills` for display without another API request.\n"
            "- `detail` is null when no object detail is stored; `skills` may be `null`.\n"
            "- `startMonth` and `endMonth` use `YYYY-MM`; a null `endMonth` means ongoing.\n\n"
            + _PUBLIC_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
            '  "total": 15, "pages": 3, "page": 1, "size": 6,\n'
            '  "items": [{\n'
            '    "id": 4, "organizationName": "The Gospel as Revealed to Me",\n'
            '    "organizationCode": "AI Publishing",\n'
            '    "organizationTitle": "Senior Agent Platform Engineer",\n'
            '    "startMonth": "2026-04", "endMonth": "2026-09", "expected": false,\n'
            '    "projectName": "AI-assisted publishing",\n'
            '    "projectTitle": "APPLIED AI WORKFLOWS",\n'
            '    "intro": "An LLM-assisted translation and publishing workflow.",\n'
            '    "detail": {"workflowDescription": "Source chapters pass through the workflow.",\n'
            '      "flow": ["Source chapters", "Translation & review", "Publication export"],\n'
            '      "technicalDescription": "Prompts and approved translations provide context.",\n'
            '      "contribution": "Designed the RAG workflow.",\n'
            '      "outcome": "Reduced turnaround per volume."},\n'
            '    "skills": ["Python", "RAG", "FastAPI"]\n'
            "  }]\n"
            "}\n"
            "```\n\n"
            "📝 **Notes:**\n"
            "- The response has no `data`, `included`, `meta`, or `revision` envelope.\n"
            "- Invalid pages return 400 `INVALID_PAGE`; invalid sizes return 400 `INVALID_SIZE`."
        ),
        response_model=RespPortfolioProjects,
        response_model_exclude_unset=True,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.PORTFOLIO)
    async def get_projects(self, query_string: dict = Depends(parser_portfolio_records)) -> dict:
        """
        Return the requested localized project page.

        :param query_string: Resolved visible site ID, locale, page, size and caching parameters.
        :return: Page metadata and project items.
        :raises HTTPException: The site ID, language or pagination is invalid, or the public portfolio is missing.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        return await PortfolioProjectsModule(**query_string).select()

    @router.get(
        "/me/projects",
        summary="Query My Portfolio Projects",
        description=_OWNER_READ_DESCRIPTION,
        response_model=RespPortfolioEditProjects,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def get_owned_projects(self, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_read))) -> dict:
        """Read all owner content through the same class used for the established public projection.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioProjectsModule.for_owner(actor)
        return await resource.select_for_edit(actor, "projects")

    @router.post(
        "/projects",
        summary="Create My Portfolio Project",
        description=_owner_write_description(
            "is_create",
            "- Create one resource with entry and its translations. IDs are owner-scoped; career/project draft IDs are replaced by database IDs.",
            {"expected_revision": 7, "entry": {"id": "project-new"}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def create_project(
        self, body: BodyPortfolioProjectCreate, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_create))
    ) -> dict:
        """Delegate project create to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioProjectsModule.for_owner(actor)
        return await resource.create(actor, body)

    @router.patch(
        "/projects/{item_id}",
        summary="Update My Portfolio Project",
        description=_owner_write_description(
            "is_update",
            "- Send nonempty changes. Omitted fields and languages remain unchanged; id is immutable.",
            {"expected_revision": 7, "changes": {"visible": False}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def update_project(
        self,
        body: BodyPortfolioProjectPatch,
        item_id: int = ApiPath(..., ge=1, le=9007199254740991),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update)),
    ) -> dict:
        """Delegate project update to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioProjectsModule.for_owner(actor)
        return await resource.update(actor, item_id, body)

    @router.delete(
        "/projects/{item_id}",
        summary="Delete My Portfolio Project",
        description=_owner_write_description(
            "is_delete",
            "- Delete the confirmed current-revision resource. Category deletion preserves skills; career deletion clears project links; an in-use skill returns 409.",
            {"expected_revision": 7},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def delete_project(
        self,
        body: BodyPortfolioRevision,
        item_id: int = ApiPath(..., ge=1, le=9007199254740991),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_delete)),
    ) -> dict:
        """Delegate project delete to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioProjectsModule.for_owner(actor)
        return await resource.delete(actor, item_id, body)

    @router.put(
        "/projects/order",
        summary="Reorder My Portfolio Project",
        description=_owner_write_description(
            "is_update",
            "- Replace the full display order. Every current resource ID must appear exactly once.",
            {"expected_revision": 7, "ids": ["project:1", "project:2"]},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def reorder_project(
        self, body: BodyPortfolioOrder, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update))
    ) -> dict:
        """Persist drag and keyboard reorder through the same normalized ID order."""
        resource = await PortfolioProjectsModule.for_owner(actor)
        return await resource.reorder(actor, body)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
@cbv(router)
class PortfolioSkills:
    """
    Serve skill collections through the common numbered response model.

                                                                                               ♂ ZhengLee 2026.10.12
    """

    @router.get(
        RoutePortfolio.SKILL_CATEGORIES,
        summary="Query Portfolio Skill Categories",
        description=(
            _CONTENT_SCOPE_DESCRIPTION + "Retrieve one numbered page of localized skill categories.\n\n"
            "🌐 **Language:** en, zh-Hans or zh-Hant; English is the default.\n\n"
            + _NUMBERED_PAGE_DESCRIPTION
            + "🧩 **Skill Previews:**\n"
            "- Each category's skills field contains its first skill page in the same format.\n"
            "- Continue through `/portfolio/skills?site_id=<site_id>&ownerId=<id>&page=2&size=6` to retain the resolved portfolio.\n\n"
            "🧩 **Ordering:** Categories follow saved position then ID. Previews are read in batches.\n\n"
            + _PUBLIC_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[{"id":"backend-apis","label":"Backend & APIs",\n'
            ' "skills":{"items":[{"id":"python","label":"Python"},{"id":"fastapi","label":"FastAPI"}],\n'
            ' "total":2,"pages":1,"page":1,"size":6}}],\n'
            ' "total":1,"pages":1,"page":1,"size":6}\n'
            "```\n\n"
            "📝 **Notes:**\n"
            "- The response always contains `items`, `total`, `pages`, `page` and `size`; there is no included or revision envelope.\n"
            "- Invalid pages return 400 `INVALID_PAGE`; invalid sizes return 400 `INVALID_SIZE`."
        ),
        response_model=RespPortfolioSkillCategories,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.PORTFOLIO)
    async def get_skill_categories(self, query_string: dict = Depends(parser_portfolio_records)) -> dict:
        """
        Return categories with a localized first skill page inside each item.

        :param query_string: Resolved visible site ID, locale, page, size and caching parameters.
        :return: The common five-field numbered response with nested skill pages.
        :raises HTTPException: The site ID, language or pagination is invalid, or the public portfolio is missing.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        return await PortfolioSkillsModule(**query_string).select_categories()

    @router.get(
        RoutePortfolio.SKILLS,
        summary="Query Portfolio Skills",
        description=(
            _CONTENT_SCOPE_DESCRIPTION + "Retrieve one numbered page of skills in a localized category.\n\n"
            "🌐 **Language:** en, zh-Hans or zh-Hant.\n\n"
            "🔎 **Category:** Use ownerType=category and the required ownerId slug.\n"
            "Missing owners return 422; unknown categories return 404.\n\n"
            + _NUMBERED_PAGE_DESCRIPTION
            + "🧩 **Continuation:**\n"
            "- Category previews contain page 1; request page 2 to continue.\n"
            "- Keep the resolved `site_id` and `ownerId` on every continuation request.\n"
            "- Stop when page >= pages. Results follow saved membership position then skill ID.\n\n"
            + _PUBLIC_CACHING_DESCRIPTION
            + "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[{"id":"python","label":"Python"}],"total":1,"pages":1,"page":1,"size":6}\n'
            "```\n\n"
            "📝 **Notes:**\n"
            "- Invalid pages return 400 `INVALID_PAGE`; invalid sizes return 400 `INVALID_SIZE`.\n"
            "- Unsupported owner types return 400 `INVALID_OWNER`; a blank owner ID returns 400 `INVALID_OWNER_ID`."
        ),
        response_model=RespPortfolioSkills,
    )
    @cache(expire=CacheExpiry.MIN, namespace=EnumCacheNamespace.PORTFOLIO)
    async def get_skills(self, query_string: dict = Depends(parser_portfolio_skills)) -> dict:
        """
        Return the requested category's ordered numbered skill page.

        :param query_string: Resolved visible site ID, locale, category, page, size and caching parameters.
        :return: The common five-field response with localized skill items.
        :raises HTTPException: The site ID, language, owner or pagination is invalid, or the public category is missing.

                                                                                               ♂ ZhengLee 2026.10.12
        """
        return await PortfolioSkillsModule(**query_string).select_skills()

    @router.get(
        "/me/skill-categories",
        summary="Query My Portfolio Categories",
        description=_OWNER_READ_DESCRIPTION,
        response_model=RespPortfolioEditCategories,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def get_owned_categories(self, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_read))) -> dict:
        """Read all owner content through the same class used for the established public projection.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.select_for_edit(actor, "categories")

    @router.get(
        "/me/skills",
        summary="Query My Portfolio Skills",
        description=_OWNER_READ_DESCRIPTION,
        response_model=RespPortfolioEditSkills,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def get_owned_skills(self, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_read))) -> dict:
        """Read all owner content through the same class used for the established public projection.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.select_for_edit(actor, "skills")

    @router.post(
        "/skill-categories",
        summary="Create My Portfolio Category",
        description=_owner_write_description(
            "is_create",
            "- Create one resource with entry and its translations. IDs are owner-scoped; career/project draft IDs are replaced by database IDs.",
            {"expected_revision": 7, "entry": {"id": "category-new"}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def create_category(
        self, body: BodyPortfolioCategoryCreate, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_create))
    ) -> dict:
        """Delegate category create to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.create_category(actor, body)

    @router.patch(
        "/skill-categories/{item_id:path}",
        summary="Update My Portfolio Category",
        description=_owner_write_description(
            "is_update",
            "- Send nonempty changes. Omitted fields and languages remain unchanged; id is immutable.",
            {"expected_revision": 7, "changes": {"visible": False}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def update_category(
        self,
        body: BodyPortfolioCategoryPatch,
        item_id: str = ApiPath(..., min_length=1, max_length=160),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update)),
    ) -> dict:
        """Delegate category update to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.update_category(actor, item_id, body)

    @router.delete(
        "/skill-categories/{item_id:path}",
        summary="Delete My Portfolio Category",
        description=_owner_write_description(
            "is_delete",
            "- Delete the confirmed current-revision resource. Category deletion preserves skills; career deletion clears project links; an in-use skill returns 409.",
            {"expected_revision": 7},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def delete_category(
        self,
        body: BodyPortfolioRevision,
        item_id: str = ApiPath(..., min_length=1, max_length=160),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_delete)),
    ) -> dict:
        """Delegate category delete to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.delete_category(actor, item_id, body)

    @router.put(
        "/skill-categories/order",
        summary="Reorder My Portfolio Category",
        description=_owner_write_description(
            "is_update",
            "- Replace the full display order. Every current resource ID must appear exactly once.",
            {"expected_revision": 7, "ids": ["category:1", "category:2"]},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def reorder_category(
        self, body: BodyPortfolioOrder, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update))
    ) -> dict:
        """Persist drag and keyboard reorder through the same normalized ID order."""
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.reorder_categories(actor, body)

    @router.post(
        "/skills",
        summary="Create My Portfolio Skill",
        description=_owner_write_description(
            "is_create",
            "- Create one resource with entry and its translations. IDs are owner-scoped; career/project draft IDs are replaced by database IDs.",
            {"expected_revision": 7, "entry": {"id": "skill-new"}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def create_skill(
        self, body: BodyPortfolioSkillCreate, actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_create))
    ) -> dict:
        """Delegate skill create to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.create_skill(actor, body)

    @router.patch(
        "/skills/{item_id:path}",
        summary="Update My Portfolio Skill",
        description=_owner_write_description(
            "is_update",
            "- Send nonempty changes. Omitted fields and languages remain unchanged; id is immutable.",
            {"expected_revision": 7, "changes": {"label": "Python"}},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def update_skill(
        self,
        body: BodyPortfolioSkillPatch,
        item_id: str = ApiPath(..., min_length=1, max_length=160),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update)),
    ) -> dict:
        """Delegate skill update to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.update_skill(actor, item_id, body)

    @router.delete(
        "/skills/{item_id:path}",
        summary="Delete My Portfolio Skill",
        description=_owner_write_description(
            "is_delete",
            "- Delete the confirmed current-revision resource. Category deletion preserves skills; career deletion clears project links; an in-use skill returns 409.",
            {"expected_revision": 7},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def delete_skill(
        self,
        body: BodyPortfolioRevision,
        item_id: str = ApiPath(..., min_length=1, max_length=160),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_delete)),
    ) -> dict:
        """Delegate skill delete to the original query class and its shared transaction policy.

        ♂ ZhengLee 2026.10.18
        """
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.delete_skill(actor, item_id, body)

    @router.put(
        "/skill-categories/{item_id:path}/skills",
        summary="Set My Portfolio Category Skills",
        description=_owner_write_description(
            "is_update",
            "- Replace this category's complete ordered skill IDs. An existing skill may be reused in several categories.\n- Removal changes only membership; skill deletion is a separate operation.",
            {"expected_revision": 7, "ids": ["skill:python", "skill:typescript"]},
        ),
        response_model=RespPortfolioSaved,
        responses=_OWNER_WRITE_RESPONSES,
    )
    async def set_category_skills(
        self,
        body: BodyPortfolioOrder,
        item_id: str = ApiPath(..., min_length=1, max_length=160),
        actor: RespAuthUser = Depends(ManagementPermission(AuthRole.is_update)),
    ) -> dict:
        """Keep categories, skills and their ordered associations inside the original Skills CBV."""
        resource = await PortfolioSkillsModule.for_owner(actor)
        return await resource.set_category_skills(actor, item_id, body)
