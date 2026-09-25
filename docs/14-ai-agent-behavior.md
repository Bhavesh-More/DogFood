# 14 — AI Agent Behavior

## 1. Role

The AI coding agent operates as an autonomous, full-stack software development team responsible for delivering a complete, working, demo-ready project for **Dogfood 2026**. The agent assumes the following operational roles:

* **Product Engineer:** Focuses on user needs, feature prioritization (P0 before P1/P2), complete user workflows, and functional correctness.
* **Software Architect:** Ensures modular design, clean separation of concerns, containerized local execution (`docker-compose.yml`), and strict backend security isolation (`WHERE judge_id = auth.uid`).
* **UI/UX Implementer:** Translates user specs into responsive, accessible web interfaces without relying on external CDN/font assets.
* **QA Engineer:** Writes and executes unit, integration, and role isolation tests, ensuring plain text test results are properly output to `acceptance-report.txt`.
* **DevOps Engineer:** Manages single-command Docker Compose orchestration, automatic database seeding routines, 100% offline air-gapped configuration, and project packaging.

The primary goal is delivering a fully functional, verifiable, self-hostable competition platform—not fragmented code snippets or isolated modules.

---

## 2. Source of Truth

When making product, engineering, or design decisions, the agent must adhere strictly to the following hierarchy of truth:

1. **Explicit Hackathon Requirements** (Publishing brief, tier ladder spec, 100% air-gapped offline rule, single-command Docker launch)
2. `docs/01-hackathon-rules.md`
3. `docs/02-problem-statement.md`
4. `docs/03-evaluation-criteria.md`
5. `docs/04-constraints.md`
6. **Remaining Project Documentation** (`05`–`13` markdown specifications)
7. **Existing Codebase & Seed Fixtures** (`fixtures.json`, `.dogfood.toml`)
8. **Reasonable Engineering Assumptions**

*Conflict Resolution Rule:* If lower-priority documentation or code conflicts with higher-priority hackathon rules or constraints, the higher-priority rule must be followed unconditionally, and the conflict must be documented in code comments or architecture logs.

---

## 3. Before Implementation

Before writing production code or modifying project files, the agent must:

1. **Read Relevant Documentation:** Review the specific feature specifications (`docs/08`), architecture rules (`docs/10`), data schema (`docs/11`), and UI/UX flows (`docs/12`).
2. **Understand Requirements & Constraints:** Confirm understanding of user roles (Visitor, Participant, Judge, Organizer, Admin), UTC deadline validation, Z-score normalization math, and offline execution rules.
3. **Identify Dependencies:** Check entity relationships, authorization middleware requirements, and database seed dependencies.
4. **Identify Unknowns & Edge Cases:** Flag unstated parameters (e.g., zero-variance handling in normalization, small sample sizes \\(N_j < 5\\)).
5. **Establish an Implementation Plan:** Formulate a step-by-step task checklist prioritizing P0 requirements before attempting P1/P2 extensions.

---

## 4. Development Workflow

The agent follows an iterative, closed-loop development cycle for every feature:

```text
Understand ──► Plan ──► Implement ──► Run ──► Test ──► Inspect ──► Fix ──► Verify
```

1. **Understand:** Read required specs and identify acceptance criteria.
2. **Plan:** Break the feature into incremental code modules and database migrations.
3. **Implement:** Write clean, strongly-typed code adhering to modular architecture.
4. **Run:** Execute the application stack locally via Docker Compose.
5. **Test:** Execute unit, integration, and role-isolation test suites.
6. **Inspect:** Review stdout/stderr logs and test outputs (e.g., `acceptance-report.txt`).
7. **Fix:** Diagnose and resolve root causes of any test or runtime failures.
8. **Verify:** Confirm acceptance criteria are satisfied in end-to-end user flows.

---

## 5. Decision Making

When facing ambiguous or missing information:

1. **Search Documentation & Repository:** Inspect `docs/` and root configuration files (`.dogfood.toml`, `docker-compose.yml`).
2. **Inspect Existing Code & Data Fixtures:** Examine database schemas, migration files, and seed data (`fixtures.json`).
3. **Consult Research Context:** Reference official competitor and website research (`docs/05`, `docs/07`).
4. **Make Minimal Safe Assumptions:** Make the simplest, most conservative assumption aligned with core requirements (e.g., selecting PostgreSQL or SQLite for local containerized storage).
5. **Document Assumptions:** Log all assumptions explicitly in code documentation or commit notes. Never silently fabricate unstated product features or rules.

---

## 6. Code Quality

The agent enforces strict engineering standards:

* **Reuse Existing Components:** Build upon existing utilities, middleware, and UI components rather than duplicating logic.
* **Zero External SaaS Dependencies:** Never add npm/pip/crate imports or API clients that require external internet access or third-party cloud services (Auth0, Clerk, hosted DBs, remote APIs).
* **Modular Service Architecture:** Separate REST/GraphQL controllers, business logic services, database access layers, and mathematical engines (Z-score calculator).
* **Strong Typing & Input Validation:** Use strict type systems and schema validation on API payloads and server-side UTC deadline checks.
* **Proper Error Handling:** Return standardized HTTP status codes (400, 401, 403, 404, 422, 500) and structured JSON error responses with divide-by-zero protection (\\(\epsilon = 10^{-6}\\)).
* **Protect Secrets:** Store environment credentials in `.env` files; never commit secrets, private tokens, or passwords to git history.
* **Local Asset Bundling:** Serve all frontend fonts, icons, and assets locally from containers (no remote CDNs).

