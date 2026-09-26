# 11 — Data Model

## 1. Data Overview

Dogfood 2026 requires a structured data model to manage the 10-stage competition lifecycle: user registration, 5-level RBAC role assignment, team formation, project drafting, server-side UTC hard deadline locks, algorithmic judge routing, weighted rubric scoring, Z-score statistical score normalization, anti-Sybil public voting, and archiving.

* **What the system stores:** User accounts, local session tokens, events, tracks, teams, team memberships, project submissions, multi-criteria rubrics, judge assignments, evaluation ballots, normalized scores, public community votes, and immutable audit logs.
* **Why the data is needed:** To ensure deterministic execution across the competition lifecycle, enforce backend query isolation (`WHERE judge_id = auth.uid`), eliminate judge scoring bias through statistical Z-score calculations, support anti-Sybil public voting, and provide seed data for air-gapped testing.
* **Persistent vs. Temporary Data:**
  * *Persistent Data:* Users, teams, submissions, rubrics, evaluation ballots, normalized scores, public votes, and audit logs stored in the containerized relational database mounted via Docker volumes.
  * *Temporary Data:* Session tokens, rate-limiting caches, transient request context, and test suite execution buffers.

---

## 2. Core Entities

### Entity: User

**Purpose:** Represents an authenticated user in the system with an assigned role in the 5-tier RBAC hierarchy.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique identifier for the user |
| `email` | String | Yes | Unique email address |
| `password_hash` | String | Yes | Hashed user password |
| `role` | Enum | Yes | Role level: `visitor`, `participant`, `judge`, `organizer`, `admin` |
| `full_name` | String | Yes | Display name of the user |
| `created_at` | Timestamp (UTC) | Yes | Account creation timestamp |

### Entity: Session

**Purpose:** Stores active user authentication sessions for local session-based authentication.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique session record ID |
| `user_id` | UUID / String | Yes | Reference to `User.id` |
| `session_token` | String | Yes | Unique session token hash |
| `expires_at` | Timestamp (UTC) | Yes | Session expiration timestamp |
| `created_at` | Timestamp (UTC) | Yes | Session creation timestamp |

### Entity: Event

**Purpose:** Represents a hackathon event instance managed by organizers.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique event ID |
| `title` | String | Yes | Name of the hackathon event |
| `slug` | String | Yes | Unique URL slug |
| `submission_deadline_utc` | Timestamp (UTC) | Yes | Server-validated hard submission deadline |
| `created_at` | Timestamp (UTC) | Yes | Event creation timestamp |

### Entity: Track

**Purpose:** Represents a competitive track or category within a hackathon event.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique track ID |
| `event_id` | UUID / String | Yes | Reference to `Event.id` |
| `name` | String | Yes | Name of the track |
| `description` | Text | No | Description of track scope |
| `created_at` | Timestamp (UTC) | Yes | Creation timestamp |

### Entity: Team

**Purpose:** Represents a competing team composed of 1 to 4 participants.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique team ID |
| `event_id` | UUID / String | Yes | Reference to `Event.id` |
| `name` | String | Yes | Team name |
| `invite_code` | String | Yes | Unique join link code for team formation |
| `created_at` | Timestamp (UTC) | Yes | Creation timestamp |

### Entity: TeamMember

**Purpose:** Maps participants to teams, enforcing the 1-to-4 member limit.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique membership ID |
| `team_id` | UUID / String | Yes | Reference to `Team.id` |
| `user_id` | UUID / String | Yes | Reference to `User.id` |
| `joined_at` | Timestamp (UTC) | Yes | Timestamp user joined the team |

### Entity: Submission

**Purpose:** Stores project drafts and final submissions locked at the server UTC deadline.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique submission ID |
| `team_id` | UUID / String | Yes | Reference to `Team.id` |
| `track_id` | UUID / String | Yes | Reference to `Track.id` |
| `title` | String | Yes | Project title |
| `description` | Text | Yes | Detailed project description |
| `repository_url` | String | Yes | Public GitHub repository URL |
| `demo_url` | String | No | Live demo or video link |
| `media_urls` | JSON / Array | No | Screenshots or diagram URLs |
| `status` | Enum | Yes | State: `draft` or `submitted` |
| `submitted_at_utc` | Timestamp (UTC) | No | Actual timestamp of final submission lock |
| `created_at` | Timestamp (UTC) | Yes | Record creation timestamp |
| `updated_at` | Timestamp (UTC) | Yes | Record last update timestamp |

### Entity: RubricCriterion

**Purpose:** Represents an evaluation criterion with custom weighting for a track.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique criterion ID |
| `track_id` | UUID / String | Yes | Reference to `Track.id` |
| `title` | String | Yes | Criterion title (e.g., Code Quality, Security) |
| `weight` | Float / Decimal | Yes | Weight percentage/multiplier (e.g., 0.25) |
| `max_score` | Integer | Yes | Maximum raw score limit (e.g., 10 or 100) |
| `created_at` | Timestamp (UTC) | Yes | Creation timestamp |

