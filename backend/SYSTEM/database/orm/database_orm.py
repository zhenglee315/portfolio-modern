# ◆—< Pack >—————————————————————————————————◆ Sqlalchemy
from sqlalchemy.ext.declarative import declarative_base, DeclarativeMeta

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import CONF_ACT_PLAT
from SYSTEM.tools import debug_info

# ■—< GLOBAL >————————————————————————————————————————————————————————————————————————■ Sqlalchemy - ORM Model Basic
_active_platforms = [plat for plat, enabled in CONF_ACT_PLAT.items() if enabled]
if not _active_platforms:
    """
    Pre-calculate and cache the active platform at module import time
    """
    debug_info("No active platform module is enabled!")
    ACTIVE_PLATFORM = None
elif len(_active_platforms) > 1:
    raise ValueError("Only one platform module can be active at the same time!")
else:
    ACTIVE_PLATFORM = _active_platforms[0]


class SqlAlchemyMetaPlatform(DeclarativeMeta):
    """
    Custom SQLAlchemy metaclass for managing platform-specific models.

    This metaclass ensures that only models associated with the active platform are registered
    with SQLAlchemy's metadata. It reads the configuration from CONF_ACT_PLAT, which should be a
    dictionary with the format:
        {'HOLMES_BASE': True, 'HOLMES_FACTORY': False, ...}
    Only one platform should be enabled at any time.

    During class creation, if a model defines a '__platform__' attribute and its value does not
    match the active platform, the corresponding table is removed from the metadata to prevent
    it from being included in migration operations.
                                                                                              ♂ Wilson 2025.03.03
    """
    _active_platform: str = ACTIVE_PLATFORM

    def __new__(mcls, name, bases, _dict):
        """
        Instantiate a new ORM model class, skipping mapping if platform mismatches.

        :param name:  Name of the model class being created.
        :param bases: Tuple of base classes for the model.
        :param _dict: Dictionary of attributes defined on the class.
        :return:       Newly created model class, possibly marked abstract.
        """
        platform_attr = _dict.get("__platform__")
        if platform_attr and mcls._active_platform not in (
                platform_attr if isinstance(platform_attr, (list, tuple, set)) else [platform_attr]
        ):
            debug_info(
                f"Skipping mapping for model '{name}', platform {platform_attr!r} "
                f"does not match active platform {mcls._active_platform!r}."
            )
            _dict["__abstract__"] = True  # Mark as abstract to skip table creation
            _dict.pop("__tablename__", None)  # Remove __tablename__ to avoid conflicts
        # Create the model class
        return super().__new__(mcls, name, bases, _dict)


BASE = declarative_base(metaclass=SqlAlchemyMetaPlatform)
