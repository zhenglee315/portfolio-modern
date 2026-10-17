"""Run repository Python quality checks and maintained tests from backend/.

uv run --locked check.py [--integration]
Integration mode requires explicitly supplied disposable SQL/Redis endpoints.
"""

import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
GENERATORS = [
    *sorted((ROOT.parent / "frontend/scripts").glob("*.py")),
    ROOT.parent / "frontend/src/assets/cow-workspace/access-denied/build-eyes.py",
]
INTEGRATION_ENV = (
    "SCHEDULER_TEST_REDIS_URL",
    "MONITOR_TEST_REDIS_URL",
    "SOCKETIO_TEST_REDIS_URL",
    "PLATFORM_PATCH_TEST_POSTGRES_URL",
)


def main() -> int:
    """Stop on the first failed check; never silently skip requested integrations."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--integration", action="store_true")
    args = parser.parse_args()
    if args.integration:
        missing = [name for name in INTEGRATION_ENV if not os.environ.get(name)]
        if missing:
            parser.error("Integration mode requires isolated endpoints: " + ", ".join(missing))
    sources = [".", *(str(p) for p in GENERATORS)]
    for command in (
        [sys.executable, "-m", "black", "--config", "pyproject.toml", "--check", *sources],
        [sys.executable, "-m", "ruff", "check", "--config", "pyproject.toml", *sources],
        [sys.executable, "-m", "mypy"],
        [sys.executable, "-m", "pytest"],
    ):
        result = subprocess.run(command, cwd=ROOT, check=False)
        if result.returncode:
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
