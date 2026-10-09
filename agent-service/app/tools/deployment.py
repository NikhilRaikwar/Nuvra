import re

import httpx
from langchain_core.tools import tool

from app.config import Settings
from app.security.urls import is_public_http_url


async def inspect_public_deployment(url: str, settings: Settings) -> dict:
    if not is_public_http_url(url):
        raise ValueError("Only public HTTP(S) deployment URLs are supported.")
    async with httpx.AsyncClient(
        follow_redirects=True,
        max_redirects=settings.max_redirects,
        timeout=settings.request_timeout_seconds,
    ) as client:
        response = await client.get(url, headers={"accept": "text/html,application/xhtml+xml"})
    title_match = re.search(r"<title[^>]*>([\s\S]*?)</title>", response.text[:50_000], flags=re.I)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else ""
    return {
        "status_code": response.status_code,
        "final_url": str(response.url),
        "title": title[:180],
        "content_type": response.headers.get("content-type", ""),
    }


@tool
async def probe_public_deployment(url: str) -> str:
    """Probe public deployment metadata without claiming production usage."""
    return f"Deployment probe is not implemented yet for {url}."
