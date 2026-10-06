# ◆—< Pack >—————————————————————————————————◆ Common
from COMMON.schema.help import HELP_TOTAL, HELP_PAGES, HELP_PAGE, HELP_SIZE, HELP_ITEMS

# ◆—< Pack >—————————————————————————————————◆ Pydantic
from pydantic import BaseModel, Field

# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any, Generic, Self, TypeVar

Record = TypeVar("Record", default=Any)


# ■—< RESP >————————————————————————————————————————————————————————————————————————————■ Paginated Records
class RespRecords(BaseModel, Generic[Record]):
    """
    Provide the shared numbered response inherited by every paginated resource.

                                                                                               ♂ ZhengLee 2026.10.06
    """

    items: list[Record] = Field(..., **HELP_ITEMS)
    total: int = Field(..., ge=0, le=9007199254740991, **HELP_TOTAL)
    pages: int = Field(..., ge=0, le=9007199254740991, **HELP_PAGES)
    page: int = Field(..., ge=1, le=9007199254740991, **HELP_PAGE)
    size: int = Field(..., ge=1, le=9007199254740991, **HELP_SIZE)

    @classmethod
    def from_records(cls, items: list[Record], *, total: int, page: int, size: int) -> Self:
        """
        Build a numbered response with consistent page counts and non-null items.

        :param items: Ordered records selected for the requested page.
        :param total: Number of matching records across the complete collection.
        :param page: Requested one-based page number, including pages beyond the end.
        :param size: Positive page size used to select the records.
        :return: A validated response whose pages is zero for an empty collection.
        :raises ValueError: The size or another response field is invalid.

                                                                                               ♂ ZhengLee 2026.10.06
        """
        if size < 1:
            raise ValueError("size must be positive")
        return cls(items=items, total=total, pages=(total + size - 1) // size, page=page, size=size)
