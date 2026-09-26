# 10 — Technical Architecture

## 1. Architecture Overview

Dogfood 2026 is designed as a modular, single-container or multi-container local stack orchestrated via a single `docker-compose.yml` manifest. The platform operates 100% offline in an air-gapped environment with zero external cloud dependencies.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        LOCAL CONTAINER ENVIRONMENT                     │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                         Frontend Layer                         │   │
│   │     (Web UI: Responsive Dashboard, Gallery & Scoring Forms)     │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │ Session Auth / JSON API            │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │                      Backend / API Layer                       │   │
│   │  - Auth & 5-Level RBAC Middleware                             │   │
│   │  - Lifecycle & Server UTC Deadline Guard                       │   │
│   │  - Query Isolation Engine (WHERE judge_id = auth.uid)          │   │
│   │  - Z-Score Normalization Engine (Min-Max Fallback)             │   │
│   │  - Anti-Sybil Voting & Rate Limiter                            │   │
│   │  - Acceptance Test Runner & Report Generator                   │   │
│   └───────────────┬────────────────────────────────┬───────────────┘   │
│                   │                                │                   │
│                   ▼                                ▼                   │
│   ┌───────────────────────────────┐┌───────────────────────────────┐   │
│   │        Database Layer         ││     Background & Export       │   │
│   │  - Local Containerized DB     ││  - Auto-Seed Routine          │   │
│   │  - Persistent Volume Storage  ││  - CSV Export Engine          │   │
│   └───────────────────────────────┘└───────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

* **Frontend:** Responsive web interface for Visitors, Participants, Judges, Organizers, and Admins.
* **Backend / API:** REST / GraphQL controllers enforcing 5-level RBAC, server-side UTC deadlines, database query isolation (`WHERE judge_id = auth.uid`), Z-score normalization math, and export generation.
* **Database:** Containerized local relational/document database (e.g., PostgreSQL, SQLite, or MySQL) persisted via Docker volumes.
* **AI / LLM Layer:** None embedded in local runtime (100% offline requirement). AI coding assistants are used strictly during development scaffolding.
* **External APIs / Services:** None. Prohibited by air-gapped offline constraints.
* **Workers / Queues:** Asynchronous local tasks for database auto-seeding on startup and CSV report generation.
* **Storage:** Local container storage and mounted Docker volumes for media uploads and seed fixtures (`fixtures.json`).
* **Authentication:** Local session-based authentication managing session tokens and 5-level RBAC cookies.

---

## 2. Technology Stack

| Layer | Technology | Reason |
| :--- | :--- | :--- |
| **Orchestration** | Docker & Docker Compose (`docker-compose.yml`) | Mandatory requirement for single-command local deployment (`docker compose up`). |
| **Backend API** | Node.js / Go / Python / Rust / Java (Developer Choice) | Full-stack server environment providing REST/GraphQL endpoints, session management, and math capabilities. |
| **Frontend UI** | React / Vue / Svelte / Server-HTML (Developer Choice) | Responsive user interface for gallery browsing, team creation, and judge evaluation sheets. |
| **Database** | PostgreSQL / SQLite / MySQL (Containerized) | Reliable local storage supporting relational schema, indexes, and row-level query filtering (`WHERE judge_id = auth.uid`). |
| **Seed & Test Runner** | Native CLI / Shell Scripts & Test Runners | Automates startup database seeding from `fixtures.json` and outputs pass/fail status to `acceptance-report.txt`. |
| **Config Manifest** | TOML (`.dogfood.toml`) | Machine-readable capability declaration required by official hackathon specification. |

---

## 3. System Components

