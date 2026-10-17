# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.schema_user import validate_public_user
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.models import AuthUser, PortfolioSite, PortfolioLocale
from SYSTEM.constants import EnumLocal

# ◆—< Pack >—————————————————————————————————◆ SQLAlchemy
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import HTTPException


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ Portfolio - Public Scope
class PortfolioPublicScopeModule(SqlAlchemyExecAsync):
    """
    Resolve one visible portfolio before public response caching and content queries.

                                                                                               ♂ ZhengLee 2026.10.11
    """

    async def resolve(
        self,
        user: str | None = None,
        site_id: int | None = None,
        *,
        locale: EnumLocal = EnumLocal.EN,
    ) -> int:
        """
        Select the published portfolio by public user, site ID, or the explicit default.

        :param user: Optional stable public account identifier.
        :param site_id: Optional positive portfolio ID; mutually exclusive with user.
        :param locale: Requested public language; its activation is checked before any response cache lookup.
        :return: Resolved portfolio ID, independent of the visitor's login SESSION.
        :raises HTTPException: Selector is invalid, portfolio is hidden/missing, or storage fails.

                                                                                               ♂ ZhengLee 2026.10.11
        """
        if user is not None and site_id is not None:
            raise HTTPException(status_code=400, detail="INVALID_SITE_SELECTOR")
        if user is not None:
            try:
                validate_public_user(user)
            except ValueError:
                raise HTTPException(status_code=400, detail="INVALID_USER") from None
        if site_id is not None and (type(site_id) is not int or not 1 <= site_id <= 2_147_483_647):
            raise HTTPException(status_code=400, detail="INVALID_SITE_ID")
        statement = (
            select(PortfolioSite.id)
            .join(AuthUser, AuthUser.id == PortfolioSite.user_id)
            .where(
                PortfolioSite.is_published.is_(True),
                AuthUser.is_active.is_(True),
                select(PortfolioLocale.code)
                .where(PortfolioLocale.code == locale, PortfolioLocale.is_active.is_(True))
                .exists(),
            )
        )
        if user is not None:
            statement = statement.where(AuthUser.user == user)
        elif site_id is not None:
            statement = statement.where(PortfolioSite.id == site_id)
        else:
            statement = statement.where(PortfolioSite.is_default.is_(True))
        try:
            resolved = (await self.execute_orm(statement)).scalar_one_or_none()
        except (SQLAlchemyError, RuntimeError, OSError):
            raise HTTPException(status_code=503, detail="PORTFOLIO_DATABASE_UNAVAILABLE") from None
        if resolved is None:
            raise HTTPException(status_code=404, detail="NOT_FOUND")
        return resolved


__all__ = ("PortfolioPublicScopeModule",)
