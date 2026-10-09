from langchain_openrouter import ChatOpenRouter

from app.config import Settings


def create_openrouter_model(settings: Settings, model_name: str) -> ChatOpenRouter:
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")
    return ChatOpenRouter(
        model=model_name,
        temperature=0,
        max_tokens=1200,
        max_retries=2,
        api_key=settings.openrouter_api_key,
        app_url=settings.agent_service_url,
        app_title="Nuvra Agent Service",
    )

