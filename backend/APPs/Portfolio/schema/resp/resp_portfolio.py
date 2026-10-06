# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.resp import RespRecords

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Literal


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Site - Brand
class RespPortfolioSiteBrand(BaseModel):
    title: str = Field(..., description="Brand mark without the decorative dot.")
    titleSub: str = Field(..., description="Localized brand subtitle.")
    copyrightYear: int = Field(..., description="Maintained copyright year.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Site - Profile
class RespPortfolioSiteProfile(BaseModel):
    firstName: str = Field(..., description="Given name.")
    familyName: str = Field(..., description="Family name.")
    nickName: str = Field(..., description="Nickname used by the accessible home label.")
    content: str = Field(..., description="Profile introduction and meta description.")
    eduCode: str = Field(..., description="Display abbreviation for education.")
    program: str = Field(..., description="Localized education program.")
    introContent: str = Field(..., description="Introductory line above the name.")
    footerContent: str = Field(..., description="Footer tagline.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Site - Social
class RespPortfolioSiteSocial(BaseModel):
    linkedin: str = Field(..., description="LinkedIn URL; an empty string hides the link.")
    github: str = Field(..., description="GitHub URL; an empty string hides the link.")
    medium: str = Field(..., description="Medium URL; an empty string hides the link.")
    email: str = Field(..., description="Email address without mailto:.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Site - Chatme
class RespPortfolioSiteChatme(BaseModel):
    title: str = Field(..., description="Localized chat heading.")
    titleSub: str = Field(..., description="Localized chat subtitle.")
    content: str = Field(..., description="Plain text chat copy; line breaks are preserved.")
    icon: str = Field(..., description="Relative path to the bundled chat icon.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Site
class RespPortfolioSite(BaseModel):
    brand: RespPortfolioSiteBrand = Field(..., description="Brand content.")
    profile: RespPortfolioSiteProfile = Field(..., description="Personal profile content.")
    social: RespPortfolioSiteSocial = Field(..., description="Social and email links.")
    chatme: RespPortfolioSiteChatme = Field(..., description="Chat entry content.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Journey - Detail
class RespPortfolioJourneyDetail(BaseModel):
    startMonth: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Supplementary period start month.")
    endMonth: str | None = Field(
        ..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Supplementary end month; null if ongoing."
    )
    endDay: int | None = Field(default=None, ge=1, le=31, description="Optional actual day within endMonth.")
    content: str = Field(..., description="Localized plain-text detail.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Journey - Item
class RespPortfolioJourneyItem(BaseModel):
    id: int = Field(..., gt=0, le=9007199254740991, description="Career ID shared with Experiences.")
    countryCode: str = Field(..., pattern=r"^[A-Z]{3}$", description="ISO alpha-3 country code used by the map.")
    countryName: str = Field(..., description="Localized country name.")
    city: str = Field(..., description="Localized city name.")
    latitude: float = Field(..., ge=-90, le=90, description="Map latitude in degrees.")
    longitude: float = Field(..., ge=-180, le=180, description="Map longitude in degrees.")
    type: Literal["work", "education"] = Field(..., description="Work or education journey type.")
    startMonth: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Inclusive start month.")
    endMonth: str | None = Field(
        ..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Inclusive end month; null if ongoing."
    )
    endDay: int | None = Field(default=None, ge=1, le=31, description="Optional actual day within endMonth.")
    expected: bool = Field(..., description="Whether the period is expected.")
    organizationName: str = Field(..., description="Full localized organization name.")
    organizationCode: str = Field(..., description="Localized display abbreviation.")
    organizationTitle: str = Field(..., description="Localized role or academic program.")
    detail: RespPortfolioJourneyDetail | None = Field(..., description="Supplementary period or null.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Experience - Item
class RespPortfolioExperienceItem(BaseModel):
    id: int = Field(..., gt=0, le=9007199254740991, description="Career ID shared with Journey.")
    order: int | float = Field(..., description="Stored experience display order.")
    type: Literal["work", "education"] = Field(..., description="Work or education experience type.")
    countryCode: str = Field(..., pattern=r"^[A-Z]{3}$", description="ISO alpha-3 country code.")
    countryName: str = Field(..., description="Localized country name.")
    city: str = Field(..., description="Localized city name.")
    organizationCode: str = Field(..., description="Localized display abbreviation.")
    organizationName: str = Field(..., description="Full localized organization name.")
    organizationTitle: str = Field(..., description="Localized role or academic program.")
    startMonth: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Inclusive start month.")
    endMonth: str | None = Field(
        ..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Inclusive end month; null if ongoing."
    )
    endDay: int | None = Field(default=None, ge=1, le=31, description="Optional actual day within endMonth.")
    expected: bool | None = Field(default=None, description="Whether the period is expected, when applicable.")
    content: str = Field(..., description="Localized experience summary.")
    skills: list[str] = Field(..., description="Ordered, localized skill labels.")
    detail: RespPortfolioJourneyDetail | None = Field(..., description="Supplementary period or null.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Experiences - Page
class RespPortfolioExperiences(RespRecords[RespPortfolioExperienceItem]):
    """
    Return one page of localized experiences with collection totals.

                                                                                               ♂ ZhengLee 2026.10.04
    """


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Project - Detail
class RespPortfolioProjectDetail(BaseModel):
    workflowDescription: str | None = Field(..., description="Localized workflow description, or null.")
    flow: list[str] | None = Field(..., description="Ordered workflow steps, or null.")
    technicalDescription: str | None = Field(..., description="Localized technical description, or null.")
    contribution: str | None = Field(..., description="Localized personal contribution, or null.")
    outcome: str | None = Field(..., description="Localized project outcome, or null.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Project - Item
class RespPortfolioProjectItem(BaseModel):
    id: int = Field(..., gt=0, le=9007199254740991, description="Stable project ID across languages.")
    organizationName: str = Field(..., description="Full localized organization name.")
    organizationCode: str = Field(..., description="Localized display abbreviation.")
    organizationTitle: str = Field(..., description="Localized role or program.")
    startMonth: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Inclusive start month.")
    endMonth: str | None = Field(
        ..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Inclusive end month; null if ongoing."
    )
    expected: bool = Field(default=False, description="Whether the project period is expected, when applicable.")
    projectName: str = Field(..., description="Localized project name.")
    projectTitle: str = Field(..., description="Localized project category heading.")
    intro: str = Field(..., description="Localized project introduction.")
    detail: RespPortfolioProjectDetail | None = Field(..., description="Complete project detail or null.")
    skills: list[str] | None = Field(..., description="Complete ordered skill labels, or null.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Projects - Page
class RespPortfolioProjects(RespRecords[RespPortfolioProjectItem]):
    """
    Return one page of localized projects with collection totals.

                                                                                               ♂ ZhengLee 2026.10.04
    """


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Skills - Item
class RespPortfolioSkillItem(BaseModel):
    id: str = Field(..., description="Stable skill identifier across languages.")
    label: str = Field(..., description="Skill label in the requested language.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Skills - Page
class RespPortfolioSkills(RespRecords[RespPortfolioSkillItem]):
    """
    Return one numbered page of localized skills in a category.

                                                                                               ♂ ZhengLee 2026.10.06
    """


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Skill Categories - Item
class RespPortfolioSkillCategoryItem(BaseModel):
    id: str = Field(..., description="Stable skill category identifier across languages.")
    label: str = Field(..., description="Skill category label in the requested language.")
    skills: RespPortfolioSkills = Field(..., description="First numbered skill page; continue with /portfolio/skills.")


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Skill Categories - Page
class RespPortfolioSkillCategories(RespRecords[RespPortfolioSkillCategoryItem]):
    """
    Return one numbered category page with a first skill page inside each item.

                                                                                               ♂ ZhengLee 2026.10.06
    """
