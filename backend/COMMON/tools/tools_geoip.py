# ◆—< Pack >—————————————————————————————————◆ GeoIP
from geoip2.database import Reader

# ◆—< Pack >—————————————————————————————————◆ Python
from datetime import datetime, timezone
from hashlib import file_digest
from pathlib import Path
import gzip
import json
import os
import tempfile


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ GeoIP - Offline Import
class GeoIpDatabaseImporter:
    """
    Validate local City data and atomically replace its runtime MMDB cache.

    Raw and gzip-compressed inputs share the same validation path. No settings,
    database connections, downloads or network clients are needed by this tool.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    def __init__(
        self,
        source: Path,
        destination: Path,
        *,
        expected_sha256: str | None = None,
        expected_bytes: int | None = None,
    ) -> None:
        """
        Retain the local source, destination and optional decompressed-file integrity checks.

        :param source: Prepared City MMDB or its gzip archive.
        :param destination: Runtime MMDB; failed validation preserves its previous contents.
        :param expected_sha256: Expected SHA-256 of the uncompressed database.
        :param expected_bytes: Expected uncompressed size, also bounding staged output.
        :return: None; install() performs all file operations.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        self.source = source.expanduser().resolve()
        self.destination = destination.expanduser().resolve()
        self.expected_sha256 = expected_sha256
        self.expected_bytes = expected_bytes

    def install(self) -> dict:
        """
        Stage and validate the complete City file before publishing it to readers.

        Unique temporary files and atomic replacement allow concurrent worker startup.
        Existing readers retain their file mapping until the next worker restart.

        :return: Database type and UTC build timestamp for the deployment log.
        :raises OSError: Source or destination cannot be read/written.
        :raises ValueError: Input type, size or checksum does not match the expected City data.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        self.destination.parent.mkdir(parents=True, exist_ok=True)
        candidate: Path | None = None
        opener = gzip.open if self.source.suffix == ".gz" else Path.open
        try:
            with (
                opener(self.source, "rb") as source,
                tempfile.NamedTemporaryFile(
                    dir=self.destination.parent,
                    prefix=".geoip-",
                    suffix=".mmdb",
                    delete=False,
                ) as output,
            ):
                candidate = Path(output.name)
                written = 0
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    written += len(block)
                    if self.expected_bytes is not None and written > self.expected_bytes:
                        raise ValueError("City database exceeds the manifest size.")
                    output.write(block)
                output.flush()
                os.fsync(output.fileno())
            if self.expected_bytes is not None and written != self.expected_bytes:
                raise ValueError("City database size does not match its manifest.")
            if self.expected_sha256 is not None and self._digest(candidate) != self.expected_sha256:
                raise ValueError("City database checksum does not match its manifest.")
            with Reader(str(candidate)) as reader:
                metadata = reader.metadata()
                if "City" not in metadata.database_type:
                    raise ValueError("A compatible City MMDB database is required.")
                result = {
                    "database_type": metadata.database_type,
                    "built_at": datetime.fromtimestamp(metadata.build_epoch, timezone.utc).isoformat(),
                }
            candidate.chmod(0o640)
            os.replace(candidate, self.destination)
            return result
        finally:
            if candidate is not None:
                candidate.unlink(missing_ok=True)

    @classmethod
    def prepare_bundle(cls, destination: Path) -> None:
        """
        Materialize or refresh a Git-bundled archive using its colocated manifest.

        With no sidecar archive, deployment-supplied raw MMDB behavior is unchanged.
        A matching cache requires no writes. Updating the archive and manifest in
        Git refreshes an older cache automatically at the next worker startup.

        :param destination: Configured MMDB; sidecars are <filename>.gz and manifest.json.
        :return: None; a missing bundle leaves the existing file untouched.
        :raises OSError: Bundle or cache files cannot be accessed.
        :raises ValueError: Manifest or archive integrity is invalid.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        archive = destination.with_name(destination.name + ".gz")
        if not archive.is_file():
            return
        manifest = json.loads((destination.parent / "manifest.json").read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or manifest.get("archive") != archive.name:
            raise ValueError("City database archive is not identified by its manifest.")
        for key in ("sha256", "archive_sha256"):
            value = manifest.get(key)
            if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                raise ValueError("City database manifest requires SHA-256 checksums.")
        for key in ("bytes", "archive_bytes"):
            if type(manifest.get(key)) is not int or manifest[key] <= 0:
                raise ValueError("City database manifest requires positive file sizes.")
        if (
            destination.is_file()
            and destination.stat().st_size == manifest["bytes"]
            and cls._digest(destination) == manifest["sha256"]
        ):
            return
        if archive.stat().st_size != manifest["archive_bytes"] or cls._digest(archive) != manifest["archive_sha256"]:
            raise ValueError("City database archive does not match its manifest.")
        cls(
            archive,
            destination,
            expected_sha256=manifest["sha256"],
            expected_bytes=manifest["bytes"],
        ).install()

    @staticmethod
    def _digest(path: Path) -> str:
        """
        Hash a local file without loading the database into application memory.

        :param path: Existing archive or uncompressed database.
        :return: Lowercase SHA-256 digest.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        with path.open("rb") as source:
            return file_digest(source, "sha256").hexdigest()
