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
    # -< Url >----------------------------------------------------------【 Authority 】
    AUTH = "authority"


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Tags
class Tags(Enum):
    # -< Tags >---------------------------------------------------------【 Portfolio 】
    PORTFOLIO = {
        "name": "Portfolio",
        "description": "Public portfolio content queries for site, journey, experiences, projects, and skills.",
    }
    # -< Tags >---------------------------------------------------------【 System Diagnostics 】
    SYS = {"name": "System", "description": "System health, diagnostics, and monitoring endpoints."}
    # -< Tags >---------------------------------------------------------【 Authority 】
    AUTH = {"name": "Authority", "description": "Authentication and authorization endpoints."}


# ■—< Route >—————————————————————————————————————————————————————————————————————————■ Portfolio
class RoutePortfolio(EnumUtils):
    # -< GET >----------------------------------------------------------【 Site 】
    # Brand, profile, social links, and chat entry; locale and optional user/site_id.
    SITE = "/site"
    # -< GET >----------------------------------------------------------【 Journey 】
    # Full lightweight journey for the map and career timeline; locale and optional site_id.
    JOURNEY = "/journey"
    # -< GET >----------------------------------------------------------【 Experiences 】
    # Experience list with complete skills; locale, page, fixed size=6, and optional site_id.
    EXPERIENCES = "/experiences"
    # -< GET >----------------------------------------------------------【 Projects 】
    # Project list with full detail and skills; locale, page, fixed size=6, and optional site_id.
    PROJECTS = "/projects"
    # -< GET >----------------------------------------------------------【 Skill Categories 】
    # Numbered categories in one portfolio; locale, page, fixed size=6, and optional site_id.
    # Returns items/total/pages/page/size with one nested six-skill preview page per category.
    SKILL_CATEGORIES = "/skill-categories"
    # -< GET >----------------------------------------------------------【 Skills 】
    # Numbered category skills in one portfolio; locale, ownerType=category, ownerId, page, size=6.
    # Optional site_id selects the portfolio; ownerId selects a category inside that portfolio.
    SKILLS = "/skills"


# ■—< Route >—————————————————————————————————————————————————————————————————————————■ System
class RouteSys(EnumUtils):
    HEARTBEAT = "/heartbeat"


# ■—< Route >—————————————————————————————————————————————————————————————————————————■ Auth
class RouteAuth(EnumUtils):
    SESSION = "/session"
    SIGN_IN = "/sign-in"
    SIGN_OUT = "/sign-out"
    REGISTER = "/register"
    CONFIRM_EMAIL = "/confirm-email"
    VERIFY_EMAIL = "/verify-email"
