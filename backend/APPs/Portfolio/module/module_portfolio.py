# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords

# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import MANAGEMENT_PRIVATE_HEADERS

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import (
    AuthUser,
    PortfolioCareer,
    PortfolioCareerLocale,
    PortfolioLocale,
    PortfolioProject,
    PortfolioProjectLocale,
    PortfolioSite,
    PortfolioSiteLocale,
    PortfolioSkillCategory,
    PortfolioSkillCategoryLocale,
    PortfolioCategorySkill,
    PortfolioSkill,
    PortfolioSkillLocale,
)

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import Select, and_, func, select
from sqlalchemy.exc import SQLAlchemyError

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Python
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, TypeVar

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
        "endMonth": row["detail_end_month"].strftime("%Y-%m") if row["detail_end_month"] else None,
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

    def __init__(self, locale: str, site_id: int, **_: object) -> None:
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
            select(PortfolioSite.id)
            .join(AuthUser, AuthUser.id == PortfolioSite.user_id)
            .where(PortfolioSite.id == self.site_id)
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
                status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE", headers=MANAGEMENT_PRIVATE_HEADERS
            ) from None


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Shared Page
class _PortfolioPageModule(_PortfolioScopedModule):
    """
    Share numbered page configuration across Experiences, Projects and skill collections.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(self, locale: str, page: int, size: int, site_id: int, **_: object) -> None:
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
            select(PortfolioSite, PortfolioSiteLocale, AuthUser.user)
            .join(AuthUser, AuthUser.id == PortfolioSite.user_id)
            .join(PortfolioSiteLocale, PortfolioSiteLocale.site_id == PortfolioSite.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSiteLocale.locale)
            .where(
                PortfolioSite.id == self.site_id,
                PortfolioSiteLocale.locale == self.locale,
            )
            .order_by(PortfolioSite.id)
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
            include_inactive=include_inactive,
        ).order_by(PortfolioCareer.experience_order.desc(), PortfolioCareer.id.desc())
        result = await self.paginate_orm(stmt, page=self.page, size=self.size, unique=False)
        items = []
        for row in result.items:
            order = row["experience_order"]
            item = {
                **_career_response(row),
                "order": int(order) if order.is_integer() else order,
                "content": row["content"],
                "skills": row["skills"],
            }
            if row["expected"]:
                item["expected"] = True
            items.append(item)

        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()


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
                PortfolioProjectLocale.organization_name,
                PortfolioProjectLocale.organization_code,
                PortfolioProjectLocale.organization_title,
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
            .join(PortfolioProjectLocale, PortfolioProjectLocale.project_id == PortfolioProject.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioProjectLocale.locale)
            .where(
                PortfolioProject.site_id == self.site_id,
                PortfolioProjectLocale.locale == self.locale,
            )
            .order_by(PortfolioProject.position, PortfolioProject.id)
        )
        stmt = _localized_query(stmt, include_inactive=include_inactive)
        result = await self.paginate_orm(stmt, page=self.page, size=self.size, unique=False)
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
                    "endMonth": row["end_month"].strftime("%Y-%m") if row["end_month"] else None,
                    "expected": row["expected"],
                    "projectName": row["project_name"],
                    "projectTitle": row["project_title"],
                    "intro": row["intro"],
                    "detail": detail,
                    "skills": row["skills"],
                }
            )

        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
class PortfolioSkillsModule(_PortfolioPageModule):
    """
    Read category and skill collections with the shared numbered response.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    def __init__(
        self,
        locale: str,
        page: int,
        size: int,
        site_id: int,
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
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSkillCategoryLocale.locale)
            .where(
                PortfolioSkillCategory.site_id == self.site_id,
                PortfolioSkillCategoryLocale.locale == self.locale,
            )
        )
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
                    partition_by=(PortfolioCategorySkill.site_id, PortfolioCategorySkill.category_id),
                    order_by=(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id),
                )
                .label("row_number"),
                func.count()
                .over(partition_by=(PortfolioCategorySkill.site_id, PortfolioCategorySkill.category_id))
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
                            skills, total=members[0]["total"] if members else 0, page=1, size=self.size
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


__all__ = (
    "PortfolioSiteModule",
    "PortfolioJourneyModule",
    "PortfolioExperiencesModule",
    "PortfolioProjectsModule",
    "PortfolioSkillsModule",
)
