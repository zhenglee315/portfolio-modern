# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

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
from sqlalchemy import and_, func, or_, select

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException

# ◆—< Pack >—————————————————————————————————◆ Python
from base64 import b64decode, urlsafe_b64encode
from binascii import Error as Base64Error
import json


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

        return {
            "total": result.total,
            "pages": result.pages,
            "page": result.page,
            "size": result.size,
            "items": items,
        }


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

        return {
            "total": result.total,
            "pages": result.pages,
            "page": result.page,
            "size": result.size,
            "items": items,
        }


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
class PortfolioSkillsModule(SqlAlchemyExecAsync):
    """
    Read localized skill categories and their ordered skills through one ORM module.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    PREVIEW_LIMIT = 6

    def __init__(
        self,
        locale: str,
        limit: int,
        cursor: str | None = None,
        owner_type: str | None = None,
        owner_id: str | None = None,
        **_: object,
    ) -> None:
        """
        Prepare the requested language, cursor page, and optional skill category.

        :param locale: Supported portfolio content language.
        :param limit: Maximum number of categories or skills in the requested page.
        :param cursor: Optional position of the previous page's final item.
        :param owner_type: Skill owner kind; only category is supported.
        :param owner_id: Category slug when querying its skills.
        :param _: Other parser values, such as is_caching, not needed for the ORM query.
        :return: None; each ORM query opens its session when executed.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        super().__init__()
        self.locale = locale
        self.limit = limit
        self.cursor = cursor
        self.owner_type = owner_type
        self.owner_id = owner_id

    @staticmethod
    def _encode_cursor(resource: str, locale: str, position: int, item_id: str) -> str:
        """Encode the resource and its final sort key as a URL-safe cursor."""
        value = {"v": 1, "resource": resource, "locale": locale, "position": position, "id": item_id}
        return urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")

    def _decode_cursor(self, resource: str) -> tuple[int, str] | None:
        """Validate a cursor's shape and scope before applying its sort key."""
        if self.cursor is None:
            return None
        try:
            if not 1 <= len(self.cursor) <= 512 or any(
                character not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
                for character in self.cursor
            ):
                raise ValueError
            raw = b64decode(self.cursor + "=" * (-len(self.cursor) % 4), altchars=b"-_", validate=True)
            value = json.loads(raw)
            if (
                not isinstance(value, dict)
                or set(value) != {"v", "resource", "locale", "position", "id"}
                or type(value["v"]) is not int
                or value["v"] != 1
                or value["resource"] != resource
                or value["locale"] != self.locale
                or type(value["position"]) is not int
                or value["position"] < 0
                or value["position"] > 9007199254740991
                or not isinstance(value["id"], str)
                or not 1 <= len(value["id"]) <= 128
            ):
                raise ValueError
            return value["position"], value["id"]
        except (Base64Error, UnicodeDecodeError, ValueError, TypeError, KeyError):
            raise HTTPException(status_code=400, detail="INVALID_CURSOR") from None

    @staticmethod
    def _after_cursor(position, item_id, cursor: tuple[int, str] | None):
        """Build a stable position-and-ID keyset filter for either collection."""
        if cursor is None:
            return None
        return or_(position > cursor[0], and_(position == cursor[0], item_id > cursor[1]))

    def _page(self, rows: list, total: int, resource: str, limit: int) -> dict:
        """Return cursor page metadata for rows already fetched with one extra item."""
        has_more = len(rows) > limit
        last = rows[limit - 1] if has_more else None
        return {
            "limit": limit,
            "total": total,
            "hasMore": has_more,
            "nextCursor": (
                self._encode_cursor(resource, self.locale, last["position"], last["id"])
                if last is not None else None
            ),
        }

    def _skill_query(self):
        """Select ordered category membership with one localized label per skill."""
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
        Return a category cursor page with six preview skills per category.

        :return: Localized categories, ordered preview IDs, referenced labels, and page metadata.
        :raises HTTPException: The cursor does not belong to this resource or locale.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        resource = "portfolio:skill-categories"
        cursor = self._decode_cursor(resource)
        category_query = (
            select(
                PortfolioSkillCategory.id.label("id"),
                PortfolioSkillCategory.position.label("position"),
                PortfolioSkillCategoryLocale.label.label("label"),
            )
            .join(PortfolioSkillCategoryLocale, PortfolioSkillCategoryLocale.category_id == PortfolioSkillCategory.id)
            .join(PortfolioLocale, PortfolioLocale.code == PortfolioSkillCategoryLocale.locale)
            .where(PortfolioSkillCategoryLocale.locale == self.locale, PortfolioLocale.is_active.is_(True))
        )
        total = (await self.execute_orm(select(func.count()).select_from(category_query.subquery()))).scalar_one()
        page_query = category_query
        if cursor is not None:
            page_query = page_query.where(
                self._after_cursor(PortfolioSkillCategory.position, PortfolioSkillCategory.id, cursor)
            )
        rows = (
            await self.execute_orm(
                page_query.order_by(PortfolioSkillCategory.position, PortfolioSkillCategory.id).limit(self.limit + 1)
            )
        ).mappings().all()
        page = self._page(rows, total, resource, self.limit)
        category_rows = rows[: self.limit]
        if not category_rows:
            return {"items": [], "page": page, "included": {"skills": []}}

        category_ids = [row["id"] for row in category_rows]
        membership = self._skill_query().where(PortfolioCategorySkill.category_id.in_(category_ids))
        ranked = membership.add_columns(
            func.row_number().over(
                partition_by=PortfolioCategorySkill.category_id,
                order_by=(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id),
            ).label("row_number"),
            func.count().over(partition_by=PortfolioCategorySkill.category_id).label("total"),
        ).subquery()
        preview_rows = (
            await self.execute_orm(
                select(ranked)
                .where(ranked.c.row_number <= self.PREVIEW_LIMIT)
                .order_by(ranked.c.category_id, ranked.c.row_number)
            )
        ).mappings().all()
        previews = {category_id: [] for category_id in category_ids}
        for row in preview_rows:
            previews[row["category_id"]].append(row)

        items = []
        included_skills = {}
        for category in category_rows:
            members = previews[category["id"]]
            count = members[0]["total"] if members else 0
            skill_ids = []
            for member in members:
                skill_ids.append(member["id"])
                included_skills.setdefault(member["id"], {"id": member["id"], "label": member["label"]})
            has_more = count > len(members)
            items.append(
                {
                    "id": category["id"],
                    "label": category["label"],
                    "skillIds": skill_ids,
                    "skillsPage": {
                        "limit": self.PREVIEW_LIMIT,
                        "total": count,
                        "hasMore": has_more,
                        "nextCursor": (
                            self._encode_cursor(
                                f"portfolio:skills:category:{category['id']}",
                                self.locale,
                                members[-1]["position"],
                                members[-1]["id"],
                            ) if has_more else None
                        ),
                    },
                }
            )

        return {"items": items, "page": page, "included": {"skills": list(included_skills.values())}}

    async def select_skills(self) -> dict:
        """
        Return one cursor page of the requested category's localized skills.

        :return: Ordered skill items and page metadata.
        :raises HTTPException: The owner is invalid, missing, or the cursor is out of scope.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        if self.owner_type != "category" or not self.owner_id:
            raise HTTPException(status_code=400, detail="INVALID_OWNER")
        resource = f"portfolio:skills:category:{self.owner_id}"
        cursor = self._decode_cursor(resource)
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

        skill_query = self._skill_query().where(PortfolioCategorySkill.category_id == self.owner_id)
        total = (await self.execute_orm(select(func.count()).select_from(skill_query.subquery()))).scalar_one()
        page_query = skill_query
        if cursor is not None:
            page_query = page_query.where(
                self._after_cursor(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id, cursor)
            )
        rows = (
            await self.execute_orm(
                page_query.order_by(PortfolioCategorySkill.position, PortfolioCategorySkill.skill_id).limit(self.limit + 1)
            )
        ).mappings().all()
        page = self._page(rows, total, resource, self.limit)
        return {
            "items": [{"id": row["id"], "label": row["label"]} for row in rows[: self.limit]],
            "page": page,
        }
