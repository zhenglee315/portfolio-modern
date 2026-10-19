# 共用工具 / Common tools

本層放可重用的資料處理及儲存工具。業務條件、SESSION 授權與 HTTP 狀態由 APPs 負責；工具不在匯入時開啟連線或啟動工作。一般工具從 `COMMON.tools` 公開入口使用；儲存與離線匯入則依下表的專用模組使用。

| 模組                                               | 介面                                                                                                                       | 用法與設計                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tools_yaml.py](tools_yaml.py)                     | `YamlConfig(file)`、`get(section, option=None, fallback=None)`、`reload()`                                                 | 建立時讀取 YAML；`get` 只讀快取，設定變更須明確 reload。缺檔視為空設定；解析錯誤不靜默吞掉。不要記錄物件的 repr，可能包含本機設定。                                   |
| [tools_enum.py](tools_enum.py)                     | `EnumUtils`、`IntEnumUtils`、`values()`                                                                                    | 分別繼承 StrEnum／IntEnum；原始值與序列化保持相容，values 回傳新清單並排除 alias。不要再建立另一份常數值清單。                                                        |
| [tools_search.py](tools_search.py)                 | `await search_recursive(data, target_key)`                                                                                 | 對巢狀 dict／list 取第一個符合 key 的值，未找到為 None；False、0 仍是有效值。這是資料搜尋，不是資料庫表格搜尋。                                                       |
| [tools_geoip.py](tools_geoip.py)                   | `GeoIpDatabaseImporter(source, destination, expected_sha256=..., expected_bytes=...)`、`install()`、`prepare_bundle(path)` | 只處理本機 MMDB／gzip；驗證後原子替換，失敗保留原檔。讀取責任由 SYSTEM 的 GeoIpReader 擁有，工具不下載資料。格式與授權見 [GeoIP 指南](../../SYSTEM/geoip/README.md)。 |
| [storage/sqlalchemy](storage/sqlalchemy/README.md) | `SqlAlchemyExecAsync`、`SqlAlchemyTransactionObserver`、共用分頁／搜尋／篩選                                               | 所有 ORM 查詢與寫入使用現有工具；一個業務交易共用同一 session，避免重複 commit 或另開連線。                                                                           |
| [storage/redis](storage/redis/README.md)           | `RedisAsync`、`RedisSync`、`RedisValue`、`RedisUpdate`                                                                     | 共用序列化、TTL、WATCH 更新計畫、stream 與心跳；區分借用／自建 client 的關閉責任。                                                                                    |

```python
from COMMON.tools import EnumUtils, YamlConfig, search_recursive

class State(EnumUtils):
    READY = "ready"
    DONE = "done"

config = YamlConfig("SYSTEM/config.yaml")
port = config.get("SERVER", "port", fallback=8080)
states = State.values()
# 在既有 async 函式內呼叫，不額外建立 event loop。
value = await search_recursive({"result": {"count": 0}}, "count")
assert value == 0
```

分頁輸入／輸出由 [COMMON schema](../schema/README.md) 登記；共用快取與 SQL 驗證裝飾器見 [decorator](../decorator/README.md)。新增工具須登記匯入路徑、輸入／回傳、例外及資源 ownership；具體方法仍由所屬指南維護，避免多份規格漂移。
