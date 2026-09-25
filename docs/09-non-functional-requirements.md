# 09 — Non-Functional Requirements

## 1. Performance

* **Response Time:** Not specified in official sources for exact millisecond targets; API endpoints must respond promptly during automated test suite execution.
* **Page / App Loading:** Fast, responsive client-side rendering for public gallery browsing, project draft editing, and judge scoring sheets. (Numeric load speed targets: Not specified).
* **AI Response Time:** Not specified (AI tools are permitted for development velocity; no embedded real-time AI response latency requirement exists for the application).
* **API Performance:** Fast, non-blocking HTTP controller execution during local evaluation and test runner execution.
* **Background Processing:** Asynchronous startup tasks (e.g., database seed routines, CSV report generation) must execute reliably during container boot and export triggers.
* **Large Data Handling:** Memory-efficient handling of CSV exports and bulk JSON/CSV import/export operations across hundreds of submissions and score records.

---

## 2. Reliability

* **Error Handling:** Graceful validation error handling on invalid requests; divide-by-zero protection in score normalization math using an epsilon parameter ($\epsilon = 10^{-6}$).
* **API Failures:** Standardized HTTP status codes (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity, 500 Internal Error) returned with informative JSON error payloads.
* **Retries & Recovery:** Container restart policies configured within `docker-compose.yml` to automatically recover from unhandled process failures.
* **Data Consistency:** Deterministic startup seed loading (`fixtures.json`); transactional integrity during submission updates and score record writes.
* **Graceful Degradation:** Automatic mathematical fallback from Z-score score normalization to Min-Max scaling when a judge evaluates fewer than 5 submissions ($N_j < 5$).

---

## 3. Scalability

* **Number of Users:** Multi-tenant support for competition management across global events; supports solo participants or teams of 1 to 4 members. (Exact maximum concurrent user count: Not specified).
* **Concurrent Requests:** Rate-limiting middleware on public voting and gallery endpoints to absorb request bursts and prevent Sybil vote stuffing.
* **Data Volume:** Capable of handling hundreds of projects, media assets, rubrics, and judge evaluation ballots across multiple event tracks.
* **Background Jobs:** Deterministic container boot seeding and background batch export processing.
* **API Rate Limits:** Configurable rate limiting on public community voting routes.
* **Future Scaling:** Production-ready architecture designed to be officially forked, self-hosted, and scaled for future Hackathon Raptors global events.

---

## 4. Security

* **Authentication:** Local session-based authentication; zero reliance on third-party cloud identity providers (Auth0, Clerk, Firebase prohibited).
* **Authorization:** 5-level Role-Based Access Control (RBAC) enforcing explicit permission boundaries across Visitor, Participant, Judge, Organizer, and Admin roles.
* **Secrets & API Keys:** Zero hardcoded API keys, private tokens, or database credentials committed to git repository history; all settings configured via environment variables.
* **Data Protection:** Query-level and row-level backend isolation (`WHERE judge_id = auth.uid`) enforcing score sheet privacy at the API/database layer (never relying on UI hiding).
* **Input Validation:** Server-side UTC hard deadline lock validating system timestamps and rejecting client-supplied time headers; strict sanitization on submission text and rubric forms.
* **Access Control:** Role isolation matrix preventing judges, participants, or visitors from accessing unauthorized track data or unassigned evaluation ballots.

---

## 5. Privacy & Data Handling

* **Personal Data:** User accounts, credentials, and team member profiles stored locally within containerized databases.
* **Sensitive Data:** Evaluation ballots and raw judge scores must remain private and accessible strictly to assigned judges (`WHERE judge_id = auth.uid`).
* **Data Storage:** Stored in local containerized database instances persistent across container restarts.
* **Data Retention:** Immutable audit trails retained for administrative overrides, score edits, and public community votes.
* **Data Transmission:** Zero external telemetry or transmission to third-party cloud services; 100% air-gapped execution.
* **Third-Party Data Sharing:** Prohibited; zero external SaaS or remote data sharing.

---

## 6. Usability & Accessibility

