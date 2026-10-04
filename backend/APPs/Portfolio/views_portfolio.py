# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Portfolio.schema.resp.resp_portfolio import RespPortfolioSite
from APPs.Portfolio.module.module_portfolio import PortfolioSiteModule

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.parser import parser_caching, parser_locale
from COMMON.decorator import cache

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import CacheExpiry
from SYSTEM.tools import FastApiRouter
from SYSTEM.urls import PreFix, RoutePortfolio, Tags

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends
from fastapi_utils.cbv import cbv

router = FastApiRouter(prefix=PreFix.PORTFOLIO, tags=Tags.PORTFOLIO)


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Site
@cbv(router)
class PortfolioSite:
    """
    Serve the localized public site content through a class-based view.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    path = RoutePortfolio.SITE

    @router.get(
        path,
        summary="Query Portfolio Site Content",
        description=(
            "Retrieve the website's localized brand, profile, social links, and chat entry.\n\n"
            "🌐 **Language:**\n"
            "- Use `locale=en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- All text is returned in the requested language.\n\n"
            "🗂️ **How It Works:**\n"
            "- Reads the shared site settings and one matching translation through the ORM.\n"
            "- Returns the four content groups `brand`, `profile`, `social`, and `chatme`.\n"
            "- This endpoint returns one site record and does not use pagination.\n\n"
            "⚡ **Caching:**\n"
            "- Set `is_caching=true` to allow a response cached for up to 60 seconds.\n"
            "- Omit the flag or set it to `false` to read the database for this request.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            "{\n"
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
    @cache(expire=CacheExpiry.MIN)
    async def get_site(self, locale: str = Depends(parser_locale), _=Depends(parser_caching)) -> dict:
        """
        Return the localized site content assembled by the portfolio module.

        :param locale: Parsed content language.
        :param _: Parsed shared caching flag.
        :return: The four localized site content groups.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        return await PortfolioSiteModule(locale=locale).select()
