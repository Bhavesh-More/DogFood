# 15 — Security Requirements

## 1. Authentication

* **User Authentication:** Local session-based authentication. Third-party cloud identity providers (Auth0, Clerk, Firebase, etc.) are explicitly prohibited due to the 100% offline air-gapped execution constraint.
* **Sessions & Tokens:** HTTP-only, secure session cookies or local session tokens verified against database session tables on protected requests.
* **Login & Logout:** Dedicated `/api/auth/login` and `/api/auth/logout` endpoints managing local session creation and destruction.
* **Password Handling:** Passwords hashed using industry-standard hashing algorithms (e.g., bcrypt or Argon2) prior to database persistence. Plaintext passwords must never be stored or logged.
* **OAuth / Social Login:** *Not specified / Prohibited.* External OAuth providers are not permitted due to air-gapped network restrictions.
* **Authentication Failures:** Standardized HTTP 401 Unauthorized error responses returned without disclosing whether an email address exists in the system.

---

## 2. Authorization

* **User Roles:** 5-tier Role-Based Access Control (RBAC) hierarchy enforcing explicit permissions across:
  1. `visitor` — Browses public event gallery and public project pages.
  2. `participant` — Creates/joins teams (1–4 members), manages project drafts, submits final entries before server UTC deadline.
  3. `judge` — Accesses assigned evaluation queue, inputs multi-criteria rubric scores, views assigned scoring progress.
  4. `organizer` — Configures events/tracks/rubrics, manages judge assignments, triggers Z-score score normalization, exports CSV reports.
  5. `admin` — System-wide management, role assignment, and audit log inspection.
* **Permissions & API Access Control:** Middleware guards verify session tokens and role privileges on all non-public endpoints before executing business logic.
* **Resource Ownership & Query Isolation:**
  * **Judge Ballot Isolation:** Database query predicates (`WHERE judge_id = auth.uid`) strictly enforced at the controller level to ensure judges can only view or edit their assigned evaluation sheets.
  * **Team Draft Ownership:** Only active team members can edit project draft submissions prior to the server UTC deadline lock.
* **Admin Access:** Administrative actions (role escalation, event track configuration, score overrides) restricted strictly to `organizer` and `admin` roles.

---

## 3. Secrets & Credentials

* **API Keys & Database Credentials:** All database passwords, encryption keys, and environment settings configured exclusively via local environment variables (`.env`).
* **Source Control Protection:** `.env` and secret key files must be listed in `.gitignore`. Secrets, API keys, private tokens, or database credentials MUST NOT be committed to git source control.
* **Third-Party Credentials:** *N/A.* No external cloud services or third-party SaaS credentials allowed.

---

## 4. Input & API Security

* **Input Validation:** Strict server-side schema validation on all incoming JSON payloads, form fields, and URL parameters.
* **Request Validation & Deadline Lock:** Server-side UTC clock verification for project submission endpoints. Client-supplied time headers MUST be ignored to prevent deadline tampering.
* **Authentication on Protected Endpoints:** Session verification required on all state-mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`).
* **Rate Limiting:** Rate-limiting middleware required on public community voting and public gallery routes to mitigate Sybil attacks, automated bot submission, and IP ballot stuffing.
* **Malicious Input Handling:** Sanitization of project descriptions, repository URLs, and media links to prevent Cross-Site Scripting (XSS) and database query injection.
* **Error Responses:** Standardized JSON error objects (`{"error": "Message", "code": "ERROR_CODE"}`) accompanied by standard HTTP status codes (400, 401, 403, 404, 422, 500). Internal stack traces, SQL queries, or filesystem paths must never be exposed to clients.
* **External API Validation:** *N/A.* Zero external API integration permitted due to 100% air-gapped constraints.

---

## 5. Data Security

* **Sensitive Data:** Password hashes, raw judge score sheets, unassigned evaluation ballots, and immutable audit logs.
* **Encryption:** Password hashing at rest in local relational database tables; TLS/HTTPS recommended for web transport when configured.
* **Secure Storage:** Database instances isolated within local Docker containers and persisted via protected Docker volume mounts.
* **Data Transmission:** Container-to-container internal networking; 100% offline air-gapped execution with zero external telemetry or cloud data transmission.
* **Database Access:** Direct database port access restricted to backend server containers; database credentials concealed from frontend clients.
* **Data Exposure Limits:** Raw, un-normalized score sheets isolated strictly to assigned judges (`WHERE judge_id = auth.uid`). Participants and visitors MUST NOT access raw individual judge ballots.

---

## 6. AI Security

* **Runtime Application Stack:** *N/A.* No embedded AI models or remote AI API integrations exist in the deployed platform (100% offline requirement).
* **Development Scaffolding:** AI tools (Claude Code, Cursor, Aider, Copilot) used during local development must not be used to commit hardcoded secrets or bypass security checks.

---

## 7. Third-Party Integrations

* **External Cloud Services:** Prohibited. Zero third-party cloud services (Auth0, Clerk, Firebase, hosted DBs, remote APIs) permitted.
* **Local Webhooks (Tier 4 Extension):** If outbound local webhooks are implemented, payload deliveries should include cryptographic HMAC signatures (`X-Dogfood-Signature`) to verify event authenticity.

---

## 8. Client-Side Security

* **Sensitive Data in Frontend:** Raw judge evaluations, unassigned score sheets, and administrative keys must never be transmitted to or stored on client-side state.
* **Token Storage:** Session identifiers stored in HTTP-only, secure, SameSite cookies or secure session storage.
* **Exposed Environment Variables:** Only public non-sensitive configuration flags (e.g., event name, declared tier features) exposed to the frontend bundle.
* **Browser Security:** Defense against XSS via template auto-escaping and Content Security Policy (CSP) headers; protection against CSRF on state-changing endpoints.
* **Unencrypted Local Storage:** Sensitive authentication credentials or private score data MUST NOT be stored in unencrypted browser `localStorage`.

---

## 9. Logging & Error Handling

* **Security-Relevant Logging:** Immutable audit trail records logged for administrative role modifications, event deadline adjustments, manual score overrides, and community vote events.
* **Automated Test Logging:** Plain-text test execution output logged directly to `acceptance-report.txt`.
* **Secrets & Sensitive Data in Logs:** Password hashes, session tokens, and raw credential payloads MUST be scrubbed or omitted from container stdout/stderr console logs.
* **Safe User-Facing Errors:** Generic, user-friendly error messages that inform the user without revealing database structure or system internals.

---

## 10. Security Checklist

### MUST
* [ ] Zero secrets, private keys, or passwords committed to git source control
* [ ] Protected endpoints require valid session authentication and 5-level RBAC authorization
* [ ] Database query isolation (`WHERE judge_id = auth.uid`) enforced for evaluation ballots
* [ ] Server UTC clock validation enforced for submission deadline locks (ignoring client time headers)
* [ ] All user inputs sanitized and validated on the server side
* [ ] Error responses return clean JSON without exposing stack traces or database query details
* [ ] Executed 100% offline in an air-gapped environment with zero external cloud SaaS calls

### SHOULD
* [ ] Rate-limiting middleware and IP duplicate detection enabled on public community voting endpoints
* [ ] Security-relevant audit trails maintained for administrative overrides and vote events
* [ ] HTTP-only, SameSite cookies utilized for session token storage

### UNKNOWN / NOT SPECIFIED
* [ ] Formal regulatory compliance obligations (GDPR, HIPAA, SOC 2 are *Not specified* in hackathon sources)
* [ ] Mandated third-party security audit tools or specific vulnerability scanners