* **Frontend Component:** Handles client-side rendering, user authentication forms, 5-level RBAC role switching, project draft editing, public gallery search/filtering, judge evaluation forms, and voting interfaces.
* **Backend API Controller:** Executes business logic, validates request authentication, enforces server-side UTC hard deadline lock, isolates judge query evaluation ballots (`WHERE judge_id = auth.uid`), and processes CSV export requests.
* **Normalization Engine:** Implements Z-score statistical score transformation math (\\(Z_{ij} = \frac{S_{ij} - \mu_j}{\sigma_j + \epsilon}\\)) and handles Min-Max fallback when a judge evaluates fewer than 5 submissions (\\(N_j < 5\\)).
* **Database Component:** Maintains persistent tables for users, sessions, events, tracks, teams, submissions, rubrics, scores, community votes, and immutable audit logs.
* **Seed & Test Harness Component:** Executes automatically on container startup to populate fixture data and run acceptance tests that generate `acceptance-report.txt`.

---

## 4. Data Flow

### Primary User & Judging Flow

```text
Participant                   Backend API                      Database
    │                              │                              │
    ├─ Save Draft Project ────────►│                              │
    │                              ├─ Validate Session & Role ───►│
    │                              ├─ Check Server UTC Deadline   │
    │                              └─ Write Draft Record ────────►│
    │                                                             │
    ├─ Submit Final Entry ────────►│                              │
    │  (At Code Freeze)            ├─ Check UTC Timestamp < Limit │
    │                              └─ Mark Submitted ────────────►│
    │                                                             │
Judge                              │                              │
    │                              │                              │
    ├─ Request Assigned Queue ────►│                              │
    │                              ├─ Query Isolation ───────────►│
    │                              │  WHERE judge_id = auth.uid   │
    │                              ◄─ Return Assigned Entries ────┤
    │                              │                              │
    ├─ Submit Rubric Scores ──────►│                              │
    │                              └─ Write Evaluation Ballot ───►│
    │                                                             │
Organizer                          │                              │
    │                              │                              │
    ├─ Trigger Normalization ─────►│                              │
    │                              ├─ Compute Judge Mean & StdDev │
    │                              ├─ Apply Z-Score / Min-Max ────│
    │                              └─ Update Normalized Scores ──►│
```

---

## 5. Data & Storage

* **Stored Entities:**
  * **Users & Sessions:** Local user accounts, hashed credentials, assigned RBAC roles, active sessions.
  * **Events & Tracks:** Competition metadata, track configurations, custom fields, weighted rubrics.
  * **Teams:** Team rosters (1 to 4 members), shareable invite link tokens.
  * **Submissions:** Project metadata, repository URLs, demo links, media asset paths, submission timestamps, draft/submitted status.
  * **Evaluations:** Judge assignments, raw multi-criteria rubric scores, normalized scores, Z-score parameters (mean, stddev).
  * **Public Votes & Audits:** Rate-limited community votes, IP records, immutable administrative audit logs.
* **Persistent vs. Temporary Data:**
  * *Persistent Data:* Databases mounted via Docker volumes storing seeded and user-generated records across container restarts.
  * *Temporary Data:* In-memory session tokens, transient rate-limit caches, and test output buffers.
* **Storage Location:** Local container disk storage and mounted Docker volume directories.

---

## 6. AI Architecture

* **Embedded AI Layer:** **None.** The deployed submission platform runs 100% offline in an air-gapped container environment with zero third-party cloud AI dependencies.
* **Developer AI Usage:** AI coding tools (Claude Code, Cursor, Aider, GitHub Copilot) are used strictly during offline software scaffolding and development to accelerate velocity.

---

## 7. API Architecture

* **Boundary:** REST or GraphQL API endpoints bridging the frontend UI and backend services.
* **Authentication:** Session cookie or HTTP header authorization verified against local session tables on every protected endpoint.
* **Validation:** Server-side request payload validation; strict server UTC clock validation for submission deadline enforcement (ignoring client time headers).
* **Error Handling:** Standardized HTTP status codes (400, 401, 403, 404, 422, 500) paired with structured JSON error responses: `{"error": "Message", "code": "ERROR_CODE"}`.
* **External Integrations:** Zero remote integrations permitted due to 100% air-gapped execution rules.

