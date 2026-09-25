# 03 — Evaluation Criteria

## 1. Official Judging Criteria

| Criterion | Weight / Score | What Judges Evaluate |
| :--- | ---: | :--- |
| **Tier Completion & Correctness** | 40% (40 pts) | Functional execution across the 4-tier ladder verified by automated acceptance test suites. Prioritizes backend functional correctness over incomplete higher-tier features. |
| **Judging Integrity & Security** | 25% (25 pts) | Database query/role isolation (`WHERE judge_id = auth.uid`), score leak prevention, Z-score/Min-Max normalization validity, audit trail logging, and anti-abuse mechanics. |
| **Adoptability & Operability** | 20% (20 pts) | Single-command deployment (`docker compose up`), air-gapped offline operation, deterministic seed data on boot, zero SaaS dependencies, and comprehensive documentation (`README`, `ARCHITECTURE`, `DATA-MODEL`, `JUDGING`). |
| **Code Quality & Architectural Innovation** | 15% (15 pts) | Schema normalization, clean architecture, maintainability, type safety, test coverage, and technical elegance. |
| **Bonus: Normalization Proof** | +5 Points | Live demonstration and mathematical proof of cross-judge statistical Z-score score normalization. |
| **Bonus: Pairwise Mode** | +5 Points | Head-to-head project ranking mode using Bradley-Terry preference modeling. |
| **Bonus: Threat Model** | +3 Points | Documented security threat model addressing Sybil attacks, ballot stuffing, and deadline bypass. |
| **Bonus: API First** | +3 Points | Comprehensive OpenAPI specification and full API controller coverage. |

---

## 2. What the Project Should Demonstrate

* **Criterion: Tier Completion & Correctness (40%)**
  * **Agent should ensure:**
    * All Tier 1 core features (auth, RBAC, teams, drafts, UTC deadline, public gallery) are fully implemented and pass tests.
    * All Tier 2 judging features (rubrics, judge routing, Z-score normalization, backend query isolation, CSV exports) are functional.
    * Automated acceptance tests pass and generate `acceptance-report.txt`.
    * No broken or half-implemented higher-tier features interfere with core functional stability.

* **Criterion: Judging Integrity & Security (25%)**
  * **Agent should ensure:**
    * Query isolation is enforced at the database level (`WHERE judge_id = auth.uid`) so judges cannot view unassigned scores or other judges' evaluations.
    * Z-score normalization math correctly handles judge mean, standard deviation, zero-variance epsilon, and falls back to Min-Max for $N_j < 5$.
    * Audit logs record administrative, judging, and voting actions.
    * Anti-Sybil rate limiting and duplicate detection mechanisms block illegitimate public votes.

