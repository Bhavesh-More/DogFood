# 07 — Competitor Research

## 1. Competitor / Existing Solutions

| Competitor / Solution | What It Does | Relevant Features | Source |
| :--- | :--- | :--- | :--- |
| **Devpost** | Commercial market incumbent for hosting online and in-person hackathons | Project submission galleries, team management, basic rubric judging, and public voting | `dogfoodhack.com`, `DEV Community` |
| **Devfolio, DoraHacks, HackerEarth, Unstop, TAIKAI** | Commercial competition and hackathon management platforms | Multi-tenant event registration, submission hosting, sponsor tracks, and basic review panels | `dogfoodhack.com`, `Unstop` |
| **Gavel (HackMIT)** | Open-source pairwise judging tool developed by HackMIT | Bradley-Terry preference modeling for head-to-head project comparisons without raw scores | `dogfoodhack.com`, `Gavel GitHub` |
| **JunctionApp, Dribdat, Quill, Hibiscus** | Self-hostable open-source hackathon portals | Community project galleries, registration management, and event organization utilities | `awesome-hackathon` repository |

---

## 2. Feature Comparison

| Capability | Devpost & Commercial SaaS | Gavel (HackMIT) | JunctionApp / Quill / Dribdat | Dogfood 2026 Target Spec |
| :--- | :---: | :---: | :---: | :---: |
| **Self-Hostable (Docker)** | No | Yes | Yes | **Yes** |
| **Zero SaaS Dependencies** | No | Unknown | Unknown | **Yes** |
| **Weighted Rubric Scoring** | No | No | Unknown | **Yes** |
| **Z-Score Normalization** | No | No | No | **Yes** |
| **Pairwise Bradley-Terry Mode** | No | Yes | No | **Yes (Bonus)** |
| **Query Isolation (`WHERE judge_id = auth.uid`)** | No | Unknown | Unknown | **Yes** |
| **Server-Side UTC Deadline Validation** | No | Unknown | Unknown | **Yes** |
| **Anti-Sybil Public Voting** | No | No | Unknown | **Yes** |
| **Official REST/GraphQL APIs** | No | Unknown | Unknown | **Yes** |

---

## 3. Strengths & Capabilities

* **Commercial Platforms (Devpost, Unstop, Devfolio):** Provide familiar registration flows, team formation, project galleries, submission links, and basic track/rubric evaluation interfaces for large-scale public events.
* **Gavel (HackMIT):** Eliminates raw score calibration issues by converting judging into simple head-to-head project comparisons using Bradley-Terry mathematical modeling.
* **Open-Source Portals (JunctionApp, Quill, Dribdat):** Provide self-hostable alternatives that remove commercial hosting fees and allow basic event management control.

---

## 4. Gaps & Limitations

* **Lack of Native Weighted Rubrics:** Commercial leaders (Devpost, Devfolio, Unstop) do not support weighted criteria natively in judging sheets, forcing organizers to compute final scores in manual offline spreadsheets.
* **Un-normalized Raw Score Bias:** Existing platforms rely on simple raw score averages, allowing strict judges to depress project scores and lenient judges to elevate them.
* **Opaque & Undocumented Normalization:** Platforms advertising "automatic normalization" do not publish mathematical formulas, code, or proofs for verification.
* **Frontend-Only Security & Score Leaks:** Existing tools frequently enforce security in UI components rather than database queries, permitting unassigned judges or participants to view hidden evaluation ballots via direct API requests.
* **Gameable Public Voting:** Community voting features are highly vulnerable to automated bot stuffing, duplicate accounts, and IP manipulation, forcing organizers to manually audit or hide real-time results.
* **Vendor Lock-in & SaaS Dependencies:** Commercial platforms require third-party cloud services (Auth0, Clerk, hosted databases, remote email APIs), preventing simple, air-gapped local execution.
* **Absence of Official Public APIs:** Major hackathon platforms omit documented public APIs, forcing external developer integrations to rely on brittle web scrapers or manual CSV exports.

---

## 5. Differentiation Opportunities

> *Research-derived opportunities, not mandatory requirements.*

* **Transparent Statistical Normalization:** Implement open, mathematically verified Z-score normalization (with Min-Max fallback for $N_j < 5$) with live proof generation.
* **Query-Level Security Isolation:** Enforce row-level security or explicit filter predicates (`WHERE judge_id = auth.uid`) at the API and database query layer to guarantee ballot privacy.
* **Combined Rubric & Pairwise Evaluation:** Support both multi-criteria weighted rubrics and head-to-head pairwise comparison modes (Bradley-Terry) in a single platform.
* **Anti-Sybil Voting Engine:** Provide rate-limited, IP-verified public voting with hidden real-time tallies, audit trails, and quadratic voting support.
* **Air-Gapped Single-Command Deployment:** Deliver a 100% offline, containerized application stack (`docker compose up`) with auto-seeded deterministic test data.

