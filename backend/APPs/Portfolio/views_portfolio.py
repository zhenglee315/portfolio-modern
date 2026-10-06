# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Portfolio.schema.parser import (
    parser_portfolio_experiences,
    parser_portfolio_projects,
    parser_portfolio_skill_categories,
    parser_portfolio_skills,
)
from APPs.Portfolio.schema.resp import (
    RespPortfolioSite,
    RespPortfolioJourneyItem,
    RespPortfolioExperiences,
    RespPortfolioProjects,
    RespPortfolioSkillCategories,
    RespPortfolioSkills,
)
from APPs.Portfolio.module import (
    PortfolioSiteModule,
    PortfolioJourneyModule,
    PortfolioExperiencesModule,
    PortfolioProjectsModule,
    PortfolioSkillsModule,
)

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.parser import parser_caching, parser_locale
from COMMON.decorator import cache

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import CacheExpiry
from SYSTEM.tools import FastApiRouter, cbv
from SYSTEM.urls import PreFix, RoutePortfolio, Tags

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends

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


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Journey
@cbv(router)
class PortfolioJourney:
    """
    Serve the localized career journey in its recorded playback order.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    path = RoutePortfolio.JOURNEY

    @router.get(
        path,
        summary="Query Portfolio Journey",
        description=(
            "Retrieve the complete journey used by the portfolio map and career timeline.\n\n"
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
            "⚡ **Caching:**\n"
            "- Set `is_caching=true` to allow a response cached for up to 60 seconds.\n"
            "- Omit the flag or set it to `false` to read the database for this request.\n\n"
            "📦 **Response Format:**\n"
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
    @cache(expire=CacheExpiry.MIN)
    async def get_journey(self, locale: str = Depends(parser_locale), _=Depends(parser_caching)) -> list[dict]:
        """
        Return all localized journey stops in their stored order.

        :param locale: Parsed content language.
        :param _: Parsed shared caching flag.
        :return: Journey items as a direct array.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        return await PortfolioJourneyModule(locale=locale).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Experiences
@cbv(router)
class PortfolioExperiences:
    """
    Serve localized career experiences as numbered pages.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    path = RoutePortfolio.EXPERIENCES

    @router.get(
        path,
        summary="Query Portfolio Experiences",
        description=(
            "Retrieve one page of localized work and education experiences.\n\n"
            "🌐 **Language:**\n"
            "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- Titles, descriptions, locations, details, and skill labels use the selected language.\n\n"
            "📄 **Pagination:**\n"
            "- `page` starts at 1 and defaults to 1.\n"
            "- `size` defaults to and must equal 6; `all` is not supported.\n"
            "- `total` counts all matching experiences, while `pages` is the number of available pages.\n"
            "- A page beyond the end returns an empty `items` array and retains the requested page.\n\n"
            "🗂️ **How It Works:**\n"
            "- Results follow experience display order, with career ID breaking ties.\n"
            "- Each item includes its complete localized `skills` list and any supplementary `detail`.\n"
            "- The career `id` matches the corresponding Journey item.\n\n"
            "⚡ **Caching:**\n"
            "- Set `is_caching=true` to allow a response cached for up to 60 seconds.\n"
            "- Omit the flag or set it to `false` to read the database for this request.\n\n"
            "📦 **Response Format:**\n"
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
    @cache(expire=CacheExpiry.MIN)
    async def get_experiences(self, query_string: dict = Depends(parser_portfolio_experiences)) -> dict:
        """
        Return the requested localized experience page.

        :param query_string: Shared locale, page, size, and caching parameters.
        :return: Page metadata and experience items.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        return await PortfolioExperiencesModule(**query_string).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Projects
