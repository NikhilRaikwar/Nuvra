import ipaddress
from urllib.parse import urlparse


PRIVATE_SUFFIXES = (".local", ".internal")


def is_public_http_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        return False
    if parsed.username or parsed.password:
        return False
    if parsed.port and parsed.port not in {80, 443}:
        return False
    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname == "localhost" or hostname.endswith(PRIVATE_SUFFIXES):
        return False
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )

