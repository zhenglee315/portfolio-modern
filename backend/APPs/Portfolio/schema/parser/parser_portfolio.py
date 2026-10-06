# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_OWNER_TYPE, HELP_OWNER_ID
from COMMON.schema.parser import (
    parser_caching,
    parser_locale,
    parser_pagination,
)

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Query


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Experiences
def parser_portfolio_experiences(
    locale: str = Depends(parser_locale),
    pagination: dict[str, int] = Depends(parser_pagination),
    is_caching: bool = Depends(parser_caching),
) -> dict:
    """
    Combine the shared query parameters for the Experiences collection.

    :param locale: Requested content language.
    :param pagination: Validated page number and page size.
    :param is_caching: Whether response caching is enabled.
    :return: Validated parameters for the Experiences API.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    return {
        "locale": locale,
        **pagination,
        "is_caching": is_caching,
    }


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Projects
def parser_portfolio_projects(
    locale: str = Depends(parser_locale),
    pagination: dict[str, int] = Depends(parser_pagination),
    is_caching: bool = Depends(parser_caching),
) -> dict:
    """
    Combine the shared query parameters for the Projects collection.

    :param locale: Requested content language.
    :param pagination: Validated page number and page size.
    :param is_caching: Whether response caching is enabled.
    :return: Validated parameters for the Projects API.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    return {
        "locale": locale,
        **pagination,
        "is_caching": is_caching,
    }


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skill Categories
def parser_portfolio_skill_categories(
    locale: str = Depends(parser_locale),
    pagination: dict[str, int] = Depends(parser_pagination),
    is_caching: bool = Depends(parser_caching),
) -> dict:
    """
    Combine the shared query parameters for the Skill Categories collection.

    :param locale: Requested content language.
    :param pagination: Validated one-based page number and fixed page size.
    :param is_caching: Whether response caching is enabled.
    :return: Validated parameters for the Skill Categories API.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    return {
        "locale": locale,
        **pagination,
        "is_caching": is_caching,
    }


# ■—< PARAM >———————————————————————————————————————————————————————————————————————————■ Portfolio - Skills
def parser_portfolio_skills(
    owner_type: str = Query(
        default="category",
        alias="ownerType",
        json_schema_extra={"enum": ["category"]},
        **HELP_OWNER_TYPE,
    ),
    owner_id: str = Query(..., alias="ownerId", **HELP_OWNER_ID),
    locale: str = Depends(parser_locale),
    pagination: dict[str, int] = Depends(parser_pagination),
    is_caching: bool = Depends(parser_caching),
) -> dict:
    """
    Combine and validate the category-owned Skills query parameters.

    :param owner_type: Supported skill owner type, currently category.
    :param owner_id: Required category identifier.
    :param locale: Requested content language.
    :param pagination: Validated one-based page number and fixed page size.
    :param is_caching: Whether response caching is enabled.
    :return: Validated parameters for the Skills API.
    :raises HTTPException: The owner type or identifier is invalid.

                                                                                               ♂ ZhengLee 2026.10.04
    """
    if owner_type != "category":
        raise HTTPException(status_code=400, detail="INVALID_OWNER")
    owner_id = owner_id.strip()
    if not owner_id:
        raise HTTPException(status_code=400, detail="INVALID_OWNER_ID")

    return {
        "owner_type": owner_type,
        "owner_id": owner_id,
        "locale": locale,
        **pagination,
        "is_caching": is_caching,
    }
