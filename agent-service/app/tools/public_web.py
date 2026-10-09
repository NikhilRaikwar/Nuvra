import re
from urllib.parse import urljoin

import httpx
from langchain_core.tools import tool

from app.config import Settings
from app.security.untrusted_text import clean_untrusted_text
from app.security.urls import is_public_http_url


def html_to_text(html: str, limit: int) -> str:
    stripped = re.sub(r"<(script|style|noscript)\b[^>]*>[\s\S]*?</\1>", " ", html, flags=re.I)
    stripped = re.sub(r"<[^>]+>", " ", stripped)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    text, _ = clean_untrusted_text(stripped, limit)
    return text


async def read_public_page(url: str, settings: Settings) -> tuple[str, list[str]]:
    if not is_public_http_url(url):
        raise ValueError("Only public HTTP(S) URLs are supported.")
    async with httpx.AsyncClient(
        follow_redirects=True,
        max_redirects=settings.max_redirects,
        timeout=settings.request_timeout_seconds,
    ) as client:
        response = await client.get(url, headers={"accept": "text/html,application/xhtml+xml"})
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if "html" not in content_type and "text/" not in content_type:
            raise ValueError("URL did not return readable public text.")
        body = response.text[: settings.max_body_bytes]
    links = []
    for href in re.findall(r"<a\b[^>]*href=[\"']([^\"']+)[\"']", body, flags=re.I):
        absolute = urljoin(url, href)
        if is_public_http_url(absolute):
            links.append(absolute)
        if len(links) >= 12:
            break
    return html_to_text(body, 8_000), links


@tool
async def fetch_public_page(url: str) -> str:
    """Fetch a public web page. Placeholder for Phase 3."""
    return f"Public page fetch is not implemented yet for {url}."


@tool
async def extract_public_links(url: str) -> str:
    """Extract public links from a web page. Placeholder for Phase 3."""
    return f"Public link extraction is not implemented yet for {url}."
