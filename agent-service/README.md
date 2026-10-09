# Nuvra Agent Service

FastAPI + LangGraph service for Nuvra 2.0 proof compilation.

The service owns stateful proof runs, trace events, tool budgets, checkpoints, and
the backend proof compiler workflow. The existing TanStack app remains the web
product and calls this service over HTTP.

## Local setup

```sh
cd agent-service
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Required environment is read from the repository `.env` or the shell:

```dotenv
OPENROUTER_API_KEY=
NUVRA_REASONING_MODEL=openai/gpt-4o-mini
NUVRA_PLANNER_MODEL=openai/gpt-4o-mini
NUVRA_CRITIC_MODEL=openai/gpt-4o-mini
DATABASE_URL=
NUVRA_WEB_ORIGIN=http://localhost:3000
```

## Current phase

This is the backend correctness foundation:

- `POST /v1/runs` creates a run and starts the graph in the background.
- `GET /v1/runs/{run_id}` returns a safe run snapshot.
- `GET /v1/runs/{run_id}/events` streams first-party trace events as SSE.
- `POST /v1/runs/{run_id}/retry` retries from safe stored input.
- `POST /v1/runs/{run_id}/cancel` marks a run as cancelled.
- `GET /health` reports service health.

The first graph contains real conditional routing and deterministic placeholder
agents. Later phases replace placeholders with the GitHub/web/RAG/LLM tools
without changing the API contract.

