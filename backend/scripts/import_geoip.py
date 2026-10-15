"""Validate and atomically import a deployment-supplied City MMDB without network access.

Run from backend: uv run --offline --locked python scripts/import_geoip.py /media/City.mmdb
Prepare the file outside the isolated network under the provider's license.

                                                                                               ♂ ZhengLee 2026.10.15
"""

from argparse import ArgumentParser
from pathlib import Path
import os
import sys
import zlib

from maxminddb import InvalidDatabaseError
import yaml

# Keep this standalone CLI independent of SYSTEM settings and server startup.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from COMMON.tools.tools_geoip import GeoIpDatabaseImporter


def main() -> None:
    """
    Import a prepared offline MMDB using the same path setting as the application.

    :return: None; invalid files return a concise CLI error without altering the deployed data.

                                                                                               ♂ ZhengLee 2026.10.15
    """
    parser = ArgumentParser(description="Import a local City MMDB; this command never accesses the network.")
    parser.add_argument("source", type=Path, help="Prepared City MMDB or .mmdb.gz archive, such as DB-IP Lite")
    parser.add_argument("--destination", type=Path, help="Override the application's configured destination")
    args = parser.parse_args()
    # Load the application setting only when no explicit path was supplied.
    if args.destination is None:
        base = Path(__file__).resolve().parents[1]
        # Read configuration without importing server startup, Redis or network discovery.
        config = yaml.safe_load((base / "SYSTEM" / "config.yaml").read_text(encoding="utf-8")) or {}
        args.destination = Path(
            os.environ.get("GEOIP_DATABASE_PATH")
            or config.get("GEOIP", {}).get("database_path", str(base / "SYSTEM" / "geoip" / "City.mmdb"))
        )
    try:
        result = GeoIpDatabaseImporter(args.source, args.destination).install()
    except (OSError, ValueError, EOFError, zlib.error, InvalidDatabaseError):
        parser.error("City MMDB import failed; verify the source file and destination permissions.")
    print(f"Installed {result['database_type']} (built {result['built_at']}). Restart API workers to load it.")


if __name__ == "__main__":
    main()