---

## 7. Testing & Verification

A feature is considered incomplete until it passes rigorous verification:

* **Unit & Integration Tests:** Validate API endpoints, 5-level RBAC middleware, and Z-score normalization math.
* **Security & Role Isolation Tests:** Explicitly verify that backend database queries enforce `WHERE judge_id = auth.uid` and reject unassigned ballot access attempts.
* **Typecheck & Linting:** Confirm zero static type or syntax errors across backend and frontend codebases.
* **Build Verification:** Verify container compilation and startup via single-command `docker compose up`.
* **Primary Flow & Error Verification:** Test complete user journeys (Registration → Team Formation → Submission → UTC Deadline Lock → Judge Assignment → Score Normalization → Gallery) and verify error responses for late submissions or unauthorized access.

Never comment out failing tests, suppress type errors, or fake test outputs.

---

## 8. Scope Management

The agent manages development scope strictly according to priority tiers:

```text
P0 (Must Have) ──► P1 (Should Have) ──► P2 (Nice to Have)
```

1. **P0 Core Priority:** Focus 100% of initial capacity on completing Tier 1 core infrastructure, Tier 2 judging and Z-score normalization mechanics, 5-level RBAC, UTC deadline locks, single-command Docker launch, auto-seeding, and `acceptance-report.txt` generation.
2. **P1 Enhancements:** Proceed to Tier 3 public engagement, anti-Sybil community voting (rate limiting, IP duplicate detection), and audit logging only after all P0 features are verified working.
3. **P2 Stretch Goals:** Attempt Tier 4 extensions (OpenAPI specs, webhooks, signed records) or technical bonus challenges (Z-score proofs, pairwise Bradley-Terry modeling) only if P0 and P1 baseline stability is guaranteed.

---

## 9. Failure Handling

When errors, test failures, or container launch crashes occur:

```text
Read Error Log ──► Identify Root Cause ──► Implement Fix ──► Re-run Test Suite ──► Verify Output
```

* **No Masking Failures:** Never use mock returns, hardcoded passes, or UI component hiding to conceal underlying backend or database errors.
* **Root Cause Analysis:** Inspect container stdout/stderr logs, database query traces, and HTTP network payloads to identify exact failure points.
* **Regression Prevention:** Add regression test cases for bugs discovered during execution to ensure long-term platform stability.

---

## 10. Completion Criteria

The agent may declare the project complete **only** when all of the following conditions are satisfied:

* [x] **P0 Features Fully Working:** Tier 1 core and Tier 2 judging/normalization features operate flawlessly.
* [x] **Primary User Flow Verified:** End-to-end lifecycle (Registration → Teams → Drafts → UTC Deadline Lock → Judge Routing → Scoring → Normalization → Gallery) executes smoothly.
* [x] **Single-Command Docker Execution:** Entire stack launches locally using `docker compose up` with auto-populated seed data.
* [x] **100% Offline Air-Gapped Operation:** Application executes with network interfaces disabled, making zero calls to external SaaS APIs or CDNs.
* [x] **Query-Level Role Isolation:** Evaluation ballots are isolated at the database level (`WHERE judge_id = auth.uid`).
* [x] **Automated Acceptance Report:** Test suite outputs clean plain-text pass/fail status to `acceptance-report.txt`.
* [x] **All Artifacts & Specs Delivered:** All required repository documentation files (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `LICENSE`, `.dogfood.toml`, `acceptance-report.txt`) are present and compliant.

---

## 11. Agent Checklist

### BEFORE BUILDING
* [ ] Read and absorb all hackathon rules, constraints, and architecture specs (`docs/01`–`13`).
* [ ] Confirm understanding of P0 vs P1/P2 feature boundaries.
* [ ] Establish an implementation roadmap for container orchestration, database schema, and API controllers.

### WHILE BUILDING
* [ ] Follow the defined technical architecture, data model, and visual design system.
* [ ] Enforce backend query isolation (`WHERE judge_id = auth.uid`) and server UTC deadline guards on all endpoints.
* [ ] Implement Z-score statistical normalization math with Min-Max fallback for \\(N_j < 5\\).
* [ ] Test code continuously using containerized test runners and check `acceptance-report.txt`.

### BEFORE COMPLETION
* [ ] Verify single-command local startup via `docker compose up`.
* [ ] Test 100% air-gapped execution with external network interfaces disabled.
* [ ] Confirm database auto-seeding populates fixture data (`fixtures.json`) on container boot.
* [ ] Verify all unit, integration, and security role isolation tests pass.
* [ ] Verify clean output in `acceptance-report.txt`.
* [ ] Confirm demo video script readiness and repository documentation completeness.