### Entity: JudgeAssignment

**Purpose:** Routes specific submissions to assigned judges for evaluation and workload balancing.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique assignment ID |
| `judge_id` | UUID / String | Yes | Reference to `User.id` (where role = judge) |
| `submission_id` | UUID / String | Yes | Reference to `Submission.id` |
| `assigned_at` | Timestamp (UTC) | Yes | Assignment timestamp |

### Entity: EvaluationBallot

**Purpose:** Stores raw rubric scores entered by an assigned judge. Query access is strictly isolated (`WHERE judge_id = auth.uid`).

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique score ID |
| `assignment_id` | UUID / String | Yes | Reference to `JudgeAssignment.id` |
| `criterion_id` | UUID / String | Yes | Reference to `RubricCriterion.id` |
| `raw_score` | Float / Integer | Yes | Raw numerical score given by judge |
| `feedback` | Text | No | Optional written judge feedback |
| `submitted_at` | Timestamp (UTC) | Yes | Timestamp score was submitted |

### Entity: NormalizedScore

**Purpose:** Stores mathematically transformed Z-scores and scaled totals to eliminate judge bias.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique normalized record ID |
| `submission_id` | UUID / String | Yes | Reference to `Submission.id` |
| `raw_total_score` | Float | Yes | Sum of weighted raw scores |
| `z_score` | Float | Yes | Calculated Z-score: $(S_{ij} - \mu_j) / (\sigma_j + \epsilon)$ |
| `normalized_score` | Float | Yes | Scaled 0–100 final normalized score |
| `calculation_method`| Enum | Yes | Calculation used: `z_score` or `min_max_fallback` |
| `computed_at` | Timestamp (UTC) | Yes | Calculation timestamp |

### Entity: PublicVote

**Purpose:** Records public community choice votes with anti-Sybil rate-limiting metadata.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique vote ID |
| `submission_id` | UUID / String | Yes | Reference to `Submission.id` |
| `voter_email` | String | No | Email address (if email-gated mode) |
| `ip_hash` | String | Yes | Hashed IP address for duplicate detection |
| `created_at` | Timestamp (UTC) | Yes | Timestamp vote was cast |

### Entity: AuditLog

**Purpose:** Maintains immutable records for administrative actions, deadline overrides, and voting events.

**Fields:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID / String | Yes | Unique log entry ID |
| `user_id` | UUID / String | No | Reference to `User.id` initiating action |
| `action` | String | Yes | Action type (e.g., `SCORE_UPDATE`, `OVERRIDE`) |
| `metadata` | JSON | No | Contextual payload details |
| `created_at` | Timestamp (UTC) | Yes | Log timestamp |

---

## 3. Relationships

```text
Event
 ├── has many ──► Track
 │                 └── has many ──► RubricCriterion
 ├── has many ──► Team
 │                 ├── has many ──► TeamMember (1 to 4) ◄── maps to ── User
 │                 └── has one  ──► Submission
 │                                     ├── has many ──► JudgeAssignment ◄── maps to ── User (Judge)
 │                                     │                 └── has many ──► EvaluationBallot
 │                                     ├── has one  ──► NormalizedScore
 │                                     └── has many ──► PublicVote
 └── has many ──► AuditLog
```

* **One-to-Many:** `Event` → `Track`, `Track` → `RubricCriterion`, `Event` → `Team`, `Team` → `TeamMember`, `Submission` → `JudgeAssignment`, `JudgeAssignment` → `EvaluationBallot`, `Submission` → `PublicVote`.
* **One-to-One:** `Team` → `Submission`, `Submission` → `NormalizedScore`.
* **Many-to-Many:** `User` ↔ `Team` (via `TeamMember`), `User` (Judge) ↔ `Submission` (via `JudgeAssignment`).

---

## 4. Data Lifecycle

```text
Draft Created ──► Updated (Pre-Deadline) ──► Server UTC Check ──► Locked / Submitted
                                                                      │
Archived ◄── Score Export ◄── Z-Score Normalized ◄── Evaluated ◄── Assigned to Judge
```

1. **Drafting:** Team creates submission draft and updates fields up until deadline cutoff.
2. **Locking:** Server verifies system UTC timestamp against `event.submission_deadline_utc`. Late submissions are rejected.
3. **Routing:** System creates `JudgeAssignment` records balancing workload across judges.
4. **Scoring:** Judge submits `EvaluationBallot` records. Queries isolated via `WHERE judge_id = auth.uid`.
5. **Normalization:** Engine computes judge mean ($\mu_j$) and stddev ($\sigma_j$), calculates Z-scores with Min-Max fallback for $N_j < 5$, and writes `NormalizedScore`.
6. **Archiving:** Results exported to CSV and saved for long-term audit history.

