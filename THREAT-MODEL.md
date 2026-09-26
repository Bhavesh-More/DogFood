# Threat model

Dogfood Portal decides who wins money and reputation, so people have an
incentive to cheat it. This document lists what we protect, from whom, how,
and what is left over.

Every mitigation below points at the code that implements it and at a test
that proves it:

- **Unit tests:** `tests/unit`.
- **Integration tests:** `tests/integration`. They run against real Postgres
  and the real HTTP app.
- **Acceptance checks:** `acceptance/run.py`, run against the live stack.

## 1. Assets and actors

| Asset | Why it matters |
|---|---|
| Ballots and per-criterion scores | They decide prizes. Only the judge who wrote a ballot and the event's organizers may see it. |
| Normalization runs and published results | The official outcome. They must be reproducible and must not change without a trace. |
| Submissions before the deadline | Unfair edits after the deadline, or leaking drafts to competitors. |
| Community votes | A popularity prize that is easy to stuff. |
| Accounts, sessions and API tokens | Taking over an account gives that account's powers. |
| Audit log and signed records | The evidence that everything above was handled honestly. |

| Actor | Capability assumed |
|---|---|
| Anonymous visitor or scraper | Any HTTP request, at scale, from many IPs. |
| Participant | A valid account. Wants to win, or to see competitors' drafts or scores. |
| Judge | A valid account on a panel. May be biased, lazy or colluding. |
| Organizer | Trusted for events they run. Must not reach other organizers' events. |
| Admin | Fully trusted operator. |
| Network or infrastructure attacker | Can read unencrypted traffic, or gets database access. |

**Trust boundaries:**

- Browser ↔ API: same origin, cookies.
- API clients ↔ API: Bearer tokens.
- API ↔ Postgres: the app role runs under Row-Level Security.
- API → webhook receivers: signed outbound calls.

## 2. Threats and mitigations

### 2.1 Sybil voting (one person, many voters)

- **Attack:** vote from many identities to push one project.
- **Mitigations:**
  - The organizer chooses the voting mode per event. `authenticated` is one
    account per voter. `email` needs a verified address. `open` is
    link-based, identified by a device cookie.
  - Email identities are canonicalised before hashing: lowercase, with
    `+tags` removed. `ada+1@x.org` and `ADA+2@x.org` are therefore one voter
    (`canonicalEmail`, `voting.ts`).
  - Codes are 6 digits, expire after 15 minutes, allow 5 attempts, and are
    stored only as an HMAC. Requesting codes is rate-limited to 3 per burst.
  - Open mode: more than 3 distinct devices voting from one IP are
    recorded as `flagged` and not counted. The IP comes from the socket, not
    from `X-Forwarded-For`, unless `TRUST_PROXY` is set. IPs are stored only
    as keyed HMACs.
  - Organizers review flagged votes in the Votes console. Every override is
    audit-logged with a reason.
- **Proof:** `tests/integration/voting.test.ts` (flag on the 4th device,
  spoofed XFF ignored, +tag canonicalisation, hashed storage);
  acceptance T3.02 and T3.06.
- **Residual risk:** CGNAT, campus and office networks can put honest voters
  behind one IP (a false positive; organizers can release those votes).
  VPN-hopping with cleared cookies defeats open mode. For money prizes, use
  `authenticated` or `email` mode.

### 2.2 Ballot stuffing and double counting

- **Attack:** vote repeatedly, exceed the budget, or race parallel requests
  past it.
- **Mitigations:**
  - One row per `(event, voter, project)`, enforced by a unique key.
    Re-voting updates the row and never adds a second one.
  - Budgets are checked inside a transaction that holds a per-voter
    `pg_advisory_xact_lock`, so parallel requests are serialised.
  - Quadratic voting: `v` votes cost `v²` credits. Single style: at most
    `budget` projects.
  - Organizers and admins cannot vote. Participants cannot vote for their
    own team.
  - Tallies stay hidden until voting closes, which stops herding.
  - The gallery order is a per-viewer shuffle, which controls position bias.
- **Proof:** `voting.test.ts`; acceptance T3.01, T3.03, T3.04, T3.06 and
  T3.07.

