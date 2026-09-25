# 06 — User Research

## 1. Target Users

* **Organizers (e.g., Hackathon Raptors):**
  * **Who they are:** Event administrators hosting global, multi-tenant engineering hackathons across 85+ countries.
  * **Role / Context:** Managing the end-to-end competition lifecycle across 10 distinct stages (registration, team formation, submissions, eligibility, judge assignments, scoring, normalization, results, certificates, and archiving).
  * **What they are trying to accomplish:** Deploy an open-source, self-hostable competition platform that runs deterministically with zero third-party cloud SaaS dependencies.
  * **Relevant needs:** Single-command local deployment (`docker compose up`), automated judge routing, multi-criteria weighted rubrics, server-side UTC deadline enforcement, Z-score statistical score normalization, audit logging, CSV exports, anti-Sybil public voting controls, and automated acceptance testing.

* **Judges:**
  * **Who they are:** Subject matter experts assigned to evaluate participant submissions.
  * **Role / Context:** Reviewing assigned project entries against multi-criteria rubrics within an 8-to-10-day judging window.
  * **What they are trying to accomplish:** Evaluate assigned projects fairly, accurately, and efficiently without administrative overload or security exposure.
  * **Relevant needs:** Balanced review workloads across tracks, clear weighted rubric criteria, backend-enforced evaluation privacy (`WHERE judge_id = auth.uid`), progress tracking, and optional head-to-head pairwise comparison tools (Bradley-Terry preference modeling).

* **Participants / Submitting Teams:**
  * **Who they are:** Solo software engineers or teams of 1 to 4 developers, students, or researchers worldwide.
  * **Role / Context:** Building software projects during a 72-hour continuous engineering sprint.
  * **What they are trying to accomplish:** Form teams, develop projects, edit draft submissions, lock in entries before hard deadlines, showcase projects in a public gallery, and receive fair, unbiased evaluation.
  * **Relevant needs:** Seamless team invite links, project draft saving, server-side UTC deadline validation (avoiding client clock mismatch errors), public gallery visibility, and confidence in statistically normalized judging.

* **Public / Community Voters:**
  * **Who they are:** Community members, event visitors, and fellow participants viewing public project entries.
  * **Role / Context:** Exploring project galleries and participating in community choice or public voting rounds.
  * **What they are trying to accomplish:** Discover innovative projects and cast votes for preferred entries in an abuse-resistant gallery.
  * **Relevant needs:** Searchable/filterable project galleries, clear voting access modes (open, email-gated, or authenticated), hidden real-time tallies during voting windows, and protection against bot manipulation.

---

## 2. User Pain Points

| Pain Point | Who Experiences It | Evidence |
| :--- | :--- | :--- |
| **Strict vs. Lenient Judge Bias (Raw Score Distortion)** | Organizers, Judges, Participants | Raw score averaging allows strict judges to depress project scores and lenient judges to elevate them, distorting overall rankings [8, 22, 97, 108]. |
| **Authorization & Score Sheet Leaks** | Organizers, Judges | Commercial and custom platforms often enforce security in UI components rather than database queries, allowing judges or participants to view unassigned evaluation sheets via direct API calls [8, 9, 99, 111]. |
| **Deadline Mismatches & Client Clock Bypass** | Organizers, Participants | Relying on client-side timestamps causes submission failures or allows participants to bypass deadlines by altering local clock settings [7, 97, 98]. |
| **Sybil Attacks & Bot Vote Stuffing** | Organizers, Public Voters, Participants | Public community voting is frequently manipulated by automated bots, duplicate accounts, and IP stuffing, forcing organizers to hide or manually purge vote tallies [10, 97, 100, 111]. |
| **Vendor Lock-in & SaaS Dependencies** | Organizers | Existing platforms require external cloud services (Auth0, hosted databases, third-party email APIs), preventing simple air-gapped local self-hosting [12, 101, 102]. |
| **Lack of Weighted Rubrics & Workload Balancing** | Organizers, Judges | Existing tools lack native multi-criteria weighted rubrics or automated judge assignment routing, forcing organizers into manual spreadsheet management [8, 9, 21, 97, 99]. |

---

## 3. User Goals

### Primary Goals
* **Deterministic Competition Lifecycle Management:** Manage user registration, team formation, project drafts, deadline locks, judge assignments, rubric scoring, and archiving in a single unified system [6, 92, 95].
* **Fair & Bias-Free Judging:** Eliminate judge variance using Z-score statistical score normalization with Min-Max fallback for small sample sizes ($N_j < 5$) [8, 22, 97, 108, 110].
* **Backend Security & Query Isolation:** Enforce strict backend row-level query isolation (`WHERE judge_id = auth.uid`) so judges only access assigned evaluation ballots [8, 9, 99, 111].
* **Zero-SaaS Local Self-Hosting:** Run the entire platform locally via `docker compose up` in a 100% air-gapped environment with pre-seeded test data [12, 101, 102].

