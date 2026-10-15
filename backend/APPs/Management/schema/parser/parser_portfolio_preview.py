# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Management.constants import MANAGEMENT_PRIVATE_HEADERS

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Depends, HTTPException, Query, Request

# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.parser import parser_locale, parser_pagination


# ■—< PARAM >——————————————————————————————————————————————————————————————————————————■ Portfolio Preview - Selection
async def parser_portfolio_preview(
    request: Request,
    site_id: str = Query(..., description="Explicit portfolio Site ID; no default or user fallback."),
    locale: str = Depends(parser_locale),
) -> dict:
    """
    Validate the preview selection without checking permissions or querying storage.

    :param request: Current request used to reject ambiguous or obsolete selectors.
    :param site_id: Required raw portfolio ID; no default or public-user fallback.
    :param locale: Supported content language supplied by the common parser.
    :return: Positive site_id and normalized locale for the existing portfolio modules.
    :raises HTTPException: Invalid or ambiguous selectors return 400.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    if "user" in request.query_params or len(request.query_params.getlist("site_id")) != 1:
        raise HTTPException(status_code=400, detail="INVALID_SITE_SELECTOR", headers=MANAGEMENT_PRIVATE_HEADERS)
    if not site_id.isascii() or not site_id.isdecimal() or len(site_id) > 10 or not 1 <= int(site_id) <= 2_147_483_647:
        raise HTTPException(status_code=400, detail="INVALID_SITE_ID", headers=MANAGEMENT_PRIVATE_HEADERS)
    return {"site_id": int(site_id), "locale": locale}


# ■—< PARAM >——————————————————————————————————————————————————————————————————————————■ Portfolio Preview - Records
def parser_portfolio_preview_records(
    selection: dict = Depends(parser_portfolio_preview),
    pagination: dict = Depends(parser_pagination),
) -> dict:
    """
    Combine the validated preview selection with the existing pagination contract.

    :param selection: Positive portfolio ID and normalized language.
    :param pagination: Validated page number and fixed public page size.
    :return: Parameters accepted by the shared portfolio collection modules.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    return {**selection, **pagination}


# ■—< PARAM >——————————————————————————————————————————————————————————————————————————■ Portfolio Preview - Skills
def parser_portfolio_preview_skills(
    query_string: dict = Depends(parser_portfolio_preview_records),
    owner_type: str = Query(default="category", alias="ownerType"),
    owner_id: str = Query(..., alias="ownerId"),
) -> dict:
    """
    Validate category-owned skill parameters before the management view runs.

    :param query_string: Validated portfolio ID, language and numbered page.
    :param owner_type: Supported owner kind; currently only category.
    :param owner_id: Required category slug; surrounding whitespace is removed.
    :return: Parameters accepted by PortfolioSkillsModule without view-side validation.
    :raises HTTPException: Unsupported or empty owners return private 400 errors.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    if owner_type != "category":
        raise HTTPException(status_code=400, detail="INVALID_OWNER", headers=MANAGEMENT_PRIVATE_HEADERS)
    if not owner_id.strip():
        raise HTTPException(status_code=400, detail="INVALID_OWNER_ID", headers=MANAGEMENT_PRIVATE_HEADERS)
    return {**query_string, "owner_type": owner_type, "owner_id": owner_id.strip()}
