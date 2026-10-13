"""Authorize preview reads before resolving an explicit portfolio, including drafts."""

from fastapi import Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from APPs.Auth.module import AuthSessionModule
from COMMON.schema.parser import parser_locale, parser_pagination
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from SYSTEM.models import AuthUser, PortfolioSite

PREVIEW_HEADERS = {"Cache-Control": "private, no-store", "Vary": "Cookie"}


async def require_portfolio_preview(request: Request, response: Response) -> None:
    """Refresh current account/role rights on every read; never trust cookie permission fields."""
    response.headers.update(PREVIEW_HEADERS)
    try:
        account = await AuthSessionModule(request=request).current_session()
    except HTTPException as error:
        error.headers = {**(error.headers or {}), **PREVIEW_HEADERS}
        raise
    if account is None:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED", headers=PREVIEW_HEADERS)
    if account.get("is_manage_sites") is not True:
        raise HTTPException(status_code=403, detail="PORTFOLIO_PREVIEW_FORBIDDEN", headers=PREVIEW_HEADERS)


async def parser_portfolio_preview(
    request: Request,
    authorized: None = Depends(require_portfolio_preview),
    site_id: str = Query(..., description="Explicit portfolio Site ID; no default or user fallback."),
    locale: str = Depends(parser_locale),
) -> dict:
    """Use the public DTO/query modules after authorization, without public visibility filters."""
    if "user" in request.query_params or len(request.query_params.getlist("site_id")) != 1:
        raise HTTPException(status_code=400, detail="INVALID_SITE_SELECTOR", headers=PREVIEW_HEADERS)
    if not site_id.isascii() or not site_id.isdecimal() or len(site_id) > 10 or not 1 <= int(site_id) <= 2_147_483_647:
        raise HTTPException(status_code=400, detail="INVALID_SITE_ID", headers=PREVIEW_HEADERS)
    resolved = int(site_id)
    statement = (
        select(PortfolioSite.id)
        .join(AuthUser, AuthUser.id == PortfolioSite.user_id)
        .where(PortfolioSite.id == resolved)
    )
    try:
        exists = (await SqlAlchemyExecAsync().execute_orm(statement)).scalar_one_or_none()
    except (SQLAlchemyError, RuntimeError, OSError):
        raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE", headers=PREVIEW_HEADERS) from None
    if exists is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND", headers=PREVIEW_HEADERS)
    return {"site_id": resolved, "locale": locale}


def parser_portfolio_preview_records(
    scope: dict = Depends(parser_portfolio_preview),
    pagination: dict = Depends(parser_pagination),
) -> dict:
    """Retain the public fixed-size pagination contract."""
    return {**scope, **pagination}
