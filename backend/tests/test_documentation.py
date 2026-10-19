"""Keep reusable Python contracts and documented directory trees tied to source."""

import ast
from pathlib import Path
import re

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPOSITORY = BACKEND.parent


def public_names(path: Path) -> set[str]:
    """Inspect declarations without importing settings, clients or application startup."""
    names = set()
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and not node.name.startswith("_"):
            names.add(node.name)
            if isinstance(node, ast.ClassDef):
                names.update(
                    method.name
                    for method in node.body
                    if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and not method.name.startswith("_")
                )
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "__all__" for target in node.targets
        ):
            names.update(ast.literal_eval(node.value))
    return names


@pytest.mark.parametrize(
    ("directory", "recursive"),
    [
        ("COMMON/tools", False),
        ("COMMON/tools/storage/redis", True),
        ("COMMON/tools/storage/sqlalchemy", True),
        ("COMMON/schema", True),
        ("COMMON/decorator", True),
        ("SYSTEM/tools", True),
        ("SCHEDULER/SYSTEM/tools", True),
    ],
)
def test_reusable_python_contracts_have_readme_entries(directory, recursive):
    """Every local public declaration/re-export belongs in its owning guide."""
    root = BACKEND / directory
    guide = (root / "README.md").read_text(encoding="utf-8")
    files = root.rglob("*.py") if recursive else root.glob("*.py")
    names = set().union(*(public_names(path) for path in files))
    missing = sorted(name for name in names if not re.search(r"\b" + re.escape(name) + r"\b", guide))
    assert not missing, f"{directory}/README.md is missing: {', '.join(missing)}"


@pytest.mark.parametrize("directory", [".", "frontend", "backend"])
def test_readme_directory_tree_paths_exist(directory):
    """Validate each listed path, including nested branches; omitted paths remain allowed."""
    root = REPOSITORY / directory
    guide = (root / "README.md").read_text(encoding="utf-8")
    tree_name = "portfolio-modern" if directory == "." else directory
    match = re.search(r"```text\n" + re.escape(tree_name) + r"/\n(.*?)```", guide, re.DOTALL)
    assert match, f"{directory}/README.md needs its explicit directory tree"
    parents = [root]
    for line in match.group(1).splitlines():
        entry = re.match(r"([│ ]*)(?:├── |└── )([^#]+)", line)
        if not entry:
            continue
        depth = len(entry.group(1)) // 4
        name = entry.group(2).strip().removesuffix("/")
        parents = parents[: depth + 1]
        path = parents[-1] / name
        assert path.exists(), f"Stale README path: {path.relative_to(REPOSITORY)}"
        parents.append(path)
