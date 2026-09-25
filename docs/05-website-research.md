# 05 — Website Research

## 1. Official Sources

* **DOGFOOD Official Website (`https://dogfoodhack.com/`):** Primary portal containing the official brief, 4-tier functional ladder, scoring weights, submission deliverables, prize breakdown, timeline, FAQ, and specification link (`/spec`).
* **Dogfood 2026 on DEV Community (`https://dev.to/raptorsdev/dogfood-2026-build-the-platform-that-will-judge-you-196e`):** Official technical announcement by Hackathon Raptors detailing the engineering motivations, data pipeline lifecycle, judging integrity challenges, and local operational constraints.
* **Dogfood 72-Hour Hackathon on Unstop (`https://unstop.com/hackathons/dogfood-72-hour-hackathon-hackathon-raptors-1748391`):** Official platform listing providing registration metadata, eligibility, team sizing, and ₹2,50,000 prize breakdown.
* **Hackathon Raptors Main Portal (`https://raptors.dev/`):** Organizer site providing historical context across 35+ global hackathons run in 85+ countries since 2023.
* **Sister Event Portals:**
  * **Zero Dependency 2026 (`https://www.zerodepshack.com/`):** Standard-library-only engineering hackathon by Hackathon Raptors.
  * **Port Mortem 2026 (`https://coderesurrection.com/2026/`):** Porting and behavioral equivalence hackathon by Hackathon Raptors.

---

## 2. Hackathon Context

* **Hackathon Purpose:** Commissioning an open-source, self-hostable competition submission and judging platform to replace inadequate commercial incumbents and serve as production infrastructure for future Hackathon Raptors events.
* **Theme:** *"Build the platform that will judge you."*
* **Organizers:** **Hackathon Raptors** (Hackathon Raptors Community Interest Company 15557917, London, UK). Has operated over 35 global hackathons across 85+ countries.
* **Ecosystem / Community:** Part of Hackathon Raptors' low-dependency, high-craft engineering hackathon series (Zero Dependency, Port Mortem, Code Olympics, Slop Scan, Raptors Conference).
* **Intended Direction:** The grand prize winning entry is officially forked, self-hosted, and deployed into production for future competitions. The original authors retain full copyright under an OSI license, receive a credit line on every powered event page, and receive upstream pull requests from organizers.
* **Important Terminology:**
  * **Tier Ladder (T1–T4):** Progressive 4-level functional specification replaced by a single product brief.
  * **Role Isolation Matrix:** Strict backend permission grid defining API access boundaries across Visitor, Participant, Judge, Organizer, and Admin.
  * **Score Normalization:** Statistical Z-score transformation eliminating strict/lenient judge bias.
  * **Acceptance Suite:** Official automated test suite released at kickoff to verify tier compliance and generate `acceptance-report.txt`.
  * **`.dogfood.toml`:** Machine-readable manifest declaring claimed tiers, application entry points, and seed routines.

---

## 3. Important Insights

* **Existing Market Limitations Identified by Organizers:**
  * **No Weighted Rubrics:** Commercial market leaders do not support weighted judging criteria natively, forcing organizers into offline spreadsheets.
  * **Hidden Normalization:** Platforms advertise "automatic score normalization" as a headline feature without publishing mathematical methods or documentation.
  * **Gameable Voting:** Public community voting is universally vulnerable to bot stuffing, forcing organizers to hide results and manually audit ballots.
  * **No Official APIs:** Zero major hackathon platforms publish official public APIs, forcing integration layers to rely on scrapers and CSV exports.
* **10-Stage Event Data Pipeline:**
  1. Registration → 2. Teams → 3. Submissions → 4. Eligibility → 5. Judge Assignment → 6. Scoring → 7. Score Normalization → 8. Results → 9. Certificates → 10. Archive.
* **Single-Command Local Execution Requirement:** Submissions must launch locally via `docker compose up` with pre-seeded data (`fixtures.json`), operating completely offline with zero external cloud SaaS dependencies.
* **Correctness Over Breadth:** Organizers explicitly enforce that a clean, mathematically sound, and secure Tier 2 implementation outranks an unstable Tier 4 implementation.

---

## 4. Existing Ecosystem

* **Commercial Incumbents (Studied & Analyzed):**
  * **Devpost:** Market incumbent; analyzed for submission field standards and rubric/voting limitations.
  * **Devfolio, DoraHacks, HackerEarth, Unstop, TAIKAI:** Commercial platforms evaluated for feature overlap and API deficiencies.
* **Open-Source References:**
  * **Gavel (HackMIT):** Pairwise comparison judging system using Bradley-Terry estimators to infer rankings without absolute scores.
  * **JunctionApp, Dribdat, Quill, Hibiscus:** Self-hostable open-source hackathon tools analyzed in `awesome-hackathon`.
* **Technical Infrastructure & Frameworks:**
  * **Docker / Docker Compose:** Mandatory local orchestration runtime.
  * **OpenAPI / REST / GraphQL:** Preferred developer interface standards for Tier 4 extensions.
  * **AI Coding Tools:** Claude Code, Cursor, Aider, GitHub Copilot (permitted for development velocity; code must be defended in architecture docs).

---

## 5. Useful References

| Resource | Purpose | Source |
| :--- | :--- | :--- |
| `https://dogfoodhack.com/` | Official Dogfood 2026 landing page & brief | `dogfoodhack.com` |
| `https://dogfoodhack.com/spec` | Published event specification document | `dogfoodhack.com/spec` |
| `https://discord.gg/xfYPDZYqeh` | Official Hackathon Raptors Discord community | Discord |
| `https://github.com/anishathalye/gavel` | Gavel pairwise judging engine (Bradley-Terry) reference | GitHub / Gavel |
| `https://github.com/dribdat/awesome-hackathon` | Curated list of open-source hackathon portals | GitHub / awesome-hackathon |
| `https://raptors.dev/` | Hackathon Raptors main archive and organizer site | `raptors.dev` |