---

## 8. Security Architecture

* **Authentication & Authorization:** Local session management enforcing a 5-tier role hierarchy (Visitor, Participant, Judge, Organizer, Admin) with explicit API middleware guards.
* **Query & Data Isolation:** Database query predicates (`WHERE judge_id = auth.uid`) enforced at the controller layer to prevent judges or participants from accessing unassigned evaluation ballots.
* **Secret Management:** Zero hardcoded API keys, database passwords, or secret tokens committed to source control; all environment settings configured via local Docker environment files.
* **Input Validation & Anti-Abuse:** Server-side input sanitization, UTC deadline locks, and rate-limiting middleware on public voting endpoints to block Sybil bot manipulation.
* **Data Protection:** Local database volume isolation; no telemetry or data transmission to remote servers.

---

## 9. Deployment Architecture

```text
┌────────────────────────────────────────────────────────────────┐
│                   LOCAL DOCKER COMPOSE STACK                   │
│                                                                │
│  ┌────────────────────┐   ┌─────────────────────────────────┐  │
│  │ Web & API Server   │   │ Relational Database             │  │
│  │ Container          ├───► Container                       │  │
│  │ (App, Static UI,   │   │ (PostgreSQL / SQLite / MySQL)   │  │
│  │  Math Engine)      │   │ [Volume: ./data/db]             │  │
│  └─────────┬──────────┘   └─────────────────────────────────┘  │
│            │                                                   │
│            │ (Auto-Seed on Startup / Run Tests)                │
│  ┌─────────▼──────────┐                                        │
│  │ Seed & Test        │                                        │
│  │ Runner Container   ├───► Output: ./acceptance-report.txt   │
│  └────────────────────┘                                        │
└────────────────────────────────────────────────────────────────┘
```

* **Target Infrastructure:** Local developer machine or evaluation server running Docker Engine and Docker Compose.
* **Containerization:** Single or multi-container `docker-compose.yml` manifest orchestrating the app server, database, and background seed/test scripts.
* **Network Isolation:** Configured to run with network interfaces disabled (air-gapped evaluation).

---

## 10. Architecture Decisions

### Decision: Single-Command Docker Compose Orchestration
**Choice:** Use `docker-compose.yml` to launch the web application, backend API, containerized database, and auto-seeding routines.  
**Reason:** Explicit requirement in hackathon rules to support single-command local deployment (`docker compose up`) without manual dependency installation.  
**Alternative:** Manual local runtime installation (Node/Python/Go) — rejected because it violates the automated, self-contained container requirement.

### Decision: Backend Database Query Isolation (`WHERE judge_id = auth.uid`)
**Choice:** Enforce authorization and score sheet privacy directly within database query predicates and API controllers.  
**Reason:** Prevents authorization bypasses and score leaks that occur when platforms rely on frontend UI hiding.  
**Alternative:** Client-side component filtering — rejected because direct API calls could leak unassigned judge ballots.

### Decision: Z-Score Statistical Score Normalization with Min-Max Fallback
**Choice:** Implement Z-score normalization math (\\(Z_{ij} = \frac{S_{ij} - \mu_j}{\sigma_j + \epsilon}\\)) with an automatic fallback to Min-Max scaling when \\(N_j < 5\\).  
**Reason:** Eliminates strict vs. lenient judge scoring bias while safely handling small review sample sizes and zero-variance edge cases.  
**Alternative:** Raw score averaging — rejected because it distorts competition rankings based on judge scoring habits.

### Decision: Local Session-Based Authentication
**Choice:** Implement session-based authentication backed by local database tables.  
**Reason:** Eliminates third-party cloud authentication dependencies (Auth0, Clerk, Firebase) to guarantee 100% offline air-gapped operation.  
**Alternative:** External OAuth / Cloud SaaS Auth — rejected due to air-gapped network restrictions.

---

## 11. Architecture Checklist

