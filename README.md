# Nuvra

![Nuvra: Live Role, Proof, Signal](public/nuvra-og-banner.png)

Nuvra is a no-login, proof-first job agent for high-agency builders. It reads
live openings from the Speedrun Talent Network, lets a builder keep a private
local profile, discovers roles from that profile, and produces evidence-grounded
fit reports, proof projects, and application drafts.

It does not submit applications, guess hidden companies, or copy full job
descriptions. The goal is to turn a live role into grounded evidence: a fit
report, a small proof project, and an honest application draft.

## What it does

- Loads live roles, facets, role details, and hiring stats from the Speedrun
  Talent Network REST API.
- Filters by search term, function, seniority, location, remote status, and
  portfolio scope.
- Stores the builder profile only in the browser's `localStorage`; no sign-up
  or database is required.
- During an explicit recruiter scan, reads a public GitHub profile for its
  active repositories, languages, README excerpts, and declared live-project
  links. It can also inspect one public portfolio page for project text,
  headings, and public links.
- Runs a server-side recruiter scan: builds a query plan from selected tracks and
  profile and public-project signals, searches the live board, deduplicates candidates, reads up to
  12 current role descriptions, then returns up to eight evidence-backed matches.
- Shows the live search plan, candidate count, description count, profile evidence,
  and posting evidence for every AI-ranked role. A conservative deterministic
  shortlist remains available when the model is unavailable.
- Uses OpenRouter for the explicit profile scan and for a selected open role:
  fit report, proof-project brief, and application draft.
- Links every job to Speedrun's canonical listing and preserves the API's
  stealth masking.

## Architecture

```mermaid
flowchart LR
  Builder[Builder browser] --> UI[Nuvra React UI]
  UI -->|localStorage only| Profile[Local builder profile]
  UI -->|TanStack server functions| Server[Nuvra server]
  Server -->|search, stats, role details; source=nuvra| Speedrun[Speedrun Talent Network API]
  Server -->|public repositories and README excerpts| GitHub[GitHub public API]
  Server -->|one public HTML page and project links| Portfolio[Portfolio site]
  Server --> Recruiter[Recruiter workflow]
  Recruiter -->|query plan, dedupe, inspect 12 postings| Server
  Server -->|selected role + profile| OpenRouter[OpenRouter]
  OpenRouter --> Model[Structured-output LLM]
  Server --> UI
  UI -->|canonical job URL| Listing[Speedrun job listing]
```

## Run locally

Requirements: Node.js 20 or newer and an OpenRouter API key.

