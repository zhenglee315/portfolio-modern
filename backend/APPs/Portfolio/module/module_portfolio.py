# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import PortfolioLocale, PortfolioSite, PortfolioSiteLocale

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import select

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException


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
