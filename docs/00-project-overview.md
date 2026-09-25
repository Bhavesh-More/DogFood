# Dogfood 2026: Executive Project Overview & Technical Architecture

## 1. Executive Summary

**Dogfood 2026** is a 72-hour global online engineering sprint organized by **Hackathon Raptors** running from **September 25 to September 28, 2026** [3, 93]. Unlike conventional hackathons where teams construct disparate domain applications, Dogfood 2026 enforces a single, standardized engineering mandate: **build a modern, open-source, self-hostable submission and judging platform that will judge your own entry** [2, 3, 92]. 

Hackathon Raptors has organized over 35 hackathons across 85+ countries, encountering recurring operational friction in multi-tenant competition management—ranging from fragmented registration flows and deadline enforcement failures to judge scoring variance and authorization leaks [2, 92]. Dogfood 2026 addresses these challenges by tasking participants with creating a deterministic, production-grade data pipeline and judging engine [6, 92, 95]. The grand prize winner's platform will be officially forked, self-hosted, and deployed as the infrastructure for future Hackathon Raptors competitions [3, 26, 92, 94].

---

## 2. Event Key Parameters & Timeline

| Parameter | Operational Detail |
| :--- | :--- |
| **Event Format** | 72-Hour Continuous Global Online Sprint [3, 93, 94] |
| **Organizer** | Hackathon Raptors [3, 37, 92] |
| **Kickoff / Registration Cutoff** | September 25, 2026 at 18:00 UTC [25, 93, 94] |
| **Code Freeze & Final Submission** | September 28, 2026 at 18:00 UTC [25, 94] |
| **Judging Window** | September 28 – October 8, 2026 [25] |
| **Winners Announcement** | October 9, 2026 [25] |
| **Team Size** | Solo participants or teams of 1 to 4 members [3, 36, 93, 94] |
| **Participation Fee** | Completely free [3, 31, 165] |
| **Total Prize Pool** | $2,500 USD (₹2,50,000 equivalent) [3, 25, 37, 93, 94] |
| **Licensing Requirement** | OSI-Approved Open Source License (e.g., MIT, Apache 2.0) [14, 94, 104] |

### Prize Breakdown
* **1st Place Grand Prize:** ₹80,000 ($800 USD) + Official Fork & Production Adoption [26, 94]
* **2nd Place:** ₹50,000 ($500 USD) [94]
* **3rd Place:** ₹35,000 ($350 USD) [94]
* **4th Place:** ₹20,000 ($200 USD) [94]
* **5th Place:** ₹15,000 ($150 USD) [94]
* **Best Judging Engine Category Award:** ₹10,000 ($100 USD) [25, 94, 112]
* **Write Up Quest Side Quest:** ₹40,000 ($100 USD × 4 Winners) [25, 94, 113]

---

## 3. The 4-Tier Functional Ladder

Dogfood 2026 replaces traditional tracks with a 4-Tier Ladder where participants ascend by delivering verified, backend-enforced functionality [7, 97].

```
┌──────────────────────────────────────────────────────────┐
│ Tier 4: Stretch (APIs, Webhooks, Signed Records, Widgets)│
├──────────────────────────────────────────────────────────┤
│ Tier 3: Public (Anti-Sybil Voting, Audit Trails, QR)     │
├──────────────────────────────────────────────────────────┤
│ Tier 2: Judging (Assignments, Isolation, Normalization) │
├──────────────────────────────────────────────────────────┤
│ Tier 1: Core (Auth, RBAC, Teams, Submissions, Deadlines) │
└──────────────────────────────────────────────────────────┘
```

### Tier 1 (T1): Core Infrastructure
* **Role Hierarchy:** Session-based authentication enforcing 5 distinct role levels: Visitor, Participant, Judge, Organizer, and Admin [7, 97, 98].
* **Event Management:** Event configuration, tracks, custom fields, and team invite link handling [7, 97].
* **Submissions & Deadlines:** Project drafting, media galleries, link submissions, and server-side hard deadline validation using UTC timestamps [7, 97, 98].
* **Public Discovery:** Searchable and filterable public project gallery [7, 97].

