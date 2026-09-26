# 16 — Testing Strategy

## 1. Testing Goals

The testing strategy for Dogfood 2026 must prove that:
* **Core Functionality Works:** All Tier 1 core infrastructure and Tier 2 judging/normalization capabilities execute deterministically.
* **Primary User Flow Works:** End-to-end competition lifecycle (Registration → Team Invite → Draft Submission → Server UTC Deadline Lock → Judge Routing → Score Normalization → Gallery View) executes seamlessly.
* **APIs Work Correctly:** Controllers enforce 5-level RBAC authorization, valid request structures, and accurate JSON responses.
* **Database & Query Isolation Enforced:** Backend database queries strictly isolate evaluation ballots (`WHERE judge_id = auth.uid`) so unassigned judges or participants cannot leak raw score sheets.
* **Air-Gapped Offline Execution:** System launches locally via `docker compose up` and runs 100% offline with zero external cloud SaaS calls.
* **Automated Acceptance Verification:** The test suite parses `.dogfood.toml` and outputs clean pass/fail status logs directly to `acceptance-report.txt`.

---

## 2. Unit Testing

Unit tests focus on isolated, deterministic business logic, mathematical engines, and validation functions:

* **Z-Score Normalization Engine:** Verify mean ($\mu_j$), standard deviation ($\sigma_j$), divide-by-zero epsilon handling ($\epsilon = 10^{-6}$), target scaling, and automatic Min-Max fallback when a judge reviews fewer than 5 projects ($N_j < 5$).
* **Server UTC Deadline Validator:** Test timestamp comparison logic against system UTC time, verifying rejection of late submission attempts regardless of client time headers.
* **RBAC & Permission Evaluator:** Test role-level permission checking across Visitor, Participant, Judge, Organizer, and Admin levels.
* **Team Size & Invite Validator:** Verify member roster limits (min 1, max 4 members) and join token generation/parsing.
* **Seed Data Parser:** Validate parsing and schema mapping of local seed fixtures (`fixtures.json`).

---

## 3. Integration Testing

Integration tests verify component interactions across the containerized local stack:

* **Backend ↔ Database:** Test SQL query execution, transaction integrity, row-level query filtering (`WHERE judge_id = auth.uid`), and database migrations.
* **Authentication ↔ Protected Endpoints:** Test session token generation, cookie validation, and endpoint protection across all 5 RBAC roles.
* **Judge Routing ↔ Rubric Evaluation:** Test batch/algorithmic judge assignment workload distribution and score record creation.
* **Voting Engine ↔ Rate Limiter:** Test IP duplicate detection and rate-limiting middleware blocking public vote manipulation.
* **Test Harness ↔ Acceptance Report:** Verify test runner execution writing plain text summary logs to `acceptance-report.txt`.

---

## 4. End-to-End Testing

The critical E2E user journey validates the complete 10-stage competition lifecycle:

```text
Launch Stack (`docker compose up`)
  ↓
Seed Fixture Data (`fixtures.json`)
  ↓
Authenticate User (Session Auth & 5-Level RBAC)
  ↓
Create/Join Team (Invite Code Validation, 1–4 Members)
  ↓
Submit Project Draft & Lock at Server UTC Deadline
  ↓
Algorithmic Judge Assignment Routing
  ↓
Query-Isolated Rubric Scoring (`WHERE judge_id = auth.uid`)
  ↓
Z-Score Score Normalization Engine Execution
  ↓
Public Gallery Viewing & Anti-Sybil Community Voting
  ↓
CSV Score Export & `acceptance-report.txt` Verification
```

---

## 5. Error & Edge Cases

* **Submission After UTC Deadline:** Attempting POST/PATCH updates after server UTC deadline returns HTTP 422/403 with an explicit deadline error.
* **Unauthorized Ballot Access:** A judge attempting to query an unassigned project ID receives HTTP 403 / empty query result (`WHERE judge_id = auth.uid`).
* **Zero-Variance Judge Scores:** Judge giving identical scores to all assigned projects triggers epsilon parameter handling without crashing.
* **Small Sample Judge Normalization ($N_j < 5$):** Judge reviewing 1 to 4 projects automatically triggers Min-Max fallback scaling.
* **Team Roster Overflow:** Attempting to join a team with 4 existing members returns HTTP 400 team full error.
* **Air-Gapped Network Isolation:** Execution with network interfaces disabled completes with zero remote connection timeouts.
* **Duplicate Vote Attempts:** Submitting multiple community votes from the same IP or account triggers rate-limiting blocks.

---

## 6. AI Testing

* **AI Runtime Dependencies:** None (100% offline application runtime).
* **Development Verification:** AI assistants (Claude Code, Cursor, Aider, Copilot) are used for code scaffolding; all generated code is verified via static type checks, linter runs, and local container integration tests before commit.

---

## 7. UI Testing

* **Screen Rendering:** Verify rendering of Landing Page, Dashboard, Team Form, Submission Editor, Judge Scoring Portal, Public Gallery, and Admin Controls.
* **RBAC Interface Controls:** Verify role-specific navigation tabs and action buttons (e.g., scoring forms visible only to Judges, normalization triggers visible only to Organizers).
* **Form Validation & Real-time Feedback:** Validate client-side input validation, UTC deadline status badges, and clear error banners.
* **Responsive Layouts:** Verify layout adaptability across mobile, tablet, and desktop viewports.
* **Zero CDN Dependency:** Verify all icons, fonts, and assets load locally without external network calls.