### 2.3 Scraping and data harvesting

- **Attack:** harvest emails, draft projects, judge comments or live tallies.
- **Mitigations:**
  - Public DTOs never include emails. `auth-rbac.test.ts` probes every
    public read endpoint for address patterns.
  - Drafts return 404, not 403, to everyone outside the team and its
    organizers.
  - Raw ballots, per-judge scores and normalization runs are organizer-only.
    RLS enforces this in Postgres, not just the API.
  - The per-IP token bucket allows a 600-request burst, refilling at 600
    per minute. Pages hold at most 200 items. Auth, vote, comment, upload and
    write traffic have their own tighter buckets.
  - The embed feed is deliberately public but minimal: title, tagline,
    thumbnail and link.
- **Proof:** `isolation.test.ts`, `lifecycle.test.ts` (private drafts),
  `platform.test.ts` (rate limit with `Retry-After`); acceptance T1.02,
  T1.09 and T4.05.
- **Residual risk:** the rate limiter is in memory, which is fine for the
  single-node target. A multi-node deployment needs a shared store. Public
  project pages are meant to be scrapable.

### 2.4 Judge collusion, bias and isolation breaches

- **Attack:** a judge reads other judges' scores to anchor on them; a judge
  scores their friend's team; a biased judge dominates the ranking; judges
  coordinate.
- **Mitigations:**
  - **Isolation.** Every judge query runs as the non-owner role
    `dogfood_app` under `FORCE ROW LEVEL SECURITY`. Assignments, ballots,
    scores and pairwise votes are visible only where
    `judge_id = app.user_id`. An API bug therefore still cannot leak another
    judge's ballot: `isolation.test.ts` runs raw SQL as the app role and gets
    zero foreign rows. Foreign assignment ids return 403
    `NOT_YOUR_ASSIGNMENT` without revealing anything.
  - **Conflicts.** Team members can never judge their own team; the router
    excludes them, and accepting a judge invite while on a team fails with
    `PARTICIPANT_CONFLICT`. Organizers declare conflicts, and judges can
    recuse themselves, which is audited. Organizers cannot judge
    (`ORGANIZER_CANNOT_JUDGE`), which keeps oversight separate from scoring.
  - **Bias.** Per-judge Z-score normalization cancels additive leniency and
    scale differences exactly (JUDGING.md, Theorem 2). The Results Lab shows
    each judge's bias, and a per-project disagreement spread (`σ_N`) that
    highlights projects where judges diverge.
  - **Collusion is hard to coordinate.** Routing randomises pairings with a
    per-(judge, project) hash tie-break, so judges cannot pick their
    projects. Ballot contents stay private until publication. Every change
    after submission is audit-logged with the before and after totals, so a
    judge who re-scores late is visible.
  - **Ownership columns are derived, never trusted.** Triggers
    (`ballots_00_ownership`, `scores_00_ownership`) copy `judge_id`,
    `event_id` and `submission_id` from the assignment, so a crafted request
    cannot re-point a ballot. `scores_10_bounds` rejects out-of-range values
    in the database.
- **Proof:** `isolation.test.ts`, `lifecycle.test.ts` (conflict honoured,
  role separation); acceptance T2.01–T2.04 and T2.06.
- **Residual risk:** a panel whose majority colludes can still agree to
  favour one project. Normalization removes each judge's overall bias, not
  a targeted boost to a single project. The disagreement column and the
  audit trail are the tools for a human review.

### 2.5 Deadline gaming

- **Attack:**
  - Edit after the deadline by faking the client clock.
  - Race the cutoff.
  - Swap team members after results.
  - Exploit timezone confusion.
- **Mitigations:**
  - The deadline check uses the server's UTC clock only (`app.now()`).
    `Date` and any client time headers are ignored. All timestamps are
    stored as `timestamptz` and shown to users converted from the server
    clock, with skew correction in the UI.
  - A second line of defence sits in the database: the
    `submissions_deadline` trigger rejects content changes after
    `max(deadline, team extension)`, even if the API check were bypassed.
    Organizer-side columns (eligibility) stay editable.
  - Submit/unsubmit, invites and joins all freeze at the same instant.
  - Per-team extensions are organizer-only, must end after the deadline,
    and are audit-logged with a reason.
  - Every submit records the server time in the audit log.
