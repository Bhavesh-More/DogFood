# 18 — Implementation Plan

## 1. Development Strategy

The implementation plan for **Dogfood 2026** follows an incremental, risk-mitigated execution strategy designed for a 72-hour engineering sprint. Development progresses strictly from container foundation and core backend data pipelines (RBAC, server UTC deadline lock, query-isolated judging, Z-score score normalization) through responsive UI flows, offline acceptance test verification, and automated seed data loading.

```text
Phase 1: Project Foundation & Docker Orchestration
  ↓
Phase 2: Core Backend (Auth, RBAC, UTC Deadline Guard, Query Isolation, Normalization)
  ↓
Phase 3: Core Frontend (Role-Based Dashboards, Draft Editor, Gallery, Scoring Portal)
  ↓
Phase 4: Integrations & Anti-Sybil Public Voting
  ↓
Phase 5: Testing, Acceptance Harness & Hardening
  ↓
Phase 6: Single-Command Docker Deployment
  ↓
Phase 7: Seed Fixture Loading & Demo Verification
```

---

## 2. Phase 1 — Project Foundation

* [ ] Initialize public GitHub repository structure (`src/`, `tests/`, `docs/`).
* [ ] Configure root `docker-compose.yml` for single-command orchestration (`docker compose up`).
* [ ] Create `.dogfood.toml` manifest declaring functional tier coverage and application entry points.
* [ ] Set up environment configuration templates (`.env.example`) for database credentials and local ports.
* [ ] Configure local containerized database service (PostgreSQL / SQLite / MySQL) with persistent volumes.
* [ ] Implement seed fixture loading scripts to ingest deterministic test data (`fixtures.json`) on boot.
* [ ] Configure code linter, type checker, and automated test runner harness.

---

## 3. Phase 2 — Core Backend

* [ ] **Database Schema & Migrations:** Define tables for users, sessions, events, tracks, teams, team members, submissions, rubrics, judge assignments, evaluation ballots, public votes, and audit logs.
* [ ] **Session Auth & 5-Level RBAC:** Implement local session authentication middleware enforcing Visitor, Participant, Judge, Organizer, and Admin permissions.
* [ ] **Server UTC Deadline Guard:** Implement middleware validating request arrival against server system UTC time, rejecting late updates.
* [ ] **Team Management Service:** Build invite code generation and team roster handling enforcing 1–4 member limits.
* [ ] **Project Draft Service:** Create endpoints for saving drafts, uploading media links, and publishing final submissions.
* [ ] **Algorithmic Judge Routing:** Implement batch/algorithmic judge assignment routing with workload balancing across tracks.
* [ ] **Query Isolation Middleware:** Enforce database query predicates (`WHERE judge_id = auth.uid`) for score sheet privacy at the API/DB layer.
* [ ] **Z-Score Normalization Engine:** Build mathematical transformer for judge mean ($\mu_j$), standard deviation ($\sigma_j$), divide-by-zero epsilon ($\epsilon = 10^{-6}$), and Min-Max fallback for $N_j < 5$.

---

## 4. Phase 3 — Core Frontend

* [ ] **Application Shell & Layout:** Build responsive navigation header with role-aware tabs and theme styles.
* [ ] **Authentication & Role Switcher:** Create login/registration screens and dev role switcher.
* [ ] **Participant Dashboard & Team Form:** Build team creation forms, invite code sharing UI, and member roster displays.
* [ ] **Submission Editor & Gallery:** Create draft project editor with UTC deadline status banners and public searchable/filterable gallery.
* [ ] **Judge Scoring Portal:** Build query-isolated review queue and multi-criteria rubric scoring sheets.
* [ ] **Organizer Admin Panel:** Create track/rubric builders, judge assignment controls, Z-score normalization trigger buttons, and CSV export triggers.
* [ ] **UI States:** Implement explicit loading spinners, empty gallery placeholders, server error banners, and submission lock badges.

---

## 5. Phase 4 — AI & Integrations

* [ ] **Embedded AI Runtime:** None required (100% offline air-gapped container execution constraint).
* [ ] **Anti-Sybil Voting Engine:** Build public community choice voting endpoints with rate-limiting middleware and IP duplicate detection.
* [ ] **CSV Export Engine:** Implement utilities dumping normalized score matrices and competition audit logs to downloadable CSV files.
* [ ] **Background Tasks:** Configure asynchronous container boot seeding and export file processing.

---

## 6. Phase 5 — Testing & Hardening

