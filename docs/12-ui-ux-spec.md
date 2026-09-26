# 12 — UI/UX Specification

## 1. UX Goals

* **Streamlined Multi-Role Navigation:** Provide clear, role-differentiated interfaces across the 5-tier RBAC hierarchy (Visitor, Participant, Judge, Organizer, Admin) without UI clutter or unauthorized access leakage [7, 97, 98].
* **Unambiguous Deadline & Submission Feedback:** Give participants real-time server UTC deadline indicators, draft auto-save status, and explicit lock notifications after code freeze [7, 97].
* **Focused & Isolated Judge Evaluation Interface:** Deliver a distraction-free rubric scoring workflow for judges that displays assigned projects, workload progress, and strictly isolated evaluation sheets (`WHERE judge_id = auth.uid`) [8, 9, 99, 111].
* **Transparent & Controllable Organizer Operations:** Enable organizers to configure weighted rubrics, execute algorithmic judge assignments, trigger Z-score score normalizations, monitor anti-Sybil voting logs, and export CSV reports effortlessly [8, 10, 97].

---

## 2. Application Structure

```text
Public Portal & Gallery
  ↓
Authentication & Profile Management
  ├── Participant Dashboard (Team Invite Links, Project Drafts & UTC Deadline Lock)
  ├── Judge Evaluation Portal (Assigned Review Queue, Weighted Rubrics & Score Isolation)
  └── Organizer & Admin Control Panel (Event Setup, Rubrics, Normalization & CSV Exports)
```

---

## 3. Screen Specifications

### Screen: Public Event Portal & Project Gallery
**Purpose:** Public-facing gallery showcasing submitted projects, event information, tracks, and community choice voting [7, 10, 97].  
**User can:**
* Browse, search, and filter submitted projects by track, title, or tags [7, 97].
* View public project details (description, GitHub repo URL, demo links, media gallery) [7, 97].
* Cast community votes (open, email-gated, or authenticated) with rate limiting and hidden real-time tallies [10, 97, 100].  
**Elements:**
* Search bar, track filter dropdowns, project card grid, project modal/detail view, vote button with rate-limit status, and event rules overview [7, 10, 97].  
**Actions:**
* Search/Filter entries, view project details, cast community vote, navigate to Login/Register [7, 10, 97].  
**Navigation:**
* Entry point: Main application root (`/`) [7, 97].
* Next: Login/Register (`/auth`), Project Detail (`/projects/:id`) [7, 97].
* Back: N/A (Root view) [7, 97].

### Screen: Authentication & Role Portal
**Purpose:** Authenticate users locally and manage session identities across 5 RBAC roles [7, 97, 98].  
**User can:**
* Register local accounts and log in via session authentication [7, 97, 98].
* View active role status (Visitor, Participant, Judge, Organizer, Admin) [7, 97, 98].  
**Elements:**
* Email/Password login and registration forms, session status indicator, role badge [7, 97, 98].  
**Actions:**
* Submit Login, Submit Registration, Logout [7, 97, 98].  
**Navigation:**
* Entry point: `/auth` or header "Login" button [7, 97].
* Next: Dashboard based on assigned role (`/participant`, `/judge`, `/organizer`) [7, 97].
* Back: Public Gallery (`/`) [7, 97].

### Screen: Participant Dashboard & Team Management
**Purpose:** Allow participants to manage teams (1–4 members), generate invite links, edit project drafts, and lock final submissions before the UTC deadline [7, 97, 98].  
**User can:**
* Create a team, generate shareable invite links, and view current team roster [7, 97].
* Edit project draft details (title, description, GitHub repo URL, demo links, media assets) [7, 97].
* Monitor live server UTC deadline countdown and lock status [7, 97].  
**Elements:**
* UTC Deadline timer badge, Team Roster widget, Invite Code generator, Project Draft form editor, "Submit Final Project" confirmation button [7, 97].  
**Actions:**
* Copy Invite Link, Save Draft, Submit Final Project [7, 97].  
**Navigation:**
* Entry point: `/participant` [7, 97].
* Next: Public Gallery (`/`) after submission lock [7, 97].
* Back: Public Portal (`/`) [7, 97].

