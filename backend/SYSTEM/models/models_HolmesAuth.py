# ◆—< Pack >—————————————————————————————————◆ Columns
from .columns import *

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.settings import TIME_ZONE, SEC_SECRET_KEY, SEC_JWT_ALGO, SEC_JWT_AUD
from SYSTEM.constants import EnumPlat, EnumTheme, EnumLang
from SYSTEM.database.orm import BASE

# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy import ForeignKey, UniqueConstraint, Index, cast, DATE, case, literal
from sqlalchemy.dialects.postgresql import JSONB, INTERVAL

# ◆—< Pack >—————————————————————————————————◆ Cryption
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any


# ■—< Auth >——————————————————————————————————————————————————————————————————————————■ Auth - Region
class AuthConfRegion(BASE):
    __tablename__ = 'auth_conf_region'
    __platform__ = EnumPlat.BASE

    # ---------------------------------------------------------------------● PK
    id = column_id()
    # ---------------------------------------------------------------------● Conf
    region = Column(String(64), nullable=False, unique=True, index=True,
                    comment="Refers to a main site location, (e.g., WJ3)")
    region_cn = Column(String(64), nullable=True, index=True, comment="Region/site name in Chinese")
    # ---------------------------------------------------------------------● Basic
    desc = column_desc()
    createtime = column_createtime()
    createuser = column_createuser()
    updatetime = column_updatetime()
    updateuser = column_updateuser()
    # ---------------------------------------------------------------------● Logical Flags
    is_freeze = column_is_freeze()
    is_active = column_is_active()