- **Proof:** `deadline-teams.test.ts` (spoofed headers, DB trigger,
  extensions); acceptance T1.11, which waits for a real deadline on the live
  stack.

### 2.6 Account takeover and session abuse

- **Passwords:**
  - scrypt (N=2¹⁵, r=8, p=1) with a per-user salt, compared in constant
    time.
  - Login failures are identical for wrong passwords and unknown emails.
  - Login and registration are limited to 10 per minute per IP, and a 429
    response carries `Retry-After`.
- **Sessions:**
  - Session tokens are 256-bit random values (API tokens 192-bit). Only
    their SHA-256 is stored, so a database leak does not yield usable
    sessions.
  - The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` behind
    HTTPS (`COOKIE_SECURE`).
  - Logout deletes the session server-side. Role changes and account
    disabling take effect immediately, because sessions are re-read on
    every request.
- **API tokens:** labelled, expiring (at most 365 days), listed and
  revocable. They are shown once.
- **CSRF:**
  - `SameSite=Lax`.
  - Cookie-authenticated writes whose `Origin` doesn't match are rejected
    (`CSRF_BLOCKED`).
  - Bearer requests are not cookie-bound.
- **XSS:**
  - React escapes all output.
  - A strict CSP: `script-src 'self'`, no inline scripts, `object-src 'none'`
    and `frame-ancestors 'none'`.
  - `X-Content-Type-Options: nosniff`, and no `X-Powered-By` header.
- **Proof:** `auth-rbac.test.ts`; acceptance T1.03–T1.05 and T4.02.

### 2.7 Privilege escalation and IDOR

- **RBAC:** five roles with a single capability matrix (`roles.ts`,
  `can(role, cap)`). Every route declares the capability it needs, and the
  route table is the only way to mount handlers.
- **Tenant isolation between organizers:** a helper checks event
  ownership. Another organizer's draft returns 404, and so does writing to
  it.
- **Mass assignment:** Zod schemas list every accepted field. Unknown
  fields are dropped, so request bodies cannot set `role`, `event_id` or
  ownership columns.
- **Proof:** `auth-rbac.test.ts` (role matrix, tenant isolation, audited
  role changes); acceptance T1.05.

### 2.8 Tampering with history and results

- **Audit log:**
  - Append-only. The app role has no `UPDATE`, `DELETE` or `TRUNCATE`, and
    a trigger refuses changes even from the table owner.
  - Each row carries `hash = SHA-256(prev_hash ‖ canonical row)`.
    `GET /api/audit/verify` recomputes the whole chain and reports the first
    edited, deleted or reordered row.
  - `platform.test.ts` disables the triggers as the owner, edits one row,
    and the verifier pinpoints it.
- **Signed records:**
  - Participation, judging and winner certificates are canonical JSON
    signed with Ed25519. The public key is published at
    `/.well-known/dogfood-signing-key.json`.
  - Anyone can verify a record offline. The acceptance runner does this with
    an independent pure-Python RFC 8032 verifier and shows that a one-field
    change fails.
- **Results:**
  - Publishing freezes a specific normalization run into
    `published_results`, recording its run id.
  - Normalization always recomputes totals from per-criterion scores; it
    never uses a cached total.
  - Each run stores its inputs and invariants, and the acceptance runner
    re-derives every number.
- **Residual risk:** the chain is unkeyed. An attacker with full database
  write access who recomputes *every* later hash would produce a
  self-consistent forged chain. To detect that, record the `headHash` from
  `/api/audit/verify` outside the system, for example in the announcement
  post. Any later rewrite will then mismatch.

### 2.9 Server-side request forgery (webhooks)

- **Mitigations:**
  - Only organizers can register webhooks.
  - Cloud metadata targets are refused: `169.254.169.254`,
    `metadata.google.internal` and IPv6 link-local addresses.
  - Requests carry no credentials and time out after 5 seconds.
  - Responses are never reflected back to the caller; only the status code
    is logged.
  - Deliveries are signed:
    `X-Dogfood-Signature: sha256=HMAC(secret, timestamp.body)`. The timestamp
    lets receivers reject replays. The secret is shown once.
- **Residual risk:** organizers are trusted to target their own LAN. That is
  a feature for self-hosting (Slack bridges, internal bots). Deployments with
  untrusted organizers should add an egress allow-list at the network layer.
  The compose file already keeps the database on an internal-only network.

### 2.10 Malicious files and exports

- **Uploads:**
  - The file type comes from magic bytes (PNG, JPEG, WebP, GIF), not the
    declared type. SVG is refused because it can carry scripts.
  - The size limit is 5 MB. Files get random names.
  - Files are served with `nosniff`, under the same strict CSP.
- **CSV exports:** cells starting with `= + - @`, a tab or a CR are prefixed
  with `'`, which neutralises spreadsheet formulas (`csvCell`, tested in the
  unit tests and in `lifecycle.test.ts` with a `=HYPERLINK` title).
