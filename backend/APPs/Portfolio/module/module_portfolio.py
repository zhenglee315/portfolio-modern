# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from COMMON.schema.resp import RespRecords

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import (
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
from sqlalchemy import func, select

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Python


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Site
class PortfolioSiteModule(SqlAlchemyExecAsync):
    """
    Read the shared site settings and the requested language row through ORM.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    def __init__(self, locale: str) -> None:
        """
        Prepare the single-database ORM executor for the requested language.

        :param locale: Supported portfolio content language.
        :return: None; the database session is opened when select() runs.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        super().__init__()
        self.locale = locale

    async def select(self) -> dict:
        """
        Return the complete /site response for the selected language.

        :return: The four localized site content groups.
        :raises HTTPException: The site or its active translation is missing.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        stmt = (
            select(PortfolioSite, PortfolioSiteLocale)
            .join(PortfolioSiteLocale, PortfolioSiteLocale.site_id == PortfolioSite.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSiteLocale.locale)
            .where(PortfolioSiteLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
            .order_by(PortfolioSite.id)
            .limit(1)
        )
        row = (await self.execute_orm(stmt)).first()
        if row is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")

        site, language = row
        return {
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
class PortfolioJourneyModule(SqlAlchemyExecAsync):
    """
    Read the ordered career journey in the requested content language.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    def __init__(self, locale: str) -> None:
        """
        Prepare the ORM executor for one supported content language.

        :param locale: Supported portfolio content language.
        :return: None; the database session is opened when select() runs.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        super().__init__()
        self.locale = locale

    async def select(self) -> list[dict]:
        """
        Return journey records in their stored playback order.

        :return: Localized journey items, or an empty list when there are none.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        stmt = (
            select(
                PortfolioCareer.id,
                PortfolioCareer.country_code,
                PortfolioCareer.latitude,
                PortfolioCareer.longitude,
                PortfolioCareer.type,
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
            )
            .join(PortfolioCareerLocale, PortfolioCareerLocale.career_id == PortfolioCareer.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioCareerLocale.locale)
            .where(PortfolioCareerLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
            .order_by(PortfolioCareer.journey_position, PortfolioCareer.id)
        )
        rows = (await self.execute_orm(stmt)).mappings().all()
        journey = []
        for row in rows:
            detail = None
            if row["detail_content"] is not None:
                detail = {
                    "startMonth": row["detail_start_month"].strftime("%Y-%m"),
                    "endMonth": row["detail_end_month"].strftime("%Y-%m") if row["detail_end_month"] else None,
                    "content": row["detail_content"],
                }
                if row["detail_end_day"] is not None:
                    detail["endDay"] = row["detail_end_day"]

            item = {
                "id": row["id"],
                "countryCode": row["country_code"],
                "countryName": row["country_name"],
                "city": row["city"],
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "type": row["type"],
                "startMonth": row["start_month"].strftime("%Y-%m"),
                "endMonth": row["end_month"].strftime("%Y-%m") if row["end_month"] else None,
                "expected": row["expected"],
                "organizationName": row["organization_name"],
                "organizationCode": row["organization_code"],
                "organizationTitle": row["organization_title"],
                "detail": detail,
            }
            if row["end_day"] is not None:
                item["endDay"] = row["end_day"]
            journey.append(item)

        return journey


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Experiences
class PortfolioExperiencesModule(SqlAlchemyExecAsync):
    """
    Read one page of localized career experiences through ORM pagination.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    def __init__(self, locale: str, page: int, size: int, **_: object) -> None:
        """
        Prepare the ORM executor for one language and numbered page.

        :param locale: Supported portfolio content language.
        :param page: Positive page number.
        :param size: Fixed page size of six.
        :param _: Other parser values, such as is_caching, that are not used by the ORM query.
        :return: None; the database session is opened when select() runs.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        super().__init__()
        self.locale = locale
        self.page = page
        self.size = size

    async def select(self) -> dict:
        """
        Return an ordered experience page with total and page counts.

        :return: Page metadata and localized experience items.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        stmt = (
            select(
                PortfolioCareer.id,
                PortfolioCareer.experience_order,
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
                PortfolioCareerLocale.organization_code,
                PortfolioCareerLocale.organization_name,
                PortfolioCareerLocale.organization_title,
                PortfolioCareerLocale.content,
                PortfolioCareerLocale.skills,
                PortfolioCareerLocale.detail_content,
            )
            .join(PortfolioCareerLocale, PortfolioCareerLocale.career_id == PortfolioCareer.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioCareerLocale.locale)
            .where(PortfolioCareerLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
            .order_by(PortfolioCareer.experience_order.desc(), PortfolioCareer.id.desc())
        )
        result = await self.paginate_orm(stmt, page=self.page, size=self.size, unique=False)
        items = []
        for row in result.items:
            detail = None
            if row["detail_content"] is not None:
                detail = {
                    "startMonth": row["detail_start_month"].strftime("%Y-%m"),
                    "endMonth": row["detail_end_month"].strftime("%Y-%m") if row["detail_end_month"] else None,
                    "content": row["detail_content"],
                }
                if row["detail_end_day"] is not None:
                    detail["endDay"] = row["detail_end_day"]

            order = row["experience_order"]
            item = {
                "id": row["id"],
                "order": int(order) if order.is_integer() else order,
                "type": row["type"],
                "countryCode": row["country_code"],
                "countryName": row["country_name"],
                "city": row["city"],
                "organizationCode": row["organization_code"],
                "organizationName": row["organization_name"],
                "organizationTitle": row["organization_title"],
                "startMonth": row["start_month"].strftime("%Y-%m"),
                "endMonth": row["end_month"].strftime("%Y-%m") if row["end_month"] else None,
                "content": row["content"],
                "skills": row["skills"],
                "detail": detail,
            }
            if row["end_day"] is not None:
                item["endDay"] = row["end_day"]
            if row["expected"]:
                item["expected"] = True
            items.append(item)

        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Projects
class PortfolioProjectsModule(SqlAlchemyExecAsync):
    """
    Read one page of localized projects in their stored display order.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    def __init__(self, locale: str, page: int, size: int, **_: object) -> None:
        """
        Prepare the ORM executor for one language and numbered page.

        :param locale: Supported portfolio content language.
        :param page: Positive page number.
        :param size: Fixed page size of six.
        :param _: Other parser values, such as is_caching, that are not used by the ORM query.
        :return: None; the database session is opened when select() runs.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        super().__init__()
        self.locale = locale
        self.page = page
        self.size = size

    async def select(self) -> dict:
        """
        Return an ordered project page with complete localized details.

        :return: Page metadata and project items, including nullable details and skills.

                                                                                               ♂ ZhengLee 2026.10.04
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
            .where(PortfolioProjectLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
            .order_by(PortfolioProject.position, PortfolioProject.id)
        )
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
class PortfolioSkillsModule(SqlAlchemyExecAsync):
    """
    Read category and skill collections with the shared numbered response.

                                                                                               ♂ ZhengLee 2026.10.06
    """

    def __init__(
        self,
        locale: str,
        page: int,
        size: int,
        owner_type: str | None = None,
        owner_id: str | None = None,
        **_: object,
    ) -> None:
        """
        Prepare the requested language, numbered page, and optional category owner.

        :param locale: Supported content language.
        :param page: Positive one-based page number.
        :param size: Shared fixed page size of six, also used for skill previews.
        :param owner_type: Skill owner kind; only category is supported.
        :param owner_id: Category slug when querying its skills.
        :param _: Parser values, such as is_caching, not used by the ORM query.
        :return: None; each ORM query opens its own session when executed.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        super().__init__()
        self.locale = locale
        self.page = page
        self.size = size
        self.owner_type = owner_type
        self.owner_id = owner_id

    def _skill_query(self):
        """
        Select ordered category membership with one localized label per skill.

        :return: A SQLAlchemy Select with category, skill, ordering and label columns.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        return (
            select(
                PortfolioCategorySkill.category_id.label("category_id"),
                PortfolioCategorySkill.skill_id.label("id"),
                PortfolioCategorySkill.position.label("position"),
                PortfolioSkillLocale.label.label("label"),
            )
            .join(PortfolioSkill, PortfolioSkill.id == PortfolioCategorySkill.skill_id)
            .join(PortfolioSkillLocale, PortfolioSkillLocale.skill_id == PortfolioSkill.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSkillLocale.locale)
            .where(PortfolioSkillLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
        )

    async def select_categories(self) -> dict:
        """
        Return a numbered category page with the first skill page in each item.

        :return: The common items/total/pages/page/size response, including nested skill pages.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        category_query = (
            select(
                PortfolioSkillCategory.id.label("id"),
                PortfolioSkillCategory.position.label("position"),
                PortfolioSkillCategoryLocale.label.label("label"),
            )
            .join(PortfolioSkillCategoryLocale, PortfolioSkillCategoryLocale.category_id == PortfolioSkillCategory.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSkillCategoryLocale.locale)
            .where(PortfolioSkillCategoryLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
            .order_by(PortfolioSkillCategory.position, PortfolioSkillCategory.id)
        )
        result = await self.paginate_orm(category_query, page=self.page, size=self.size, unique=False)
        category_rows = result.items
        items = []
        if category_rows:
            category_ids = [row["id"] for row in category_rows]
            membership = self._skill_query().where(PortfolioCategorySkill.category_id.in_(category_ids))
            ranked = membership.add_columns(
                func.row_number()
                .over(
                    partition_by=PortfolioCategorySkill.category_id,
                    order_by=(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id),
                )
                .label("row_number"),
                func.count().over(partition_by=PortfolioCategorySkill.category_id).label("total"),
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

    async def select_skills(self) -> dict:
        """
        Return a numbered skill page in the requested category's membership order.

        :return: The common items/total/pages/page/size response with localized skill labels.
        :raises HTTPException: The owner is unsupported, empty, or absent in this language.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        if self.owner_type != "category" or not self.owner_id:
            raise HTTPException(status_code=400, detail="INVALID_OWNER")
        owner = (
            select(PortfolioSkillCategory.id)
            .join(PortfolioSkillCategoryLocale, PortfolioSkillCategoryLocale.category_id == PortfolioSkillCategory.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSkillCategoryLocale.locale)
            .where(
                PortfolioSkillCategory.id == self.owner_id,
                PortfolioSkillCategoryLocale.locale == self.locale,
                PortfolioLocale.is_active.is_(True),
            )
            .limit(1)
        )
        if (await self.execute_orm(owner)).first() is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")
        query = (
            self._skill_query()
            .where(PortfolioCategorySkill.category_id == self.owner_id)
            .order_by(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id)
        )
        result = await self.paginate_orm(query, page=self.page, size=self.size, unique=False)
        items = [{"id": row["id"], "label": row["label"]} for row in result.items]
        return RespRecords.from_records(items, total=result.total, page=result.page, size=result.size).model_dump()