---

## 6. Useful Patterns

* **Bradley-Terry Preference Modeling (from Gavel):** Using pairwise binary choices ("Project A vs Project B") to calculate mathematical rankings when absolute numerical scoring is noisy or inconsistent.
* **Standardized Repository & Document Specifications:** Standardizing documentation (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `.dogfood.toml`) to streamline automated testing and judge onboarding.
* **Deterministic Fixture Seeding:** Automatically populating local database schemas on startup (`fixtures.json`) to enable instant offline testing and acceptance verification.
* **Audit Trail Logging:** Maintaining immutable logs for all administrative actions, judge score updates, and community votes.

---

## 7. Competitor Research Summary

### EXISTING SOLUTIONS
* Commercial SaaS portals (Devpost, Unstop, Devfolio, DoraHacks, HackerEarth, TAIKAI) handling basic registration and submission CRUD.
* Specialized open-source tools (Gavel for pairwise judging; JunctionApp, Quill, Dribdat, Hibiscus for self-hosted event management).

### DOCUMENTED GAPS
* No native weighted rubrics in commercial platforms.
* Un-normalized raw score averages distorting final rankings.
* Score sheet leaks caused by UI-only authorization instead of backend query isolation.
* Bot stuffing and Sybil manipulation in public voting.
* SaaS vendor lock-in preventing air-gapped local operation.
* Absence of official documented public REST/GraphQL APIs.

### OPPORTUNITIES
* Open, verifiable Z-score statistical score normalization engine.
* Backend query-level security isolation (`WHERE judge_id = auth.uid`).
* Hybrid rubric and pairwise (Bradley-Terry) evaluation options.
* Single-command local deployment (`docker compose up`) with deterministic seed data and zero external SaaS dependencies.

### UNKNOWN
* Proprietary backend architecture and internal database schemas of commercial SaaS competitors (Devpost, Unstop, Devfolio).
* Specific test harness CLI binary used by Hackathon Raptors organizers during automated evaluation.

---

## 8. Other Dogfood 2026 Entries (public repos, kickoff-day snapshot)

| Repo | Stack | Claimed scope | Notable choices |
| :--- | :--- | :--- | :--- |
| `ankukumarsingh82-boop/dogfood-portal` | Python + Postgres 16 + vendored htmx | **T1 only** | Seeds checker cookies (`dogfood_session=org_…`, `jdg_a_…`, `jdg_b_…`, `prt_…`); imports official `fixtures/fixtures.json` (`/e/evt_01`), falls back to a built-in seed. |
| `somnath-jamadar09/DogFood-Hackathon-Main` | React/Vite/Tailwind + Express + FastAPI judging microservice + MongoDB | T1–T2+ | Separate Python service for Z-score, Bayesian shrinkage and Bradley-Terry; four containers. |
| `SilverMoon-ops/moonforge` | React + Express + MongoDB | T1–T2 | Document store; single commit at snapshot time. |

### What this tells us
* Most entries enforce isolation **only in route handlers**. A database-level guarantee (Postgres Row-Level Security with `FORCE ROW LEVEL SECURITY`) is a clear differentiator for the 25% integrity criterion.
* Several entries split the maths into a separate service; that adds a container and a network hop without adding correctness. We keep the maths in a pure, dependency-free TypeScript module that is unit-tested and property-tested, and snapshot every normalization run for audit.
* Nobody in the snapshot ships signed, publicly verifiable judge records or a hash-chained audit log — both are cheap to build with Node's built-in `crypto` (Ed25519, SHA-256) and fully offline.

## 9. Our Differentiation Plan
1. **Isolation in three layers:** route guard → repository `WHERE judge_id = $uid` → Postgres RLS policy. A test proves a deliberately unfiltered `SELECT * FROM scores` returns only the caller's rows.
2. **Transparent normalization:** every run is stored with per-judge μ, σ, N and method, and a live "Normalization Lab" page shows before/after distributions for the fixture data.
3. **Hybrid judging:** rubric scores *and* a Bradley-Terry pairwise mode, reported side by side.
4. **Tamper-evident audit trail:** each audit row stores `hash = SHA-256(prev_hash ‖ row)`; a verify endpoint recomputes the chain.
5. **Signed records:** Ed25519-signed judge participation and participant certificates with a public verify page.
6. **Zero-SaaS, two-container deploy:** one Node container (API + static UI) and one Postgres container.