---

## 5. AI / Generated Data

* **Embedded AI Data:** **None.** The platform runs 100% offline in an air-gapped environment with zero cloud AI API dependencies.
* **System-Generated Mathematical & Verification Data:**
  * **Normalized Scores:** Computed Z-scores, Min-Max fallback scores, and scaling parameters ($\mu_j, \sigma_j$).
  * **Acceptance Report:** Plain text pass/fail summary log written to `acceptance-report.txt`.
  * **Exports:** Generated CSV score and evaluation metric files.

---

## 6. User & Authentication Data

* **Role Permissions (5-Tier RBAC):** `visitor` (public gallery/voting), `participant` (teams/drafts), `judge` (assigned rubrics/ballots), `organizer` (events/tracks/routing/normalization), `admin` (system configuration).
* **Local Session Storage:** `Session` tokens linked to `User.id` with UTC expiry dates.
* **Security Isolation:** Database queries for score entry and viewing strictly filter by assigned `judge_id` (`WHERE judge_id = auth.uid`).

---

## 7. Data Validation

* **Team Size:** `TeamMember` count per team must be between 1 and 4.
* **Deadline Verification:** `submitted_at_utc` must be less than or equal to `event.submission_deadline_utc`.
* **Score Limits:** `raw_score` in `EvaluationBallot` must be $\ge 0$ and $\le$ `RubricCriterion.max_score`.
* **Uniqueness:**
  * `User.email` must be unique.
  * `Team.invite_code` must be unique.
  * `User` can only belong to one `Team` per `Event`.
  * `PublicVote` unique per `ip_hash` + `submission_id` within active voting window.

---

## 8. Data Privacy & Security

* **Sensitive Fields:** `password_hash` must be hashed locally (e.g., bcrypt/argon2). `PublicVote.ip_hash` hashed to prevent storing raw IP addresses.
* **Protected Evaluation Ballots:** Raw evaluation ballots and judge scores MUST NOT be exposed to participants or unassigned judges. Strictly isolated at the backend database query layer (`WHERE judge_id = auth.uid`).
* **Git History Protection:** Database credentials and session secret keys MUST NOT be committed to git repositories; configured via environment variables.

---

## 9. Database Requirements

* **Database Type:** Relational DB (PostgreSQL, SQLite, or MySQL containerized).
* **Required Indexes:**
  * `sessions(session_token)` for fast auth lookup.
  * `submissions(team_id, track_id, status)` for gallery and state filtering.
  * `judge_assignments(judge_id, submission_id)` for workload and isolation query enforcement.
  * `evaluation_ballots(assignment_id, criterion_id)` for score aggregation.
  * `public_votes(ip_hash, submission_id)` for anti-Sybil duplicate detection.
* **Database Constraints:** Foreign key constraints with cascading deletes where appropriate; UNIQUE constraints on emails, invite codes, and vote hashes.
* **Seed Data:** Deterministic boot seeding from `fixtures.json` populating default test accounts, events, tracks, rubrics, teams, and submissions.

---

## 10. Data Model Checklist

### MUST HAVE
* [x] All required entities defined (User, Session, Event, Track, Team, TeamMember, Submission, RubricCriterion, JudgeAssignment, EvaluationBallot, NormalizedScore, PublicVote, AuditLog)
* [x] Required relationships defined (1-to-1, 1-to-many, many-to-many)
* [x] Required fields identified with data types and nullability
* [x] Validation rules defined (Team size 1-4, UTC deadline check, score ranges, uniqueness)
* [x] Sensitive data protected (`password_hash`, query-isolated score sheets `WHERE judge_id = auth.uid`)

### SHOULD HAVE
* [x] Appropriate indexes defined for auth, query isolation, and voting lookup
* [x] Database foreign key and uniqueness constraints specified
* [x] Deterministic seed data loading from `fixtures.json` on boot

### UNKNOWN
* [ ] Specific internal database runner schema requirements from organizers beyond `.dogfood.toml`

---

## 11. Implemented Schema

The implemented schema is documented in the repository-root **`DATA-MODEL.md`** (ER diagram, every table, the database-enforced rules, the RLS matrix, indexes, fixtures and bundle formats). Source of truth: `src/api/migrations/001_schema.sql`, `002_security.sql`, `003_harden_secrets.sql`. Decisions that refined this planning document during implementation:

* One-team-per-person and one-submission-per-team are `UNIQUE` constraints; cross-event references are prevented with composite foreign keys `(x_id, event_id)`.
* Ballot ownership columns are derived by trigger from the assignment, and score bounds are checked by trigger — never trusted from the writer.
* Normalization runs are stored as complete JSON snapshots (inputs, per-judge statistics, every normalized entry, invariants) so any published ranking can be re-derived; `published_results` is the public projection without per-judge data.
* Secrets (HMAC key, Ed25519 signing key) live in `settings`, unreadable by the request role.
