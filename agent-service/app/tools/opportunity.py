import httpx

from app.config import Settings
from app.security.untrusted_text import clean_untrusted_text
from app.security.urls import is_public_http_url


async def fetch_opportunity_url(url: str, settings: Settings) -> str:
    if not is_public_http_url(url):
        raise ValueError("Only public HTTP(S) opportunity URLs are supported.")
    async with httpx.AsyncClient(
        follow_redirects=True,
        max_redirects=settings.max_redirects,
        timeout=settings.request_timeout_seconds,
    ) as client:
        response = await client.get(url, headers={"accept": "text/html,text/plain"})
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if "text/" not in content_type and "html" not in content_type:
            raise ValueError("Opportunity URL did not return readable text.")
        text, _ = clean_untrusted_text(response.text, settings.max_body_bytes)
        return text


async def load_speedrun_opportunity(speedrun_job_id: str, settings: Settings) -> str:
    url = f"https://speedrun-talent-network.com/api/v1/jobs/{speedrun_job_id}?source=nuvra"
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.get(url, headers={"accept": "application/json"})
        response.raise_for_status()
        payload = response.json()
    job = payload.get("job", payload)
    parts = [
        job.get("title", ""),
        job.get("company", ""),
        job.get("function", ""),
        job.get("seniority", ""),
        job.get("description_text", ""),
    ]
    text, _ = clean_untrusted_text("\n".join(str(part) for part in parts if part), settings.max_body_bytes)
    return text
