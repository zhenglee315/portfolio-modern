# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import column_id

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship, backref

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.database.orm import BASE

# SQLite requires INTEGER for an auto-incrementing primary key; PostgreSQL uses BIGINT.
_PORTFOLIO_ID = BigInteger().with_variant(Integer, 'sqlite')


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Locale
class PortfolioLocale(BASE):
    """Supported language codes shared by all translated content."""

    __tablename__ = 'portfolio_locale'

    # ---------------------------------------------------------------------● PK
    code = Column(String(32), primary_key=True, comment='Language tag, e.g. en or zh-Hant')
    # ---------------------------------------------------------------------● Conf
    name = Column(String(64), nullable=False, comment='Language self-name, e.g. English or 繁體中文')
    is_active = Column(Boolean, nullable=False, default=True, comment='Whether the API accepts this language')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (CheckConstraint(code != '', name='ck_portfolio_locale_code'),)


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Site
class PortfolioSite(BASE):
    """Language-independent settings for the single /site response."""

    __tablename__ = 'portfolio_site'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● Brand
    copyright_year = Column(Integer, nullable=False, comment='Explicit copyright year; not calculated from the clock')
    # ---------------------------------------------------------------------● Social
    linkedin = Column(String(2048), nullable=False, default='', comment='LinkedIn URL; empty string hides the link')
    github = Column(String(2048), nullable=False, default='', comment='GitHub URL; empty string hides the link')
    medium = Column(String(2048), nullable=False, default='', comment='Medium URL; empty string hides the link')
    email = Column(String(320), nullable=False, default='', comment='Email address without mailto:')
    # ---------------------------------------------------------------------● Chatme
    chat_icon = Column(String(512), nullable=False, comment='Relative path to the bundled chat icon')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (CheckConstraint(copyright_year >= 0, name='ck_portfolio_site_copyright_year'),)


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Site - Locale
class PortfolioSiteLocale(BASE):
    __tablename__ = 'portfolio_site_locale'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / Locale
    site_id = Column(Integer, ForeignKey(PortfolioSite.id, ondelete='CASCADE'), nullable=False, comment='Site record')
    locale = Column(
        String(32), ForeignKey(PortfolioLocale.code, ondelete='RESTRICT'), nullable=False, comment='Language code'
    )
    site = relationship(PortfolioSite, backref=backref('locales', cascade='all, delete-orphan'))
    language = relationship(PortfolioLocale)
    # ---------------------------------------------------------------------● Brand
    brand_title = Column(String(255), nullable=False, comment='Brand title')
    brand_title_sub = Column(String(255), nullable=False, comment='Brand subtitle; independent of nickname')
    # ---------------------------------------------------------------------● Profile
    first_name = Column(String(255), nullable=False, comment='Profile given name')
    family_name = Column(String(255), nullable=False, comment='Profile family name')
    nick_name = Column(String(255), nullable=False, comment='Accessible home-label nickname')
    profile_content = Column(Text, nullable=False, comment='Profile introduction and meta description')
    edu_code = Column(String(128), nullable=False, comment='Education display abbreviation; not a foreign key')
    program = Column(String(255), nullable=False, comment='Education program')
    intro_content = Column(Text, nullable=False, comment='Introduction above the name')
    footer_content = Column(Text, nullable=False, comment='Footer tagline')
    # ---------------------------------------------------------------------● Chatme
    chat_title = Column(String(255), nullable=False, comment='Chat title')
    chat_title_sub = Column(String(255), nullable=False, comment='Chat subtitle')
    chat_content = Column(Text, nullable=False, comment='Chat copy, including paragraph newlines')
    content_blocks = Column(JSON, nullable=True, comment='Optional localized sections beyond the current site API')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (UniqueConstraint(site_id, locale, name='uq_portfolio_site_locale'),)


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Journey / Experience
class PortfolioCareer(BASE):
    """One record shared by /journey and /experiences under the same API ID."""

    __tablename__ = 'portfolio_career'

    # ---------------------------------------------------------------------● PK
    id = Column(_PORTFOLIO_ID, primary_key=True, autoincrement=True, comment='Shared Journey / Experience ID')
    # ---------------------------------------------------------------------● Ordering
    journey_position = Column(Integer, nullable=False, comment='Journey array order, starting at zero')
    experience_order = Column(Float, nullable=False, comment='Experience order value returned by the API')
    # ---------------------------------------------------------------------● Location / Type
    country_code = Column(String(3), nullable=False, comment='ISO alpha-3 code used by the world map')
    latitude = Column(Float, nullable=False, comment='Map latitude in degrees')
    longitude = Column(Float, nullable=False, comment='Map longitude in degrees')
    type = Column(String(16), nullable=False, comment='work or education')
    # ---------------------------------------------------------------------● Period
    start_month = Column(Date, nullable=False, comment='First day of start month; API formats YYYY-MM')
    end_month = Column(Date, nullable=True, comment='First day of end month; null means ongoing')
    end_day = Column(Integer, nullable=True, comment='Optional actual day within end_month')
    expected = Column(Boolean, nullable=False, default=False, comment='Whether the period is expected')
    # ---------------------------------------------------------------------● Detail
    detail_start_month = Column(Date, nullable=True, comment='Optional detail period start month')
    detail_end_month = Column(Date, nullable=True, comment='Optional detail period end month')
    detail_end_day = Column(Integer, nullable=True, comment='Optional actual day within detail_end_month')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        UniqueConstraint(journey_position, name='uq_portfolio_career_journey_position'),
        Index('ix_portfolio_career_experience_order', experience_order, id),
        CheckConstraint(id.between(1, 9007199254740991), name='ck_portfolio_career_safe_id'),
        CheckConstraint(journey_position >= 0, name='ck_portfolio_career_journey_position'),
        CheckConstraint(type.in_(('work', 'education')), name='ck_portfolio_career_type'),
        CheckConstraint(latitude.between(-90, 90), name='ck_portfolio_career_latitude'),
        CheckConstraint(longitude.between(-180, 180), name='ck_portfolio_career_longitude'),
        CheckConstraint(end_month.is_(None) | (end_month >= start_month), name='ck_portfolio_career_months'),
        CheckConstraint(
            end_day.is_(None) | (end_month.is_not(None) & end_day.between(1, 31)),
            name='ck_portfolio_career_end_day',
        ),
        CheckConstraint(
            detail_start_month.is_not(None) | detail_end_month.is_(None),
            name='ck_portfolio_career_detail_start',
        ),
        CheckConstraint(
            detail_end_month.is_(None) | (detail_end_month >= detail_start_month),
            name='ck_portfolio_career_detail_months',
        ),
        CheckConstraint(
            detail_end_day.is_(None) | (detail_end_month.is_not(None) & detail_end_day.between(1, 31)),
            name='ck_portfolio_career_detail_end_day',
        ),
    )


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Journey / Experience - Locale
class PortfolioCareerLocale(BASE):
    __tablename__ = 'portfolio_career_locale'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / Locale
    career_id = Column(
        _PORTFOLIO_ID,
        ForeignKey(PortfolioCareer.id, ondelete='CASCADE'),
        nullable=False,
        comment='Shared career record',
    )
    locale = Column(
        String(32), ForeignKey(PortfolioLocale.code, ondelete='RESTRICT'), nullable=False, comment='Language code'
    )
    career = relationship(PortfolioCareer, backref=backref('locales', cascade='all, delete-orphan'))
    language = relationship(PortfolioLocale)
    # ---------------------------------------------------------------------● Journey / Experience
    country_name = Column(String(255), nullable=False, comment='Localized country display name')
    city = Column(String(255), nullable=False, comment='Localized city display name')
    organization_name = Column(String(255), nullable=False, comment='Localized organization display name')
    organization_code = Column(String(255), nullable=False, comment='Localized display abbreviation; not a foreign key')
    organization_title = Column(String(255), nullable=False, comment='Localized role or academic program')
    content = Column(Text, nullable=False, comment='Experience summary')
    skills = Column(JSON, nullable=False, comment='Ordered, localized experience skill labels as a string array')
    detail_content = Column(
        Text, nullable=True, comment='Journey / Experience detail content; null when there is no detail'
    )
    content_blocks = Column(JSON, nullable=True, comment='Optional localized sections beyond the current career API')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (UniqueConstraint(career_id, locale, name='uq_portfolio_career_locale'),)


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Project
class PortfolioProject(BASE):
    __tablename__ = 'portfolio_project'

    # ---------------------------------------------------------------------● PK
    id = Column(_PORTFOLIO_ID, primary_key=True, autoincrement=True, comment='Project API ID')
    # ---------------------------------------------------------------------● Ordering / Period
    position = Column(Integer, nullable=False, comment='Project array order, starting at zero')
    start_month = Column(Date, nullable=False, comment='First day of project start month; API formats YYYY-MM')
    end_month = Column(Date, nullable=True, comment='First day of project end month; null means ongoing')
    expected = Column(Boolean, nullable=False, default=False, comment='Whether the project period is expected')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        UniqueConstraint(position, name='uq_portfolio_project_position'),
        CheckConstraint(id.between(1, 9007199254740991), name='ck_portfolio_project_safe_id'),
        CheckConstraint(position >= 0, name='ck_portfolio_project_position'),
        CheckConstraint(end_month.is_(None) | (end_month >= start_month), name='ck_portfolio_project_months'),
        CheckConstraint(~expected | end_month.is_not(None), name='ck_portfolio_project_expected'),
    )


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Project - Locale
class PortfolioProjectLocale(BASE):
    __tablename__ = 'portfolio_project_locale'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / Locale
    project_id = Column(
        _PORTFOLIO_ID, ForeignKey(PortfolioProject.id, ondelete='CASCADE'), nullable=False, comment='Project record'
    )
    locale = Column(
        String(32), ForeignKey(PortfolioLocale.code, ondelete='RESTRICT'), nullable=False, comment='Language code'
    )
    project = relationship(PortfolioProject, backref=backref('locales', cascade='all, delete-orphan'))
    language = relationship(PortfolioLocale)
    # ---------------------------------------------------------------------● Project
    organization_name = Column(String(255), nullable=False, comment='Localized organization display name')
    organization_code = Column(String(255), nullable=False, comment='Localized display abbreviation; not a foreign key')
    organization_title = Column(String(255), nullable=False, comment='Localized role or academic program')
    project_name = Column(String(255), nullable=False, comment='Project name')
    project_title = Column(String(255), nullable=False, comment='Project category heading')
    intro = Column(Text, nullable=False, comment='Short project introduction')
    skills = Column(JSON, nullable=True, comment='Ordered, localized skill-label array; null is distinct from []')
    # ---------------------------------------------------------------------● Detail
    detail_kind = Column(
        String(8), nullable=False, default='object', comment='API detail representation: object, null or empty'
    )
    workflow_description = Column(Text, nullable=True, comment='Detail workflowDescription')
    flow = Column(JSON, nullable=True, comment='Ordered flow string array; null is distinct from []')
    technical_description = Column(Text, nullable=True, comment='Detail technicalDescription')
    contribution = Column(Text, nullable=True, comment='Detail contribution')
    outcome = Column(Text, nullable=True, comment='Detail outcome')
    content_blocks = Column(JSON, nullable=True, comment='Optional localized sections beyond the current project API')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        UniqueConstraint(project_id, locale, name='uq_portfolio_project_locale'),
        CheckConstraint(detail_kind.in_(('object', 'null', 'empty')), name='ck_portfolio_project_detail_kind'),
    )


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Skill
class PortfolioSkill(BASE):
    __tablename__ = 'portfolio_skill'

    # ---------------------------------------------------------------------● PK
    id = Column(String(128), primary_key=True, comment='Skill slug returned by the API')
    # ---------------------------------------------------------------------● Conf
    label_key = Column(String(255), nullable=False, unique=True, comment='Translation key, e.g. skill.python')


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Skill - Locale
class PortfolioSkillLocale(BASE):
    __tablename__ = 'portfolio_skill_locale'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / Locale
    skill_id = Column(
        String(128), ForeignKey(PortfolioSkill.id, ondelete='CASCADE'), nullable=False, comment='Skill slug'
    )
    locale = Column(
        String(32), ForeignKey(PortfolioLocale.code, ondelete='RESTRICT'), nullable=False, comment='Language code'
    )
    skill = relationship(PortfolioSkill, backref=backref('locales', cascade='all, delete-orphan'))
    language = relationship(PortfolioLocale)
    # ---------------------------------------------------------------------● Label
    label = Column(String(255), nullable=False, comment='Localized label for label_key')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (UniqueConstraint(skill_id, locale, name='uq_portfolio_skill_locale'),)


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Skill Category
class PortfolioSkillCategory(BASE):
    __tablename__ = 'portfolio_skill_category'

    # ---------------------------------------------------------------------● PK
    id = Column(String(128), primary_key=True, comment='Category slug returned by the API')
    # ---------------------------------------------------------------------● Conf
    label_key = Column(String(255), nullable=False, unique=True, comment='Translation key for the category label')
    position = Column(Integer, nullable=False, comment='Category array order, starting at zero')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        UniqueConstraint(position, name='uq_portfolio_skill_category_position'),
        CheckConstraint(position >= 0, name='ck_portfolio_skill_category_position'),
    )


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Skill Category - Locale
class PortfolioSkillCategoryLocale(BASE):
    __tablename__ = 'portfolio_skill_category_locale'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / Locale
    category_id = Column(
        String(128),
        ForeignKey(PortfolioSkillCategory.id, ondelete='CASCADE'),
        nullable=False,
        comment='Category slug',
    )
    locale = Column(
        String(32), ForeignKey(PortfolioLocale.code, ondelete='RESTRICT'), nullable=False, comment='Language code'
    )
    category = relationship(PortfolioSkillCategory, backref=backref('locales', cascade='all, delete-orphan'))
    language = relationship(PortfolioLocale)
    # ---------------------------------------------------------------------● Label
    label = Column(String(255), nullable=False, comment='Localized label for label_key')
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (UniqueConstraint(category_id, locale, name='uq_portfolio_skill_category_locale'),)


