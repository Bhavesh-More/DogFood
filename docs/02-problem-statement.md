# 02 — Problem Statement

## 1. Problem

* **What problem participants must solve:** Participants must engineer a modern, open-source, self-hostable competition platform that manages the entire lifecycle of a hackathon—from registration, team formation, project submissions, and hard deadlines to judge routing, weighted rubric evaluation, statistical score normalization, public voting integrity, and archiving [2, 6, 37, 89, 92].
* **Who experiences this problem:** Hackathon organizers (such as Hackathon Raptors, who have run over 35 global hackathons across 85+ countries) [2, 37, 89], volunteer judges, and hackathon participants [2, 5, 6, 27].
* **Where/when the problem occurs:** During multi-tenant hackathon management and competition lifecycle administration [2, 6, 37, 89, 92].
* **Why the problem matters:** A hackathon is a stateful data pipeline where each stage feeds the next [6, 92]. Flaws in deadline parsing, authorization, or judge routing cascade directly into judging—the component participants care about most—resulting in rankings distorted by judge scoring habits or security leaks rather than project quality [5, 6, 7, 93, 104].
* **Current situation / existing gap:** Existing hackathon tools handle basic CRUD workflows but suffer from operational friction, state desynchronization, authorization leaks, judge scoring variance, voting abuse, and heavy dependency on third-party cloud SaaS services (Auth0, managed databases, external APIs) [2, 4, 5, 12, 89, 99, 104].

---

## 2. Target Users

* **Organizers (e.g., Hackathon Raptors):**
  * *Who they are:* Multi-tenant competition hosts managing global hackathons across dozens of countries [2, 37, 89].
  * *Relevant needs:* Reliable lifecycle data management, automated judge routing, configurable weighted rubrics, server-side UTC deadline enforcement, audit trails, CSV exports, and easy local self-hosting [2, 3, 4, 7, 8, 12, 94, 99].
  * *Main pain points:* Operational friction across fragmented tools, deadline enforcement failures, judge bias distortion, vote stuffing, and SaaS vendor lock-in [2, 6, 12, 89, 104, 108].
  * *Goal:* Run seamless, secure, and fair hackathons on an open-source platform they control and operate locally [3, 26, 89, 94].

* **Judges:**
  * *Who they are:* Domain experts assigned to evaluate hackathon submissions [5, 8, 27, 96].
  * *Relevant needs:* Balanced assignment workloads, clear weighted rubrics, scoring privacy from other judges/tracks, progress tracking, and pairwise comparison options [5, 8, 9, 17, 21, 96, 107].
  * *Main pain points:* Overlapping/unbalanced review assignments, raw score averages favoring lenient judges over strict judges, and authorization leaks exposing evaluation ballots [5, 8, 21, 104, 108].
  * *Goal:* Fairly, securely, and efficiently evaluate assigned projects [5, 8, 21, 104].

* **Participants:**
  * *Who they are:* Solo developers or teams of 1 to 4 building and submitting projects [3, 7, 36, 90, 95].
  * *Relevant needs:* User registration, team formation via invite links, project draft editing until deadline, public gallery discovery, and fair, unbiased judging [7, 8, 10, 95, 97].
  * *Main pain points:* Submission rejection confusion caused by client clock mismatches, unfair rankings from scoring bias or Sybil vote manipulation, and unverified judging [5, 6, 7, 10, 104, 108].
  * *Goal:* Form teams, submit project drafts before deadlines, explore competing entries, and receive fair evaluation [6, 7, 10, 95].

* **Public / Community Voters:**
  * *Who they are:* Community members participating in public project voting or discussion [7, 10, 97].
  * *Relevant needs:* Searchable project gallery, clear voting access modes (open, email-gated, or authenticated), and transparent audit trails [7, 10, 97].
  * *Main pain points:* Results leaked prematurely during voting windows, automated bot stuffing, and duplicate account manipulation [10, 97, 108].
  * *Goal:* Discover entries and vote in an abuse-resistant community gallery [10, 97].

---

## 3. Core Challenge

* **Required Problem to Solve:**
  * Build a self-hostable, open-source submission and judging platform managing the full competition lifecycle [2, 3, 6, 37, 89, 92].
  * Satisfy Tier 1 core requirements (auth, RBAC, teams, drafts, UTC hard deadlines, public gallery) and Tier 2 judging requirements (algorithmic routing, weighted rubrics, backend query isolation, Z-score/Min-Max score normalization, CSV exports) [7, 8, 94, 95, 96, 105-107].
  * Guarantee local execution via a single `docker compose up` command in a fully air-gapped environment with seeded fixture data and automated acceptance report generation [12, 13, 99, 100].