### Secondary Goals
* **Anti-Sybil Community Voting:** Enable rate-limited, IP-verified community choice voting with hidden tallies and audit trails [10, 97, 100, 111].
* **Developer Extensions:** Expose documented OpenAPI REST/GraphQL interfaces, webhooks, and gallery widgets for external integrations [11, 97, 101].
* **Verifiable Assets:** Generate cryptographically signed judge participation records and automated certificates [11, 97, 101].

---

## 4. Current User Workflow

```text
Step 1: User Registration & Team Formation (Invite links, 5-level RBAC role assignment) 
  ──► Step 2: Project Draft Editing & Media Uploads (Draft state prior to deadline) 
  ──► Step 3: Hard Deadline Submission Lock (Server-side UTC timestamp validation) [PAIN POINT: Client clock bypass/rejection]
  ──► Step 4: Algorithmic Judge Routing & Rubric Evaluation (Workload balancing, query isolation) [PAIN POINT: Unbalanced routing & score leaks]
  ──► Step 5: Statistical Score Normalization & Output (Z-score math, Min-Max fallback, CSV export) [PAIN POINT: Raw score bias distortion]
  ──► Step 6: Public Gallery & Anti-Sybil Voting (Rate limiting, IP duplicate detection, hidden tallies) [PAIN POINT: Bot stuffing & Sybil votes]
  ──► Step 7: Archiving & Verifiable Certificate/Record Export
```

---

## 5. User Needs

* **Organizers need** a self-hostable, zero-SaaS competition platform that automates judge assignments, normalizes scores statistically, and runs offline via `docker compose up` [8, 12, 97, 102].
* **Judges need** a secure review portal that displays assigned entries, provides clear weighted rubrics, hides unassigned score sheets, and tracks evaluation progress [8, 9, 99, 111].
* **Participants need** a clear submission interface supporting team invite links, draft saving, and server-validated UTC hard deadline enforcement [7, 97, 98].
* **Public Voters need** a searchable project gallery supporting abuse-resistant community voting with hidden real-time results [10, 97, 100].

---

## 6. User Research Insights

* **Functional Integrity Over Feature Quantity:** Evidence shows organizers strictly prioritize a clean, secure, mathematically sound Tier 2 judging engine over buggy Tier 4 stretch features [11, 97, 117].
* **API/Query-Level Isolation is Non-Negotiable:** Hiding UI elements is insufficient; authorization predicates (`WHERE judge_id = auth.uid`) must be embedded in backend queries to prevent direct API security leaks [8, 9, 99, 111].
* **Server-Side UTC Validation Required:** Relying on client-provided time headers invites deadline tampering; timestamps must be verified against server UTC clocks [7, 97, 98].
* **Determinism Drives Operability:** Automated database seeding on boot is essential for seamless offline evaluation and testing [12, 103].

---

## 7. User Assumptions & Unknowns

* **Unstated Organizer Preferences:** The exact global scaling target constants ($\mu_{target}, \sigma_{target}$) for score normalization are configurable in `.dogfood.toml` based on organizer preference [107, 108].
* **Database Engine Choice:** The specification requires containerized storage but does not mandate a specific database engine (PostgreSQL, SQLite, and MySQL are all compliant if containerized) [12, 102].
* **Acceptance Runner Execution Details:** The specific internal CLI harness binary used by organizers to parse `.dogfood.toml` during judging is unstated in source materials [13, 103].

---

## 8. Agent Takeaways

### MUST UNDERSTAND
* The platform serves 5 distinct roles: Visitor, Participant, Judge, Organizer, and Admin [7, 97, 98].
* Hackathons represent a 10-stage stateful data pipeline where each stage depends on the preceding stage's integrity [6, 92, 95].
* Statistical Z-score normalization is required to eliminate judge strictness/leniency bias [8, 22, 97, 108].

### MUST SOLVE
* Query-level role isolation (`WHERE judge_id = auth.uid`) to prevent evaluation ballot leaks [8, 9, 99, 111].
* Server-side UTC hard deadline lock to prevent submission tampering [7, 97, 98].
* Single-command local startup (`docker compose up`) operating 100% offline with zero cloud SaaS dependencies [12, 101, 102].

### SHOULD CONSIDER
* Anti-Sybil rate limiting and IP fingerprinting for public community voting rounds [10, 97, 100, 111].
* Documented OpenAPI REST specs, webhooks, and signed verifiable judge records [11, 97, 101].
* Pairwise Bradley-Terry preference scoring as an optional complementary evaluation mode [17].

### UNKNOWN
* Specific internal runner script used by organizers to evaluate `.dogfood.toml` during offline judging [13, 103].
* Preferred database engine (PostgreSQL, SQLite, MySQL are all compliant) [12, 102].