* **Criterion: Adoptability & Operability (20%)**
  * **Agent should ensure:**
    * The entire application stack starts flawlessly with a single `docker compose up` command.
    * System operates 100% offline with network interfaces disabled (no remote CDNs, fonts, or external SaaS APIs).
    * Database seed scripts automatically execute on startup, populating test users, events, rubrics, and submissions.
    * Documentation files (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`) are complete and clear.

* **Criterion: Code Quality & Architectural Innovation (15%)**
  * **Agent should ensure:**
    * Data schema is normalized with clean entity-relationship boundaries and indexes.
    * Codebase adheres to strict type safety, modular separation of concerns, and clean project layout.
    * Unit, integration, and security role isolation tests cover critical backend routines.

* **Bonus Technical Challenges (+16 pts max)**
  * **Agent should ensure:**
    * Mathematical Z-score proof and test fixtures demonstrate bias elimination.
    * Pairwise Bradley-Terry comparison algorithms function alongside rubric judging.
    * Threat model document explicitly maps vectors for ballot stuffing and deadline bypass.
    * OpenAPI spec file covers all system routes.

---

## 3. Required Evidence

* **Core Workflow:** User registration, 5-level RBAC role switching, team creation via invite links, project draft editing, UTC server-side deadline lock enforcement, and public gallery search.
* **Product Functionality:** Automated judge assignment routing, multi-criteria rubric scoring, progress tracking, statistical score normalization output, and CSV score export.
* **Technical Implementation & Demo Quality:** Single-command `docker compose up` execution, air-gapped offline operation without network errors, automated seed data loading, and execution of automated test suites outputting `acceptance-report.txt`.
* **User Experience & Security:** Clean, responsive UI for participants and judges, zero exposure of unassigned judge ballots, rate limiting on community voting, and audit trail logging.

---

## 4. Scoring / Evaluation Process

* **Scoring System:** 100-point base scale across 4 weighted categories + up to 16 bonus points.
* **Judge Process:** Evaluation combines automated acceptance test suite runners against local Docker containers (`acceptance-report.txt`, `.dogfood.toml`) with human review during an 10-day judging window (September 28 – October 8, 2026).
* **Demo Evaluation:** 5-minute recorded video demonstrating single-command deployment, user role workflows, deadline enforcement, score normalization, and air-gapped execution.
* **Minimum Requirements:** Passing Tier 1 acceptance tests is required to avoid disqualification.
* **Individual vs Team Evaluation:** Teams of 1 to 4 members evaluated uniformly per submission.
* **Tie-Breaking / Ranking:** Tier 2 functional correctness and score isolation outrank higher-tier extensions.

---

## 5. Engineering Checklist

* [ ] Every official judging criterion (Tier Completion, Security, Operability, Code Quality) is addressed
* [ ] Required functionality for Tier 1 and Tier 2 is fully implemented and verified working
* [ ] The demo video / script clearly demonstrates single-command docker startup, RBAC, judging, and normalization
* [ ] Technical restrictions (100% air-gapped offline mode, zero cloud SaaS) are satisfied
* [ ] Required evidence (`acceptance-report.txt`, seeded database, documentation files) can be shown during evaluation
* [ ] No documented judging or security isolation requirement (`WHERE judge_id = auth.uid`) is ignored

---

## 6. Unknown / Unclear Criteria

* **Exact Automated Test Runner Binary:** The internal script or test harness binary used by judges to parse `.dogfood.toml` and verify tiers is unstated in source materials.
* **Human vs Automated Score Weight Split:** The exact numerical proportion between automated acceptance test scores and manual judge review scores within the 40% Tier Completion category is unspecified.
* **Live Presentation / Q&A:** Sources do not specify whether live presentation or Q&A sessions occur during the judging window beyond the required 5-minute video submission.

---

# Evaluation Summary for Autonomous Development

### MUST OPTIMIZE FOR
* Tier 1 & Tier 2 functional correctness (40% weight) — a stable Tier 2 platform strictly outranks a buggy Tier 4.
* Database query isolation (`WHERE judge_id = auth.uid`) and Z-score statistical normalization validity (25% weight).
* Single-command local startup (`docker compose up`), 100% air-gapped offline execution, deterministic seed data, and clean documentation (20% weight).

### MUST DEMONSTRATE
* Flawless execution of `docker compose up` with auto-seeded fixture data and zero external network calls.
* Working UTC server-side deadline lock preventing late submissions.
* Algorithmic judge assignment routing, weighted rubric evaluation, and Z-score normalized results.
* Generated `acceptance-report.txt` showing passed test cases.

### MUST NOT IGNORE
* Backend query isolation (never rely on frontend UI hiding for authorization).
* Local containerized execution requirement (never depend on external SaaS authentication or remote databases).
* Standardized repository documentation structure (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `LICENSE`, `.dogfood.toml`).

### UNKNOWN
* Exact internal CLI test harness used by organizers during automated evaluation.
* Proportion of automated vs human judge points within the 40% Tier Completion criteria.
* Presence of live Q&A sessions during the evaluation window.