* **Related Problems (Optional Tier Extensions & Bonuses):**
  * Tier 3 Public Engagement (anti-Sybil community voting, rate limiting, quadratic voting, audit trails) [10, 94, 97].
  * Tier 4 Platform Extensions (REST/GraphQL APIs, webhooks, verifiable signed judge records, gallery widgets) [11, 94, 98].
  * Technical Bonuses: Mathematical normalization proof, pairwise Bradley-Terry voting, security threat model, and OpenAPI spec [16-18].

* **Out of Scope / Non-Priorities:**
  * Unstable Tier 4 extensions built at the expense of core Tier 1 and Tier 2 correctness ("A clean, correct T2 is better than a broken T4") [11, 94, 114].
  * Third-party cloud SaaS services (Auth0, Clerk, hosted databases, external email APIs) are explicitly prohibited for local evaluation [12, 99].

---

## 4. Existing Solutions / Current Approach

* **Existing Approaches:** Conventional hackathon portals (e.g., Unstop, Devpost, or custom CRUD applications) [4, 15, 37, 89].
* **Their Limitations:**
  * **Raw Score Averaging:** Averages raw judge scores without statistical normalization, causing lenient judges to elevate projects and strict judges to depress them [5, 15, 22, 104].
  * **Frontend-Only Security:** Hides administrative or judging elements in UI components rather than enforcing row-level query isolation (`WHERE judge_id = auth.uid`) at the API/database layer [5, 6, 9, 21, 96, 108].
  * **SaaS Dependency & Lock-in:** Requires multiple external cloud services to run, preventing simple, air-gapped local deployment [12, 23, 99].
  * **Voting & Deadline Vulnerabilities:** Susceptible to Sybil attacks, bot ballot stuffing, and client clock manipulation during project submission [6, 10, 18, 95, 108].
* **Identified Gaps:** Absence of an open-source, deterministic data pipeline and judging engine capable of running completely offline with mathematical score normalization and backend security isolation [4, 6, 12, 89, 94, 99, 104].
* **Why a New Solution is Needed:** Hackathon Raptors requires a production-grade platform that can be officially forked, self-hosted, and operated for future global hackathons [3, 26, 89, 94].

---

## 5. Desired Outcome

A successful solution provides a self-contained, open-source competition platform that launches locally with `docker compose up`, operates completely offline with pre-seeded data, validates submissions against server-side UTC hard deadlines, enforces query-level backend role isolation, normalizes judge scores statistically to eliminate judge bias, passes automated acceptance tests, and delivers clean, maintainable, and well-documented architectural specifications [3, 8, 12, 13, 14, 15, 94, 99, 101, 105-107].

---

## 6. Key Constraints

* **User Constraints:** Enforce a 5-tier role hierarchy (Visitor, Participant, Judge, Organizer, Admin) with session authentication [7, 95].
* **Technical Constraints:** 
  * Orchestrated locally via single-command `docker compose up` [12, 99].
  * Zero external network dependencies (air-gapped execution with network interfaces disabled) [12, 99].
  * Backend query/role isolation (`WHERE judge_id = auth.uid`) enforced at the API/database layer, never UI-only [5, 9, 96, 108].
* **Data Constraints:**
  * Server-side UTC hard deadline verification rejecting client-supplied timestamps [7, 95, 108].
  * Deterministic database seeding on container boot [12, 100].
  * Z-score statistical score normalization with Min-Max fallback for small sample sizes ($N_j < 5$) [8, 105-107].
* **Business & Operational Constraints:**
  * OSI-approved open-source license [14, 91, 101].
  * Standardized repository structure (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `docker-compose.yml`, `src/`, `tests/`, `acceptance-report.txt`, `LICENSE`, `.dogfood.toml`) [13, 14, 101].
* **Time Constraints:** Built within a 72-hour hackathon engineering sprint [3, 37, 90].
* **Platform Constraints:** Must generate plain-text test results in `acceptance-report.txt` when automated acceptance suites run against the stack [13, 100, 101].

---

## 7. Problem → Solution Requirements

