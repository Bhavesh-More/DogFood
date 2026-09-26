# AGENTS.md — handoff for AI coding agents (and humans)

This file gives the next agent everything needed to keep working on
**Dogfood Portal** without re-deriving context. Read it fully before
changing code. Deeper references: `README.md`, `ARCHITECTURE.md`,
`DATA-MODEL.md`, `JUDGING.md`, `THREAT-MODEL.md`, and `docs/00–19`.

---

## 1. What this project is

**Dogfood 2026** is a hackathon (https://dogfoodhack.com) whose brief is
*"build the platform that will judge you"*: a self-hosted hackathon
submission and judging platform. Entries are graded mostly by an automated
acceptance suite run against the entry's own stack, plus human review.

**Our entry, Dogfood Portal**, covers:

- Events, teams and invites, and submissions with a server-enforced hard
  deadline.
- Judge invites, conflict-aware routing, and weighted rubrics.
- Strict per-judge isolation, enforced by Postgres Row-Level Security.
- Per-judge Z-score normalization with a Min-Max fallback.
- Pairwise Bradley–Terry ranking.
- Community voting: open, email-verified or authenticated; single or
  quadratic; anti-Sybil controls.
- Comments, and a hash-chained audit log.
- Webhooks, Ed25519-signed certificates, an embeddable gallery widget,
  import/export, and a generated OpenAPI 3.1 document.

The UI follows **Material 3 Expressive**, implemented with **Tailwind CSS v4**.

### Hackathon rules that constrain every decision

| Rule | Consequence for code |
|---|---|
| Must start with **one command**: `docker compose up` | Everything lives in `docker-compose.yml` (app + Postgres); the DB auto-migrates and auto-seeds |
| Must run **fully offline** | No CDNs, external fonts, email APIs or telemetry. Fonts and icons are self-hosted; email goes to a local `outbox` table |
| Acceptance: `python3 acceptance/run.py .dogfood.toml > acceptance-report.txt` | We wrote this runner ourselves (the official harness is unpublished). It reads `.dogfood.toml` and finds `fixtures.json` at the repo root |
| `.dogfood.toml` declares claimed tiers + stable per-role session tokens | Tokens are seeded as "checker sessions" on every boot while `CHECKER_SESSIONS=true` |
| **Overclaiming a tier is penalised** (re-graded at the highest verified tier) | Never claim a tier the runner can't verify |
| Required files: README, ARCHITECTURE, DATA-MODEL, JUDGING, LICENSE, `.dogfood.toml`, `docker-compose.yml`, `src/`, `tests/`, `acceptance-report.txt` | All present at the repo root |
| Judging window: Sep 28 – Oct 8, 2026 | — |

### The four tiers (all claimed and verified) and the bonuses

- **T1:** auth and five-role RBAC; events with tracks, prizes and questions;
  registration; single-use expiring team invites; a deadline-locked
  submission; public gallery.
- **T2:** judge invites; routing; weighted rubric; RLS isolation; progress;
  Z-score normalization (Min-Max fallback when a judge has N < 5 ballots);
  CSV exports.
- **T3:** voting modes; quadratic voting; anti-Sybil controls; comments;
  hidden tallies; randomized order; audit trail.
- **T4:** REST + OpenAPI; webhooks; Ed25519-signed records; embed widget;
  import/export.
- **Bonuses:** normalization proof (`JUDGING.md`), pairwise Bradley–Terry,
  threat model (`THREAT-MODEL.md`), API-first.

---

## 2. Current status (end of the previous session)

- **Everything is implemented and verified.** On a freshly rebuilt Docker
  image:
  - **218/218 Vitest tests**, run with `pnpm test`.
  - **17/17 Playwright journeys.**
  - **38/38 acceptance checks** (T4 verified, 4/4 bonuses). See
    `acceptance-report.txt`.
  - Lint and type-check are clean.
  - Container logs show no errors and no 5xx responses.
- **Git:** all work is on branch **`claude/compassionate-lamport-qnnpk6`**:
  73 small commits on top of `main` (the base is a create-turbo starter
  plus the `docs/` research). The previous session **could not push**: the
  Claude GitHub App had no write access to `Bhavesh-More/DogFood` (HTTP
  403). The branch was handed to the user as a `git bundle`.
- **No pull request exists yet.** The user asked for one once the work is
  pushed. The target is `main` of `Bhavesh-More/DogFood` or the user's fork
  `divyanshu-patil/DogFood`. There is no PR template in the repo.
- **Remaining TODOs:**
  1. Push the branch and open the PR.
  2. Watch CI (`.github/workflows/ci.yml` has never run yet) and fix
     anything environment-specific.
  3. Record the demo video (script in `docs/19-demo-script.md`).
  4. Optional ideas in §11.

### Resuming from the bundle (if the repo doesn't have the branch yet)

```bash
git clone -b claude/compassionate-lamport-qnnpk6 dogfood.bundle DogFood
cd DogFood
git remote set-url origin https://github.com/<owner>/DogFood.git
git push -u origin claude/compassionate-lamport-qnnpk6
```

---

## 3. Stack and versions (exact; they matter)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | **pnpm 11.25** workspaces + **Turborepo** | `pnpm-workspace.yaml`: `src/*`, `tooling/*` |
| Language | **TypeScript 7.0.2** (the native Go compiler) | TS 7 has **no JS API**, so ESLint parses TS through **Babel** (`@babel/preset-typescript`), not typescript-eslint |
| Runtime | Node ≥ 22.12 (Docker uses `node:24-alpine`) | |
| API | **Express 5.2**, **Zod 4.6**, **pg 8.23** | Bundled by esbuild into `src/api/dist/server.mjs` and `cli.mjs` (no `node_modules` at runtime) |
| DB | **PostgreSQL 16** | RLS, triggers, `timestamptz`, advisory locks, generated `tsvector` |
| Web | **Vite 8**, **React 19.2**, **React Router 7.18**, **TanStack Query 5**, **Tailwind 4.3** | Lazy route chunks |
| Design | `@material/material-color-utilities` (2025 spec, `SchemeVibrant`, seed `#6750FF`) | Google Sans Flex (weight + ROND axes) and JetBrains Mono via fontsource; Material Symbols Rounded SVG subset |
| Tests | **Vitest 5** (projects: `unit`, `integration`), **Playwright 1.63** (`tests/e2e`) | Integration tests need a real Postgres |
| Acceptance | Python 3.11+ **stdlib only** | `acceptance/run.py` |

---

## 4. Repository map

```
.dogfood.toml            capability manifest: tiers, bonuses, normalization, checker tokens, entry points
fixtures.json            deterministic seed data (format dogfood.fixtures.v1), generated by scripts/generate-fixtures.py
acceptance/run.py        38-check black-box acceptance runner (writes the report to stdout)
acceptance-report.txt    latest runner output (commit it after re-running)
docker-compose.yml       app + db (db on an internal-only network)
Dockerfile               multi-stage: build (pnpm install, esbuild, vite) → runtime (dist + migrations + web + fixtures)
playwright.config.ts     e2e config (E2E_BASE_URL, CHROME env)
vitest.config.ts         projects unit/integration; alias @dogfood/core → src/core/src/index.ts
.github/workflows/ci.yml checks → docker stack → acceptance → e2e
README · ARCHITECTURE · DATA-MODEL · JUDGING · THREAT-MODEL · LICENSE (MIT)
docs/00–19               research and planning; 18 = execution log, 19 = demo script, screenshots/

src/core/src/            @dogfood/core — PURE TypeScript, no I/O, shared by API and web
  roles.ts               ROLES, capability matrix, can(role, cap)
  schemas.ts             every Zod input schema (+ default-free *Patch variants)
  types.ts               DTOs returned by the API
  normalization.ts       weightedTotal, normalize, aggregate, checkInvariants, spearman
  bradley-terry.ts       fitBradleyTerry (MM with phantom prior), selectNextPair, fnv1a (+ fmix32)
  assignment.ts          planAssignments (most-constrained first, least-loaded judge)
  timeline.ts            isBeforeDeadline, eventPhase, voting windows, countdown
  voting.ts, csv.ts      quadratic helpers, seededShuffle; CSV with formula-injection guard

src/api/
  migrations/001_schema.sql         tables, constraints, indexes
  migrations/002_security.sql       dogfood_app role, RLS policies, triggers, audit hash chain, audit_log_verify()
  migrations/003_harden_secrets.sql REVOKE settings FROM dogfood_app
  src/config.ts          env → Config (see §6)
  src/app.ts             ensureSecrets, allRoutes(), createApp (API, uploads, precompressed assets, SPA fallback)
  src/boot.ts            prepareDatabase: migrate → secrets → seed if empty → checker sessions
  src/index.ts, cli.ts   server entry; CLI: migrate | seed | reset --yes
  src/db/pool.ts         Db.tx(actor, fn) (SET LOCAL ROLE dogfood_app + app.user_id/app.role), system(), owner(), one/many/mapSeq
  src/http/route.ts      route() definitions, mountRoutes (auth, capability, rate limit, zod), sendJson (br/gzip), openApiDocument
  src/http/middleware.ts security headers/CSP, authenticate, csrfGuard, globalRateLimit, errorHandler (error → HTTP mapping)
  src/http/rate-limit.ts in-memory token buckets (LIMITS)
  src/modules/*.ts       access, auth, events, teams, submissions, judging, results, voting, webhooks, records, platform, admin
  src/seed/*.ts          fixtures schema + seeding (latent-quality ballots, Sybil cluster, pairwise, votes, records)

src/web/src/
  ui/                    M3 Expressive kit: Button/IconButton/Fab/ButtonGroup, Chip/Pill, Field (TextField, Select, Switch,
                         Checkbox, ScoreSlider), Tabs, Dialog, Menu, Toast, Progress, Feedback, Card, Avatar, Shape, Art, Icon
  app/Shell.tsx          nav rail (≥840px) / bottom bar, top bar, user menu, theme toggle
  components/            Countdown, EventCard, Voting, charts/Charts.tsx (BarList, DivergingBars, StripPlot)
  lib/                   api.ts (ApiError + field errors), session.tsx, time.ts (server-synced clock), queries.ts,
                         theme.ts, format.ts, icons.generated.ts
  pages/                 public pages; participant/, judge/, organize/, admin/, auth/
  styles/theme.css       GENERATED colour roles (light + dark)
  styles/app.css         Tailwind @theme tokens, type scale utilities, state-layer, focus-ring, scroll-fade-x, breakpoints
  scripts/               generate-theme.mjs, generate-icons.mjs (+ icons.txt), compress.mjs

tests/unit/              pure core tests
tests/integration/       helpers.ts (startStack) + auth-rbac, isolation, deadline-teams, lifecycle, voting, platform, web-assets
tests/e2e/smoke.spec.ts  Playwright journeys (public, participant, judge, organizer, mobile)
tests/tsconfig.json      so test sources are type-checked by `pnpm check-types`
tooling/                 @dogfood/eslint-config (Babel parser), @dogfood/typescript-config
scripts/                 generate-fixtures.py, screenshots.mjs
```

---

## 5. Commands

```bash
pnpm install
pnpm setup                            # copy .env.example files, install, pull docker images, Playwright Chromium
pnpm dev                              # docker devdb (:5433) + Turbo TUI panes: API :8001 (src/api/.env), Vite :5173 (proxies to API_URL in src/web/.env)
pnpm dashboard                        # docker compose stack on :8000 (coexists with `pnpm dev`); dashboard:logs|down|reset
pnpm build                            # API bundle + web build (+ Brotli/gzip twins)
pnpm lint                             # eslint --max-warnings 0 everywhere
pnpm check-types                      # workspace tsc + `tsc -p tests`
pnpm test                             # unit + integration (TEST_DATABASE_URL, default postgres://postgres@127.0.0.1:5432/postgres)
pnpm test:e2e                         # Playwright vs running stack (E2E_BASE_URL default http://localhost:8000; CHROME=/path optional)
python3 acceptance/run.py .dogfood.toml > acceptance-report.txt   # needs a running stack
docker compose up --build             # full stack at http://localhost:8000
docker compose down -v                # wipe DB + uploads (next boot reseeds)
docker compose exec app node dist/cli.mjs reset --yes             # reseed in place
node src/web/scripts/generate-icons.mjs                           # after editing src/web/scripts/icons.txt
pnpm --filter @dogfood/web theme                                  # regenerate theme.css (runs via tsx; plain node fails on ESM imports)
python3 scripts/generate-fixtures.py                              # regenerate fixtures.json (deterministic)
node scripts/screenshots.mjs <outDir> <baseUrl>                   # env: ONLY, VIEWPORTS (desktop,mobile), THEMES (light,dark), FULL=0
```

Integration tests create a throwaway database per test file
(`dogfood_test_*`) as a Postgres superuser. They start the real Express app
on an ephemeral port with an injectable clock (`startStack({ now })`).
Helpers:

- `s.as(token)`, `s.anon`, `s.cookieJar()`: HTTP clients.
- `s.sql()`: raw SQL as the owner.
- `s.asDbUser(userId, role, fn)`: raw SQL as the RLS-restricted app role.
- `s.tokenFor(userId)`: mint a session without hitting the login rate
  limit.

---

## 6. Configuration (env → `src/api/src/config.ts`)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 8000 | |
| `DATABASE_URL` | `postgres://postgres@127.0.0.1:5432/dogfood` | compose sets `postgres://dogfood:…@db:5432/dogfood` |
| `APP_SECRET` | *(generated on first boot, stored in `settings`)* | HMAC key (IP, email and voter-cookie hashes) |
| `PUBLIC_URL` | `http://localhost:$PORT` | invite links; CSRF allowed origin |
| `SEED_ON_BOOT` | true | load fixtures into an **empty** DB |
| `FIXTURES_PATH` | searched in default locations | |
| `CHECKER_SESSIONS` | true | seed the public acceptance tokens; **must be false in production** |
| `COOKIE_SECURE`, `TRUST_PROXY` | false | true behind TLS / a reverse proxy |
| `UPLOAD_DIR`, `WEB_DIST`, `MIGRATIONS_DIR` | repo-relative | Docker sets the `/app/...` paths |
| `WEBHOOK_WORKER` | true | 2 s delivery loop |
| `LOG_REQUESTS` | true unless `NODE_ENV=test` | |

Checker tokens (also in `.dogfood.toml` `[sessions]`):

| Key | Token |
|---|---|
| admin | `dfc_admin_4f9c2e7a1b8d60536e21` |
| organizer | `dfc_organizer_8b1d3f5a7c9e20461a` |
| judge (judge A, strict) | `dfc_judge_a_2c4e6a8b0d1f39571b` |
| judge_b (lenient) | `dfc_judge_b_9e7c5a3b1d2f40682c` |
| judge_track (judge F, civic only) | `dfc_judge_f_5a1c9e3b7d2f60843d` |
| participant | `dfc_participant_7d3b1f9e5c2a48064e` |
| participant_2 | `dfc_participant2_3e9a7c1d5b2f86024f` |
| visitor | `dfc_visitor_1b5d9f3a7e2c64080a` |

Demo logins: `organizer@dogfood.local`, `judge.a@…`, `participant@…`,
`admin@…`, and so on. Every account's password is `dogfood-demo-2026`.

### Seed data (times are relative to seed time)

- **`evt_01` Sample Hack 2026** (`sample-hack-2026`)
  - In judging, with open-link single voting live (budget 3).
  - 6 judges:
    - A is strict (bias −27.5) and B is lenient (+13.6).
    - F is scoped to the Civic track, with 4 ballots, so it takes the
      Min-Max fallback.
  - Pairwise comparisons.
  - A 7-device Sybil cluster.
  - 1 ineligible project (`sub_01_17`).
- **`evt_02` Autumn Build Week** (`autumn-build-week`)
  - Submissions open.
  - Email-gated quadratic voting later (budget 25).
  - `team_02_01` belongs to `participant`.
- **`evt_03` Spring Hack 2026**
  - Archived, results published, records issued.
- **`evt_04` Winter Jam 2027**
  - A draft owned by `organizer2`; used for tenant-isolation tests.

---

## 7. How the system works (the parts you must not break)

### Request pipeline

1. Security headers and CSP.
2. Global rate limit.
3. JSON body (1 MB limit).
4. `authenticate`: a Bearer token or the `dogfood_session` cookie, hashed
   with SHA-256 and looked up in `sessions`.
5. `csrfGuard`: cookie-authenticated writes whose Origin doesn't match are
   refused.
6. The **route table**.

Every endpoint is declared once with `route({ method, path, summary, auth,
body, query, rateLimit, handler })` inside `src/api/src/modules/*.ts`, and
registered via `allRoutes()` in `app.ts`. `mountRoutes` enforces:

- `auth`: `"public"`, `"user"`, or a capability from `@dogfood/core`
  `roles.ts`.
- Rate limits.
- Zod validation; failures return 422 `VALIDATION_FAILED` with per-field
  `details`.

`/api/openapi.json` is generated from the same table, and
`platform.test.ts` asserts every route is documented. **Add endpoints only
through `route()`.**

### Transactions and RLS

Handlers call `tx(fn)`. That opens a transaction, runs
`SET LOCAL ROLE dogfood_app`, and sets `app.user_id` and `app.role`, so
Row-Level Security filters every query:

- Assignments, ballots, scores and pairwise votes: `judge_id = app_user_id()`,
  or the caller organizes the event.
- `normalization_runs`: staff only.

Trusted jobs use `db.system()` (`app.role = 'system'`). Only migrations and
`ensureSecrets` use the owner connection. **Never** read ballot or score
data outside `tx`/`system`. **Never** run `Promise.all` over one `tx`
client; use `mapSeq`, because pg 9 removes the implicit queue.

### Database-level guarantees (triggers and constraints)

- **`submissions_deadline` trigger:** rejects content changes after
  `max(deadline, team extension)`. It raises hint `DEADLINE_PASSED`,
  which is mapped to 403. Eligibility edits are allowed.
- **Ownership triggers:**
  - `ballots_00_ownership` and `scores_00_ownership` derive `judge_id`,
    `event_id` and `submission_id` from the assignment.
  - `scores_10_bounds` enforces the criterion max.
  - Trigger names are prefixed `00`/`10` because Postgres fires triggers
    alphabetically.
- **Audit log:**
  - Append-only: the app role has no UPDATE/DELETE, and an owner-level
    trigger refuses changes.
  - Each `hash` is SHA-256 over `prev_hash` and the row.
  - `audit_log_verify()` finds the first broken row.
- **Constraints:** one team per person per event (`UNIQUE (event_id,
  user_id)`); one submission per team; composite FKs `(x_id, event_id)`
  keep children in their own event.
- **Secrets:** `settings` (the HMAC secret and the Ed25519 key) is not
  readable by `dogfood_app`.

### Time

A single injectable clock, `app.now()`, drives every rule:

- Deadlines and voting windows.
- Judging close.
- Invite and code expiry. **Expiry is written from `app.now()` too, not
  from the DB's `now()`.**
- Rate-limit refill.

Rules are pure functions in `core/timeline.ts`. Client time headers are
ignored. Sessions and webhook backoff use the DB clock internally; that's
fine, because they never compare against the app clock.

### Normalization (see JUDGING.md for the proofs)

1. **Weighted total:** `T = 100·Σ w·s/max / Σ w` over the event-wide
   criteria plus the project's track criteria. It is **always recomputed
   from `scores`** and never taken from `ballots.raw_total`.
2. **Z-score** when a judge has `n ≥ minSampleSize` (5):
   `z = (T−μ)/(σ+ε)` with population σ and `ε = 1e-6`.
3. **Min-Max fallback** otherwise:
   `x = (T−min)/(max−min+ε)`, with `x = 0.5` when the range is 0;
   then `z = (2x−1)·√3`.
4. **Display score:** `N = 70 + 15·z`. The target is configurable per
   event.
5. **Aggregation:** the mean N per project ranks projects, and `σ_N` is
   reported as a disagreement signal. Ties break on the raw mean, then the
   judge count, then the id.
6. **Storage:** every run's inputs and outputs are snapshotted in
   `normalization_runs`. Publishing copies the run into
   `published_results`, without per-judge data.

**Bradley–Terry:**

- MM iterations over sparse adjacency, with a phantom opponent of strength
  1 carrying `α = 0.5` pseudo wins and losses, and **no rescaling**.
- The fixed-point identity `Σ p/(p+1) = n/2` is checked by the acceptance
  runner.
- `selectNextPair` picks the next pair in this priority order: pairs the
  judge hasn't compared yet, then the fewest total comparisons, then the
  closest strengths, then a hash tie-break.

**Routing** (`planAssignments`):

- Deterministic.
- Most-constrained submissions are placed first, each with its
  least-loaded judges.
- Ties break on an FNV-1a hash of `(judge, submission)` with a murmur3
  `fmix32` finalizer. Without the finalizer, raw FNV-1a clusters.
- Respects track scopes, team membership, conflicts and `maxPerJudge`, and
  reports shortfalls.
- `dryRun` previews without writing.

### Voting

- **Identity** comes from the `voter_key`:
  - `u:<user>` in authenticated mode.
  - `e:<hmac(canonical email)>` in email mode. Canonicalisation lowercases
    and strips `+tag`.
  - `d:<hmac(device cookie)>` in open mode.
- **One row per voter per project** (`UNIQUE`). Budgets are checked under a
  `pg_advisory_xact_lock` per voter.
- **Costs:**
  - Quadratic: `v` votes cost `v²` credits.
  - Single: each voter backs at most `budget` projects.
- **Sybil rule, open mode only:** more than 3 distinct devices voting from
  one IP hash puts the new vote in `flagged`, which is not counted. The IP
  comes from the socket; `X-Forwarded-For` is ignored unless
  `TRUST_PROXY` is set. Organizers can override, and the override is
  audited.
- **Tallies are hidden** from non-organizers until the voting window closes.
- **The gallery** shows a stable per-viewer shuffle while voting is open.
- **Restrictions:** organizers can't vote, and no one can vote for their
  own team.
- **Email codes** are 6 digits, stored as an HMAC, valid for 15 minutes
  with 5 attempts, and delivered to the `outbox` table. Admins see them at
  `/api/admin/outbox`.

### Webhooks and records

- **Webhook emission:** `app.webhooks.emit(eventId, type, data, tx)`
  inserts delivery rows in the same transaction as the change (outbox
  pattern).
- **Webhook worker:**
  - Leases rows by pushing `next_attempt_at` 60 s ahead in the claiming
    statement.
  - Sends concurrently with a 5 s timeout.
  - Retries with backoff `5·2ⁿ` s, 6 attempts in total.
  - Signs with `X-Dogfood-Signature: sha256=HMAC(secret, "${timestamp}.${body}")`.
  - Refuses cloud metadata targets.
- **Records:**
  - Canonical JSON (sorted keys), signed with Ed25519.
  - The public key is served at `/.well-known/dogfood-signing-key.json`.
  - Kinds: `judge_participation`, `participant`, `winner`.

### Error model

Every error has the shape `{ error, code, details? }`. `errorHandler` maps:

- `HttpError` subclasses, Zod errors, body-parser errors (`BAD_JSON`,
  `PAYLOAD_TOO_LARGE`), and framework 4xx errors → `BAD_REQUEST`.
- Postgres errors:
  - 23505 → 409.
  - 42501 → 403.
  - 23514/23503/22P02 → 422 `CONSTRAINT_VIOLATION`.
  - Class-22 input errors such as NUL bytes → 400.
  - Hint `DEADLINE_PASSED` → 403.

Anything else becomes a 500 `INTERNAL`, logged server-side, never a stack
trace. Stable codes that clients rely on include `DEADLINE_PASSED`,
`NOT_YOUR_ASSIGNMENT`, `ROLE_FORBIDDEN`, `RESULTS_HIDDEN`, `INVITE_USED`,
`TEAM_FULL`, `BUDGET_EXCEEDED` and `JUDGING_CLOSED`. The full list can be
grepped from `src/api/src/modules`.

### Web delivery and performance

- `vite build` then `scripts/compress.mjs` writes `.br` and `.gz` twins;
  the server serves them by Accept-Encoding (`precompressedAssets` in
  `app.ts`).
- JSON bodies of 1.4 KB or more are Brotli/gzip compressed (`sendJson`).
- Hashed assets are served with `immutable` caching; the SPA shell with
  `no-cache`.
- The font is the weight + ROND build (71 KB). **Don't switch back to
  `full.css`**, which is 1.4 MB.

### Test inventory

| Suite | Count | What it covers |
|---|---|---|
| `tests/unit/*` | 57 | Normalization, Bradley–Terry, assignment, rules |
| `auth-rbac` | 18 | Sessions, RBAC, tenancy, headers, CSRF, no email leaks, malformed input → 4xx |
| `isolation` | 14 | Raw SQL as the app role proves RLS; secrets hidden; audit append-only |
| `deadline-teams` | 14 | Deadline, DB trigger, extensions, invite race |
| `lifecycle` | 17 | A whole event on a controllable clock |
| `voting` | 15 | Voting modes, budgets and anti-Sybil controls |
| `platform` | 16 | Webhooks to a real receiver, Ed25519 + tampering, OpenAPI coverage, bundles, uploads, embed, rate limit, audit tamper |
| `web-assets` | 5 | Precompressed assets and compressed JSON |
| `tests/e2e/smoke.spec.ts` | 10 | Playwright journeys; they restore any data they change |
| `acceptance/run.py` | 38 | See `acceptance-report.txt` |

The runner:

- Creates uniquely named events (`acc-<runid>`) and waits for a real
  14-second deadline.
- Recomputes the maths independently, including a pure-Python RFC 8032
  Ed25519 verifier.
- Archives its events at the end.

It uses `DOGFOOD_BASE_URL` and `DOGFOOD_WEBHOOK_HOSTS` env overrides.
Webhook hosts default to `127.0.0.1` and `host.docker.internal`; compose
maps the latter to the host gateway.

---

## 8. Conventions and gotchas (learned the hard way)

**Commits and workflow**

- Commits are small and focused, with a Conventional-Commit style prefix
  (`feat(web):`, `fix(api):`, `test(integration):`, `docs:`, `perf(core):`,
  `chore:`). The body explains *why*.
- The user asked for **small commits, pushed often, including doc
  updates**, and for `docs/18-implementation-plan.md` (execution log) to be
  updated after each phase or iteration.
- The last previous session appended trailers to every commit:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: <url>`. Keep that convention or follow your own
  harness's instructions.

**Lint and type rules**

- **ESLint uses the Babel parser**, because TS 7 has no JS API. That has
  consequences:
  - `no-undef`, `no-unused-vars` and `no-redeclare` are off for TS; `tsc`
    catches those instead.
  - In `.ts` files, prefer **function declarations for generics**.
    `const f = <T>(…) =>` is parsed as JSX in some configurations.
  - The React preset is `@babel/preset-react`. Babel 8 removed
    `isTSX` and `allExtensions`.
- **The React Compiler lint rules are on.** Four patterns fail:
  - `Date.now()` during render. Use a lazy `useState` initializer or
    `useServerNow()`.
  - `setState` synchronously inside an effect. Reset in handlers, or key a
    child component.
  - Writing refs during render.
  - An unstable mutate in dependency arrays.
- **TypeScript is strict**, with `noUncheckedIndexedAccess`,
  `noUnusedLocals` and `verbatimModuleSyntax`. Test sources are
  type-checked too (`tests/tsconfig.json`).

**Zod patch schemas**

- Zod 4's `.partial()` keeps `.default()`s, so a PATCH would reset omitted
  fields. Use the **default-free `*Patch` schemas** in `core/schemas.ts`.
  Also, `.partial()` cannot be called on a refined object.

**Tailwind and layout**

- Custom breakpoints must be in **rem**: `compact` 37.5, `medium` 52.5,
  `expanded` 75, `large` 100. Values in px mis-sort against Tailwind's own.
- Give every responsive grid a base **`grid-cols-1`**. Without it, a
  truncated line or wide child widens the whole page on phones; this bit us
  43 times. Wide tables go inside `overflow-x-auto` with `min-w-0` parents.

**Generated code**

- `Shape` adds `relative` only when the class list has no position class
  already. Don't pass both `absolute` and `relative`.
- Icons are a **generated subset**. To add one, add its name to
  `src/web/scripts/icons.txt`, run the generator, and commit
  `icons.generated.ts`. Names must exist in Material Symbols Rounded.
- `theme.css` is generated; never hand-edit it. Custom *success* and
  *warning* roles are harmonised to the seed colour.

**Charts**

- Follow the data-viz rules:
  - Thin bars (≤ 24 px) with 4 px rounded data ends.
  - Hairline grids.
  - Text in text tokens, never the series colour.
  - Tooltips on hover and focus.
- The SVG charts measure their width and draw at 1 unit = 1 px (the
  `useWidth` hook). Don't reintroduce a fixed scaled `viewBox`.

**Environment**

- Kill stray dev servers by **PID**. `pkill -f "src/api/src/index.ts"`
  once killed the agent's own shell. A stale dev server on :8000 once
  silently answered the acceptance runner; check the version and clock
  skew it prints on T1.01.
- In sandboxed or cloud containers behind a TLS-intercepting proxy,
  `docker build` fails at `npm install` with `SELF_SIGNED_CERT_IN_CHAIN`.
  To verify builds there, use a **scratch** Dockerfile that copies the
  proxy CA and sets `NODE_EXTRA_CA_CERTS`, build with `--network host`,
  and pass the proxy build args. **Don't commit that change**; the real
  Dockerfile must stay clean.

**Rate limits during tests**

- Anonymous traffic is keyed by IP:
  - `auth`: 10 per minute.
  - `vote`: 20 per minute (also used by code verification).
  - `emailCode`: a burst of 3.
- Running the acceptance suite several times back to back can hit 429s.
  Wait about a minute between runs. Integration tests use
  `s.tokenFor(userId)` to avoid the login limiter.

**Data mutation**

- Playwright tests must **restore anything they change**, because they run
  against the demo database.

---

## 9. How to verify a change (definition of done)

```bash
pnpm lint && pnpm check-types && pnpm test          # needs Postgres
pnpm build
docker compose down -v && docker compose up -d --build --wait
pnpm test:e2e
python3 acceptance/run.py .dogfood.toml > acceptance-report.txt && tail -12 acceptance-report.txt   # must say Result PASS, Verified tier T4
docker compose logs app | grep -iE "error|exception"   # expect nothing
```

For UI changes, also look at the screens:

- Capture with `node scripts/screenshots.mjs`.
- Check desktop 1440 px and mobile 360–390 px, in both light and dark.
- Check for horizontal overflow: `document.documentElement.scrollWidth`
  must not exceed `clientWidth`. The e2e `@mobile` test asserts this on the
  home page.

Update `docs/18-implementation-plan.md` (execution log). If counts or
behaviour change, also update README, ARCHITECTURE, `docs/16` and
`docs/17`.

---

## 10. Bugs found and fixed so far (don't regress)

1. Webhook retries crashed: `power()` received an untyped parameter.
   Parameters are now cast with `::int`.
2. Webhook claiming released its lock before sending. Rows are now leased,
   and a slow receiver no longer blocks the others (deliveries are
   concurrent).
3. Invite and email-code expiry mixed the DB clock with the app clock. Both
   now use `app.now()`.
4. `settings` secrets were readable by the request role. Migration 003
   fixed it.
5. `Promise.all` ran on a single pg client. It now uses `mapSeq`.
6. NUL bytes or undecodable URLs returned 500. They now return 400.
7. Several UI fixes:
   - Five pages overflowed at phone width; fixed with `grid-cols-1`,
     table scrolling, `break-all`, and a truncating `Pill`.
   - Chart text shrank on phones.
   - The organizer tabs clipped at 1440 px.
   - The deadline countdown was buried at the bottom of the page on
     phones.
   - The podium's DOM order was wrong for screen readers.
   - The embed page had no `h1`.
8. Performance:
   - Fonts went from 1.4 MB to 71 KB.
   - Assets and JSON are compressed.
   - Bradley–Terry is 4.3× faster (sparse adjacency).
   - Routing is 2.2× faster (precomputed pools and hashes).
9. Earlier fixes:
   - Zod partial defaults.
   - FNV clustering (the fmix32 finalizer).
   - Bradley–Terry rescaling that fought the prior.
   - Trigger order.
   - The generated `tsvector` needed an `IMMUTABLE` wrapper
     (`immutable_tags_text`).

---

## 10b. Added in the follow-up session (PR #3)

- **Theme.** Dark mode uses deep containers: `DARK_CONTAINER_OVERRIDES` in
  `generate-theme.mjs` sets tone 30 for the surface and tone 90 for text.
  `tests/unit/theme-contrast.test.ts` fails if any text/surface pair used
  by the UI drops below WCAG AA in either theme. **Regenerate the theme;
  never edit `theme.css` by hand.**
- **Two-state theme.** `lib/theme.ts` exposes `useTheme()` →
  `[theme, toggle, set]`. There is no "system" state; the OS preference is
  only the default before the viewer chooses.
- **Scrollbars** are hidden globally (`@layer base` in `app.css`).
- **Calendar.** `core/calendar.ts` builds the file; the route is
  `GET /api/events/:eventId/calendar.ics`.
- **Announcements.**
  - `modules/announcements.ts` and migration `004`.
  - `visibleAudiences()` decides who sees what, on the server.
  - Posting copies the announcement to the outbox and emits an
    `announcement.published` webhook (a new `WEBHOOK_EVENTS` entry).
  - UI: `components/Announcements.tsx`.
- **Team finder.**
  - `modules/teamfinder.ts` and migration `005`.
  - The `team_members_clear_seeker` trigger removes a person's post when
    they join or found a team.
  - `teams.looking_for` holds the recruiting text; `null` means the team
    is not recruiting.
  - UI: `components/TeamFinder.tsx`, shown on the team page.

## 11. Known limitations and next ideas

- **Rate limiter:** in memory, which is correct for a single node. A
  multi-node deployment needs a shared store.
- **Open-link voting:** the Sybil heuristic can flag honest voters behind
  CGNAT, and VPN-hopping plus clearing cookies defeats it. For real prizes,
  recommend `email` or `authenticated` mode.
- **Audit hash chain:** it is unkeyed. Publish `headHash` from
  `/api/audit/verify` when announcing results so external anchoring can
  detect a full-chain rewrite.
- **Webhooks:** organizers are trusted to target their own LAN; only cloud
  metadata IPs are blocked.
- **Email:** it only reaches the local outbox. SMTP could be added without
  schema changes.
- **Ideas, if time allows:**
  - Organizer "export all" as a ZIP.
  - An i18n scaffold.
  - Keyboard shortcuts in the judge queue.
  - A notification centre fed by webhooks.
  - Visual regression screenshots in CI.
  - Moderation queue UI for comments.
  - A per-judge calibration round before scoring.

---

## 12. Rules for the next agent

1. Verify before claiming; state test results truthfully. Never inflate
   tier claims in `.dogfood.toml`.
2. Keep everything offline-capable: no new CDNs or network calls at
   runtime.
3. Put business rules in `@dogfood/core` (pure, unit-tested). Put
   endpoints in `route()`. Put data rules in SQL constraints or triggers
   where possible.
4. Never commit secrets. The checker tokens are intentionally public
   test tokens.
5. Make small commits and update the docs as you go. Open the PR only when
   the user asks, and target the repository the user names.
