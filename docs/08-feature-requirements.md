# 08 — Feature Requirements

## 1. Feature Priority

* **P0 — Must Have:** Core Tier 1 infrastructure, Tier 2 judging and normalization mechanics, 5-level RBAC, UTC hard deadline locks, single-command Docker launch, automatic database seeding, backend query isolation (`WHERE judge_id = auth.uid`), and automated acceptance test runner generating `acceptance-report.txt`.
* **P1 — Should Have:** Tier 3 public engagement capabilities, anti-Sybil community voting (rate limiting, IP duplicate detection, hidden tallies), audit logging, and CSV exports.
* **P2 — Nice to Have:** Tier 4 platform extensions (OpenAPI specs, webhooks, verifiable signed certificates, gallery widgets) and technical bonus challenges (Z-score math proofs, pairwise Bradley-Terry preference modeling, security threat model).

---

## 2. Core Features

### F001 — Session Authentication & 5-Level RBAC
* **Priority:** P0
* **Purpose:** Enforce role-based permission boundaries across the entire application lifecycle.
* **User:** Visitor, Participant, Judge, Organizer, Admin.
* **Behavior:** Authenticates users via local session tokens and restricts access according to a 5-tier role hierarchy.
* **Acceptance Criteria:**
  * [ ] Authenticates users locally without third-party cloud auth services (Auth0/Clerk).
  * [ ] Enforces role access limits across Visitor, Participant, Judge, Organizer, and Admin levels.
  * [ ] Blocks unauthorized API endpoint access with standard HTTP 401/403 responses.

### F002 — Event, Track & Rubric Management
* **Priority:** P0
* **Purpose:** Allow organizers to configure multi-track competition parameters and multi-criteria rubrics.
* **User:** Organizer, Admin.
* **Behavior:** Enables creation of event tracks, custom project fields, and weighted multi-criteria judging rubrics.
* **Acceptance Criteria:**
  * [ ] Organizers can define tracks and custom submission metadata fields.
  * [ ] Organizers can construct multi-criteria rubrics with configurable criteria weighting.
  * [ ] Rubric configuration is stored deterministically in the local database.

### F003 — Team Formation & Invite Link Management
* **Priority:** P0
* **Purpose:** Enable participants to assemble teams of 1 to 4 members prior to project submission.
* **User:** Participant.
* **Behavior:** Generates unique shareable invite links for team joining and manages member rosters.
* **Acceptance Criteria:**
  * [ ] Participants can create teams and generate secure invite links.
  * [ ] Enforces minimum (1) and maximum (4) team size limits.
  * [ ] Prevents participants from joining multiple active teams within the same event.

### F004 — Project Draft Editing & Submission Gallery
* **Priority:** P0
* **Purpose:** Allow teams to edit project drafts and publish completed submissions to a public gallery.
* **User:** Participant, Visitor.
* **Behavior:** Supports saving draft states, uploading media assets, specifying repo links, and publishing to a public gallery.
* **Acceptance Criteria:**
  * [ ] Teams can save and update project drafts up until the hard submission deadline.
  * [ ] Supports repository URLs, demo links, image uploads, and descriptive copy.
  * [ ] Searchable and filterable public gallery displays published entries.

### F005 — Server-Side UTC Hard Deadline Lock
* **Priority:** P0
* **Purpose:** Guarantee submission deadline integrity and prevent late updates or timestamp tampering.
* **User:** Organizer, Participant.
* **Behavior:** Rejects all submission creation or modification requests timestamped after the server UTC deadline.
* **Acceptance Criteria:**
  * [ ] Server validates request arrival time against system UTC clocks.
  * [ ] Rejects POST/PATCH updates submitted after deadline cutoff with an explicit error.
  * [ ] Ignores client-supplied time headers to prevent local clock manipulation.

### F006 — Algorithmic Judge Assignment & Workload Balancing
* **Priority:** P0
* **Purpose:** Distribute submitted projects evenly among assigned judges across tracks.
* **User:** Organizer, Judge.
* **Behavior:** Routes submissions to judges automatically or via batch assignment while balancing review volume.
* **Acceptance Criteria:**
  * [ ] Organizers can assign judges to specific tracks or project batches.
  * [ ] Prevents judge assignment overload through balanced routing distribution.
  * [ ] Displays assigned review queues cleanly inside each judge's dashboard.