### Screen: Judge Evaluation Portal
**Purpose:** Provide judges with assigned project review queues, multi-criteria weighted rubric forms, and query-isolated score entries (`WHERE judge_id = auth.uid`) [8, 9, 97, 99].  
**User can:**
* View assigned project queue and evaluation progress bar [8, 97].
* Open project submission assets (repo URL, demo video, documentation) in side-by-side or tabbed view [8, 97].
* Score entries against weighted rubrics and submit private evaluation ballots [8, 9, 97].
* Access optional pairwise Bradley-Terry comparison mode [17].  
**Elements:**
* Review Queue sidebar, Assigned Progress Bar (e.g., "3/8 Evaluated"), Project Asset Inspector, Weighted Rubric Slider/Number inputs, "Save Score" button, Pairwise Toggle [8, 17, 97].  
**Actions:**
* Select Project, Input Rubric Scores, Submit Score, Toggle Pairwise Mode [8, 17, 97].  
**Navigation:**
* Entry point: `/judge` [8, 97].
* Next: Next project in assigned queue [8, 97].
* Back: Judge Queue Dashboard [8, 97].

### Screen: Organizer & Admin Dashboard
**Purpose:** Provide organizers with complete competition lifecycle controls, weighted rubric configuration, algorithmic judge routing, Z-score score normalization execution, audit logs, and CSV exports [8, 10, 97].  
**User can:**
* Configure event tracks, custom fields, and weighted judging rubrics [7, 8, 97].
* Trigger algorithmic judge assignment and monitor evaluation progress across tracks [8, 97].
* Execute Z-score statistical normalization and review bias adjustments [8, 22, 97].
* View anti-Sybil community voting audit logs and download CSV data exports [8, 10, 97].  
**Elements:**
* Lifecycle Phase selector, Rubric Builder table, Judge Workload Distribution matrix, Z-Score Normalization trigger button, Audit Log table, CSV Export actions, Acceptance Test status banner [7, 8, 10, 13, 97].  
**Actions:**
* Update Rubric, Assign Judges, Run Normalization, Export CSV, View Audit Logs [7, 8, 10, 97].  
**Navigation:**
* Entry point: `/organizer` or `/admin` [7, 97].
* Next: Track Settings, Judge Matrix, Normalization Results, Audit Logs [7, 8, 10, 97].
* Back: Main Dashboard [7, 97].

---

## 4. Primary User Flow

```text
Visitor / Participant Registration & Team Joining
  ↓
Project Draft Editing & Media Asset Uploads
  ↓
Server-Side UTC Deadline Validation & Hard Lock (Status: Draft ──► Submitted)
  ↓
Algorithmic Judge Routing & Assigned Queue Populated
  ↓
Query-Isolated Rubric Scoring by Judges (WHERE judge_id = auth.uid)
  ↓
Organizer Execution of Z-Score Statistical Score Normalization
  ↓
Public Gallery Results & Anti-Sybil Community Voting (Hidden tallies revealed post-window)
```

---

## 5. UI States

* **Loading:** Displays skeleton loaders or subtle spinner indicators during local database queries, asset loading, or Z-score normalization execution.
* **Empty:** Clear empty-state cards for empty project galleries ("No projects submitted yet"), unassigned judge queues ("No projects assigned to you yet"), or empty team rosters.
* **Success:** Explicit banner notifications for saved project drafts, locked final submissions, submitted judge evaluation ballots, and completed Z-score score normalizations.
* **Error:** Informative alert boxes with specific error codes for rejected late submissions ("Submission locked: Hard UTC deadline passed"), unauthorized route access (HTTP 401/403), or invalid rubric inputs.
* **Disabled:** Disables "Save Draft" and "Submit Project" buttons after server-side UTC hard deadline lock; disables "Cast Vote" buttons when IP rate limits are reached.
* **Processing:** Disables action triggers and displays progress bars during batch judge routing or statistical score normalization.
* **Failed / Retry:** Provides explicit error descriptions and retry triggers when local acceptance test execution fails or database connections error.

