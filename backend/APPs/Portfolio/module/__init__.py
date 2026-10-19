"""Compatibility exports; resource class definitions live beside their existing CBVs.

Lazy resolution avoids a package cycle while FastAPI discovers the views.
                                                                                               ♂ ZhengLee 2026.10.18
"""

from importlib import import_module

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from APPs.Portfolio.views_portfolio import (
        PortfolioSiteModule,
        PortfolioJourneyModule,
        PortfolioExperiencesModule,
        PortfolioProjectsModule,
        PortfolioSkillsModule,
    )
    from APPs.Portfolio.module.module_portfolio_scope import PortfolioPublicScopeModule

__all__ = (
    "PortfolioSiteModule",
    "PortfolioJourneyModule",
    "PortfolioExperiencesModule",
    "PortfolioProjectsModule",
    "PortfolioSkillsModule",
    "PortfolioPublicScopeModule",
)


def __getattr__(name):
    if name not in __all__:
        raise AttributeError(name)
    target = (
        "APPs.Portfolio.module.module_portfolio_scope"
        if name == "PortfolioPublicScopeModule"
        else "APPs.Portfolio.views_portfolio"
    )
    return getattr(import_module(target), name)