### F007 — Backend-Enforced Database Query Isolation
* **Priority:** P0
* **Purpose:** Ensure strict evaluation ballot privacy and prevent cross-judge or participant score leaks.
* **User:** Judge.
* **Behavior:** Restricts score read/write operations at the API and database query layer (`WHERE judge_id = auth.uid`).
* **Acceptance Criteria:**
  * [ ] Database queries explicitly filter score sheets by `judge_id = auth.uid`.
  * [ ] Judges cannot query or view unassigned evaluation sheets via direct API calls.
  * [ ] Participants cannot access raw judge ballots or un-normalized score data.

### F008 — Z-Score Statistical Score Normalization
* **Priority:** P0
* **Purpose:** Eliminate judge strictness and leniency bias across evaluation panels.
* **User:** Organizer, Judge.
* **Behavior:** Transforms raw judge scores using Z-score math ($Z_{ij} = \frac{S_{ij} - \mu_j}{\sigma_j + \epsilon}$) with Min-Max fallback for $N_j < 5$.
* **Acceptance Criteria:**
  * [ ] Computes judge mean ($\mu_j$) and standard deviation ($\sigma_j$) dynamically.
  * [ ] Incorporates zero-variance epsilon parameter ($\epsilon = 10^{-6}$) to prevent divide-by-zero errors.
  * [ ] Falls back to Min-Max scaling when a judge reviews fewer than 5 projects ($N_j < 5$).
  * [ ] Scales normalized outputs back to target 0–100 global distribution metrics.

### F009 — Single-Command Docker Launch & Auto-Seeding
* **Priority:** P0
* **Purpose:** Guarantee instant, air-gapped local execution without external cloud dependencies.
* **User:** Organizer, Developer/Evaluator.
* **Behavior:** Orchestrates web, API, database, and workers via `docker compose up` and auto-populates fixture data.
* **Acceptance Criteria:**
  * [ ] Entire stack launches successfully using `docker compose up`.
  * [ ] Runs completely offline with network interfaces disabled (zero cloud SaaS dependencies).
  * [ ] Database seed scripts automatically populate test users, events, rubrics, and submissions on boot.

### F010 — Automated Acceptance Test Runner
* **Priority:** P0
* **Purpose:** Verify platform capabilities against `.dogfood.toml` and generate evaluation evidence logs.
* **User:** Developer/Evaluator.
* **Behavior:** Executes test suites against the local stack and outputs pass/fail status to `acceptance-report.txt`.
* **Acceptance Criteria:**
  * [ ] Executes unit, integration, and security role isolation tests.
  * [ ] Parses claimed functional tiers from `.dogfood.toml`.
  * [ ] Outputs clean plain text pass/fail summary report directly to `acceptance-report.txt`.

### F011 — Anti-Sybil Community Voting & Audit Logs
* **Priority:** P1
* **Purpose:** Support public community choice voting while blocking bot stuffing and vote manipulation.
* **User:** Visitor, Public Voter, Organizer.
* **Behavior:** Enforces rate limiting and IP duplicate detection, hides real-time tallies, and maintains audit trails.
* **Acceptance Criteria:**
  * [ ] Configurable voting modes (open, email-gated, authenticated participant).
  * [ ] Rate-limiting middleware and IP duplicate detection block automated vote stuffing.
  * [ ] Real-time vote counts remain hidden from public view during active voting windows.
  * [ ] Logs immutable audit records for vote events and administrative overrides.

### F012 — Pairwise Bradley-Terry Comparison Engine
* **Priority:** P2 (Bonus Challenge)
* **Purpose:** Offer head-to-head project comparisons as an alternative to absolute numerical scoring.
* **User:** Judge, Organizer.
* **Behavior:** Presents two projects side-by-side to judges and computes global rankings using Bradley-Terry preference modeling.
* **Acceptance Criteria:**
  * [ ] Presents side-by-side binary comparison interface to judges.
  * [ ] Computes global project rankings using Bradley-Terry mathematical preference estimators.
  * [ ] Functions alongside or independently from rubric scoring engines.