- **Imports:**
  - Event bundles and registration CSVs are validated in full before
    anything is written.
  - A bad row rejects the whole import, listing every error.
  - New accounts get random one-time passwords.

### 2.11 Invite links

- Team and judge invites are 192-bit random tokens. Only their SHA-256 is
  stored.
- They are single-use: acceptance locks the row with `SELECT … FOR UPDATE`,
  and a concurrent race admits exactly one person (`deadline-teams.test.ts`).
- They expire after 72 hours for teams, or 1 hour to 30 days (configurable)
  for judges.
- They can be revoked. They check capacity when minted and again when
  accepted.
- A **targeted invitation** reuses the same token but delivers it inside the
  invitee's in-app feed, so the captain does not have to copy a link out of
  band. The invitee is checked (not already on a team, not a judge) when it
  is sent.

### 2.12 In-app notifications

- The `notifications` table carries no RLS of its own (like `announcements`),
  so **every query filters `user_id = <caller>`** in the module. A read of
  someone else's notification is a 404, not a leak
  (`notifications.test.ts`).
- Rows are written only by server code paths that already authorised the
  actor (event organiser, team member); a client cannot address one.
- Notification bodies are plain text rendered as text by React, never
  injected as markup.

### 2.13 Denial of service

- Per-IP and per-user token buckets: `global`, `auth`, `vote`, `emailCode`,
  `comment`, `upload` and `write`.
- JSON bodies are limited to 1 MB and uploads to 5 MB.
- Every query is bounded or paginated.
- Webhook deliveries run concurrently, with timeouts and exponential backoff
  (6 attempts). One slow receiver cannot stall the others.

## 3. Deployment checklist

| Setting | Development default | Production |
|---|---|---|
| `CHECKER_SESSIONS` | `true`: seeds the well-known acceptance tokens from `.dogfood.toml` | **`false`**. These tokens are public. |
| `SEED_ON_BOOT` | `true` (demo data) | `false` |
| `APP_SECRET` | Generated on first boot and stored in the database | Set explicitly (32+ random chars) and keep it in a secret store |
| `COOKIE_SECURE`, `TRUST_PROXY` | `false` | `true` behind a TLS reverse proxy |
| Postgres | Internal compose network, random-looking default password | Set `POSTGRES_PASSWORD`, back up the `db-data` volume |
| Audit anchor | — | Publish `headHash` when results go out |

## Optional AI sidecar

The AI service is advisory and isolated by design:

| Threat | Control |
|---|---|
| Model reads private ballots | The sidecar never receives ballot rows; it only gets text already visible to the caller, and returns text |
| Model alters scores/results | AI output is cached separately; routing affinity is only a tie-break; nothing AI-generated is published or normalized |
| Prompt injection in a project description | Output is stored as data and rendered as text; it is never executed and never used as a SQL/route decision |
| Data exfiltration | The image runs with `HF_HUB_OFFLINE=1` and makes no external calls; the default backend is fully local |
| Abuse / cost of public summaries | Public summary generation is rate-limited and cached; batch size is capped |
| Shared-secret exposure | Optional `AI_SERVICE_KEY` is read from the environment, never persisted or returned |
