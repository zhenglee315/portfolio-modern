# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools.tools_enum import EnumUtils

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
    # -< Url >----------------------------------------------------------【 Management 】
    MGR = "management"


# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Tags
class Tags(Enum):
    # -< Tags >---------------------------------------------------------【 Portfolio 】
    PORTFOLIO = {
        "name": "Portfolio",
        "description": (
            "Deliver published portfolio content to website visitors. Resolve the requested owner's portfolio "
            "or the default published site, then return content in the selected language.\n\n"
            "Covers branding, personal introductions, social and contact links, career journeys, "
            "education and work experience, projects, skill categories, and skills. "
            "Collection endpoints provide numbered pages for progressive browsing."
        ),
    }
    # -< Tags >---------------------------------------------------------【 System Diagnostics 】
    SYS = {
        "name": "System",
        "description": (
            "Provide website activity indicators for visitor displays and operational monitoring.\n\n"
            "Currently exposes an estimated online visitor count based on recent request heartbeats. "
            "Returns an aggregate count without visitor identities; the estimate represents recent activity "
            "rather than the number of authenticated accounts or open browser tabs."
        ),
    }
    # -< Tags >---------------------------------------------------------【 Authority 】
    AUTH = {
        "name": "Authority",
        "description": (
            "Manage account registration and the browser's authenticated session. Registration checks email "
            "availability, sends and verifies an email code, and assigns the active default role to the new account.\n\n"
            "Sign-in verifies account and role availability, authenticates the password, records the successful "
            "login, and initializes the session. Session lookup restores the current identity and role permissions; "
            "sign-out clears the current browser session."
        ),
    }
    # -< Tags >---------------------------------------------------------【 Management 】
    MGR = {
        "name": "Management",
        "description": (
            "Support administration of portfolio publication, account status and role assignments, "
            "and shared role permissions. Website management concerns each owner's portfolio; "
            "user management concerns each account; role management concerns each permission set.\n\n"
            "Provides three administrative lists: portfolios and accounts each use one row per person, while "
            "roles use one row per permission set. Portfolio rows include the selected-language content and site "
            "publication settings; account rows include assigned roles and summarized successful sign-ins; "
            "role rows include permissions and assigned-account counts. Search, state filters, ordered multi-column "
            "sorting, and numbered pagination support administrative review. Partial updates and atomic website "
            "deletion use current management permissions and strict identity confirmation."
        ),
    }


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


class RouteManagement(EnumUtils):
    """Management resource paths shared by views and documentation."""

    ROLES = "/roles"
    ROLE_BULK_DELETE = "/roles/bulk-delete"
    USERS = "/users"
    USER_BULK_DELETE = "/users/bulk-delete"
    ROLE_OPTIONS = "/role-options"
    SITES = "/sites"
    SITE_BULK_DELETE = "/sites/bulk-delete"
    LOGIN_RECORDS = "/login-records"
    PREVIEW = "/preview"


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