---

## 3. User Flow

```text
Visitor / Participant
  ↓
1. Local Registration / Login (Session Auth & 5-Level RBAC)
  ↓
2. Team Creation or Join (Invite link handling, 1–4 members)
  ↓
3. Project Draft Editing & Media Uploads
  ↓
4. Final Submission Lock (Server-side UTC hard deadline verification)
  ↓
5. Algorithmic Judge Routing (Workload balancing & assignment queues)
  ↓
6. Rubric Evaluation & Pairwise Judging (Query-isolated score entry: WHERE judge_id = auth.uid)
  ↓
7. Z-Score Score Normalization Engine (Bias elimination & Min-Max fallback)
  ↓
8. Public Gallery, Anti-Sybil Voting & CSV Score Export (Results & Audit Logs)
```

---

## 4. Functional Requirements

* **User Management:**
  * System MUST manage session authentication locally without external cloud identity providers.
  * System MUST enforce a 5-tier role hierarchy (Visitor, Participant, Judge, Organizer, Admin).
* **Teams & Submissions:**
  * System MUST enforce team sizes between 1 and 4 members via unique invite links.
  * System MUST allow participants to save project drafts prior to deadline cutoff.
  * System MUST reject project submission or modification attempts after the server UTC deadline.
* **Judging & Security:**
  * System MUST automatically or batch-assign projects to judges with workload balancing.
  * System MUST restrict database query access to evaluation sheets (`WHERE judge_id = auth.uid`).
  * System MUST normalize scores statistically using Z-score calculations (with Min-Max fallback for $N_j < 5$).
* **Operability & Reporting:**
  * System MUST start completely offline via `docker compose up` with auto-populated seed data.
  * System MUST execute automated test suites and write results to `acceptance-report.txt`.
  * System MUST export project scores and evaluation metrics to CSV files.

---

## 5. AI / Intelligence Features

