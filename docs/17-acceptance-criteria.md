# 17 — Acceptance Criteria

## 1. Product Acceptance

The product is accepted as a complete solution for **Dogfood 2026** when all of the following conditions are met:
* **Core Problem Addressed:** The platform manages the full 10-stage competition lifecycle (registration, team formation, project drafting, server-side UTC hard deadline lock, algorithmic judge routing, weighted rubric scoring, Z-score statistical score normalization, anti-Sybil public voting, and archiving) in a unified, open-source, self-hostable application stack.
* **Target Users Supported:** Visitors, Participants, Judges, Organizers, and Admins can log in and execute their respective workflows through a 5-level Role-Based Access Control (RBAC) system.
* **Required Outcomes Achieved:** The platform launches locally with a single `docker compose up` command, operates 100% offline in an air-gapped environment with zero external cloud SaaS dependencies, loads deterministic seed data (`fixtures.json`) on container boot, isolates evaluation ballots (`WHERE judge_id = auth.uid`), eliminates judge scoring bias via Z-score normalization, and executes an automated test runner logging pass/fail results to `acceptance-report.txt`.
* **P0 Functionality Verified:** All 10 P0 features defined in `08-feature-requirements.md` pass automated tests and manual inspection.

---

## 2. Feature Acceptance

### F001 — Session Authentication & 5-Level RBAC
* [ ] User can register and log in locally via session authentication without third-party cloud identity providers (Auth0/Clerk).
* [ ] System correctly assigns and enforces 5 distinct role levels: `visitor`, `participant`, `judge`, `organizer`, and `admin`.
* [ ] Expected result is that authenticated routes and UI elements strictly reflect assigned user permissions.
* [ ] Error case is handled by returning HTTP 401 Unauthorized or HTTP 403 Forbidden on unauthorized endpoint access.

### F002 — Event, Track & Rubric Management
* [ ] Organizers can create hackathon events, define custom tracks, and build multi-criteria rubrics.
* [ ] System correctly stores criteria weights and binds rubrics to specific tracks in the local database.
* [ ] Expected result is that judges evaluate projects using track-specific weighted rubric criteria.
* [ ] Error case is handled by rejecting incomplete rubric configurations or invalid weight totals.

### F003 — Team Formation & Invite Link Management
* [ ] Participant can create a team and generate a unique join invite link.
* [ ] System correctly enforces team size boundaries (minimum 1 member, maximum 4 members).
* [ ] Expected result is that participants can join teams via invite links until the 4-member limit is reached.
* [ ] Error case is handled by returning an error message when attempting to join a full team (4 members) or join multiple active teams.

### F004 — Project Draft Editing & Submission Gallery
* [ ] Participant can save project drafts, upload media, provide repository/demo URLs, and publish entries.
* [ ] System correctly stores draft states and renders published submissions in a searchable public gallery.
* [ ] Expected result is that participants can continuously update drafts prior to the hard deadline lock.
* [ ] Error case is handled by preventing draft updates from unauthenticated non-team members.

### F005 — Server-Side UTC Hard Deadline Lock
* [ ] Participant attempts project submission or draft updates before and after the deadline cutoff.
* [ ] System correctly validates arrival timestamps against server system UTC time, completely ignoring client-supplied headers.
* [ ] Expected result is that submissions timestamped prior to deadline are marked `submitted`, and late attempts are strictly rejected.
* [ ] Error case is handled by returning an explicit HTTP 422/403 deadline expired error payload on late update attempts.

### F006 — Algorithmic Judge Assignment & Workload Balancing
* [ ] Organizer can trigger algorithmic or batch judge routing across tracks.
* [ ] System correctly distributes project review volumes evenly across assigned judges to prevent review overload.
* [ ] Expected result is that each judge's dashboard displays a balanced queue of assigned projects.
* [ ] Error case is handled by flagging unassigned projects or insufficient judge coverage in administrative views.

### F007 — Backend-Enforced Database Query Isolation
* [ ] Judge queries assigned evaluation sheets via API endpoints.
* [ ] System correctly appends query predicates (`WHERE judge_id = auth.uid`) at the backend controller and database layer.
* [ ] Expected result is that judges can only read and write evaluation sheets explicitly assigned to them.
* [ ] Error case is handled by returning HTTP 403 Forbidden or empty query sets if a judge or participant attempts to access unassigned raw score ballots.

### F008 — Z-Score Statistical Score Normalization
* [ ] Organizer triggers score normalization on completed raw judge rubrics.
* [ ] System correctly computes judge mean ($\mu_j$), standard deviation ($\sigma_j$), divide-by-zero epsilon parameter ($\epsilon = 10^{-6}$), and falls back to Min-Max scaling when a judge reviews fewer than 5 projects ($N_j < 5$).
* [ ] Expected result is that strict and lenient judge scoring biases are mathematically eliminated and final scores are scaled to target global distribution metrics.
* [ ] Error case is handled by preventing division-by-zero crashes on zero-variance judge scores.

