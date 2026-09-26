# Dogfood Portal

**A self-hosted hackathon platform that judges fairly.** It covers teams,
submissions with a hard deadline, judge invites and conflict-aware routing,
weighted rubrics, and per-judge statistical normalization, so a strict
judge's 7 counts as much as a lenient judge's 9. It also runs community
voting with anti-Sybil controls, and produces signed certificates and a
tamper-evident audit trail. It works offline and starts with one command.

Built for **Dogfood 2026**, *"build the platform that will judge you"*.
It claims **Tiers 1–4 and all four bonuses**, and verifies them: 38/38
acceptance checks pass against a fresh `docker compose` stack
([acceptance-report.txt](acceptance-report.txt)).

![Home](docs/screenshots/home.png)

## Quick start

```bash
docker compose up --build
```

Open **http://localhost:8000**. On first boot the app migrates the
database, generates its signing keys and loads the demo data from
`fixtures.json`. After the first image build it needs no network at all;
there are no CDNs, external fonts or third-party APIs.

| Sign in as | Email | Password |
|---|---|---|
| Organizer | `organizer@dogfood.local` | `dogfood-demo-2026` |
| Judge (strict) | `judge.a@dogfood.local` | `dogfood-demo-2026` |
| Judge (track-scoped) | `judge.f@dogfood.local` | `dogfood-demo-2026` |
| Participant | `participant@dogfood.local` | `dogfood-demo-2026` |
| Admin | `admin@dogfood.local` | `dogfood-demo-2026` |

API clients can use the stable per-role Bearer tokens in
[`.dogfood.toml`](.dogfood.toml). For example:

```bash
curl -H "Authorization: Bearer dfc_organizer_8b1d3f5a7c9e20461a" localhost:8000/api/events/evt_01/normalization
```

Reset to a fresh demo with `docker compose down -v && docker compose up`.
Configuration is optional; see [`.env.example`](.env.example).

### Run the acceptance suite

```bash
python3 acceptance/run.py .dogfood.toml > acceptance-report.txt
```

The suite needs only Python 3.11+ (standard library) and takes about 20 s,
because it waits for a real server-side deadline and voting window to pass.
It creates its own uniquely named events, so you can re-run it against the
same stack; it archives them afterwards. It checks the maths independently:
normalization is recomputed from raw totals, the Bradley–Terry fixed point is
verified, webhook HMACs are checked, and records are verified with a
pure-Python Ed25519 implementation.

## The demo, by role

The seed data puts an event in every phase, with times relative to boot:

- **Sample Hack 2026** is in judging, with open-link voting live. Its six
  judges include a very strict one, a lenient one and a civic-only judge
  with 4 ballots, so the platform has real bias to correct.
- **Autumn Build Week** is open for submissions, with email-gated
  quadratic voting to come.
- **Spring Hack 2026** is finished, with published results and signed
  certificates.
- **Winter Jam 2027** is a private draft owned by another organizer.

| | |
|---|---|
| **Participants.** Register, form a team with single-use invite links, draft a submission with a live countdown against the server's clock, and lock it in. After the deadline, edits are refused, first by the API and then by a database trigger. | ![Gallery](docs/screenshots/gallery-dark.png) |
| **Judges.** Get a routed queue: a balanced load, never their own team or a declared conflict, and only their tracks. They score a weighted rubric with sliders. Postgres Row-Level Security guarantees they can never see another judge's ballot. Pairwise comparisons are optional. | ![Ballot](docs/screenshots/judge-ballot.png) |
| **Organizers.** Set up tracks, prizes, questions and the rubric, invite judges, preview and run the routing, and watch progress. In the **Results Lab** they compare raw and normalized scores, each judge's bias, the Spearman correlation and the invariant checks, then publish. They also get CSV exports, webhooks, event import/export and the audit trail. | ![Results Lab](docs/screenshots/results-lab-dark.png) |
| **Everyone.** A public gallery with search, filters and a per-viewer shuffle while voting is open; a leaderboard; community choice; verifiable certificates; an embeddable widget; and interactive API docs. | ![Leaderboard](docs/screenshots/leaderboard.png) |

Every screen works at phone width (navigation bar and compact layouts),
in light and dark themes.

## Tier coverage

| Tier | What's in it | Acceptance |
|---|---|---|
| **T1** | Five-role RBAC; events with tracks, prizes and custom questions; registration; teams with single-use, expiring, revocable invites; hard UTC deadline (server clock plus DB trigger, per-team audited extensions); public gallery with search, tags and tracks | 11/11 |
| **T2** | Judge invites with track scopes; conflict-aware, balanced, deterministic routing (dry run first); weighted rubric; RLS judge isolation; progress tracking; Z-score normalization with Min-Max fallback (n < 5) and invariant checks; CSV exports with formula-injection protection | 8/8 |
| **T3** | Open, email-verified and authenticated voting; single or quadratic style; anti-Sybil flagging and review; tallies hidden until close; randomized per-viewer order; comments; hash-chained, verifiable audit log | 8/8 |
| **T4** | REST API with a generated OpenAPI 3.1 document (116 operations); personal API tokens; signed webhooks with retries; Ed25519-signed records with public verification; embeddable widget; event bundle import/export; bulk CSV registration | 7/7 |
| **Bonus** | Normalization proof ([JUDGING.md](JUDGING.md)); pairwise Bradley–Terry ranking; threat model ([THREAT-MODEL.md](THREAT-MODEL.md)); API-first | 4/4 |

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, request lifecycle, modules, design-system pipeline, testing, deployment, decisions |
| [DATA-MODEL.md](DATA-MODEL.md) | Every table, the integrity rules Postgres enforces, the RLS matrix, fixtures and bundle formats |
| [JUDGING.md](JUDGING.md) | Routing, rubric maths, normalization with proofs, ranking, Bradley–Terry, voting rules |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Threats, mitigations with code and test references, residual risks, production checklist |
| [docs/](docs) | Research and planning notes (hackathon rules, requirements, UI spec, execution log) |
| `/api-docs` in the app | Interactive API reference generated from `/api/openapi.json` |

## Development

Requirements: Node 22.12+, pnpm 11, PostgreSQL 16, and Python 3.11+ (for
the acceptance runner).

```bash
pnpm install
pnpm --filter @dogfood/api dev   # API on :8000, migrates and seeds a local "dogfood" DB
pnpm --filter @dogfood/web dev   # Vite on :5173 (proxies /api to :8000)

pnpm test                        # 57 unit + 93 integration tests (integration needs Postgres;
                                 #   set TEST_DATABASE_URL, default postgres://postgres@127.0.0.1:5432/postgres)
pnpm lint && pnpm check-types
pnpm build                       # API bundle (dist/server.mjs) + static web build
```

```
src/core   pure TypeScript shared by API and UI: scoring, normalization, routing, rules, schemas
src/api    Express 5 + pg, SQL migrations, route table → OpenAPI, domain modules
src/web    React 19 + Vite + Tailwind v4, Material 3 Expressive component kit
tests      unit/ and integration/ (Vitest)
acceptance run.py: stdlib black-box tier checker
```

**Stack:**

- **Backend:** TypeScript 7, Node 24, Express 5, Zod 4, PostgreSQL 16
  (Row-Level Security, triggers).
- **Frontend:** React 19, React Router 7, TanStack Query, Tailwind CSS v4.
- **Design:** Material 3 Expressive color (material-color-utilities),
  Google Sans Flex and Material Symbols, self-hosted.

## License

[MIT](LICENSE)
