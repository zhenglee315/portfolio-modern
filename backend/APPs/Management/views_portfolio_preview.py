"""Protected portfolio preview endpoints reuse public DTOs and owner-scoped query modules."""

from fastapi import Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError

from APPs.Management.schema.parser.parser_portfolio_preview import (
    PREVIEW_HEADERS,
    parser_portfolio_preview,
    parser_portfolio_preview_records,
)
from APPs.Portfolio.module import (
    PortfolioSiteModule,
    PortfolioJourneyModule,
    PortfolioExperiencesModule,
    PortfolioProjectsModule,
    PortfolioSkillsModule,
)
from APPs.Portfolio.schema.resp import (
    RespPortfolioSite,
    RespPortfolioJourneyItem,
    RespPortfolioExperiences,
    RespPortfolioProjects,
    RespPortfolioSkillCategories,
    RespPortfolioSkills,
)
from SYSTEM.tools import FastApiRouter
from SYSTEM.urls import PreFix, RoutePortfolio, Tags

router = FastApiRouter(prefix=f"{PreFix.MGR}/portfolio", tags=Tags.MGR)
DESCRIPTION = (
    "Requires a current enabled account/role with is_manage_sites. Guests return 401; missing permission returns 403. "
    "An explicit site_id is required. Drafts and disabled portfolio owners are included; missing portfolios or translations "
    "do not fall back. Uses the public portfolio response/pagination contracts. Private no-store responses; no public response cache."
)


async def _preview_read(module, method: str = "select"):
    """Reuse domain queries while retaining safe private errors and no-store headers."""
    try:
        return await getattr(module, method)()
    except HTTPException as error:
        error.headers = {**(error.headers or {}), **PREVIEW_HEADERS}
        raise
    except (SQLAlchemyError, RuntimeError, OSError):
        raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE", headers=PREVIEW_HEADERS) from None


@router.get(RoutePortfolio.SITE, response_model=RespPortfolioSite, description=DESCRIPTION)
async def preview_site(query: dict = Depends(parser_portfolio_preview)) -> dict:
    return await _preview_read(PortfolioSiteModule(**query))


@router.get(
    RoutePortfolio.JOURNEY,
    response_model=list[RespPortfolioJourneyItem],
    response_model_exclude_unset=True,
    description=DESCRIPTION,
)
async def preview_journey(query: dict = Depends(parser_portfolio_preview)) -> list:
    return await _preview_read(PortfolioJourneyModule(**query))


@router.get(RoutePortfolio.EXPERIENCES, response_model=RespPortfolioExperiences, description=DESCRIPTION)
async def preview_experiences(query: dict = Depends(parser_portfolio_preview_records)) -> dict:
    return await _preview_read(PortfolioExperiencesModule(**query))


@router.get(RoutePortfolio.PROJECTS, response_model=RespPortfolioProjects, description=DESCRIPTION)
async def preview_projects(query: dict = Depends(parser_portfolio_preview_records)) -> dict:
    return await _preview_read(PortfolioProjectsModule(**query))


@router.get(RoutePortfolio.SKILL_CATEGORIES, response_model=RespPortfolioSkillCategories, description=DESCRIPTION)
async def preview_categories(query: dict = Depends(parser_portfolio_preview_records)) -> dict:
    return await _preview_read(PortfolioSkillsModule(**query), "select_categories")


@router.get(RoutePortfolio.SKILLS, response_model=RespPortfolioSkills, description=DESCRIPTION)
async def preview_skills(
    query: dict = Depends(parser_portfolio_preview_records),
    owner_type: str = Query(default="category", alias="ownerType"),
    owner_id: str = Query(..., alias="ownerId"),
) -> dict:
    if owner_type != "category":
        raise HTTPException(status_code=400, detail="INVALID_OWNER", headers=PREVIEW_HEADERS)
    if not owner_id.strip():
        raise HTTPException(status_code=400, detail="INVALID_OWNER_ID", headers=PREVIEW_HEADERS)
    return await _preview_read(
        PortfolioSkillsModule(**query, owner_type=owner_type, owner_id=owner_id.strip()), "select_skills"
    )
