"""Keep dependency injection and explicit public exports enforceable after refactoring."""

import ast
from importlib.util import resolve_name
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("directory", ["SYSTEM/tools", "SCHEDULER/SYSTEM/tools"])
def test_infrastructure_tools_do_not_resolve_common_dependencies(directory):
    for path in (BACKEND / directory).rglob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith("COMMON"), path
            elif isinstance(node, ast.Import):
                assert not any(alias.name.startswith("COMMON") for alias in node.names), path


def test_wildcard_imports_have_explicit_public_exports():
    """Allow package wildcard imports while requiring an explicit public-name contract."""
    for directory in ("APPs", "COMMON", "SYSTEM", "SCHEDULER"):
        for path in (BACKEND / directory).rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                if not isinstance(node, ast.ImportFrom) or not any(alias.name == "*" for alias in node.names):
                    continue
                name = node.module or ""
                if node.level:
                    package = ".".join(path.relative_to(BACKEND).parent.parts)
                    name = resolve_name("." * node.level + name, package)
                target = BACKEND.joinpath(*name.split("."))
                source = target / "__init__.py" if target.is_dir() else target.with_suffix(".py")
                assert source.is_file(), f"{path}: wildcard source must be a local module: {name}"
                exports = [
                    statement.value
                    for statement in ast.parse(source.read_text()).body
                    if isinstance(statement, ast.Assign)
                    and any(isinstance(item, ast.Name) and item.id == "__all__" for item in statement.targets)
                ]
                assert len(exports) == 1, f"{source}: define an explicit __all__ for wildcard consumers"
                public_names = ast.literal_eval(exports[0])
                assert isinstance(public_names, (tuple, list)) and public_names, source
                assert all(isinstance(item, str) and item.isidentifier() for item in public_names), source
                assert len(set(public_names)) == len(public_names), source


def test_session_payload_access_does_not_use_literal_field_keys():
    """Keep session data and returned account dictionaries on the enum key contract."""
    for directory in ("APPs", "COMMON", "SYSTEM", "SCHEDULER"):
        for path in (BACKEND / directory).rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                if isinstance(node, ast.Subscript):
                    target, key = node.value, node.slice
                elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.args:
                    if node.func.attr not in {"get", "pop", "setdefault", "__getitem__", "__setitem__", "__delitem__"}:
                        continue
                    target, key = node.func.value, node.args[0]
                else:
                    continue
                is_session = isinstance(target, ast.Attribute) and target.attr == "session"
                is_identity = isinstance(target, ast.Name) and target.id in {"account", "challenge"}
                if is_session or is_identity:
                    assert not (
                        isinstance(key, ast.Constant) and isinstance(key.value, str)
                    ), f"{path.relative_to(BACKEND)}:{node.lineno}: use EnumSess for session payload keys"


def test_public_exports_retain_the_implementation_classes():
    from SYSTEM.tools.tools_monitor import WorkerMonitor, MonitorStream, MonitorSupervisor
    from SYSTEM.tools.monitor_worker import WorkerMonitor as Worker
    from SYSTEM.tools.monitor_stream import MonitorStream as Stream
    from SYSTEM.tools.monitor_supervisor import MonitorSupervisor as Supervisor
    from APPs.Auth.module import AuthModule, AuthSignInModule, AuthRegisterModule
    from APPs.Auth.module.module_base import AuthModule as Base
    from APPs.Management.module import ManagementSitesModule
    from APPs.Management.module.module_sites import ManagementSitesModule as Sites

    assert (WorkerMonitor, MonitorStream, MonitorSupervisor) == (Worker, Stream, Supervisor)
    assert AuthModule is Base and ManagementSitesModule is Sites
    assert issubclass(AuthSignInModule, AuthModule) and issubclass(AuthRegisterModule, AuthModule)
