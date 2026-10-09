from app.graph.events import trace_event
from app.graph.state import ProofAgentState
from app.models.schemas import EvidenceNode, ResearchTask, SourceRecord, ToolBudget
from app.scoring.evidence_strength import score_evidence_strength
from app.config import get_settings
from app.tools.deployment import inspect_public_deployment
from app.tools.github import get_readme, github_handle, list_public_repositories
from app.tools.public_web import read_public_page


async def research_planner(state: ProofAgentState) -> dict:
    tasks: list[ResearchTask] = []
    for requirement in state.get("requirements", [])[:6]:
        label = requirement.get("label", "requirement")
        terms = [term.strip() for term in label.split(",") if term.strip()]
        tasks.append(
            ResearchTask(
                id=f"task_{len(tasks) + 1}",
                question=f"Can the candidate show credible evidence for {label}?",
                preferredSources=["github_code", "github_readme", "portfolio"],
                searchTerms=terms,
                priority=requirement.get("priority", "medium"),
            )
        )
    event = trace_event(
        run_id=state["run_id"],
        node="research_planner",
        actor="Research Planner",
        action="create bounded research plan",
        status="completed",
        output_summary=f"{len(tasks)} evidence questions planned",
    )
    return {
        "research_plan": [task.model_dump(mode="json") for task in tasks],
        "current_stage": "research_plan",
        "trace_events": state.get("trace_events", []) + [event],
    }


