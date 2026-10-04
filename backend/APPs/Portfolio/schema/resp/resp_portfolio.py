# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field

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
