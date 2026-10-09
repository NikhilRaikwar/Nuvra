import time

from fastapi.testclient import TestClient

from app.main import app


PAYLOAD = {
    "opportunity": {
        "text": "We need an agentic RAG system with retrieval traces, API tools, and tests.",
        "url": None,
        "speedrunJobId": "job_123",
    },
    "profile": {
        "identity": "AI builder",
        "resumeText": "Built a RAG project with manual approval and tests.",
        "githubUrl": "https://github.com/example",
        "portfolioUrl": "",
        "targetRoles": ["AI Engineer"],
    },
}


def main() -> None:
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200

        created = client.post("/v1/runs", json=PAYLOAD)
        assert created.status_code == 200, created.text
        run_id = created.json()["runId"]

        snapshot = None
        for _ in range(40):
            response = client.get(f"/v1/runs/{run_id}")
            assert response.status_code == 200
            snapshot = response.json()
            if snapshot["status"] in {"completed", "failed", "partial", "cancelled"}:
                break
            time.sleep(0.25)

        assert snapshot is not None
        assert snapshot["status"] == "completed", snapshot
        assert snapshot["proofPacket"]
        assert [item["verdict"] for item in snapshot["criticHistory"]] == ["REVISE", "ACCEPT"]
        assert any(event["status"] == "checkpointed" for event in snapshot["traceEvents"])
        print("api smoke ok", run_id)


if __name__ == "__main__":
    main()