async def evidence_research_agent(state: ProofAgentState) -> dict:
    settings = get_settings()
    profile = state.get("profile", {})
    budget = ToolBudget.model_validate(state.get("tool_budget", {}))
    evidence_nodes = list(state.get("evidence_nodes", []))
    inspected_sources = list(state.get("inspected_sources", []))
    events = list(state.get("trace_events", []))

    source_texts: list[tuple[str, str, str]] = []
    if profile.get("resumeText"):
        source_texts.append(("profile_claim", "saved profile", profile["resumeText"]))
    if profile.get("portfolioUrl"):
        try:
            text, links = await read_public_page(profile["portfolioUrl"], settings)
            budget.web_fetches += 1
            if text:
                source_texts.append(("documentation", profile["portfolioUrl"], text))
            inspected_sources.append(
                SourceRecord(
                    id=f"src_{len(inspected_sources) + 1}",
                    source_type="portfolio",
                    source_url=profile["portfolioUrl"],
                    summary=f"Portfolio page read; {len(links)} public links found",
                    status="read",
                ).model_dump(mode="json")
            )
            for link in links[:2]:
                if budget.web_fetches >= budget.max_web_fetches:
                    break
                try:
                    deployment = await inspect_public_deployment(link, settings)
                    budget.web_fetches += 1
                    source_texts.append(
                        (
                            "deployment",
                            link,
                            "Deployment probe: "
                            f"HTTP {deployment['status_code']} / title {deployment['title']} / "
                            f"content-type {deployment['content_type']}",
                        )
                    )
                except Exception:
                    continue
            events.append(
                trace_event(
                    run_id=state["run_id"],
                    node="evidence_research_agent",
                    actor="Portfolio Tool",
                    action="fetch public portfolio",
                    status="tool_result",
                    tool="fetch_public_page",
                    output_summary=f"{len(links)} public links extracted",
                )
            )
        except Exception as error:
            inspected_sources.append(
                SourceRecord(
                    id=f"src_{len(inspected_sources) + 1}",
                    source_type="portfolio",
                    source_url=profile["portfolioUrl"],
                    summary=f"Portfolio unavailable: {error}",
                    status="unavailable",
                ).model_dump(mode="json")
            )

    handle = github_handle(profile.get("githubUrl", ""))
    if handle and budget.repo_metadata_reads < budget.max_repo_metadata_reads:
        try:
            repos = await list_public_repositories(handle, settings)
            budget.repo_metadata_reads += min(len(repos), budget.max_repo_metadata_reads)
            selected = repos[: min(5, budget.max_deep_repos)]
            events.append(
                trace_event(
                    run_id=state["run_id"],
                    node="evidence_research_agent",
                    actor="GitHub Tool",
                    action="list public repositories",
                    status="tool_result",
                    tool="github_list_repositories",
                    output_summary=f"{len(repos)} public repos discovered; {len(selected)} selected",
                )
            )
            for repo in selected:
                if budget.file_reads >= budget.max_file_reads:
                    break
                repo_name = repo.get("name", "")
                summary = [
                    f"Repository: {repo.get('full_name', repo_name)}",
                    f"Description: {repo.get('description') or ''}",
                    f"Language: {repo.get('language') or ''}",
                    f"Topics: {', '.join(repo.get('topics') or [])}",
                    f"Homepage: {repo.get('homepage') or ''}",
                ]
                try:
                    readme = await get_readme(handle, repo_name, settings)
                    budget.file_reads += 1
                    if readme:
                        summary.append(f"README: {readme[:3000]}")
                except Exception:
                    pass
                source_texts.append(("documentation", repo.get("html_url", ""), " | ".join(summary)))
                inspected_sources.append(
                    SourceRecord(
                        id=f"src_{len(inspected_sources) + 1}",
                        source_type="github_repository",
                        source_url=repo.get("html_url"),
                        summary=f"{repo.get('full_name', repo_name)} inspected",
                        status="read",
                    ).model_dump(mode="json")
                )
        except Exception as error:
            inspected_sources.append(
                SourceRecord(
                    id=f"src_{len(inspected_sources) + 1}",
                    source_type="github",
                    source_url=profile.get("githubUrl") or None,
                    summary=f"GitHub unavailable: {error}",
                    status="unavailable",
                ).model_dump(mode="json")
            )

    for source_type, source_url, text in source_texts[:3]:
        evidence_type = "profile_claim" if source_type == "profile_claim" else "documentation"
        base, final = score_evidence_strength(
            evidence_type,
            0.55,
            self_reported=evidence_type == "profile_claim",
        )
        node = EvidenceNode(
            id=f"ev_{len(evidence_nodes) + 1}",
            claim=text[:160],
            source_type=source_type,
            source_url=None if source_url == "saved profile" else source_url,
            excerpt=text[:600],
            evidence_type=evidence_type,
            verification_status="self_reported" if evidence_type == "profile_claim" else "unverified",
            base_strength=base,
            relevance_score=0.55,
            final_strength=final,
            supports_requirements=[
                requirement["id"] for requirement in state.get("requirements", [])[:2]
            ],
        )
        evidence_nodes.append(node.model_dump(mode="json"))
        inspected_sources.append(
            SourceRecord(
                id=f"src_{len(inspected_sources) + 1}",
                source_type=source_type,
                source_url=None if source_url == "saved profile" else source_url,
                summary=text[:160],
                status="read",
            ).model_dump(mode="json")
        )

    budget.retrieval_queries += 1
    event = trace_event(
        run_id=state["run_id"],
        node="evidence_research_agent",
        actor="Research Agent",
        action="collect initial bounded evidence",
        status="completed",
        output_summary=f"{len(evidence_nodes)} evidence nodes available",
    )
    return {
        "evidence_nodes": evidence_nodes,
        "inspected_sources": inspected_sources,
        "tool_budget": budget.model_dump(mode="json"),
        "current_stage": "evidence_research",
        "trace_events": events + [event],
    }


async def evidence_indexer(state: ProofAgentState) -> dict:
    event = trace_event(
        run_id=state["run_id"],
        node="evidence_indexer",
        actor="Evidence Indexer",
        action="index evidence placeholders",
        status="checkpointed",
        output_summary=f"{len(state.get('evidence_nodes', []))} evidence records indexed",
    )
    return {
        "current_stage": "evidence_indexed",
        "trace_events": state.get("trace_events", []) + [event],
    }
