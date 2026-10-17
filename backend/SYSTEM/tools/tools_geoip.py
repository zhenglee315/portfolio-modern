# ◆—< Pack >—————————————————————————————————◆ GeoIP
from geoip2.database import Reader
from geoip2.errors import AddressNotFoundError, GeoIP2Error
from maxminddb import InvalidDatabaseError

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.constants import LoginGeoStatus

# ◆—< Pack >—————————————————————————————————◆ Python
from dataclasses import asdict, dataclass
from ipaddress import ip_address
from pathlib import Path
from threading import RLock
from collections.abc import Callable
import logging
import zlib

_LOGGER = logging.getLogger(__name__)


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ GeoIP - Login Snapshot
@dataclass(frozen=True)
class LoginLocation:
    """
    Carry the immutable IP and approximate location captured for one successful login.

    Names are historical display values, not geographic identifiers or proof of a
    person's physical location. Missing attributes remain None in persistent data.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    ip_address: str | None = None
    country_code: str | None = None
    region: str | None = None
    city: str | None = None
    geo_status: LoginGeoStatus = "unknown"

    def record_values(self) -> dict:
        """
        Produce the named columns accepted by RecordLogin without exposing reader internals.

        :return: Independent dictionary containing only the five login-location fields.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return asdict(self)


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■ GeoIP - Database Reader
class GeoIpReader:
    """
    Own one process-local City MMDB reader and return bounded login snapshots.

    The application lifespan prepares a versioned local archive when present,
    then opens and closes this object. Lookups never download
    files or call a network service. A lock protects lookup/open/close when FastAPI
    runs this synchronous local-file operation in its worker thread pool.

                                                                                               ♂ ZhengLee 2026.10.15
    """

    def __init__(self, database_path: str | Path | None = None, *, prepare_database: Callable | None = None) -> None:
        """
        Retain the optional deployment path without opening files at import time.

        :param database_path: Compatible City MMDB, such as DB-IP Lite, supplied by the deployment.
        :param prepare_database: Optional caller-supplied preparation callback, run before opening the file.
                                 Without it, only an already prepared MMDB is opened.
        :return: None; open() prepares the reader outside the login request path.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        self.database_path = Path(database_path).expanduser() if database_path else None
        self.prepare_database = prepare_database
        self._reader: Reader | None = None
        self._lock = RLock()

    def open(self) -> bool:
        """
        Open a City database, allowing sign-in to continue when enrichment is unavailable.

        :return: True when a City MMDB was opened; otherwise False with one startup warning.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        with self._lock:
            self.close()
            if self.database_path is None:
                _LOGGER.warning("GeoIP City database is not configured; login locations will be unavailable.")
                return False
            try:
                if self.prepare_database is not None:
                    self.prepare_database(self.database_path)
            except (OSError, ValueError, EOFError, zlib.error, InvalidDatabaseError):
                # Preserve a readable prior cache if an offline bundle update cannot be installed.
                #                                                                               ♂ ZhengLee 2026.10.15
                _LOGGER.warning("Bundled GeoIP data cannot be prepared; using the existing City file if available.")
            reader: Reader | None = None
            try:
                reader = Reader(str(self.database_path))
                if "City" not in reader.metadata().database_type:
                    reader.close()
                    _LOGGER.warning("GeoIP requires a City MMDB; login locations will be unavailable.")
                    return False
                self._reader = reader
            except (OSError, ValueError, InvalidDatabaseError):
                if reader is not None:
                    reader.close()
                _LOGGER.warning("GeoIP City database cannot be opened; login locations will be unavailable.")
                return False
            return True

    def close(self) -> None:
        """
        Release the shared file mapping after in-flight lookups have finished.

        :return: None; repeated shutdown/open calls are safe.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        with self._lock:
            if self._reader is not None:
                self._reader.close()
                self._reader = None

    def lookup(self, client_ip: str | None) -> LoginLocation:
        """
        Normalize a request IP and resolve available geographic names from the local MMDB.

        :param client_ip: ASGI client address after trusted-proxy handling, never a body field.
        :return: Snapshot with explicit status; unknown/non-public addresses are not geolocated.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        # --------------------------------------------------● Step 1. Validate and normalize IPv4 / IPv6.
        try:
            if not isinstance(client_ip, str) or "%" in client_ip:
                return LoginLocation()
            address = ip_address(client_ip.strip())
        except ValueError:
            return LoginLocation()
        if address.version == 6 and address.ipv4_mapped is not None:
            address = address.ipv4_mapped
        if address.is_unspecified:
            return LoginLocation()
        normalized = str(address)
        if not address.is_global or address.is_multicast:
            return LoginLocation(ip_address=normalized, geo_status="non_public")

        # --------------------------------------------------● Step 2. Read only the deployment's local database.
        with self._lock:
            if self._reader is None:
                return LoginLocation(ip_address=normalized, geo_status="unavailable")
            try:
                location = self._reader.city(normalized)
            except AddressNotFoundError:
                return LoginLocation(ip_address=normalized, geo_status="not_found")
            except (OSError, ValueError, InvalidDatabaseError, GeoIP2Error):
                _LOGGER.warning("GeoIP City lookup failed; login location enrichment is unavailable.")
                return LoginLocation(ip_address=normalized, geo_status="unavailable")

        # --------------------------------------------------● Step 3. Bound optional names to the persistent contract.
        country = location.country.iso_code
        country = (
            country.upper()
            if isinstance(country, str) and len(country) == 2 and country.isascii() and country.isalpha()
            else None
        )
        region = self._name(location.subdivisions.most_specific.name)
        city = self._name(location.city.name)
        return LoginLocation(
            ip_address=normalized,
            country_code=country,
            region=region,
            city=city,
            geo_status="resolved" if any((country, region, city)) else "not_found",
        )

    @staticmethod
    def _name(value: str | None) -> str | None:
        """
        Normalize provider display text to the nullable 128-character storage boundary.

        :param value: Optional region or city name supplied by the MMDB reader.
        :return: Trimmed bounded name, or None when no display text is available.

                                                                                               ♂ ZhengLee 2026.10.15
        """
        return value.strip()[:128] or None if isinstance(value, str) else None


__all__ = ("GeoIpReader", "LoginLocation", "LoginGeoStatus")