### Tier 2 (T2): Judging & Evaluation Engine
* **Assignment Routing:** Automated batch or algorithmic judge routing with workload balancing across tracks [8, 21, 97, 99].
* **Rubrics:** Multi-criteria rubrics with configurable criteria weighting [8, 9, 97, 99].
* **Security & Isolation:** Backend query isolation (`WHERE judge_id = auth.uid`) restricting score visibility exclusively to assigned judges [8, 9, 99, 111].
* **Score Normalization:** Statistical algorithms (such as Z-score and Min-Max scaling) to eliminate judge leniency/strictness bias [8, 22, 97, 108, 110].
* **Data Export:** CSV exports for evaluation metrics and project scores [8, 97].

### Tier 3 (T3): Public Engagement & Anti-Abuse
* **Community Voting:** Support for open voting, email-gated voting, and authenticated participant voting [10, 97, 100].
* **Anti-Sybil Protections:** Rate limiting, IP fingerprinting, duplicate detection, and hidden results during voting windows [10, 97, 100, 111].
* **Advanced Voting:** Alternative models such as Quadratic Voting paired with readable audit logs [10, 97, 100].

### Tier 4 (T4): Platform & Infrastructure Extensions
* **Developer Interfaces:** Documented REST/GraphQL APIs and system webhooks triggered by platform state events [11, 97, 101].
* **Exportable Assets:** Cryptographically signed verifiable judge participation records and automated certificate generation [11, 97, 101].
* **Integrations:** Embeddable project gallery widgets and bulk JSON/CSV import/export utilities [11, 97, 101].

> **Scope Note:** Organizers explicitly enforce that a clean, mathematically sound, and secure **Tier 2** platform outranks a buggy or unverified **Tier 4** implementation [11, 97, 117].

---

## 4. Local Execution & Offline Operational Mandate

To guarantee that winning submissions can be self-hosted without vendor lock-in, all entries must comply with strict local execution rules [12, 101, 102]:

1. **One-Command Startup:** The entire stack (web app, API, database, background workers) must launch locally via `docker compose up` [12, 102].
2. **Zero External Dependencies:** No external cloud services, hosted databases, SaaS authentication, or third-party APIs are permitted [12, 102].
3. **Air-Gapped Operation:** Evaluation suites will test submissions with all network interfaces disabled [12, 102].
4. **Deterministic Seed Data:** Upon startup, database seed scripts must automatically populate test accounts, events, teams, submissions, and rubrics [12, 103].
5. **Acceptance Test Suite:** An automated test runner must execute against the local stack and produce a pass/fail summary report written to `acceptance-report.txt` [13, 103].

---

## 5. Evaluation & Scoring Mechanics

Submissions are evaluated on a **100-point weighted scale** across four core criteria [15, 16, 105, 106]:

```
┌──────────────────────────────────────────────────────────┐
│ Tier Completion & Correctness (40%)                      │
├──────────────────────────────────────────────────────────┤
│ Judging Integrity & Security (25%)                       │
├──────────────────────────────────────────────────────────┤
│ Adoptability & Operability (20%)                         │
├──────────────────────────────────────────────────────────┤
│ Code Quality & Architectural Innovation (15%)           │
└──────────────────────────────────────────────────────────┘
```

1. **Tier Completion & Correctness (40%):** Verified by automated acceptance test suites [15, 106].
2. **Judging Integrity & Security (25%):** Evaluation of API isolation, normalization validity, audit trail logging, and anti-abuse mechanisms [15, 106].
3. **Adoptability & Operability (20%):** Assessed on single-command startup, clear documentation, offline capability, and seed data quality [16, 106].
4. **Code Quality & Innovation (15%):** Schema design, maintainability, type safety, and technical elegance [16, 106].

### Bonus Technical Challenges
* **Normalization Proof (+5 Points):** Demonstrating cross-judge statistical score normalization with live fixture data and mathematical proofs [16, 17].
* **Pairwise Mode (+5 Points):** Implementing head-to-head project comparisons using Bradley-Terry preference modeling [17].
* **Threat Model (+3 Points):** Documenting a security threat model for Sybil attacks, ballot stuffing, and deadline manipulation [18].
* **API First (+3 Points):** Complete OpenAPI specification and full API coverage for platform actions [18].

