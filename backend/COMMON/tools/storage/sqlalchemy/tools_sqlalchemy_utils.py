# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from SYSTEM.constants import EnumDBType

# ◆—< Pack >—————————————————————————————————◆ Fastapi
from fastapi_pagination import Params
from pydantic import Field


class BigParams(Params):
    """
    Allow SQL pagination sizes from one to 100,000 rows.

                                                                                               ♂ ZhengLee 2026.10.03
    """

    size: int = Field(200, ge=1, le=100_000)


def sqlalchemy_pagination_stmt(sql: str, page: int, size: int, type_db: str):
    """
    Generate pagination sql.

    :param sql: Raw sql.
    :param page: Page number.
    :param size: Page size.
    :param type_db: Type of database.
    :return: Generated sql.

                                                                                               ♂ ZhengLee 2026.10.03
    """
    page_sql = ""
    match type_db:
        case EnumDBType.ORACLE:
            page_sql = f"""
            SELECT *
            FROM (SELECT ROWNUM AS rowno,a.*
                  FROM({sql}) a
                  where ROWNUM <= {page * size} 
                 ) b
            WHERE b.rowno > {(page - 1) * size};
            """

        case EnumDBType.POSTGRESQL:
            offset = (page - 1) * size
            page_sql = f"{sql} LIMIT {size} OFFSET {offset}"

        case EnumDBType.MYSQL | EnumDBType.MARIADB:
            offset = (page - 1) * size
            page_sql = f"{sql} LIMIT {size} OFFSET {offset}"

        case EnumDBType.MSSQL:
            offset = (page - 1) * size
            page_sql = f"{sql} OFFSET {offset} ROWS FETCH NEXT {size} ROWS ONLY"

    return page_sql