### MUST HAVE
* [x] Core components defined (Frontend, Backend API, Containerized DB, Seed/Test Harness)
* [x] Primary data flow works (Registration → Teams → Drafts → UTC Deadline Lock → Judging → Normalization → Gallery)
* [x] Required integrations work (Local Docker orchestration, auto-seeding from `fixtures.json`, `acceptance-report.txt` generation)
* [x] Secrets protected (Environment variable configuration, zero committed keys)
* [x] Failure handling exists (Divide-by-zero protection in Z-score math, UTC server deadline guards, Min-Max fallback)

### SHOULD HAVE
* [x] Modular services (Clear separation between API controllers, normalization math, RBAC middleware, and DB access)
* [x] Separation of concerns (Frontend UI decoupled from backend business logic and query execution)
* [x] Logging / Observability (Structured console logs during boot seeding and test suite execution)
* [x] Automated testing (Unit, integration, and security role isolation tests outputting to `acceptance-report.txt`)

### UNKNOWN
* [ ] Specific automated test runner CLI binary provided by organizers at kickoff
* [ ] Exact containerized database engine preference (PostgreSQL, SQLite, MySQL are all compliant)

---

## 12. Chosen Stack (decision record, 2026-09-25)

| Layer | Choice | Why |
| :--- | :--- | :--- |
| Runtime | **Node.js 24** (TypeScript, strict) | One language front to back; built-in `crypto` gives scrypt, SHA-256, HMAC and Ed25519 with zero native modules. |
| API | **Express 5** + **Zod 4** | Mature, small; Zod schemas validate every request *and* generate the OpenAPI 3.1 document (`z.toJSONSchema`). |
| Database | **PostgreSQL 16** via `pg` | Real transactions, `FOR UPDATE` locking for team capacity and invite consumption, full-text search, and **Row-Level Security** as the last isolation layer. |
| Frontend | **React 19 + Vite + React Router + TanStack Query**, **Tailwind CSS v4** with Material 3 Expressive tokens | Built to static files and served by the API container — same origin, strict CSP, no runtime Node server for the UI, fully offline. |
| Fonts & icons | `@fontsource-variable/google-sans-flex`, `@fontsource-variable/roboto-flex`, `material-symbols` (bundled at build) | No CDN; works with the network unplugged. |
| Tests | **Vitest** (unit + integration against real Postgres), **Playwright** (UI e2e), **Python stdlib acceptance runner** (`acceptance/run.py`) | The acceptance runner needs nothing beyond `python3`. |
| Packaging | pnpm workspace + Turborepo; multi-stage Dockerfile; `docker-compose.yml` with **two services**: `app` and `db` | Matches the "two containers" wording and the doc §9 deployment sketch (one web+API container, one DB container). |

### Repository layout (required by the brief)
```
src/core   pure domain logic: normalization, Bradley-Terry, assignment, deadline, RBAC matrix, schemas
src/api    Express server, repositories, migrations, seed, worker (webhooks)
src/web    React SPA (Material 3 Expressive)
tests/     unit, integration, security (isolation) and e2e suites
acceptance/run.py  tier-by-tier acceptance runner → acceptance-report.txt
```

### Isolation in depth
1. **Route guard** — `requireRole()` / `requireEventRole()` middleware.
2. **Repository predicate** — every ballot query is written `WHERE judge_id = $currentUser`.
3. **Postgres RLS** — `scores`, `ballots`, `assignments` and `pairwise_votes` have `FORCE ROW LEVEL SECURITY`; each request runs in a transaction with `set_config('app.user_id', …, true)` and `set_config('app.role', …, true)`. A forgotten `WHERE` still returns only the caller's rows.

### Time source
Deadlines compare against the **server clock** (`Date.now()` inside the API, `now()` inside the DB trigger). Client headers such as `Date` are ignored. A DB trigger on `submissions` rejects content changes after the deadline as a second line of defence.
