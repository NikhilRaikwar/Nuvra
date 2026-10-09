import base64
import re

import httpx
from langchain_core.tools import tool

from app.config import Settings
from app.security.untrusted_text import clean_untrusted_text

GITHUB_HEADERS = {
    "accept": "application/vnd.github+json",
    "user-agent": "Nuvra-Agent-Service",
}


def github_handle(input_url: str) -> str | None:
    match = re.match(r"^https?://(?:www\.)?github\.com/([A-Za-z0-9-]{1,39})(?:/.*)?$", input_url.strip())
    if not match:
        return None
    handle = match.group(1)
    if handle.startswith("-") or handle.endswith("-"):
        return None
    return handle


async def github_json(path: str, settings: Settings):
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.get(f"https://api.github.com{path}", headers=GITHUB_HEADERS)
        response.raise_for_status()
        return response.json()


async def list_public_repositories(handle: str, settings: Settings) -> list[dict]:
    repos = await github_json(f"/users/{handle}/repos?per_page=100&sort=updated", settings)
    selected = [
        repo
        for repo in repos
        if not repo.get("fork") and not repo.get("archived")
    ]
    selected.sort(key=lambda repo: (repo.get("stargazers_count", 0), repo.get("pushed_at") or ""), reverse=True)
    return selected


async def get_readme(handle: str, repo: str, settings: Settings) -> str:
    payload = await github_json(f"/repos/{handle}/{repo}/readme", settings)
    if payload.get("encoding") != "base64" or not payload.get("content"):
        return ""
    raw = base64.b64decode(payload["content"]).decode("utf-8", errors="ignore")
    text, _ = clean_untrusted_text(raw, 5_000)
    return text


@tool
async def github_list_repositories(handle: str) -> str:
    """List public GitHub repositories for a handle. Placeholder for Phase 4."""
    return f"GitHub repository listing is not implemented yet for {handle}."


@tool
async def github_search_code(repository: str, query: str) -> str:
    """Search public GitHub code. Placeholder for Phase 4."""
    return f"GitHub code search is not implemented yet for {repository}: {query}."
