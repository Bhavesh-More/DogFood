# 01 — Hackathon Rules

## 1. Basic Information

* **Hackathon Name:** Dogfood 2026 (Dogfood | 72-Hour Hackathon - 2026)
* **Organizer:** Hackathon Raptors
* **Duration:** 72 Hours (continuous global online engineering sprint)
* **Eligibility:** Global, online, free to participate; open to full-stack, backend, API, security, DevOps, and data/algorithms developers, students, and researchers worldwide
* **Team Size:** Solo developers or teams of 1 to 4 members
* **Important Dates & Deadlines:**
  * **Registration Opens:** August 24, 2026
  * **Judging Panel Announced:** September 4, 2026
  * **Team Formation:** September 21, 2026
  * **Specification Published:** September 24, 2026
  * **Hackathon Kickoff & Registration Cutoff:** September 25, 2026 at 18:00 UTC
  * **Code Freeze & Final Submission Deadline:** September 28, 2026 at 18:00 UTC
  * **Judging Window:** September 28 – October 8, 2026
  * **Winners Announced:** October 9, 2026

---

## 2. Challenge Requirements

* **What Participants Must Build:** A modern, open-source, self-hostable hackathon submission and judging platform that manages the entire lifecycle of a hackathon (registration, teams, project submissions, hard deadlines, judge routing, rubric scoring, statistical score normalization, public voting, and archiving). Everyone builds against the same published specification (no separate tracks).
* **Mandatory Requirements:**
  * **Tier 1 (T1) Core Foundation:** Session authentication, 5-level RBAC (Visitor, Participant, Judge, Organizer, Admin), event/track setup, team invite links, project drafts, server-side hard deadline validation using UTC timestamps, and searchable public project gallery.
  * **Tier 2 (T2) Evaluation Engine:** Judge invitations, batch/algorithmic judge routing, weighted rubrics, backend-enforced query/role isolation (`WHERE judge_id = auth.uid`), judge progress tracking, statistical score normalization (Z-score with Min-Max fallback), and CSV exports.
  * **Local & Offline Execution Mandate:** Application stack must start locally with a single `docker compose up` command. Must operate completely offline with network interfaces disabled, containing deterministic seeded fixture data and an automated acceptance test runner writing pass/fail results to `acceptance-report.txt`.
  * **Open Source Licensing:** Must include an OSI-approved open source license (e.g., MIT, Apache 2.0).
* **Optional / Encouraged Requirements:**
  * **Tier 3 (T3) Public Engagement:** Community voting (open, email-gated, authenticated), hidden results during voting windows, rate limiting, IP duplicate detection, quadratic voting, and audit trails.
  * **Tier 4 (T4) Platform Extensions:** REST/GraphQL APIs, outbound webhooks, cryptographically signed verifiable judge participation records, embeddable gallery widgets, and bulk JSON/CSV import/export.
  * **Bonus Technical Challenges:**
    * **Normalization Proof (+5 pts):** Mathematical proof and live demonstration of cross-judge Z-score normalization.
    * **Pairwise Mode (+5 pts):** Head-to-head project comparisons using Bradley-Terry preference modeling.
    * **Threat Model (+3 pts):** Documented threat model for Sybil attacks, ballot stuffing, submission scraping, judge collusion, and deadline manipulation.
    * **API First (+3 pts):** Complete OpenAPI specification and full API coverage.
* **Required Outcomes:** The grand prize winning platform will be officially forked, self-hosted, and deployed as the production infrastructure for future Hackathon Raptors competitions.

---

## 3. Technology Rules

