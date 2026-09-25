# ◆—< Pack >—————————————————————————————————◆ FastAPI
from fastapi import Request

# ◆—< Pack >—————————————————————————————————◆ Python
from functools import lru_cache
from http.client import HTTPException
from ipaddress import (
    IPv4Address,
    IPv4Network,
    IPv6Address,
    IPv6Network,
    ip_address,
    ip_network,
)
import socket
from urllib.error import URLError
from urllib.request import urlopen


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ IP validation
def _net_parse_ip(value: str) -> IPv4Address | IPv6Address | None:
    """
    Parse an IPv4 or IPv6 address without a port or interface scope identifier.

    :param value: Address string; surrounding whitespace is ignored.
    :return: Parsed address, or None for invalid or non-string input.

                                                                                             ♂ ZhengLee 2026.09.26
    """
    if not isinstance(value, str) or "%" in value:
        return None
    try:
        return ip_address(value.strip())
    except ValueError:
        return None


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Client IP extraction
def net_client_ip(request: Request | None = None) -> str:
    """
    Return the validated request client address or detect the host's public IP.

    In web contexts, use the ASGI client address. Proxy headers must be processed
    by the ASGI server with an explicit trusted-proxy configuration; this helper
    never trusts X-Forwarded-For or X-Real-IP directly.

    Without a request, query https://ipinfo.io/ip synchronously with a one-second
    socket timeout, then fall back to local hostname resolution. DNS resolution
    and multiple I/O operations can make the total duration exceed one second.
    This lookup contacts an external service; avoid calling it on an async
    request path. The result may be a public, private, or loopback address.

    :param request: FastAPI request, or None to detect the host address.
    :return: Normalized IP string, or "0.0.0.0" when no valid address is available.
             The fallback is an unknown-address sentinel, not a verified client.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    if request is not None:
        address = _net_parse_ip(request.client.host) if request.client else None
        return str(address) if address is not None else "0.0.0.0"

    try:
        with urlopen("https://ipinfo.io/ip", timeout=1.0) as response:
            if response.status == 200:
                address = _net_parse_ip(response.read(128).decode("ascii"))
                if address is not None and address.is_global:
                    return str(address)
    except (OSError, URLError, HTTPException, UnicodeError, ValueError):
        pass

    try:
        address = _net_parse_ip(socket.gethostbyname(socket.gethostname()))
        return str(address) if address is not None else "0.0.0.0"
    except OSError:
        return "0.0.0.0"


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Primary IP
def net_primary_ip(destination: str = "8.8.8.8") -> str:
    """
    Determine the local source address selected for a destination synchronously.

    Resolve IPv4/IPv6 candidates and try each route using a UDP socket. No
    application payload is sent, but hostname resolution may generate DNS
    traffic. A successful probe does not prove that the destination is reachable.
    On failure, resolve the local hostname, which may return a loopback address.

    :param destination: Destination IP or hostname used to select a route.
    :return: Local interface IP, a hostname fallback, or "0.0.0.0" on failure.
             This is not necessarily the public address seen beyond NAT.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    if isinstance(destination, str) and destination.strip():
        try:
            candidates = socket.getaddrinfo(
                destination.strip(), 80, socket.AF_UNSPEC, socket.SOCK_DGRAM
            )
        except (OSError, UnicodeError):
            candidates = []

        for family, socktype, proto, _, sockaddr in candidates:
            try:
                with socket.socket(family, socktype, proto) as connection:
                    connection.connect(sockaddr)
                    address = _net_parse_ip(connection.getsockname()[0])
                    if address is not None and not address.is_unspecified:
                        return str(address)
            except OSError:
                continue

    try:
        address = _net_parse_ip(socket.gethostbyname(socket.gethostname()))
        return str(address) if address is not None else "0.0.0.0"
    except OSError:
        return "0.0.0.0"


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Wildcard IP to CIDR
def net_wildcard_cidr(ip_rule: str) -> str | None:
    """
    Normalize a single IP, CIDR network, or trailing IPv4 wildcard pattern.

    Examples: '192.168.*' becomes '192.168.0.0/16', '*' becomes '0.0.0.0/0',
    and '::1' becomes '::1/128'. Wildcards must occupy complete trailing octets;
    abbreviated patterns are padded to four octets. IPv6 wildcards and scoped
    addresses are not supported. CIDR host bits are normalized to the network.

    :param ip_rule: Address or network rule; surrounding whitespace is ignored.
    :return: Canonical CIDR string, or None for an invalid or non-string rule.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    if not isinstance(ip_rule, str):
        return None
    rule = ip_rule.strip()
    if not rule or "%" in rule:
        return None

    if "*" in rule:
        parts = rule.split(".")
        if len(parts) > 4 or "*" not in parts:
            return None
        first_star = parts.index("*")
        if any(part != "*" for part in parts[first_star:]):
            return None
        # Validate unchanged octets with ipaddress; int() accepts ambiguous forms.
        octets = parts[:first_star] + ["0"] * (4 - first_star)
        rule = f"{'.'.join(octets)}/{first_star * 8}"

    try:
        return ip_network(rule, strict=False).with_prefixlen
    except ValueError:
        return None


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Whitelist cache
@lru_cache(maxsize=128)
def _net_whitelist_cached(
    whitelist_key: tuple[str, ...],
) -> tuple[tuple[IPv4Network, ...], tuple[IPv6Network, ...]]:
    """
    Compile and deduplicate whitelist rules in a bounded internal cache.

    :param whitelist_key: Validated tuple of rule strings used as the cache key.
    :return: IPv4 and IPv6 network tuples. Invalid rules are ignored.
             Cached objects remain private to prevent caller mutation.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    v4_map, v6_map = {}, {}
    for rule in whitelist_key:
        cidr = net_wildcard_cidr(rule)
        if cidr is None:
            continue
        network = ip_network(cidr)
        networks = v4_map if network.version == 4 else v6_map
        networks[cidr] = network
    return tuple(v4_map.values()), tuple(v6_map.values())


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Whitelist networks
def net_whitelist_ip(
    whitelist_key: tuple[str, ...],
) -> tuple[list[IPv4Network], list[IPv6Network]]:
    """
    Return separate IPv4 and IPv6 lists compiled from whitelist rules.

    Compilation is cached by rule content. Each call returns fresh network
    objects and lists so mutations cannot alter subsequent whitelist checks.

    :param whitelist_key: Tuple of rule strings. Lists are also accepted.
                         Invalid rules are ignored; other containers are rejected.
    :return: Two deduplicated network lists, or two empty lists for invalid input.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    if not isinstance(whitelist_key, (tuple, list)):
        return [], []
    rules = tuple(rule.strip() for rule in whitelist_key if isinstance(rule, str))
    v4_nets, v6_nets = _net_whitelist_cached(rules)
    # Network objects themselves have writable attributes; copy them as well.
    return (
        [IPv4Network(net.with_prefixlen) for net in v4_nets],
        [IPv6Network(net.with_prefixlen) for net in v6_nets],
    )


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ Whitelist check
def net_whitelist_check(client_ip: str, whitelist: list[str]) -> bool:
    """
    Check whether a valid client address matches a whitelist network.

    Compare addresses only against their own IP family. IPv4-mapped IPv6
    addresses remain IPv6. Empty or malformed inputs never grant access.
    Unspecified addresses are rejected, including net_client_ip's failure value.

    :param client_ip: IPv4 or IPv6 address without a port or scope identifier.
    :param whitelist: List or tuple of IP, CIDR, or trailing IPv4 wildcard rules.
                     Invalid rules are ignored; a bare string is rejected.
    :return: True for a matching network; False otherwise.

                                                                                               ♂ ZhengLee 2026.09.26
    """
    address = _net_parse_ip(client_ip)
    if address is None or address.is_unspecified:
        return False
    if not isinstance(whitelist, (list, tuple)):
        return False
    rules = tuple(rule.strip() for rule in whitelist if isinstance(rule, str))
    v4_nets, v6_nets = _net_whitelist_cached(rules)
    networks = v4_nets if address.version == 4 else v6_nets
    return any(address in network for network in networks)