### F009 — Single-Command Docker Launch & Auto-Seeding
* [ ] Evaluator executes `docker compose up` on a machine with network interfaces disabled.
* [ ] System correctly orchestrates app, API, and database containers, automatically running seed scripts (`fixtures.json`) on boot.
* [ ] Expected result is that the entire platform becomes operational locally in an air-gapped environment with populated test accounts, rubrics, and projects.
* [ ] Error case is handled by container restart policies recovering from transient database startup delays.

### F010 — Automated Acceptance Test Runner
* [ ] Evaluator runs the automated test harness against the local container stack.
* [ ] System correctly executes unit, integration, and role isolation tests, parsing claimed capabilities from `.dogfood.toml`.
* [ ] Expected result is that plain text pass/fail summary results are written directly to `acceptance-report.txt`.
* [ ] Error case is handled by logging specific assertion failures clearly in `acceptance-report.txt` without crashing the test runner.

### F011 — Anti-Sybil Community Voting (P1)
* [ ] Visitor attempts to cast community votes for public project entries.
* [ ] System correctly applies rate-limiting middleware and IP duplicate detection, hiding real-time tallies during active voting windows.
* [ ] Expected result is that legitimate votes are recorded while rapid automated bot votes are blocked and logged in immutable audit trails.
* [ ] Error case is handled by returning HTTP 429 Too Many Requests when rate limits are exceeded.

---

## 3. User Flow Acceptance

The primary competition lifecycle flow must execute end-to-end without manual intervention or undocumented workarounds:

```text
Start: `docker compose up` & Auto-Seed Loading (`fixtures.json`)
  ↓
1. User Login (Local Session Auth & 5-Level RBAC Role Resolution)
  ↓
2. Team Formation (Create team, generate invite code, join 1–4 participants)
  ↓
3. Draft Editing (Input title, repo URL, demo link, media screenshots)
  ↓
4. Submission Lock (Server validates system UTC timestamp < deadline cutoff)
  ↓
5. Algorithmic Judge Routing (Submissions routed to judges with balanced workloads)
  ↓
6. Query-Isolated Judging (Judges score rubrics via `WHERE judge_id = auth.uid`)
  ↓
7. Score Normalization Engine (Computes Z-scores, handles $\epsilon$, applies Min-Max for $N_j < 5$)
  ↓
8. Results, Public Gallery & CSV Export (Anti-Sybil voting, score exports, audit logs)
  ↓
Success: Acceptance Runner Execution (`acceptance-report.txt` logged with 0 failures)
```

---

## 4. UI/UX Acceptance

* [ ] **Required Screens Exist:** Landing Page, Authentication Portal, Participant Dashboard, Team Management Form, Submission Editor, Public Gallery, Judge Review Queue, Rubric Scoring Form, Organizer Admin Panel, and Audit Logs.
* [ ] **Navigation Works:** Role-aware navigation headers display appropriate tabs based on active RBAC level (`visitor`, `participant`, `judge`, `organizer`, `admin`).
* [ ] **Core Interactions Work:** Team invite links function, draft saving persists text, deadline lock status banners display real-time UTC state, and rubric sliders/inputs record scores.
* [ ] **UI States Function:** Loading spinners display during async API calls, empty gallery states render helpful prompt messages, error banners show server validation messages, and success badges confirm submission locks.
* [ ] **Responsive Behavior Works:** Interface adapts seamlessly across mobile, tablet, and desktop viewports.
* [ ] **Zero Remote Asset Dependencies:** All CSS, JavaScript, fonts, and icons are bundled locally in containers without external CDN calls.
* [ ] **Design System Consistency:** UI adheres to documented visual design principles (`13-design-system.md`) with functional information density and high contrast readability.

---

## 5. Technical Acceptance

* [ ] **Architecture Implemented:** System complies with `10-technical-architecture.md` (single or multi-container local Docker Compose orchestration, containerized database, local session auth).
* [ ] **APIs Function:** REST / GraphQL endpoints respond with standardized HTTP status codes (200, 201, 400, 401, 403, 404, 422, 500) and structured JSON error payloads.
* [ ] **Database & Migrations Work:** Local relational schema initializes cleanly, enforces relational constraints, and persists data across container restarts via Docker volumes.
* [ ] **100% Offline Air-Gapped Operation:** Platform operates with network interfaces disabled, making zero calls to external cloud APIs, Auth0/Clerk, or remote services.
* [ ] **Environment Configuration:** All configuration options managed via local `.env` files and `.dogfood.toml`.
* [ ] **Zero Critical Runtime Errors:** Backend stdout/stderr logs and browser consoles remain free of unhandled exceptions, memory leaks, or unhandled promise rejections.

---

## 6. Security Acceptance

* [ ] **No Secrets Committed:** Zero API keys, private credentials, database passwords, or secret tokens exist in git source control.
* [ ] **Query Isolation Enforced:** Database query predicates (`WHERE judge_id = auth.uid`) strictly prevent judges or participants from reading unassigned score sheets.
* [ ] **Server-Side Deadline Enforcement:** Submission cutoffs validated against server UTC time, discarding client-supplied timestamp headers.
* [ ] **Input Sanitization:** User text input, repository links, and rubric inputs sanitized against cross-site scripting (XSS) and injection attacks.
* [ ] **Rate Limiting:** Public community voting endpoints protected by rate-limiting middleware and IP duplicate detection to block Sybil bot manipulation.
* [ ] **Safe Error Messages:** Public error payloads convey validation guidance without leaking internal database schemas or stack traces.