# ■—< PORTFOLIO >——————————————————————————————————————————————————————————————————————■ Skill Category - Membership
class PortfolioCategorySkill(BASE):
    """Ordered skill membership; one skill may appear in several categories."""

    __tablename__ = 'portfolio_category_skill'

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● FK / Ordering
    category_id = Column(
        String(128),
        ForeignKey(PortfolioSkillCategory.id, ondelete='CASCADE'),
        nullable=False,
        comment='Category slug',
    )
    skill_id = Column(
        String(128), ForeignKey(PortfolioSkill.id, ondelete='CASCADE'), nullable=False, comment='Skill slug'
    )
    position = Column(Integer, nullable=False, comment='Skill order inside the category, starting at zero')
    category = relationship(
        PortfolioSkillCategory,
        backref=backref('skills', cascade='all, delete-orphan', order_by=position),
    )
    skill = relationship(PortfolioSkill, backref=backref('categories', cascade='all, delete-orphan'))
    # ---------------------------------------------------------------------● Constraints
    __table_args__ = (
        UniqueConstraint(category_id, skill_id, name='uq_portfolio_category_skill'),
        UniqueConstraint(category_id, position, name='uq_portfolio_category_skill_position'),
        CheckConstraint(position >= 0, name='ck_portfolio_category_skill_position'),
    )


__all__ = (
    'PortfolioLocale',
    'PortfolioSite',
    'PortfolioSiteLocale',
    'PortfolioCareer',
    'PortfolioCareerLocale',
    'PortfolioProject',
    'PortfolioProjectLocale',
    'PortfolioSkill',
    'PortfolioSkillLocale',
    'PortfolioSkillCategory',
    'PortfolioSkillCategoryLocale',
    'PortfolioCategorySkill',
)
