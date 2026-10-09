import * as fs from "node:fs";
import * as path from "node:path";
import { searchSpeedrunJobs, loadSpeedrunJob, type Job } from "../../src/lib/speedrun.functions";

const FIXTURES_DIR = path.resolve(process.cwd(), "evals/match/fixtures");

const SAMPLE_ROLES: Job[] = [
  {
    id: "job-ai-01",
    title: "Senior AI Engineer",
    company: "Cognitive Labs",
    companySlug: "cognitive-labs",
    companyUrl: "https://cognitive.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-ai-01",
    location: "San Francisco, CA",
    workplaceType: "Hybrid",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Senior",
    remote: true,
    compensation: "$180k-$240k",
    scope: "speedrun / SR04",
    publishedAt: "2026-03-01T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "We are building agentic workflows and LLM evaluation infrastructure. Requirements: 4+ years software engineering, deep experience with Python, TypeScript, LLM agents, RAG, retrieval pipelines, prompt engineering, and Postgres databases. You will design multi-step tool-calling agents and deployment pipelines.",
  },
  {
    id: "job-fs-02",
    title: "Full Stack Founding Engineer",
    company: "HyperScale",
    companySlug: "hyperscale",
    companyUrl: "https://hyperscale.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-fs-02",
    location: "Remote",
    workplaceType: "Remote",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Lead",
    remote: true,
    compensation: "$150k-$200k",
    scope: "a16z / Games",
    publishedAt: "2026-03-02T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Looking for a full stack engineer to ship developer tools. Stack: React, TypeScript, Node.js, Next.js, Tailwind CSS, and Postgres. You will own product features from API design to frontend micro-interactions.",
  },
  {
    id: "job-be-03",
    title: "Backend Platform Engineer",
    company: "DataMesh",
    companySlug: "datamesh",
    companyUrl: "https://datamesh.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-be-03",
    location: "New York, NY",
    workplaceType: "Onsite",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Mid",
    remote: false,
    compensation: "$140k-$175k",
    scope: "speedrun / SR05",
    publishedAt: "2026-03-03T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Build high-throughput distributed backend services. Experience with Go, Python, Postgres, distributed caching, database indexing, and API integrations required.",
  },
  {
    id: "job-fe-04",
    title: "Frontend UI/UX Engineer",
    company: "Interface Studio",
    companySlug: "interface-studio",
    companyUrl: "https://interface.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-fe-04",
    location: "Remote",
    workplaceType: "Remote",
    employmentType: "Full-time",
    function: "Design & Engineering",
    seniority: "Mid",
    remote: true,
    compensation: "$130k-$165k",
    scope: "speedrun / SR03",
    publishedAt: "2026-03-04T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Craft world-class interactive web experiences. Must have mastery of React, TypeScript, Tailwind, CSS animations, and accessibility standards.",
  },
  {
    id: "job-w3-05",
    title: "Smart Contract & Protocol Engineer",
    company: "ChainRelay",
    companySlug: "chainrelay",
    companyUrl: "https://chainrelay.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-w3-05",
    location: "Remote",
    workplaceType: "Remote",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Senior",
    remote: true,
    compensation: "$170k-$220k",
    scope: "speedrun / SR04",
    publishedAt: "2026-03-05T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Design and audit decentralized protocols and onchain smart contracts. Requirements: Solidity, smart contract security, Web3 APIs, DeFi primitives, and automated contract testing.",
  },
  {
    id: "job-fde-06",
    title: "Forward Deployed Engineer (FDE)",
    company: "OmniDeploy",
    companySlug: "omnideploy",
    companyUrl: "https://omnideploy.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-fde-06",
    location: "San Francisco, CA",
    workplaceType: "Hybrid",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Mid",
    remote: true,
    compensation: "$145k-$190k",
    scope: "speedrun / SR05",
    publishedAt: "2026-03-06T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Work directly with enterprise clients to integrate customer deployment workflows and custom AI models. Hands-on integration engineering, Python, API development, and client communication.",
  },
  {
    id: "job-devrel-07",
    title: "Developer Relations Advocate",
    company: "OpenEngine",
    companySlug: "openengine",
    companyUrl: "https://openengine.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-devrel-07",
    location: "Remote",
    workplaceType: "Remote",
    employmentType: "Full-time",
    function: "Developer Relations",
    seniority: "Mid",
    remote: true,
    compensation: "$120k-$160k",
    scope: "speedrun / SR02",
    publishedAt: "2026-03-07T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Grow our open source developer ecosystem. Create technical guides, developer documentation, sample repositories, and engage with the builder community across GitHub and Discord.",
  },
  {
    id: "job-prod-08",
    title: "Product Engineer",
    company: "FlowState",
    companySlug: "flowstate",
    companyUrl: "https://flowstate.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-prod-08",
    location: "Remote",
    workplaceType: "Remote",
    employmentType: "Full-time",
    function: "Product",
    seniority: "Mid",
    remote: true,
    compensation: "$135k-$175k",
    scope: "speedrun / SR04",
    publishedAt: "2026-03-08T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Bridge design and technical implementation for end-user products. Full-stack product development with React, TypeScript, Node.js, and product analytics instrumentation.",
  },
  {
    id: "job-ai-09",
    title: "Junior AI Application Engineer",
    company: "PromptCraft",
    companySlug: "promptcraft",
    companyUrl: "https://promptcraft.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-ai-09",
    location: "Remote",
    workplaceType: "Remote",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Junior",
    remote: true,
    compensation: "$90k-$120k",
    scope: "speedrun / SR05",
    publishedAt: "2026-03-09T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Join as an early AI engineer integrating LLMs and RAG pipelines into web applications. Python, TypeScript, React, and prompt evaluation.",
  },
  {
    id: "job-fs-10",
    title: "Full Stack Engineer (Growth)",
    company: "GrowthLoop",
    companySlug: "growthloop",
    companyUrl: "https://growthloop.example.com",
    canonicalUrl: "https://speedrun-talent-network.com/jobs/job-fs-10",
    location: "Austin, TX",
    workplaceType: "Hybrid",
    employmentType: "Full-time",
    function: "Engineering",
    seniority: "Mid",
    remote: true,
    compensation: "$130k-$170k",
    scope: "speedrun / SR03",
    publishedAt: "2026-03-10T00:00:00Z",
    stealth: false,
    status: "open",
    descriptionText:
      "Build conversion funnels, onboarding flows, and internal growth instrumentation. React, TypeScript, Postgres, API integrations, and experimentation platforms.",
  },
];

export async function recordFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  let roles = SAMPLE_ROLES;

  try {
    const searchRes = await searchSpeedrunJobs({ q: "engineer", page: 0 });
    if (searchRes.jobs.length >= 8) {
      const detailedJobs: Job[] = [];
      for (const job of searchRes.jobs.slice(0, 12)) {
        try {
          const detail = await loadSpeedrunJob(job.id);
          detailedJobs.push(detail);
        } catch {
          detailedJobs.push(job);
        }
      }
      if (detailedJobs.length >= 8) {
        roles = detailedJobs;
      }
    }
  } catch {
    console.log("Speedrun API offline or rate-limited; recorded canonical fixture set.");
  }

  fs.writeFileSync(
    path.join(FIXTURES_DIR, "roles.json"),
    JSON.stringify(roles, null, 2),
    "utf8",
  );
  console.log(`Saved ${roles.length} role fixtures to ${FIXTURES_DIR}/roles.json`);
}

recordFixtures().catch((err) => {
  console.error("Failed to record fixtures:", err);
  process.exit(1);
});

