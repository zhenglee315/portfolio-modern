# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_OWNER_TYPE, HELP_OWNER_ID
from COMMON.schema.parser import (
    parser_caching,
    parser_locale,
    parser_pagination,
)

# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Portfolio.module.module_portfolio_scope import PortfolioPublicScopeModule
from SYSTEM.constants import EnumLocal

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Query, Request


# ■—< FUNC >———————————————————————————————————————————————————————————————————————————■ Portfolio - Public Identity
async def _resolve_portfolio_site(
    site_id: int | str | None, user: str | None = None, *, locale: EnumLocal = EnumLocal.EN
) -> int:
    """
    Normalize the query ID and resolve one published portfolio through the common scope module.

    :param site_id: Optional raw portfolio ID from the query string.
    :param user: Optional public account identifier, supported by the Site API only.
    :return: Published portfolio ID belonging to an active account.
    :raises HTTPException: Selectors are invalid, the portfolio is hidden/missing, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    if site_id is not None:
        try:
            site_id = int(site_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="INVALID_SITE_ID") from None
    return await PortfolioPublicScopeModule().resolve(user=user, site_id=site_id, locale=locale)


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Language and Caching
def _parser_portfolio_common(locale: str = Depends(parser_locale), is_caching: bool = Depends(parser_caching)) -> dict:
    """
    Combine language and caching parameters shared by every Portfolio API.

    :param locale: Requested content language.
    :param is_caching: Whether response caching is enabled.
    :return: Shared language and caching parameters.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    return {"locale": locale, "is_caching": is_caching}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Site Lookup
async def parser_portfolio_site(
    user: str | None = Query(
        default=None,
        description="Stable public account identifier; omit both selectors for the default portfolio.",
    ),
    site_id: int | str | None = Query(default=None, description="Resolved portfolio ID; mutually exclusive with user."),
    query_string: dict = Depends(_parser_portfolio_common),
    locale: str = Depends(parser_locale),
) -> dict:
    """
    Resolve a public account, pinned ID or default for the Site lookup before response caching.

    :param user: Optional stable public identifier.
    :param site_id: Optional portfolio ID, pinned by the Site API response.
    :param query_string: Shared language and caching parameters.
    :return: Resolved site ID, language and caching parameters for the Site module.
    :raises HTTPException: Invalid selectors, hidden/missing portfolio, or database failure.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    return {
        "site_id": await _resolve_portfolio_site(site_id=site_id, user=user, locale=EnumLocal(locale)),
        **query_string,
    }


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Content Identity
async def _parser_portfolio_site_id(
    request: Request,
    site_id: int | str | None = Query(
        default=None,
        description="Portfolio ID returned by the Site API; omit it to read the published default.",
    ),
    locale: str = Depends(parser_locale),
) -> int:
    """
    Resolve content by site ID or default while rejecting obsolete account selectors before caching.

    :param request: Current request used to reject user selectors without advertising them in OpenAPI.
    :param site_id: Optional portfolio ID, pinned by the Site API response.
    :return: Published portfolio ID belonging to an active account.
    :raises HTTPException: User is supplied, the site ID is invalid, visibility fails, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    if "user" in request.query_params:
        raise HTTPException(status_code=400, detail="INVALID_SITE_SELECTOR")
    return await _resolve_portfolio_site(site_id=site_id, locale=EnumLocal(locale))


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Public Content
def parser_portfolio_content(
    site_id: int = Depends(_parser_portfolio_site_id),
    query_string: dict = Depends(_parser_portfolio_common),
) -> dict:
    """
    Combine the visible content identity with the common language and caching parameters.

    :param site_id: Published portfolio ID resolved before response caching.
    :param query_string: Shared language and caching parameters.
    :return: Resolved site ID, language and caching parameters for public content modules.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    return {"site_id": site_id, **query_string}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Numbered Collections
def parser_portfolio_records(
    query_string: dict = Depends(parser_portfolio_content),
    pagination: dict[str, int] = Depends(parser_pagination),
) -> dict:
    """
    Extend the shared content identity, language and caching parameters with numbered pagination.

    :param query_string: Resolved site ID, language and caching parameters.
    :param pagination: Validated page number and page size.
    :return: Parameters shared by Experiences, Projects, Skill Categories and Skills.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    return {**query_string, **pagination}


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
def parser_portfolio_skills(
    owner_type: str = Query(
        default="category",
        alias="ownerType",
        json_schema_extra={"enum": ["category"]},
        **HELP_OWNER_TYPE,
    ),
    owner_id: str = Query(..., alias="ownerId", **HELP_OWNER_ID),
    query_string: dict = Depends(parser_portfolio_records),
) -> dict:
    """
    Combine and validate the category-owned Skills query parameters.

    :param owner_type: Supported skill owner type, currently category.
    :param owner_id: Required category identifier.
    :param query_string: Resolved site ID, language, page, size and caching parameters.
    :return: Validated parameters for the Skills API.
    :raises HTTPException: The owner type or identifier is invalid.

                                                                                               ♂ ZhengLee 2026.10.12
    """
    if owner_type != "category":
        raise HTTPException(status_code=400, detail="INVALID_OWNER")
    owner_id = owner_id.strip()
    if not owner_id:
        raise HTTPException(status_code=400, detail="INVALID_OWNER_ID")

    return {
        "owner_type": owner_type,
        "owner_id": owner_id,
        **query_string,
    }


__all__ = (
    "parser_portfolio_site",
    "parser_portfolio_content",
    "parser_portfolio_records",
    "parser_portfolio_skills",
)