* [ ] **Unit Tests:** Execute tests for Z-score normalization math (mean, stddev, epsilon, Min-Max fallback), server UTC deadline locks, and team size rules.
* [ ] **Integration Tests:** Execute tests for database transactions, session RBAC middleware, judge query isolation (`WHERE judge_id = auth.uid`), and CSV exports.
* [ ] **E2E Lifecycle Verification:** Test the complete primary user journey (Registration → Teams → Drafts → UTC Deadline Lock → Judge Routing → Scoring → Normalization → Gallery).
* [ ] **Automated Acceptance Runner:** Execute test harness parsing `.dogfood.toml` and write plain text results directly to `acceptance-report.txt`.
* [ ] **Quality Checks:** Run static type checker and linter to verify zero errors.

---

## 7. Phase 6 — Deployment

* [ ] **Air-Gapped Docker Configuration:** Verify all container services execute with network interfaces disabled (zero remote CDN/API calls).
* [ ] **Local Storage Mounting:** Confirm database volumes and media storage persist correctly across container restarts.
* [ ] **Environment Verification:** Verify all secrets and database passwords read exclusively from local environment variables.
* [ ] **Single-Command Launch Check:** Confirm `docker compose up --build` compiles and initializes the entire stack flawlessly on a clean host.

---

## 8. Phase 7 — Demo & Submission

* [ ] **Seed Data Validation:** Confirm boot seeding populates realistic test users, events, tracks, rubrics, and draft projects (`fixtures.json`).
* [ ] **Primary Demo Flow Verification:** Perform a dry run of the 5-minute video demonstration script.
* [ ] **Repository Artifacts Audit:** Verify all required files exist in the repository root:
  * `README.md`
  * `ARCHITECTURE.md`
  * `DATA-MODEL.md`
  * `JUDGING.md`
  * `docker-compose.yml`
  * `src/`
  * `tests/`
  * `acceptance-report.txt`
  * `LICENSE` (OSI open-source license)
  * `.dogfood.toml`
* [ ] **Acceptance Criteria Verification:** Verify all checklist items in `17-acceptance-criteria.md` pass before declaring complete.

---

## 9. Task Prioritization

### P0 — Must Complete
* Single-command `docker-compose.yml` orchestration and local DB setup.
* Local session authentication & 5-level RBAC middleware (F001).
* Event, track, and weighted rubric setup (F002).
* Team invite codes enforcing 1–4 member limits (F003).
* Project draft editor and public gallery (F004).
* Server-side UTC hard deadline lock (F005).
* Algorithmic judge assignment routing (F006).
* Backend query isolation `WHERE judge_id = auth.uid` (F007).
* Z-score score normalization engine with Min-Max fallback for $N_j < 5$ (F008).
* Auto-seeded database loading (`fixtures.json`) and 100% offline air-gapped execution (F009).
* Automated acceptance test runner logging pass/fail status to `acceptance-report.txt` (F010).

### P1 — Should Complete
* Anti-Sybil community voting with rate limiting and IP duplicate detection (F011).
* CSV score and audit log export utilities.

### P2 — If Time Allows
* Pairwise Bradley-Terry preference modeling engine (F012 / Bonus +5).
* Z-score normalization mathematical proof and demonstration UI (Bonus +5).
* Security threat model document and OpenAPI specification (Bonus +6).

---

## 10. Dependencies

```text
Docker Compose & Local Database Setup (Phase 1)
   ↓
Session Auth & 5-Level RBAC Middleware (Phase 2)
   ↓
Server UTC Deadline Lock & Query Isolation Engine (Phase 2)
   ↓
Team & Draft Services (Phase 2) ──► Frontend Application Shell & UI Forms (Phase 3)
   ↓                                       ↓
Algorithmic Judge Routing & Z-Score Normalization Engine (Phase 2)
   ↓
Public Gallery & Anti-Sybil Voting (Phase 4)
   ↓
Testing, Acceptance Runner & `acceptance-report.txt` (Phase 5)
   ↓
Single-Command Launch Verification & Demo Seed Verification (Phase 6 & 7)
```

---

## 11. Definition of Done

A development phase is declared **DONE** only when:
1. All assigned P0 features execute cleanly without runtime errors.
2. Unit, integration, and security role isolation tests pass.
3. Database query isolation (`WHERE judge_id = auth.uid`) and server UTC deadline guards are verified working.
4. The phase output integrates seamlessly with downstream dependencies without breaking existing user flows.

---

## 12. Final Checklist