| Identified Problem | Required Solution Capability |
| :--- | :--- |
| Fragmented hackathon management tools cause state desynchronization [2, 6, 92] | System must unify the complete lifecycle (auth, teams, drafts, deadlines, judging, voting) in a single backend pipeline [6, 7, 8, 10, 92, 94]. |
| Client clock manipulation bypasses submission deadlines [6, 93, 108] | System must validate submission deadlines server-side using UTC timestamps [7, 95, 108]. |
| Strict vs. lenient judges distort raw score averages [5, 22, 104] | System must implement Z-score statistical score normalization with Min-Max fallback [8, 105-107]. |
| Direct API calls leak score sheets and other track data [5, 6, 9, 96] | System must enforce backend database query isolation (`WHERE judge_id = auth.uid`) at the controller level [8, 9, 96, 108]. |
| SaaS cloud dependencies prevent local self-hosting [12, 23, 99] | Stack must run completely offline using `docker compose up` with zero third-party cloud services [12, 99]. |
| Unseeded local installations fail automated testing [12, 100] | Containers must auto-populate deterministic seed data (test users, events, rubrics, submissions) on startup [12, 100]. |
| Unauthenticated public voting leads to bot stuffing and Sybil votes [10, 97, 108] | System must provide rate-limiting, IP duplicate detection, configurable access modes, and audit trails [10, 97, 108]. |

---

## 8. Success Criteria

Submissions are evaluated on a **100-point weighted scale** across four official criteria [15, 16, 102, 103]:

1. **Tier Completion & Correctness (40%):** Verified by automated acceptance test execution in `acceptance-report.txt`. Functional correctness is strictly prioritized over incomplete stretch features [13, 15, 94, 103].
2. **Judging Integrity & Security (25%):** Evaluates database query isolation (`WHERE judge_id = auth.uid`), score leak prevention, mathematical validity of normalization models, anti-Sybil mechanisms, and audit logging [15, 103, 108].
3. **Adoptability & Operability (20%):** Evaluated on single-command startup (`docker compose up`), air-gapped offline operation, deterministic seed data, comprehensive documentation (`README`, `ARCHITECTURE`, `DATA-MODEL`, `JUDGING`), and zero cloud SaaS lock-in [12, 14, 16, 99, 101, 103].
4. **Code Quality & Architectural Innovation (15%):** Assesses schema normalization, API design, code maintainability, type safety, and test coverage [16, 103].

---

## 9. Assumptions & Unknowns

* **Database Engine Selection:** The specification requires containerized storage but does not mandate a specific database engine (PostgreSQL, SQLite, MySQL are all compliant if containerized) [99, 101].
* **Automated Acceptance Runner Implementation:** The internal test runner binary executing against `.dogfood.toml` during judging is unstated in source texts; systems must expose documented endpoints and standard CLI scripts [13, 100, 101].
* **Global Normalization Target Constants:** Default target mean ($\mu_{target}=70$) and target standard deviation ($\sigma_{target}=15$) are standard configuration options in `.dogfood.toml` [101, 106].

---

# Problem Summary for Autonomous Development

### MUST SOLVE
* Full Tier 1 core infrastructure (5-level RBAC, event/track setup, team invite links, project drafts, server-side UTC hard deadline validation, searchable public gallery) [7, 94, 95].
* Full Tier 2 judging engine (judge assignments, workload balancing, weighted rubrics, backend query isolation `WHERE judge_id = auth.uid`, Z-score normalization with Min-Max fallback, CSV exports) [8, 94, 96, 105-107].
* Single-command local startup (`docker compose up`) operating 100% offline with zero external SaaS dependencies [12, 99].
* Automatic database seeding and automated test suite output written to `acceptance-report.txt` [12, 13, 100, 101].

### SHOULD ADDRESS
* Tier 3 public engagement (anti-Sybil rate limits, IP duplicate detection, open/email/authenticated voting, quadratic voting, audit trails) [10, 94, 97].
* Tier 4 platform extensions (OpenAPI REST specs, webhooks, signed verifiable records, embeddable gallery widgets) [11, 94, 98].
* Bonus technical challenges (Normalization mathematical proof, pairwise Bradley-Terry voting, documented threat model) [16-18].

### MUST NOT ASSUME
* Do NOT assume internet access or external cloud services (Auth0, Clerk, hosted DBs, remote APIs) are available [12, 99].
* Do NOT assume frontend UI hiding is sufficient for authorization or judge isolation [5, 9, 96, 108].
* Do NOT assume client clock timestamps are accurate for deadline enforcement [7, 95, 108].
* Do NOT assume raw score averages are fair without statistical normalization [5, 8, 104, 105].

### UNKNOWN
* Specific database engine choice (any containerized DB is compliant) [99, 101].
* Exact internal runner binary used by organizers to parse `.dogfood.toml` during offline evaluation [13, 100, 101].