```sh
npm install
copy .env.example .env
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Set these values in `.env` before starting the server:

```dotenv
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
APP_URL=http://localhost:3000
VITE_APP_URL=http://localhost:3000
```

`OPENROUTER_API_KEY` is server-only. Do not add it to a `VITE_` variable, commit
`.env`, or paste it into the browser. GPT-4o mini is the cost-aware default and
supports OpenRouter JSON-schema structured outputs. Choose another model only if
its OpenRouter model metadata lists `structured_outputs`.

## Data contract and guardrails

The integration uses the documented API at
[speedrun-talent-network.com/developers](https://speedrun-talent-network.com/developers):

| Nuvra action         | Speedrun endpoint          |
| -------------------- | -------------------------- |
| Search and facets    | `GET /api/v1/jobs`         |
| Role analysis source | `GET /api/v1/jobs/{id}`    |
| Dashboard totals     | `GET /api/v1/stats/hiring` |

- Every request identifies the product with `source=nuvra`.
- Live search, dashboard totals, role detail, and recruiter scans are server-mediated.
  This keeps the OpenRouter key private and avoids browser-network failures while
  preserving the API's `source=nuvra` attribution.
- API caching can make listings a few minutes behind the original company board.
- `scope=everywhere` is only used after the builder enables the broader-universe
  control.
- Stealth listings stay as `Stealth`; there is no bypass or reveal parameter.
- Job descriptions are read server-side for analysis but not rehosted in the UI.
- Apply actions remain on Speedrun's canonical listing. Nuvra never applies
  on a user's behalf.
- Speedrun integration feedback can be sent to [talent@a16zspeedrun.com](mailto:talent@a16zspeedrun.com).

## AI behavior

The recruiter agent searches only the documented Speedrun API for jobs. It turns
selected tracks, resume terms, and factual public-project evidence into a bounded
live query plan, reviews current descriptions for the strongest candidates, and
returns exact profile and posting evidence with each shortlist item. Target-role
choices can guide search, but never count as candidate experience. Senior and staff
roles are capped when the profile lacks explicit seniority evidence.

The selected-role agent fetches the role fresh before every AI request. The server
sends that role detail and the profile currently stored in the browser to OpenRouter.
All agents are instructed to use only supplied profile facts and never invent
employers, repositories, metrics, or credentials.

Structured fit and project outputs are validated with Zod. If a model returns
invalid structured data, the UI shows an error instead of a fake zero-score
report. Application drafts use plain text and are generated only after the
builder selects a format and clicks the button.

## Security and privacy

- Profile data remains in the current browser's `localStorage` until the user
  clears it.
- Opening an AI report sends the selected role and the local profile to the
  configured OpenRouter model. Do not include secrets in the resume field.
- Public GitHub and portfolio enrichment runs only when the builder starts a
  recruiter scan. GitHub reads public repositories and up to four README files;
  portfolio enrichment reads one public HTML page, follows at most three redirects,
  and blocks private/local network destinations. It never reads LinkedIn pages.
- Public-page content is treated as untrusted reference material, not as model
  instructions. A site can decline the request or rate-limit it, in which case
  Nuvra marks that source unavailable and continues with the saved profile.
- TanStack server functions are protected by same-origin CSRF middleware.
- Server input is Zod-validated and job IDs are URL-encoded before API requests.
- There is no account system, server-side profile store, or automated application
  submission.
- Vercel Web Analytics records deployed page views only; Nuvra does not send resume text,
  profile fields, or AI prompts as analytics events.

## Validation

Run the project checks:

```sh
npm run build
npx tsc --noEmit
npm run lint
```

For a live smoke test, start the dev server, load the radar, complete a local
test profile, click `Find my best roles`, open a role, and verify that the fit
report, proof brief, and an application draft each return. The profile scan and
the selected-role actions are paid AI operations; normal search, filters,
pagination, and stats remain live API reads.

## Project structure

```text
src/routes/app.tsx                 Live radar and local profile workflow
src/routes/role.$id.tsx            Selected-role evidence workspace
src/lib/speedrun.functions.ts      Live Speedrun API adapter
src/lib/recruiter.functions.ts     Server-side live-role recruiter workflow
src/lib/profile-enrichment.server.ts Public GitHub and portfolio evidence reader
src/lib/shortlist.functions.ts     Deterministic local ranking
src/lib/scoring.functions.ts       Structured fit-report agent
src/lib/proof.functions.ts         Structured proof-project agent
src/lib/application.functions.ts   Application-draft agent
src/lib/ai-gateway.server.ts       Server-only OpenRouter provider
src/start.ts                       Request error and CSRF middleware
```

## Deploy to Vercel

Import this repository into Vercel, add `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `APP_URL`, and
`VITE_APP_URL` (for example, `https://nuvra.vercel.app`) in the project's environment variables,
then deploy. `VITE_APP_URL` ensures that social crawlers receive an absolute URL for the Nuvra
preview image. Vercel Web Analytics is enabled automatically for deployed builds and does not
need a browser-side API key.

## License

Released under the [MIT License](LICENSE).

## Limitations

- The app does not verify every claim in a resume, public project page, or generated draft.
- GitHub and portfolio evidence requires public access. A portfolio can block or
  rate-limit server requests, and LinkedIn is intentionally not scraped.
- A current role can close between the radar response and opening its report.
- AI output is a working draft, not a truth source. Review it before sending it.
