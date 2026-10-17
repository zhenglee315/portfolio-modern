"""Register reusable fixtures without importing fixture names into individual tests."""

from importlib import import_module

pytest_plugins = (
    "test_auth_architecture",
    "test_management_permission",
    "test_management_roles",
    "test_management_lists",
    "test_portfolio_ownership",
)


def pytest_configure() -> None:
    """Load the normal composition graph before tests temporarily replace settings.

    Importing the wrappers opens no connections. This makes individual fixture
    files reproducible without relying on collection order to warm their imports.
    """
    import_module("COMMON.tools.storage.sqlalchemy")
    import_module("COMMON.tools.storage.redis")
    import_module("COMMON.tools.tools_geoip")