---

## 6. Required Repository Artifacts

Submissions must deliver a standardized repository structure to avoid automated scoring penalties [13, 14, 104]:

```
your-portal/
├── README.md              # Environment requirements & docker compose launch instructions
├── ARCHITECTURE.md        # Component diagrams, state flow & architectural design trade-offs
├── DATA-MODEL.md          # Entity-relationship schema, indexes & state machine transitions
├── JUDGING.md             # Routing mechanics, score normalization math & security isolation
├── docker-compose.yml     # Complete containerization manifest
├── src/                   # Production source code
├── tests/                 # Unit, integration & API security test suites
├── acceptance-report.txt  # Automated test suite output log
├── LICENSE                # OSI-approved open-source license file
└── .dogfood.toml          # Platform capability & tier declaration file
```

---

## 7. Mathematical Model: Score Normalization

To eliminate judge variance (where strict judges depress scores and lenient judges elevate them), platforms implement **Z-Score Normalization** [107, 108].

### Mathematical Formulas

For a raw score $S_{ij}$ given by judge $j$ to submission $i$, the judge's mean score $\mu_j$ across $N_j$ evaluated projects is:
$$\mu_j = \frac{1}{N_j} \sum_{k=1}^{N_j} S_{kj}$$

The judge's standard deviation $\sigma_j$ is:
$$\sigma_j = \sqrt{\frac{1}{N_j} \sum_{k=1}^{N_j} (S_{kj} - \mu_j)^2}$$

The normalized score $Z_{ij}$ is computed using an epsilon parameter ($\epsilon = 10^{-6}$) to handle zero variance:
$$Z_{ij} = \frac{S_{ij} - \mu_j}{\sigma_j + \epsilon}$$

To scale scores back to a readable $0-100$ scale (with target mean $\mu_{target} = 70$ and $\sigma_{target} = 15$):
$$\text{FinalScore}_{ij} = \mu_{target} + (Z_{ij} \times \sigma_{target})$$

For small sample sizes ($N_j < 5$), the system falls back to Min-Max scaling [110]:
$$\text{MinMaxScore}_{ij} = \frac{S_{ij} - S_{j,\min}}{(S_{j,\max} - S_{j,\min}) + \epsilon} \times 100$$

---

## 8. Hackathon Raptors Ecosystem Context

Dogfood 2026 forms part of a broader series of rigorous, low-dependency engineering hackathons organized by Hackathon Raptors:

1. **Zero Dependency 2026:** A 72-hour challenge requiring participants to build developer tools, parsers, HTTP servers, or databases using **only the programming language standard library** with zero third-party packages [161, 163, 169]. Examples include `molt`, a zero-dependency Go dependency migrator built using Go's built-in `go/ast` and `go/parser` packages [42, 45, 63, 78].
2. **Port Mortem 2026:** A porting hackathon challenging developers to port libraries across languages (such as porting `cron-parser` from TypeScript/Luxon to zero-dependency Go) while maintaining behavioral equivalence verified through differential fuzzing and conformance oracles [119, 120, 123, 136].

---

## 9. Strategic 72-Hour Roadmap

```
Hours 00-12 ──► Hours 12-36 ──► Hours 36-54 ──► Hours 54-66 ──► Hours 66-72
 Architecture    Core Platform    Judging Engine   Public & API     Offline Test
  & Database      (T1 Core)         (T2 Engine)     (T3/T4 & Bonus)   & Packaging
```

1. **Phase 1 (Hours 00–12):** Architecture lock, schema definition, Docker Compose setup, seed data [115].
2. **Phase 2 (Hours 12–36):** Tier 1 core implementation (auth, RBAC, submissions, UTC deadline enforcement) [115].
3. **Phase 3 (Hours 36–54):** Tier 2 judging engine (rubric builder, assignment algorithms, Z-score normalization, API isolation middleware) [115].
4. **Phase 4 (Hours 54–66):** Tier 3 public security (rate limits, anti-Sybil, quadratic voting) & optional T4 webhooks [115].
5. **Phase 5 (Hours 66–72):** Offline network interface shutdown testing, `acceptance-report.txt` generation, documentation polish, demo video recording [115].
