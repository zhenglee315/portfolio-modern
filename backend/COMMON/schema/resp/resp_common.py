# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_TOTAL, HELP_PAGE, HELP_SIZE, HELP_ITEMS

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any, List, Optional


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Paginated Records
class RespRecords(BaseModel):
    """
    Provide the shared fields for paginated API responses.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    total: int = Field(..., **HELP_TOTAL)
    page: int = Field(..., **HELP_PAGE)
    size: int = Field(..., **HELP_SIZE)
    items: Optional[List[Any]] = Field(..., **HELP_ITEMS)
