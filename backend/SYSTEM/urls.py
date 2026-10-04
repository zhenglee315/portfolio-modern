# ◆—< Pack >—————————————————————————————————◆ Tools
from SYSTEM.constants import *

# ◆—< Pack >—————————————————————————————————◆ Python
from enum import Enum


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Url - Prefix
class PreFix(EnumUtils):
    # -< Url >----------------------------------------------------------【 Portfolio 】
    PORTFOLIO = "portfolio"
    # -< Url >----------------------------------------------------------【 System Diagnostics 】
    SYS = "system"


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Tags
class Tags(Enum):
    # -< Tags >---------------------------------------------------------【 Portfolio 】
    PORTFOLIO = {
        "name": "Portfolio",
        "description": "Public portfolio content queries for site, journey, experiences, projects, and skills.",
    }
    # -< Tags >---------------------------------------------------------【 System Diagnostics 】
    SYS = {"name": "System", "description": "System health, diagnostics, and monitoring endpoints."}


# ■—< Route >—————————————————————————————————————————————————————————————————————————■ Portfolio
class RoutePortfolio(EnumUtils):
    # -< GET >----------------------------------------------------------【 Site 】
    # Brand, profile, social links, and chat entry; locale only.
    SITE = "/site"
    # -< GET >----------------------------------------------------------【 Journey 】
    # Full lightweight journey for the map and career timeline; locale only.
    JOURNEY = "/journey"
    # -< GET >----------------------------------------------------------【 Experiences 】
    # Experience list with complete skills; locale, page, and fixed size=6.
    EXPERIENCES = "/experiences"
    # -< GET >----------------------------------------------------------【 Projects 】
    # Project list with full detail and skills; locale, page, and fixed size=6.
    PROJECTS = "/projects"
    # -< GET >----------------------------------------------------------【 Skill Categories 】
    # Cursor page of localized categories; locale, cursor, limit=12 (1-50), and six skill previews each.
    # Returns items, page, and included.skills for the preview IDs actually referenced.
    SKILL_CATEGORIES = "/skill-categories"
    # -< GET >----------------------------------------------------------【 Skills 】
    # Cursor page of localized category skills; locale, ownerType=category, ownerId, cursor, limit=12 (1-50).
    # Returns items and page; preview nextCursor may continue this category's skill list.
    SKILLS = "/skills"


# ■—< Route >—————————————————————————————————————————————————————————————————————————■ System
class RouteSys(EnumUtils):
    HEARTBEAT = "/heartbeat"