@cbv(router)
class PortfolioProjects:
    """
    Serve localized portfolio projects as numbered pages.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    path = RoutePortfolio.PROJECTS

    @router.get(
        path,
        summary="Query Portfolio Projects",
        description=(
            "Retrieve one page of localized portfolio projects with their full details and skills.\n\n"
            "🌐 **Language:**\n"
            "- Select `en`, `zh-Hans`, or `zh-Hant`; English is the default.\n"
            "- Organization, project, detail, and skill text use the selected language.\n\n"
            "📄 **Pagination:**\n"
            "- `page` starts at 1 and defaults to 1.\n"
            "- `size` defaults to and must equal 6; `all` is not supported.\n"
            "- `total` counts projects in the selected language and `pages` counts available pages.\n"
            "- A page beyond the end returns an empty `items` array and retains the requested page.\n\n"
            "🗂️ **How It Works:**\n"
            "- Results follow the stored project display order, with project ID breaking ties.\n"
            "- Each item includes its complete `detail` and `skills` for display without another API request.\n"
            "- `detail` is null when no object detail is stored; `skills` may be `null`.\n"
            "- `startMonth` and `endMonth` use `YYYY-MM`; a null `endMonth` means ongoing.\n\n"
            "⚡ **Caching:**\n"
            "- Set `is_caching=true` to allow a response cached for up to 60 seconds.\n"
            "- Omit the flag or set it to `false` to read the database for this request.\n\n"
            "📦 **Response Format:**\n"
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
    @cache(expire=CacheExpiry.MIN)
    async def get_projects(self, query_string: dict = Depends(parser_portfolio_projects)) -> dict:
        """
        Return the requested localized project page.

        :param query_string: Shared locale, page, size, and caching parameters.
        :return: Page metadata and project items.

                                                                                               ♂ ZhengLee 2026.10.04
        """
        return await PortfolioProjectsModule(**query_string).select()


# ■—< API >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
@cbv(router)
class PortfolioSkills:
    """
    Serve skill collections through the common numbered response model.

                                                                                               ♂ ZhengLee 2026.10.06
    """

    @router.get(
        RoutePortfolio.SKILL_CATEGORIES,
        summary="Query Portfolio Skill Categories",
        description=(
            "Retrieve one numbered page of localized skill categories.\n\n"
            "🌐 **Language:** en, zh-Hans or zh-Hant; English is the default.\n\n"
            "📄 **Pagination:**\n"
            "- Use page=1 and size=6; other sizes return 400 INVALID_SIZE.\n"
            "- The response always contains items, total, pages, page and size.\n"
            "- Each category's skills field contains its first skill page in the same format.\n"
            "- Continue through /portfolio/skills?ownerId=<id>&page=2&size=6.\n"
            "- Empty collections have items=[] and pages=0; beyond-end pages retain total.\n\n"
            "🧩 **Ordering:** Categories follow saved position then ID. Previews are read in batches.\n\n"
            "⚡ **Caching:** is_caching=true allows a response cached for up to 60 seconds.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[{"id":"backend-apis","label":"Backend & APIs",\n'
            ' "skills":{"items":[{"id":"python","label":"Python"},{"id":"fastapi","label":"FastAPI"}],\n'
            ' "total":2,"pages":1,"page":1,"size":6}}],\n'
            ' "total":1,"pages":1,"page":1,"size":6}\n'
            "```\n\n"
            "There is no included or revision envelope; continuation uses numbered pages."
        ),
        response_model=RespPortfolioSkillCategories,
    )
    @cache(expire=CacheExpiry.MIN)
    async def get_skill_categories(self, query_string: dict = Depends(parser_portfolio_skill_categories)) -> dict:
        """
        Return categories with a localized first skill page inside each item.

        :param query_string: Validated locale, page, size and caching parameters.
        :return: The common five-field numbered response with nested skill pages.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        return await PortfolioSkillsModule(**query_string).select_categories()

    @router.get(
        RoutePortfolio.SKILLS,
        summary="Query Portfolio Skills",
        description=(
            "Retrieve one numbered page of skills in a localized category.\n\n"
            "🌐 **Language:** en, zh-Hans or zh-Hant.\n\n"
            "🔎 **Category:** Use ownerType=category and the required ownerId slug.\n"
            "Missing owners return 422; unknown categories return 404.\n\n"
            "📄 **Pagination:**\n"
            "- page starts at 1; size is fixed at 6.\n"
            "- Category previews contain page 1; request page 2 to continue.\n"
            "- Stop when page >= pages. Results follow saved membership position then skill ID.\n\n"
            "⚡ **Caching:** is_caching=true allows a response cached for up to 60 seconds.\n\n"
            "📦 **Response Format:**\n"
            "```json\n"
            '{"items":[{"id":"python","label":"Python"}],"total":1,"pages":1,"page":1,"size":6}\n'
            "```"
        ),
        response_model=RespPortfolioSkills,
    )
    @cache(expire=CacheExpiry.MIN)
    async def get_skills(self, query_string: dict = Depends(parser_portfolio_skills)) -> dict:
        """
        Return the requested category's ordered numbered skill page.

        :param query_string: Validated locale, category, page, size and caching parameters.
        :return: The common five-field response with localized skill items.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        return await PortfolioSkillsModule(**query_string).select_skills()
