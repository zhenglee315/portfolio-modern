# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Literal, get_args

# ■—< CONF >——————————————————————————————————————————————————————————————————————————■ Login - GeoIP Result
# Shared by the reader, ORM and read API; migrations retain their own historical values.
#                                                                                               ♂ ZhengLee 2026.10.15
LoginGeoStatus = Literal["unknown", "resolved", "not_found", "non_public", "unavailable"]
LOGIN_GEO_STATUSES = get_args(LoginGeoStatus)

__all__ = ("LoginGeoStatus", "LOGIN_GEO_STATUSES")