* **Required Technologies:** Docker / Docker Compose (`docker-compose.yml`) for containerized local orchestration.
* **Allowed Technologies:** Any programming language, framework, database, or tech stack of the team's choice, provided the full stack runs locally within Docker. AI coding tools/assistants (Claude Code, Cursor, Aider, GitHub Copilot, local models) are permitted.
* **Prohibited Technologies:** External cloud services, managed databases, hosted authentication providers (e.g., Auth0, Clerk), external email APIs, or third-party SaaS tools that require internet connectivity.
* **API / Service Restrictions:** Zero external network dependencies. Systems must run in an air-gapped environment with network interfaces disabled. Attempting external network calls during testing is prohibited.
* **AI / LLM Usage Rules:** AI assistants are permitted for scaffolding, boilerplate, and development velocity. AI usage is not directly scored; evaluation focuses on code correctness, architecture, security isolation, and team comprehension of shipped code.
* **Existing Code / Project Restrictions:** Submissions must be open-source under an OSI-approved license. Code written before official kickoff (September 25, 2026 at 18:00 UTC) is restricted; planning, research, and prompt preparation before kickoff are allowed.

---

## 4. Submission Requirements

List of all required materials for submission:

* **Public GitHub Repository:** Public repository link containing the full project source code.
* **README Documentation (`README.md`):** Deployment instructions, environment requirements, Docker startup commands, and default test credentials.
* **Architecture Specification (`ARCHITECTURE.md`):** System component diagrams, state flow descriptions, boundaries, and design trade-offs.
* **Data Model Specification (`DATA-MODEL.md`):** Entity-relationship schema, indexes, state machine rules, and migration scripts.
* **Judging Mechanics Blueprint (`JUDGING.md`):** Assignment routing algorithms, score normalization math, and API security isolation model.
* **Container Manifest (`docker-compose.yml`):** Root Compose file launching the web app, backend API, local database, task workers, and seed routines.
* **Source Code (`src/`):** Organized production source files.
* **Automated Test Suite (`tests/`):** Unit, integration, and security role isolation tests.
* **Acceptance Report (`acceptance-report.txt`):** Output generated by running the automated acceptance test suite against the local stack.
* **Open Source License (`LICENSE`):** Full text file of an OSI-approved open source license.
* **Capabilities Manifest (`.dogfood.toml`):** Configuration file declaring claimed functional tiers, application entry points, and seed routines.
* **Demo Video:** A 5-minute video demonstrating single-command deployment, user role workflows, deadline enforcement, scoring normalization, and offline operation.

---

## 5. Judging Criteria

Official judging criteria and weights (100-point scale):

1. **Tier Completion & Correctness (40%):** Verified by automated acceptance test suite output. Measures functional progression through tiers. Functional correctness is strictly prioritized; a clean, working Tier 2 implementation outranks an unstable Tier 4 implementation.
2. **Judging Integrity & Security (25%):** Assesses database query/role isolation (`WHERE judge_id = auth.uid`), score leak prevention, mathematical validity of normalization engines (Z-score / Min-Max), audit logging, and anti-abuse mechanisms.
3. **Adoptability & Operability (20%):** Evaluated on single-command startup (`docker compose up`), complete offline execution, quality of seeded test data, comprehensive documentation (`README`, `ARCHITECTURE`, `DATA-MODEL`, `JUDGING`), and zero cloud SaaS lock-in.
4. **Code Quality & Architectural Innovation (15%):** Assesses schema normalization, type safety, API design maintainability, test coverage, and modular separation of concerns.

---

## 6. Disqualification / Restrictions

Submissions are subject to disqualification, tier downgrades, or scoring penalties under the following conditions:

* **Tier 1 (T1) Failure:** Submissions that fail mandatory Tier 1 acceptance tests are disqualified from judging.
* **Cloud / External Service Dependency:** Applications that require internet access, call external SaaS APIs, or stall when network interfaces are disabled during air-gapped evaluation.
* **Frontend-Only Security:** Authorization or role isolation enforced solely in UI components rather than at the API / database query level.
* **Missing or Non-OSI License:** Repository lacking a valid OSI-approved open source license file.
* **Late Submission / Code Freeze Violation:** Pushing commits or modifying submissions after the code freeze cutoff (September 28, 2026 at 18:00 UTC).
* **Inflated Tier Claims:** Claiming Tier 3 or Tier 4 capabilities without passing corresponding acceptance tests results in immediate re-grading at the highest verified tier.
* **Non-Standard Repository Layout:** Structure deviations that break automated testing or evaluation scripts incur scoring penalties.