---

## 6. Responsive / Platform Requirements

* **Desktop Layout:** Full-featured desktop layout optimized for multi-pane judge scoring (project inspector side-by-side with rubric form) and organizer management dashboards.
* **Mobile & Tablet Layout:** Responsive single-column layouts for public project gallery browsing, participant draft editing, and basic vote casting.
* **Platform Support:** Linux/Docker container environment executing standard modern web browser engines (Chrome, Firefox, Safari, Edge).

---

## 7. Accessibility

* **Keyboard Navigation:** *Not specified in official sources for formal WCAG targets; standard HTML form focus states and keyboard tab navigation recommended.*
* **Contrast & Readability:** *Not specified in official sources; clear contrast ratios for status badges (Draft vs Submitted) and rubric score numbers recommended.*
* **Screen Readers & Focus States:** *Not specified in official sources.*

---

## 8. UX Requirements for AI Features

* **Embedded AI Interface:** **None.** The application operates 100% offline in an air-gapped environment with zero embedded cloud AI UI components.
* **Developer AI Usage Context:** AI coding assistants used during development scaffolding must produce clean, maintainable UI code supported by technical documentation.

---

## 9. Design References

* **Devpost & Unstop Public Portals:** Referenced in research for baseline project gallery card patterns, submission link fields, and track filtering layouts [2, 3, 92].
* **Gavel (HackMIT):** Referenced for side-by-side binary pairwise project comparison workflows [17].
* **Hackathon Raptors Dashboard:** Standard multi-tenant competition control layout for rubric configuration and score exports [2, 92].

---

## 10. UX Checklist

### MUST HAVE
* [x] Primary user journey across registration, teams, submissions, judging, and results is clear
* [x] Core actions (draft saving, invite link generation, rubric scoring, normalization trigger) are discoverable
* [x] Loading, empty, success, error, and disabled UI states exist across key workflows
* [x] Backend query isolation (`WHERE judge_id = auth.uid`) prevents unauthorized score sheet exposure in the UI
* [x] Server UTC deadline lock status is prominently indicated to participants
* [x] Navigation flows logically between public, participant, judge, and organizer portals

### SHOULD HAVE
* [x] Responsive single-column fallbacks for mobile gallery browsing and draft editing
* [x] Clear status badges differentiating draft, submitted, and evaluated entries

### UNKNOWN
* [ ] Specific design token palette, font families, or CSS framework mandated by organizers (developers choose UI styling)

---

## 11. Implementation & Verification Notes

* **Screens shipped** — public (home, events, event, gallery, project, results, embed widget, record verification, API reference), participant (hub, team & invites, submission editor), judge (queue, rubric scoring, pairwise), organizer (overview, settings, setup, rubric, submissions, judges & routing, Results Lab, voting review, audit trail, integrations), admin.
* **Responsive** — navigation rail ≥ 840 px, bottom navigation bar below; two-pane layouts ≥ 1200 px. An automated probe loads all 31 screens at 360 px and 390 px and asserts zero horizontal overflow (it caught and drove fixes for grid min-width blow-outs, the results table, long API paths and a long status pill). On phones the submission deadline countdown leads the editor and the podium reads in rank order.
* **Accessibility** — automated sweep over every screen: all controls named, all inputs labelled, alt text present, unique ids, one `h1` per page (the embed widget was the only miss, fixed). Keyboard: skip link, visible focus rings, roving tabindex on tabs, sliders with `aria-valuetext`, chart points focusable with tooltips. Colour roles come from the M3 tonal system, which guarantees on-colour contrast pairs in light and dark themes.
* **Horizontal scrollers** (chip filters, event rows) fade their edges only while more content is hidden (CSS scroll-driven animation).
* **Performance** — lazy route chunks, assets precompressed at build (Brotli: 878 KB → 225 KB for JS + CSS), immutable caching for hashed assets, a 71 KB variable font instead of 1.4 MB.
* **E2E** — `tests/e2e/smoke.spec.ts` (Playwright) walks the key journey of every role in a real browser, desktop and phone.
