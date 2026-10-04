# ◆—< Pack >—————————————————————————————————◆ Tools
from COMMON.tools import EnumUtils

__all__ = ["EnumLocal"]


# ■—< Enum >——————————————————————————————————————————————————————————————————————————■ Portfolio content languages
class EnumLocal(EnumUtils):
    """
    Define the supported portfolio content languages by language code.

                                                                                               ♂ ZhengLee 2026.10.04
    """

    EN = "en"
    ZH_HANS = "zh-Hans"
    ZH_HANT = "zh-Hant"