* [x] Phase 1 — Foundation & Docker orchestration complete
* [x] Phase 2 — P0 backend services (Auth, RBAC, UTC lock, query isolation, Z-score math) complete
* [x] Phase 3 — P0 frontend dashboards and user workflows complete
* [x] Phase 4 — Integrations & anti-Sybil voting complete
* [x] Phase 5 — Testing complete and `acceptance-report.txt` generated (38/38, T4 verified)
* [x] Phase 6 — Security & offline air-gapped execution verified (app detached from every routable network, suite still verifies T1–T4)
* [x] Phase 7 — Production container build succeeds (`docker compose up --build`, healthy in ~10 s)
* [x] Primary demo flow verified on seeded fixture data
* [x] Hackathon submission requirements (`README`, `ARCHITECTURE`, `DATA-MODEL`, `JUDGING`, `THREAT-MODEL`, `LICENSE`, `.dogfood.toml`, video script) verified
* [x] `17-acceptance-criteria.md` definition of done satisfied

---

## 13. Execution Log

| Phase | Status | Notes |
| :--- | :--- | :--- |
| Research | ✅ Done | Tier lists, acceptance conventions and UI references recorded in `05`, `07`, `08`, `01`. |
| Phase 1 — Foundation | ✅ Done | Repo restructured to `src/{core,api,web}` + `tests/` + `tooling/`; pnpm/turbo workspace; Vitest projects. Compose/`.dogfood.toml`/LICENSE land with Phase 6. |
| Phase 2 — Core backend | ✅ Done | `src/core` maths (57 unit tests), Postgres schema with RLS + deadline trigger + hash-chained audit, T1/T2 API, deterministic fixtures. Verified by curl: cross-judge reads → 403, late edits → 403 `DEADLINE_PASSED`, invites single-use, normalization invariants hold. |
| Phase 3 — Frontend (M3 Expressive) | ✅ Done | Vite + React 19 + Tailwind v4; generated M3 colour tokens (light/dark), Google Sans Flex, Material Symbols subset, procedural expressive shapes; every role's screens; screenshot-reviewed on desktop and mobile. |
| Phase 4 — T3/T4 + bonuses | ✅ Done | Voting modes, quadratic, Sybil cap, comments, webhooks, signed records, import/export, pairwise BT, OpenAPI (116 operations), all with UI. |
| Phase 5 — Tests + acceptance | ✅ Done | 57 unit + 93 integration tests (real Postgres, real HTTP, one throw-away DB per file) and `acceptance/run.py` (38 black-box checks, stdlib only). Five real bugs found and fixed along the way — see below. |
| Phase 6 — Deploy & harden | ✅ Done | Multi-stage non-root image with bundled API (no `node_modules`), compose with the DB on an `internal` network, air-gap run verified; secrets hidden from the request role. |
| Phase 7 — Docs & demo | ✅ Done | README, ARCHITECTURE, DATA-MODEL, JUDGING (proofs), THREAT-MODEL, LICENSE, `acceptance-report.txt`, demo script (`19-demo-script.md`). |

### Findings during Phase 2
* **Zod 4 `.partial()` keeps defaults** — a PATCH would reset omitted fields. Fixed with default-free patch schemas.
* **FNV-1a high-bit clustering** — deterministic seed draws clustered; added a MurmurHash3 finalizer + distribution test.
* **Bradley–Terry scaling bug** — rescaling each iteration fought the phantom-item prior; removed rescaling so the fixed point is the true MAP estimate (caught by the balance-condition test).
* **Trigger ordering** — Postgres fires same-event triggers alphabetically; ownership derivation now runs before the score-bound check.

### Findings during Phases 5–6 (bugs the tests caught)
* **Webhook retries never happened.** The retry `UPDATE` passed `attempts` to `power()` untyped; Postgres resolved it as `text` and rejected it, so the first failed delivery aborted the worker pass forever. Explicit casts; covered by a test against a receiver that returns 500.
* **Webhook double-send / head-of-line blocking.** `FOR UPDATE SKIP LOCKED` was released as soon as the claim transaction committed, and deliveries were sent one by one, so a single unresolvable host delayed everyone by its timeout. Rows are now leased atomically (`next_attempt_at` pushed forward in the claiming statement) and sent concurrently.
* **Two clocks for expiry.** Invite and voting-code expiry was written with the DB clock but checked against the app clock — surfaced by the controllable-clock lifecycle test. All expiries now derive from `app.now()`.
* **Secrets readable by the request role.** `settings` (HMAC secret, Ed25519 key) had `SELECT` for `dogfood_app` although only the owner reads it at boot; migration `003` revokes it, with a test.
* **pg client fan-out.** `Promise.all` over one transaction client relies on pg's implicit queue, removed in pg 9; replaced by sequential `mapSeq`.
* **Environment gotcha.** A stale dev server on :8000 silently answered the first acceptance run — the runner now prints server version and clock skew up front so a wrong target is obvious.