---

## 7. Testing Acceptance

The project satisfies all testing verification requirements from `16-testing-strategy.md`:

* [ ] **Unit Tests Pass:** Z-score normalization math ($\mu_j$, $\sigma_j$, $\epsilon = 10^{-6}$, Min-Max fallback), UTC deadline validator, and team size rules pass unit test suites.
* [ ] **Integration Tests Pass:** Database queries, session authentication middleware, judge routing, and CSV exports pass integration tests.
* [ ] **Primary E2E Flow Passes:** Complete 10-stage competition lifecycle executes end-to-end without errors.
* [ ] **Typecheck Passes:** Static type checker (`tsc` / type checkers) reports 0 type errors.
* [ ] **Linter Passes:** Code linter reports 0 errors/warnings.
* [ ] **Production Build Succeeds:** Container compilation and startup (`docker compose build && docker compose up`) complete without errors.
* [ ] **Automated Acceptance Report Generated:** Plain-text summary results written cleanly to `acceptance-report.txt`.

---

## 8. Hackathon Acceptance

The final project complies with all rules and constraints specified in `01-hackathon-rules.md`, `03-evaluation-criteria.md`, and `04-constraints.md`:

* [ ] **72-Hour Sprint Mandate:** Code written within event timeline constraints.
* [ ] **Team Sizing:** Supports team sizes of 1 to 4 members.
* [ ] **OSI Open-Source License:** Includes a valid `LICENSE` file in the repository root (e.g., MIT, Apache 2.0).
* [ ] **Standardized Repository Artifacts:** Delivers all required documentation files in proper root/docs structure:
  * `README.md` (deployment and launch instructions)
  * `ARCHITECTURE.md` (component diagrams and state flows)
  * `DATA-MODEL.md` (entity-relationship schemas)
  * `JUDGING.md` (routing mechanics and Z-score math)
  * `docker-compose.yml` (root orchestration file)
  * `src/` (production source code)
  * `tests/` (test suites)
  * `acceptance-report.txt` (automated test runner output)
  * `LICENSE` (OSI open-source license)
  * `.dogfood.toml` (capabilities manifest)
* [ ] **5-Minute Demo Video Script:** Demonstrates single-command deployment, RBAC role workflows, UTC deadline lock, score normalization, and air-gapped offline operation.

---

## 9. Demo Acceptance

The final application is verified demo-ready:

* [ ] **Runnable:** Launches immediately via single-command `docker compose up`.
* [ ] **Stable:** Pre-seeded with realistic fixture data (`fixtures.json`) including test users, events, tracks, teams, rubrics, and draft submissions.
* [ ] **Demonstrates Core Value Quickly:** Instantly showcases server UTC deadline enforcement, query-isolated judge scoring (`WHERE judge_id = auth.uid`), and statistical Z-score score normalization.
* [ ] **Zero Primary Flow Blockers:** Primary user journey executes smoothly without crashes or required manual database interventions.

---

## 10. Final Definition of Done

The Dogfood 2026 project is officially declared **DONE** when every checkbox below is verified:

* [ ] **All P0 Features Pass:** F001 through F010 satisfy all acceptance criteria.
* [ ] **Primary Flow Verified:** End-to-end lifecycle executes successfully.
* [ ] **Air-Gapped Execution Proven:** Platform runs 100% offline via `docker compose up` with zero cloud dependencies.
* [ ] **Query Isolation Verified:** Score sheet privacy enforced at database level (`WHERE judge_id = auth.uid`).
* [ ] **Mathematical Normalization Verified:** Z-score math with Min-Max fallback eliminates judge bias.
* [ ] **Build & Tests Pass:** Container compilation succeeds and `acceptance-report.txt` logs 0 test failures.
* [ ] **Documentation Complete:** All 10 required repository artifacts (`README`, `ARCHITECTURE`, `DATA-MODEL`, `JUDGING`, `docker-compose.yml`, `src/`, `tests/`, `acceptance-report.txt`, `LICENSE`, `.dogfood.toml`) and documentation specs (`docs/01`–`17`) are complete.
* [ ] **Demo Ready:** Seeded local stack ready for recorded video demonstration.

---

## 11. Known Limitations

The following documented design choices are acceptable limitations for the hackathon release:

* **Local Offline Focus over Distributed Cloud Sync:** Designed strictly for single-host container orchestration (`docker compose up`) without multi-region cloud clustering or external SaaS auth integration.
* **Min-Max Fallback for Small Judge Samples ($N_j < 5$):** Statistical Z-score normalization requires sample variance; judges reviewing fewer than 5 entries automatically fall back to Min-Max scaling as documented in `JUDGING.md`.
* **In-Memory / Container Rate Limiting:** Rate limiting on public community voting uses local container memory/storage rather than enterprise cloud WAF services, perfectly matching the air-gapped requirement.
