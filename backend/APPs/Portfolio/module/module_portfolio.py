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

__all__ = (
    "PortfolioSiteModule",
    "PortfolioJourneyModule",
    "PortfolioExperiencesModule",
    "PortfolioProjectsModule",
    "PortfolioSkillsModule",
)


def __getattr__(name):
    if name not in (*__all__, "_PortfolioScopedModule", "_PortfolioPageModule"):
        raise AttributeError(name)
    return getattr(import_module("APPs.Portfolio.views_portfolio"), name)