### Iteration 2 — review & improve loop
| Area | Finding | Change |
| :--- | :--- | :--- |
| Mobile layout | Probe of 31 screens at 360/390 px found 5 pages wider than the viewport (grid min-width blow-outs, results table, API paths, a long pill) | Base `grid-cols-1` on every responsive grid (43 grids), contained table scrolling, wrapping paths, truncating pills; probe now reports zero overflow |
| Charts | Strip plots scaled a fixed viewBox, shrinking labels to ~6 px on phones | Measured width, drawn at 1 unit = 1 px |
| Participant UX | Deadline countdown sat below the whole form on phones; podium read 2-1-3 to screen readers | Countdown leads on phones; DOM in rank order, visual 2-1-3 only on wide screens |
| Organizer UX | Console tabs clipped at 1440 px | Shorter labels; active tab scrolls into view |
| Scrollers | No affordance that chip rows scroll | Scroll-driven edge fade, only where content is hidden |
| Accessibility | Automated sweep of every screen | One miss (embed had no `h1`), fixed |
| Payload | 1.4 MB font (all axes), uncompressed JS/CSS/JSON | Weight+ROND font (71 KB); build-time Brotli/gzip for assets (878 → 225 KB); Brotli/gzip JSON ≥ 1.4 KB (OpenAPI 96 → 8.5 KB) |
| Robustness | NUL bytes and bad percent-encoding produced 500s | Mapped to 400 `BAD_REQUEST`; regression test fires six malformed requests |
| Algorithms | Bradley–Terry O(n²) per MM step; routing recomputed pools/hashes in comparators | Sparse adjacency (4.3× faster), precomputed pools and hashes (2.2× faster), identical outputs |
| Test coverage | Test sources not type-checked; no browser tests; no CI | `tests/tsconfig.json` in `check-types`; 10 Playwright journeys; GitHub Actions workflow (checks → Docker stack → acceptance → e2e) |

Re-verified on a fresh `docker compose` build: 156/156 Vitest, 10/10 Playwright, 38/38 acceptance (T4).

### Iteration 3 — dark mode, theme switch, new features (PR #3)
| Area | Change |
| :--- | :--- |
| Dark mode | Deep tone-30 primary/tertiary containers instead of the 2025 spec's bright ones; hero highlight and cover initials use paired "on" colours; a unit test enforces WCAG contrast for every pairing the UI uses in both themes |
| Theme switch | Two states (light ⇄ dark); follows the OS until the viewer chooses; choice remembered |
| Scrollbars | Hidden app-wide; scrolling unchanged |
| Add to calendar | RFC 5545 `.ics` export of event milestones with a deadline reminder |
| Announcements | Audience-targeted (everyone / participants / judges), pinnable, audited, copied to the outbox, webhook `announcement.published` |
| Team finder | Solo seekers post skills; teams advertise open spots; trigger clears seekers who join; locks with the roster |

Re-verified on a fresh `docker compose` build: 218/218 Vitest, 14/14 Playwright, 38/38 acceptance (T4), lint and types clean.


### Iteration 4 — dev tooling, sign-in/out fixes
| Area | Change |
| :--- | :--- |
| Dev tooling | `pnpm setup` (env files, install, images, Chromium); `pnpm dev` = dev Postgres (compose profile `dev`, :5433) + Turbo TUI with API (:8001) and web (:5173) panes; `pnpm dashboard` = full Docker stack on :8000, alongside |
| Sign-in redirect | After a client-side login the app bounced back to `/login` (e.g. judges sent from `/judge`): `qc.clear()` detached the session query `SessionProvider` observes. Now the session is swapped in place and other queries are reset. The old e2e hid it with a full-page `goto` |
| Sign-in errors | The form showed only "Invalid request body"; it now shows per-field messages |
| Sign-out | M3 confirmation dialog, then a full reload so no per-user state survives |
| Button shape morph | `rounded-full` (9999px) → pressed radius snapped; round buttons now use half-height radii and ease out (`--ease-emphasized-decelerate`) for Button, IconButton and ButtonGroup |
| Accessibility | `Dialog` is labelled by its title (`aria-labelledby`) |

Re-verified on a fresh `docker compose` build: 218/218 Vitest, 17/17 Playwright, 38/38 acceptance (T4), lint and types clean; a crawl of 66 routes × 8 roles × desktop/mobile found no page errors, 5xx, error screens or overflow.