* **Ease of Use:** Single-command local startup (`docker compose up`) for organizers; streamlined UI forms for team creation, project drafting, and rubric scoring.
* **User Workflow:** Intuitive multi-step progression: Registration → Team Invites → Draft Submission → Server UTC Deadline Lock → Algorithmic Judge Queue → Rubric Scoring → Public Gallery Voting.
* **Responsive Design:** Functional web interface responsive across desktop and mobile screen sizes.
* **Accessibility:** Clear form labels, status badges (e.g., Draft vs. Submitted), and readable score summaries. (Specific accessibility compliance standards like WCAG 2.1 AA: Not specified).
* **Clear Feedback & Error States:** Explicit server error messaging when submission attempts occur after UTC deadlines or when unauthorized resource access is attempted.

---

## 7. Maintainability

* **Code Organization:** Standardized repository file layout (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `docker-compose.yml`, `src/`, `tests/`, `acceptance-report.txt`, `LICENSE`, `.dogfood.toml`).
* **Modularity:** Clean architectural separation between frontend UI components, backend REST/GraphQL controllers, database models, and scoring/normalization engines.
* **Documentation:** Comprehensive markdown specifications detailing system architecture, entity schemas, judging mechanics, and launch requirements.
* **Configuration:** Centralized capability and environment settings in `.dogfood.toml` and Docker Compose manifests.
* **Type Safety:** Type-safe models and API schemas recommended across backend services to prevent runtime exceptions.
* **Testing:** Comprehensive unit, integration, and security role isolation test suites; test execution outputs plain text results to `acceptance-report.txt`.
* **Logging:** Structured console logs for container boot routines, database migrations, seed population, and test execution.

---

## 8. Observability

* **Logging:** Application stdout/stderr logs captured by Docker container logging drivers; test summary output captured in `acceptance-report.txt`.
* **Error Tracking:** Test suite execution logs plain text pass/fail statuses to `acceptance-report.txt`.
* **Monitoring:** Container health status monitored via Docker engine health checks.
* **AI / API Failures:** Standardized HTTP status codes and error JSON structures returned on controller exceptions.
* **Background Jobs:** Console output logging progress and completion status during container boot database seeding.
* **Debugging:** Deterministic database seed files (`fixtures.json`) enable reproducible local state for debugging.

---

## 9. Deployment & Availability

* **Hosting:** Local self-hosted container orchestration via Docker Compose (`docker-compose.yml`).
* **Deployment:** Single-command local execution via `docker compose up`.
* **Environment Configuration:** 100% offline air-gapped execution with network interfaces disabled; zero third-party cloud service calls.
* **Production Readiness:** Open-source codebase suitable for being officially forked, self-hosted, and deployed as production infrastructure by Hackathon Raptors.
* **Required Uptime / Availability:** High local availability throughout offline evaluation without crashes, memory leaks, or unhandled exceptions.
* **External Services:** Zero external cloud SaaS dependencies permitted (no Auth0, Clerk, hosted databases, or remote email APIs).

---

## 10. NFR Checklist

### MUST
* [ ] Execute 100% offline in an air-gapped environment with network interfaces disabled
* [ ] Launch locally using a single `docker compose up` command
* [ ] Enforce backend query/row-level role isolation (`WHERE judge_id = auth.uid`) for score privacy
* [ ] Implement divide-by-zero protection ($\epsilon = 10^{-6}$) in Z-score normalization math
* [ ] Fall back from Z-score normalization to Min-Max scaling when $N_j < 5$
* [ ] Auto-seed deterministic test data on container boot
* [ ] Log plain text test pass/fail results directly to `acceptance-report.txt`
* [ ] Include an OSI-approved open source license (`LICENSE`) and required documentation (`README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `.dogfood.toml`)

### SHOULD
* [ ] Implement rate-limiting middleware and IP duplicate detection on public community voting endpoints
* [ ] Maintain structured console logging and immutable audit trails for administrative and vote events
* [ ] Ensure modular separation of concerns and type safety across application backend services

### UNKNOWN / NOT SPECIFIED
* [ ] Specific millisecond API response time targets
* [ ] Exact numerical concurrent user limits
* [ ] Specific web accessibility certification standard (e.g., WCAG 2.1 AA)
* [ ] Preferred database engine choice (PostgreSQL, SQLite, MySQL are all compliant if containerized)
