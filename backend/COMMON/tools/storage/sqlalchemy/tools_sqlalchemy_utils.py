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
    if page < 1 or size < 1:
        raise ValueError("page and size must be positive integers.")

    sql = sql.rstrip().removesuffix(';').rstrip()
    if not sql:
        raise ValueError("sql must be a non-empty string.")

    match type_db:
        case 'oracle':
            page_sql = f"""
            SELECT *
            FROM (SELECT ROWNUM AS rowno,a.*
                  FROM({sql}) a
                  where ROWNUM <= {page * size} 
                 ) b
            WHERE b.rowno > {(page - 1) * size}
            """

        case EnumDBType.SQLLite | EnumDBType.POSTGRESQL | 'mysql' | 'mariadb':
            offset = (page - 1) * size
            page_sql = f"{sql} LIMIT {size} OFFSET {offset}"

        case 'mssql':
            offset = (page - 1) * size
            page_sql = f"{sql} OFFSET {offset} ROWS FETCH NEXT {size} ROWS ONLY"

        case _:
            raise ValueError(f"Unsupported database type for pagination: {type_db!r}.")

    return page_sql