---

## 6. Source Conflicts / Uncertainty

* **Prize Currency Formatting:** Displayed as $2,50,000 INR (₹2,50,000) on Indian platforms (Unstop) and $2,500 USD equivalent on global portals.
* **Automated Acceptance Suite Runner Details:** The exact internal CLI binary used by judges to parse `.dogfood.toml` and verify tier endpoints is released at kickoff and not published in advance.
* **Sister Hackathon Timelines:** Timeline dates across sister events (Zero Dependency, Port Mortem) differ from Dogfood 2026 and should not be confused with Dogfood deadlines.

---

## 7. Key Takeaways for the AI Agent

1. **One Product, Single Spec:** Build a complete, unified submission and judging platform managing the 10-stage lifecycle.
2. **Prioritize Tier 2 Integrity:** A clean, working Tier 2 platform (auth, RBAC, rubrics, judge routing, Z-score normalization, query isolation) outranks a broken Tier 4.
3. **Strict Air-Gapped Local Operation:** Must launch using `docker compose up` with auto-seeded fixture data and zero external cloud SaaS APIs.
4. **Backend Query Isolation:** Permissions (`WHERE judge_id = auth.uid`) must be enforced at the API/database layer, never UI component hiding.
5. **Statistical Normalization:** Implement Z-score normalization (with Min-Max fallback for $N_j < 5$) to eliminate judge scoring bias.
6. **Required Deliverables:** Public GitHub repo, OSI license, `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `docker-compose.yml`, `acceptance-report.txt`, `.dogfood.toml`, and 5-minute demo video.

---

## 8. Verified Research Pass (2026-09-25, kickoff day)

> **Access note:** From the build environment, `dogfoodhack.com`, `dev.to`, `unstop.com` and the shared ChatGPT conversation were blocked by the egress proxy. The findings below were cross-checked through search-engine extracts of those pages and of public participant repositories on GitHub. Anything not confirmed by at least one extract is marked *(inferred)*.

### 8.1 Tier ladder — confirmed capability lists

| Tier | Confirmed capabilities (from the official brief extracts) |
| :--- | :--- |
| **T1 Core** | Email/password auth; roles (visitor, participant, judge, organizer, admin); organizers **create, edit and publish events with schedule, tracks, prizes and custom submission questions**; participants **register for an event, create a team, invite teammates with single-use, expiring invitation links**; project submission with **name, tagline, description, thumbnail, gallery images, demo video URL, repository URL, live link, tech tags, track, and the organizer's questions**; drafts locked by a server-side deadline; public gallery with search and filters. |
| **T2 Judging** | Judge invitations; judge assignments; batch or algorithmic assignment; weighted judging rubrics; backend-enforced role isolation; judge progress tracking; cross-judge score normalization; CSV exports. |
| **T3 Public** | Community voting; configurable voting access (open-link, email-gated, authenticated); comments on projects; hidden results during the voting window; randomized project ordering; rate limits; duplicate detection; readable audit trails. Quadratic voting is *one* option — "teams are free to implement something else if they can defend it". |
| **T4 Stretch** | REST API; API access for every UI action; webhooks; certificate generation; record generation; signed and publicly verifiable judge participation records; embeddable gallery widget; bulk import and export. |

### 8.2 Isolation rule (quoted intent)
* "A judge should never be able to access another judge's scores. A track judge should never be able to access another track's data."
* "If this only works because the UI hides a button, it does not work."
* "If a judge can make an API request and retrieve another judge's ballot, the system has failed."

### 8.3 Acceptance harness conventions
* Command used by participants: `python3 acceptance/run.py .dogfood.toml > acceptance-report.txt`.
* The suite "runs against your application and produces a tier-by-tier pass report"; the report is the receipt for the tiers claimed in `.dogfood.toml`.
* **Overclaiming is penalised**: "If you claim T3 but the acceptance suite only confirms T2, you get scored at T2. Overclaiming costs more than the tier was worth."
* Stable local **session tokens for the checker live in `.dogfood.toml`** (participants seeded long-lived sessions for organizer, judge A, judge B and participant roles).
* An official kickoff **`fixtures.json`** exists; participants import it on first boot (one repo stores it at `fixtures/fixtures.json`, the event lives at `/e/evt_01` titled "Sample Hack 2026"). The acceptance runner locates `fixtures.json` at the repo root without a flag.

### 8.4 Threat-model bonus scope
The threat model must be "written and defensible" for **Sybil votes, ballot stuffing, submission scraping, judge collusion and deadline gaming**, naming the attacks stopped *and* the ones not stopped.

### 8.5 Operational wording
* "Everything runs in the containers defined in `docker-compose.yml`. The app works with the network cable unplugged." One extract phrases it as "two containers" (app + database) *(inferred to be an example, not a hard cap)*.
* "No cloud services, no external APIs, no external auth providers."

### 8.6 UI inspiration sources
* **dogfoodhack.com** — could not be rendered from the build environment; the title is "DOGFOOD — Build the platform that will judge you".
* **Unstop event pages** — known layout pattern: hero banner with organiser logo, sticky right-hand registration card (deadline countdown, team size, registered count), tabbed body (Details, Stages & Timeline, Prizes, FAQs), eligibility chips.
* **Material 3 Expressive** (Google, 2025) — adopted as the design language: emphasized type, expanded shape scale (up to 48dp corners and shape morphing), vibrant tonal colour roles, spring motion, button groups, wavy progress and loading indicators.