---

## 8. Build & Quality Checks

Before declaring implementation complete, execute:

```bash
# 1. Run Unit & Integration Test Suites
npm test # or pytest / go test / cargo test

# 2. Execute Type Checking
npm run typecheck # or tsc --noEmit / mypy

# 3. Run Linter
npm run lint # or eslint / flake8 / golangci-lint

# 4. Verify Local Container Build
docker compose build --no-cache

# 5. Launch Stack & Verify Startup Seeding
docker compose up -d

# 6. Execute Automated Acceptance Test Runner
npm run test:acceptance # Outputs to acceptance-report.txt

# 7. Check Acceptance Report Output
cat acceptance-report.txt
```

---

## 9. Acceptance Testing

| Feature | Acceptance Criteria | Test Method | Status |
| :--- | :--- | :--- | :---: |
| **F001 — Session Auth & RBAC** | Authenticates locally, enforces 5 RBAC roles without cloud auth | Auth integration test & role access check | ⬜ |
| **F002 — Event & Rubric Setup** | Configures multi-track events and weighted rubrics in database | Event controller unit & DB integration test | ⬜ |
| **F003 — Team Invite Links** | Enforces 1–4 team size limits via unique join codes | Team service unit test & roster limit test | ⬜ |
| **F004 — Drafts & Gallery** | Supports project draft editing and public gallery rendering | Submission API test & gallery render test | ⬜ |
| **F005 — Server UTC Deadline** | Rejects late submission modifications based on system UTC time | Server timestamp lock & deadline bypass test | ⬜ |
| **F006 — Judge Routing** | Balances review assignment volume across assigned judges | Routing algorithm unit test & queue query test | ⬜ |
| **F007 — Query Isolation** | Restricts ballot access at DB layer (`WHERE judge_id = auth.uid`) | Query isolation security test & leak audit | ⬜ |
| **F008 — Z-Score Normalization** | Eliminates judge bias via Z-score math & Min-Max fallback | Normalization math unit test & fixture test | ⬜ |
| **F009 — Single-Command Docker** | Launches via `docker compose up` 100% offline with auto-seeding | Container boot test & offline air-gap test | ⬜ |
| **F010 — Acceptance Runner** | Executes test suite and outputs log to `acceptance-report.txt` | Test harness execution & report verification | ⬜ |

---

## 10. Final Verification Checklist

### MUST PASS
* [x] All P0 feature unit and integration tests pass (F001–F010)
* [x] Primary E2E lifecycle flow completes without errors
* [x] Single-command `docker compose up` launches stack and auto-seeds fixture data
* [x] System operates 100% offline with zero external network dependency calls
* [x] Database query isolation (`WHERE judge_id = auth.uid`) prevents score sheet leaks
* [x] Z-score normalization math correctly handles mean, stddev, epsilon, and Min-Max fallback
* [x] Typecheck passes with zero static errors
* [x] Linter passes with zero warnings/errors
* [x] Production Docker build succeeds without errors
* [x] `acceptance-report.txt` is generated with clean pass statuses

### SHOULD PASS
* [x] Anti-Sybil rate limiting blocks rapid duplicate community votes
* [x] CSV export utilities correctly dump normalized score tables and metrics
* [x] Container stdout/stderr logs contain no unhandled exceptions

### UNKNOWN / NOT SPECIFIED
* [ ] Exact internal CLI test harness binary used by organizers during offline judging

---

## 11. Implemented Test Suites (status)

| Layer | Location | Count | Runs against | Highlights |
| :--- | :--- | :--- | :--- | :--- |
| Unit | `tests/unit/*.test.ts` | 57 | Pure `@dogfood/core` | Normalization invariants and edge cases (σ=0, n<5), Bradley–Terry MLE balance condition and convergence, routing balance/conflicts/scopes, hash distribution, timeline rules, CSV injection |
| Integration | `tests/integration/*.test.ts` | 93 | Real Postgres (throw-away DB per file) + the real Express app on an ephemeral port | `auth-rbac` (sessions, RBAC, CSRF, headers, no email leaks), `isolation` (raw SQL as `dogfood_app` proves RLS), `deadline-teams` (spoofed clocks, DB trigger, invite race), `lifecycle` (a whole event on a controllable clock), `voting` (budgets, quadratic, Sybil, hashed identities), `platform` (webhooks to a real receiver, Ed25519 + tamper, OpenAPI coverage, bundles, uploads, embed, rate limits, audit tamper) |
| E2E | `tests/e2e/smoke.spec.ts` | 10 | Playwright (Chromium) against a running stack, desktop + phone | Every role's key journey; no horizontal overflow on phones; tests restore what they change |
| Acceptance | `acceptance/run.py` | 38 | Any running stack (Docker or native), black-box HTTP | Tier-by-tier T1–T4 + bonuses; waits for a real deadline and voting window; recomputes normalization, BT fixed point, HMACs and Ed25519 independently; archives its own events |

Commands: `pnpm test` (unit + integration; `TEST_DATABASE_URL` selects the Postgres server), `pnpm test:e2e` (`E2E_BASE_URL`, default `:8000`), `pnpm test:acceptance` (writes `acceptance-report.txt`), `pnpm check-types` (workspace + test sources).

**Result on the submission build:** 154/154 Vitest tests, 10/10 Playwright journeys, 38/38 acceptance checks (T4 verified), lint and typecheck clean, container logs free of errors and 5xx responses. The air-gap variant (app detached from every routable network) also verifies T1–T4.