* **AI Usage Rules & Restrictions:**
  * AI tools (Claude Code, Cursor, Aider, GitHub Copilot) are permitted for development scaffolding and velocity.
  * AI functionality is **not** required as an embedded product feature within the submission judging platform itself.
  * All submitted code must be fully understood, maintainable, and supported by documentation (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`).

---

## 6. Feature Dependencies

```text
Docker Compose Orchestration & Auto-Seeding (F009)
    ↓
Session Authentication & 5-Level RBAC (F001)
    ↓
Event, Track & Rubric Setup (F002) ──► Team Formation & Invites (F003)
    ↓                                      ↓
Algorithmic Judge Routing (F006)   ──► Project Drafts & UTC Deadline Lock (F004, F005)
    ↓
Query-Isolated Rubric Evaluation (F007)
    ↓
Z-Score Statistical Score Normalization (F008)
    ↓
Public Gallery, Anti-Sybil Voting & CSV Exports (F011)
    ↓
Automated Acceptance Test Runner & Report (F010)
```

---

## 7. Out of Scope

* **Third-Party SaaS Cloud Integrations:** Integration with Auth0, Clerk, Firebase, hosted databases, or remote email APIs is strictly prohibited.
* **Unstable Tier 4 Stretch Features at the Expense of Core:** Building webhooks, gallery widgets, or complex APIs before completing Tier 1 and Tier 2 functionality is out of scope.
* **Client-Side Deadline Validation:** Client clock verification without backend UTC validation is explicitly rejected.
* **Frontend-Only Authorization:** UI component hiding without database query isolation (`WHERE judge_id = auth.uid`) is non-compliant.

---

## 8. Feature Checklist

### P0 — MUST BUILD
* [ ] F001 — Session Authentication & 5-Level RBAC
* [ ] F002 — Event, Track & Rubric Management
* [ ] F003 — Team Formation & Invite Link Management
* [ ] F004 — Project Draft Editing & Submission Gallery
* [ ] F005 — Server-Side UTC Hard Deadline Lock
* [ ] F006 — Algorithmic Judge Assignment & Workload Balancing
* [ ] F007 — Backend-Enforced Database Query Isolation (`WHERE judge_id = auth.uid`)
* [ ] F008 — Z-Score Statistical Score Normalization (with Min-Max fallback for $N_j < 5$)
* [ ] F009 — Single-Command Docker Launch & Auto-Seeding
* [ ] F010 — Automated Acceptance Test Runner (`acceptance-report.txt`)

### P1 — SHOULD BUILD
* [ ] F011 — Anti-Sybil Community Voting & Audit Logs
* [ ] CSV Export Utilities for Scores and Metrics

### P2 — IF TIME ALLOWS
* [ ] F012 — Pairwise Bradley-Terry Comparison Engine (Bonus +5)
* [ ] Z-Score Normalization Mathematical Proof & Live Demonstration (Bonus +5)
* [ ] Documented Threat Model & OpenAPI Specification (Bonus +6)

### NOT IN SCOPE
* [ ] External cloud SaaS dependencies (Auth0, Clerk, hosted databases, remote APIs)
* [ ] Unstable Tier 4 features built before verifying Tier 1 & Tier 2 correctness
* [ ] Client-side clock deadline validation or UI-only authorization hiding

---

## 9. Research-Verified Additions (2026-09-25)

The confirmed tier lists (see `05-website-research.md` §8) add requirements that the original feature list did not name. They are tracked here with the tier that the acceptance suite will attribute them to.

| ID | Feature | Tier | Priority | Notes |
| :--- | :--- | :---: | :---: | :--- |
| F013 | Event lifecycle: create → edit → **publish**, with schedule (registration, submission deadline, judging, voting, results), tracks, **prizes**, **custom submission questions** | T1 | P0 | Unpublished events are invisible to non-organizers. |
| F014 | **Event registration** before team formation | T1 | P0 | Registration is a precondition for creating/joining a team. |
| F015 | **Single-use, expiring** team invite links | T1 | P0 | Token stored hashed; consumed atomically; default TTL 72h. |
| F016 | Full submission fields: name, tagline, description, **thumbnail**, **gallery images**, demo video URL, repo URL, live link, **tech tags**, track, **answers to organizer questions** | T1 | P0 | Local file uploads on a Docker volume; no external storage. |
| F017 | **Eligibility** review (eligible / ineligible with reason) before judging | T1/T2 | P0 | Ineligible projects are never routed to judges. |
| F018 | **Judge invitations** (single-use links, optional track scope) and **conflict-of-interest** exclusion | T2 | P0 | Track-scoped judges cannot read other tracks. |
| F019 | **Judge progress tracking** (per judge and per track) | T2 | P0 | Organizer matrix + judge progress bar. |
| F020 | Community voting access modes: **open-link, email-gated, authenticated**; **comments**; **randomized ordering**; hidden results until the window closes | T3 | P1 | Email codes delivered through a local outbox (no email API). |
| F021 | Quadratic voting (credits, cost = votes²) as an organizer option | T3 | P1 | Defended in `THREAT-MODEL.md`. |
| F022 | Readable, **tamper-evident** audit trail | T3 | P1 | Hash-chained rows + verify endpoint. |
| F023 | REST API with personal API tokens covering every UI action; OpenAPI 3.1 document generated from the same Zod schemas that validate requests | T4 | P2 | Bonus "API First". |
| F024 | Outbound **webhooks** with HMAC-SHA256 signatures and retry | T4 | P2 | Delivered by an in-process worker. |
| F025 | **Certificates** + **signed, publicly verifiable judge participation records** (Ed25519) | T4 | P2 | Public verify page + public key endpoint. |
| F026 | **Embeddable gallery widget** (`/embed/:slug`, iframe-safe) | T4 | P2 | Framing allowed only on the embed route. |
| F027 | **Bulk import/export** (event JSON bundle, CSV) | T4 | P2 | Import accepts the `fixtures.json` shape. |

### Updated checklist
* [ ] F013–F019 are P0 because the acceptance suite attributes them to T1/T2.
* [ ] F020–F022 are required before claiming T3 in `.dogfood.toml`.
* [ ] F023–F027 are required before claiming T4 in `.dogfood.toml`.
* [ ] Never claim a tier whose acceptance checks fail — overclaiming is scored below the verified tier.