---

## 7. Engineering Implications

Actionable instructions derived directly from hackathon rules for AI coding agents:

> **Rule:** Single-command local startup required (`docker compose up`).
> **Action:** Maintain a root `docker-compose.yml` encapsulating web UI, API, database, and worker containers. Ensure database migrations and seed data run automatically on container boot.

> **Rule:** Complete air-gapped offline operation required.
> **Action:** Use local database drivers, local session/JWT authentication, and local asset serving. Never import external CDN scripts, remote fonts, external Auth providers, or cloud SDKs.

> **Rule:** Backend-enforced role isolation required (`WHERE judge_id = auth.uid`).
> **Action:** Enforce row-level security or explicit filter predicates in backend database queries and API controllers. Never rely on hiding frontend UI buttons or client-side filtering.

> **Rule:** Hard UTC deadline enforcement on project submissions.
> **Action:** Validate draft submission cutoffs on the server using system UTC timestamps; reject client-provided timestamp headers or late POST/PATCH updates.

> **Rule:** Automated pass/fail validation report required in `acceptance-report.txt`.
> **Action:** Implement test scripts in `tests/` that run against the local stack, test all implemented endpoints, and log plain text pass/fail results directly to `acceptance-report.txt`.

> **Rule:** Public repository required.
> **Action:** Never commit API secrets, private environment keys, database credentials, or private tokens to git history.

---

## 8. Research Updates (2026-09-25)

* **Acceptance command:** `python3 acceptance/run.py .dogfood.toml > acceptance-report.txt` — the runner reads base URL and **stable per-role session tokens** from `.dogfood.toml`, and finds `fixtures.json` at the repository root.
* **Overclaiming penalty:** a tier claimed in `.dogfood.toml` but not confirmed by the suite is scored at the highest *verified* tier, and "overclaiming costs more than the tier was worth".
* **Team invites** must be **single-use and expiring**.
* **Isolation is judged by direct API calls**, not by the UI: "If a judge can make an API request and retrieve another judge's ballot, the system has failed."
* **Containers:** "Everything runs in the containers defined in `docker-compose.yml` … the app works with the network cable unplugged."

## 9. Important Unknowns

Information that is missing, unstated, or subject to configuration in the provided sources:

* **Acceptance Test Harness Implementation:** The exact CLI runner binary or test scripts used by judges to parse `.dogfood.toml` and generate official acceptance scores are not published in advance.
* **Normalization Target Scaling Constants:** While standard Z-score math ($\mu=0, \sigma=1$) is mandated, exact global target scaling defaults (e.g., target mean 70, target stddev 15) are configurable per organizer preference in `.dogfood.toml`.
* **Database Engine Choice:** The specification requires containerized local storage but does not restrict the specific database engine (e.g., PostgreSQL, SQLite, MySQL are all compliant if containerized).

---

## 10. Agent Checklist

* [ ] All mandatory requirements satisfied (Tier 1 core features, UTC deadline, RBAC)
* [ ] Technology restrictions satisfied (Docker containerized, zero external cloud dependencies)
* [ ] AI usage complies with rules (Accelerates development; code understood and documented)
* [ ] Submission requirements satisfied (Repo, 4 docs, docker-compose, acceptance-report.txt, license, .dogfood.toml, video)
* [ ] Judging requirements addressed (Tier 2 judging engine, Z-score normalization, query isolation)
* [ ] No disqualification conditions triggered (Offline air-gap verified, no SaaS lock-in)
* [ ] Final project is demo-ready (Seeded fixture data loaded; 5-min demo video script verified)
