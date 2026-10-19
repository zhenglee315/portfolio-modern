# 共用 API 契約 / Shared API contracts

parser 驗證輸入，ORM 工具查詢，response schema 統一回傳；APPs 只補自己的欄位及限制，不複製另一種分頁格式。完整 schema 必須先通過驗證，才可進入 ORM／cache。

| 模組                                                               | 介面                                                                                                             | 用法與設計                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [parser/parser_common.py](parser/parser_common.py)                 | `parser_caching`、`parser_locale`、`parser_pagination`                                                           | FastAPI Depends 使用的共用 query parser；公開集合固定 size=6、正整數 page，locale 限三語。管理與本人專案的可調 size 由各自 parser 驗證，不能把此公開 parser 的限制直接套上去。 |
| [parser/parser_column_filters.py](parser/parser_column_filters.py) | `parse_column_filters(raw, fields)`                                                                              | 以明確欄位 whitelist 驗證 typed JSON filters，回 tuple predicates；SQL predicate 由既有 apply_column_filters 組裝，不把 request 字串拼入 SQL。                                 |
| [parser/parser_table_search.py](parser/parser_table_search.py)     | `parse_table_search(term, raw_fields, fields)`                                                                   | 驗證搜尋文字及允許欄位，回正規化搜尋或 None；交給 apply_table_search，在 count／pagination 前使用。                                                                            |
| [resp/resp_common.py](resp/resp_common.py)                         | `RespRecords[Record]`、`from_records(items, total=..., page=..., size=...)`                                      | 唯一 `items/total/pages/page/size` response；items 永遠是 list，空集合 pages=0，超過末頁保留要求的 page 並回空 items。數值限制在 JavaScript safe integer。                     |
| [schema_user.py](schema_user.py)                                   | `PUBLIC_USER_PATTERN`、`PUBLIC_USER_RESERVED`、`validate_public_user`、`public_user_candidate(email, attempt=1)` | 公開 handle 的格式、保留字及碰撞候選共用來源；唯一性仍由 DB constraint／交易處理，不以 email 當公開身份。                                                                      |
| [help](help/)                                                      | Query／response 欄位 help metadata                                                                               | 共用描述、型別限制與 schema 顯示資料；業務不把 help 字典視為資料來源。                                                                                                         |

```python
from fastapi import Depends
from sqlalchemy import select
from COMMON.schema.parser import parser_pagination
from COMMON.schema.resp import RespRecords
from COMMON.tools.storage.sqlalchemy import SqlAlchemyExecAsync
from SYSTEM.models import PortfolioLocale

# 在現有 CBV 方法中接入，不另開 router。
async def records(pagination: dict = Depends(parser_pagination)):
    page = await SqlAlchemyExecAsync().paginate_orm(
        select(PortfolioLocale).order_by(PortfolioLocale.code),
        page=pagination["page"], size=pagination["size"],
    )
    return RespRecords.from_records(
        page.items, total=page.total, page=page.page, size=page.size,
    )
```

有 JOIN／投影時先建立穩定排序及篩選，再分頁；不要查完整集合後在 Python 切片。工具本身允許的大型 size 不等於每個公開 API 都授權該 size。交易與分頁工具見 [SQLAlchemy 指南](../tools/storage/sqlalchemy/README.md)。

`help` 公開匯出 `HELP_CACHING`、`HELP_LOCALE`、`HELP_TOTAL`、`HELP_PAGES`、`HELP_PAGE`、`HELP_SIZE`、`HELP_ITEMS`、`HELP_OWNER_TYPE`、`HELP_OWNER_ID`，供 Query／Field 共用文件描述。限制仍由 parser／schema 驗證，不把展示文字當成運算規則。
