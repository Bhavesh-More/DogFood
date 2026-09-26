import type { Role } from "@dogfood/core";
import { ACCOUNTS, SLUGS, SUBMISSIONS } from "./accounts";
import { at, byTour, click, visibleNav, waitForSelector } from "./dom";
import type { TourStep } from "./types";

const event = (slug: string) => `/e/${slug}`;
const gallery = (slug: string) => `/e/${slug}/gallery`;
const organize = (slug: string) => `/organize/${slug}`;
const judgeEvent = (slug: string) => `/judge/${slug}`;

/** Click a tab after the tablist has rendered. */
const tab = (label: string) => async () => {
  await waitForSelector('[role="tablist"]');
  click('button[role="tab"]', label);
};

/* ------------------------------------------------------------------ *
 * Global chrome — shown first in every tour.
 * The first step signs the tour in as an anonymous visitor (demo only;
 * role tours strip `as` so they never change the current session).
 * ------------------------------------------------------------------ */
const shellSteps: TourStep[] = [
  {
    as: null,
    route: "/",
    element: visibleNav(),
    popover: {
      title: "Navigation rail",
      description:
        "Home, Events and — depending on your role — My hub, Judging, Organize and Admin; the API reference and Tour sit at the bottom. On phones this becomes the bottom bar.",
      side: "right",
    },
  },
  {
    element: byTour("context-fab"),
    popover: {
      title: "One-tap shortcut",
      description:
        "Organizers get “Create event”, judges get “Continue judging”, everyone else gets “Find a hackathon”.",
      side: "right",
    },
  },
  {
    element: byTour("topbar"),
    popover: {
      title: "Top bar",
      description:
        "The whole platform is offline-first: no CDNs, no external fonts, no telemetry — everything runs on this server.",
      side: "bottom",
    },
  },
  {
    element: byTour("theme-toggle"),
    popover: {
      title: "Light & dark themes",
      description:
        "Material 3 Expressive theming with colour roles generated from a single seed. The choice is remembered on this device.",
      side: "bottom",
    },
  },
  {
    element: byTour("user-menu"),
    popover: {
      title: "Account menu",
      description:
        "Profile, personal API tokens, Ed25519-signed certificates, the API reference and sign-out live here.",
      side: "bottom",
    },
  },
];

/* ------------------------------------------------------------------ *
 * Public / anonymous journey.
 * ------------------------------------------------------------------ */
const publicSteps: TourStep[] = [
  {
    as: null,
    route: "/",
    element: at("main h1"),
    popover: {
      title: "Welcome to Dogfood Portal",
      description:
        "A self-hosted hackathon platform that covers the entire competition: registration, teams, submissions, judge routing, weighted rubrics, normalized scores, community voting, certificates and a hash-chained audit trail.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: "/",
    element: at("#live-heading"),
    popover: {
      title: "Happening now",
      description:
        "Events in their live phase appear here. Open a card to register, submit a project or vote.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: "/",
    element: at("#pipeline-heading"),
    popover: {
      title: "One pipeline, ten stages",
      description:
        "Registration → Teams → Submissions → Eligibility → Judge routing → Scoring → Normalization → Results → Certificates → Archive. Every stage is a real feature, not a diagram.",
      side: "top",
    },
  },
  {
    as: null,
    route: "/events",
    element: at("main h1"),
    popover: {
      title: "Browse hackathons",
      description:
        "Search and filter by phase — open, upcoming, judging, results or archived.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}`,
    element: at("main h1"),
    popover: {
      title: "Event page",
      description:
        "Each event has a public page: rules, tracks, prizes, timeline, the judging rubric, organizer news and a deadline countdown driven by the server clock.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}`,
    element: at('[role="tablist"][aria-label="Event sections"]'),
    popover: {
      title: "Event sections",
      description:
        "Overview, News, Timeline, Tracks & prizes, Judging and Rules. Switch tabs for the full public picture of the event.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}`,
    before: tab("Tracks & prizes"),
    element: at('button[role="tab"]', "Tracks & prizes"),
    popover: {
      title: "Tracks & prizes",
      description:
        "Projects compete inside tracks; prizes can be overall or scoped to a single track.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}`,
    before: tab("Judging"),
    element: at('button[role="tab"]', "Judging"),
    popover: {
      title: "Judging criteria",
      description:
        "The weighted rubric is public: every criterion, its weight and whether it applies to all tracks or just one.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: gallery(SLUGS.judging),
    element: at("main h1"),
    popover: {
      title: "Project gallery",
      description:
        "Every submitted project, with search, track and tag filters and sorting (recent, A–Z, ranked, or a per-viewer shuffle).",
      side: "bottom",
    },
  },
  {
    as: null,
    route: gallery(SLUGS.judging),
    element: byTour("voting-bar"),
    popover: {
      title: "Community voting",
      description:
        "This event is live with open single-choice voting: back up to 3 projects. Tallies stay hidden until the window closes and the order is shuffled for each viewer.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}/p/${SUBMISSIONS.commented}`,
    element: at("main h1"),
    popover: {
      title: "Project page",
      description:
        "Description, tech tags, repository/demo links, team roster and the project's gallery.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}/p/${SUBMISSIONS.commented}`,
    element: byTour("vote-control"),
    popover: {
      title: "Cast a vote",
      description:
        "Votes can be cast straight from the project page; the budget meter updates live.",
      side: "left",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.judging}/p/${SUBMISSIONS.commented}`,
    element: at("#comments-heading"),
    popover: {
      title: "Comments",
      description:
        "Signed-in visitors, participants and judges can discuss projects. Organizers can hide comments; every action is audited.",
      side: "top",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.archived}/results`,
    element: at("main h1", "Results"),
    popover: {
      title: "Published results",
      description:
        "Once results are published, anyone can see the podium and leaderboard — normalized score, raw mean, judge count, pairwise strength and community votes.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: `/e/${SLUGS.archived}/results`,
    element: at("#board"),
    popover: {
      title: "Leaderboard",
      description:
        "Normalization removes judge bias, so the normalized rank is the fair one. The raw mean and disagreement are shown next to it for transparency.",
      side: "top",
    },
  },
  {
    as: null,
    route: `/embed/${SLUGS.judging}`,
    element: at("h1"),
    popover: {
      title: "Embeddable gallery",
      description:
        "The same gallery can be dropped into any site with one iframe. It needs nothing but this server — no third-party scripts.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: "/api-docs",
    element: at("main h1", "REST API"),
    popover: {
      title: "Public REST API",
      description:
        "The API is generated from the route table and documented as OpenAPI 3.1. Every endpoint the UI uses is here, with capabilities and schemas.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: "/api-docs",
    element: at('[aria-label="Filter endpoints"]'),
    popover: {
      title: "Explore the API",
      description:
        "Filter by tag, then expand any endpoint to read its request body and responses. Download the live spec at /api/openapi.json.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: "/register",
    element: at("main h1", "Create your account"),
    popover: {
      title: "Self-service registration",
      description:
        "Accounts are stored on this server only. Participants compete and join teams; visitors browse and vote; judge and organizer roles are granted by invitation or an admin.",
      side: "bottom",
    },
  },
  {
    as: null,
    route: "/login",
    element: at("main h1", "Welcome back"),
    popover: {
      title: "Sign in",
      description:
        "One-click demo accounts are shown below the form. The full demo signs in and out of each role for you as it walks through every feature.",
      side: "bottom",
    },
  },
];

/* ------------------------------------------------------------------ *
 * Visitor journey.
 * ------------------------------------------------------------------ */
const visitorSteps: TourStep[] = [
  {
    as: ACCOUNTS.visitor,
    route: "/dashboard",
    element: at("main h1"),
    popover: {
      title: "Visitor hub",
      description:
        "Visitors get a personal hub with the events they follow and their signed certificates.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.visitor,
    route: "/dashboard",
    element: at("h2", "My hackathons"),
    popover: {
      title: "My hackathons",
      description:
        "Events you registered for or joined a team in, with quick links to the team page and submission editor.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.visitor,
    route: "/dashboard",
    element: at("h2", "Certificates & signed records"),
    popover: {
      title: "Certificates & signed records",
      description:
        "Every certificate is Ed25519-signed and independently verifiable — even offline, with the public key.",
      side: "top",
    },
  },
  {
    as: ACCOUNTS.visitor,
    route: event(SLUGS.open),
    element: at("main h1"),
    popover: {
      title: "Email-gated quadratic voting",
      description:
        "This event is configured for email-verified quadratic voting (25 credits; v votes cost v²). Voters prove an address, one person one ballot — and codes land in the platform's local outbox, never an external mail service.",
      side: "bottom",
    },
  },
];

/* ------------------------------------------------------------------ *
 * Participant journey.
 * ------------------------------------------------------------------ */
const participantSteps: TourStep[] = [
  {
    as: ACCOUNTS.participant,
    route: "/dashboard",
    element: at("main h1"),
    popover: {
      title: "Participant hub",
      description:
        "Your hackathons, teams, submissions and certificates in one place.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: "/dashboard",
    element: at("h2", "My hackathons"),
    popover: {
      title: "Your events",
      description:
        "Open an event to manage the team and the submission for it.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: event(SLUGS.open),
    element: at("main h1"),
    popover: {
      title: "Open for submissions",
      description:
        "The action card on the right is phase- and role-aware: it offers Register, Create or join a team, Edit submission, or Vote as appropriate.",
      side: "left",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/team`,
    element: at("main h1"),
    popover: {
      title: "Team page",
      description:
        "Create a team or join one with an invite link. Rosters, invites and recruiting all live here.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/team`,
    element: at("#team-finder-heading"),
    popover: {
      title: "Team finder",
      description:
        "Post yourself on the board with your skills, or list your team as recruiting. The board clears a post automatically once the person joins a team.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/team`,
    element: at("h2", "Invite links"),
    popover: {
      title: "Single-use invites",
      description:
        "Invite links expire after 72 hours and work exactly once. There is a hard cap of one team per person per event, enforced by a database constraint.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/submit`,
    element: at("main h1", "Submission"),
    popover: {
      title: "Submission editor",
      description:
        "Drafts autosave. You can edit freely until the hard deadline — which the server clock, not your browser, decides.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/submit`,
    element: at("h2", "Basics"),
    popover: {
      title: "Basics & links",
      description:
        "Project name, tagline, track, description, tech tags and the repository / demo / live links.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/submit`,
    element: at("h2", "Media"),
    popover: {
      title: "Media",
      description:
        "Upload a thumbnail and up to eight gallery images. If you skip the thumbnail, cover art is generated for you.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.participant,
    route: `/e/${SLUGS.open}/submit`,
    element: at('[aria-label="Submission checklist"]'),
    popover: {
      title: "Readiness checklist",
      description:
        "The checklist mirrors the server-side validation exactly. When it is complete, “Submit project” locks the entry in for judging — and “Return to draft” unlocks it again before the deadline.",
      side: "left",
    },
  },
];

/* ------------------------------------------------------------------ *
 * Organizer journey — create an event, then run one end to end.
 * ------------------------------------------------------------------ */
const organizerSteps: TourStep[] = [
  {
    as: ACCOUNTS.organizer,
    route: "/organize",
    element: at("main h1", "Organizer console"),
    popover: {
      title: "Organizer console",
      description:
        "Every event you organize, with registrations, teams and submissions at a glance.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: "/organize",
    element: at("a", "New event"),
    popover: {
      title: "Start a new hackathon",
      description:
        "New events start as private drafts. You build the tracks, prizes, questions and rubric, then publish when ready.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: "/organize/new",
    element: at("main h1", "New hackathon"),
    popover: {
      title: "Create a hackathon",
      description:
        "Name, URL slug, tagline, description, schedule and team size. The slug becomes the public page at /e/your-slug.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: "/organize/new",
    element: at("label", "Hard submission deadline"),
    popover: {
      title: "The hard deadline",
      description:
        "Times are stored and enforced in UTC. After this instant the API and a database trigger both refuse content edits — only eligibility edits remain.",
      side: "right",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: organize(SLUGS.judging),
    element: at("main h1"),
    popover: {
      title: "Event console",
      description:
        "The console is the command centre: settings, setup, rubric, submissions, judges, results, voting, audit and integrations.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: organize(SLUGS.judging),
    element: at('nav[aria-label="Event console"]'),
    popover: {
      title: "Console sections",
      description:
        "Overview, Settings, Setup, Rubric, Submissions, Judges, Results lab, Voting, Audit trail and Integrations.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: organize(SLUGS.judging),
    element: at("h3", "Judging progress"),
    popover: {
      title: "Overview",
      description:
        "Live stats, per-judge progress, and “needs attention” alerts: submissions awaiting eligibility review, projects short of reviews, and flagged votes.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: organize(SLUGS.judging),
    element: at("h2", "Announcements"),
    popover: {
      title: "Announcements",
      description:
        "Post news to everyone, participants only or judges only. Announcements are audience-filtered on the server and can be pinned to the top of the event page.",
      side: "top",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/settings`,
    element: at("h3", "Details"),
    popover: {
      title: "Event settings",
      description:
        "Edit the public details, schedule, team rules, judging and normalization targets, and the community-voting configuration.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/settings`,
    element: at("h3", "Schedule"),
    popover: {
      title: "Schedule",
      description:
        "Hacking start, hard deadline and (optionally) judging end. Every deadline change is recorded in the audit trail with the previous value.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/settings`,
    element: at("h3", "Teams & judging"),
    popover: {
      title: "Teams & judging",
      description:
        "Min/max team size, reviews per project, and the normalization target mean and standard deviation, plus the Min-Max fallback threshold.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/settings`,
    element: at("h3", "Community voting"),
    popover: {
      title: "Community voting",
      description:
        "Off, open link, email-gated or signed-in. Choose single-choice or quadratic credits, set the budget and the voting window.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/setup`,
    element: at("h3", "Tracks"),
    popover: {
      title: "Tracks",
      description:
        "Categories projects compete in. Judges can be scoped to a single track or all of them.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/setup`,
    element: at("h3", "Prizes"),
    popover: {
      title: "Prizes",
      description:
        "Overall prizes or per-track prizes, each with a name, value and description.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/setup`,
    element: at("h3", "Submission questions"),
    popover: {
      title: "Submission questions",
      description:
        "Custom questions every team answers when submitting: short/long text, URL, choice or yes/no, optionally required.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/rubric`,
    element: at("h3", "Criteria"),
    popover: {
      title: "Weighted rubric",
      description:
        "Add criteria with a weight and a maximum score. Judges score each criterion on a slider; the weighted total is T = 100·Σ wᵢ·(sᵢ/maxᵢ) / Σ wᵢ.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/rubric`,
    element: at("h3", "Effective rubric per track"),
    popover: {
      title: "Effective rubric",
      description:
        "Exactly what judges see per track, with normalized weights after shared and track-specific criteria are combined.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/submissions`,
    element: at("main table"),
    popover: {
      title: "Submissions review",
      description:
        "Search and filter submissions, review each one, and mark eligibility. Only submitted, eligible projects are judged.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/submissions`,
    element: at("a", "CSV"),
    popover: {
      title: "Exports & extensions",
      description:
        "Export submissions as CSV, and grant a per-team deadline extension when organizers verify a good reason — the reason and both times are audited.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/judges`,
    element: at("h3", "Judges"),
    popover: {
      title: "Judges",
      description:
        "Each judge sees only the projects assigned to them inside their track scope — enforced by row-level security, not by hiding buttons.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/judges`,
    element: at("button", "Invite judge"),
    popover: {
      title: "Invite a judge",
      description:
        "Create a single-use link (7 days) with an optional note and track scope. The invitee accepts it, which switches their account to the judge role. Links can be revoked until used.",
      side: "left",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/judges`,
    element: at("h3", "Algorithmic routing"),
    popover: {
      title: "Algorithmic routing",
      description:
        "Deterministic and fair: most-constrained project first, least-loaded judge first, respecting track scopes, conflicts and the reviews-per-project target. Preview before you commit.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/judges`,
    element: at("h3", "Conflicts of interest"),
    popover: {
      title: "Conflicts of interest",
      description:
        "Conflicted pairs are never routed. Team members are excluded automatically, and judges can also recuse themselves.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/judges`,
    element: at("h3", "Assignments"),
    popover: {
      title: "Assignments",
      description:
        "The full assignment matrix, coverage per project and any gaps — with manual add and remove.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/results`,
    element: at('[role="tablist"][aria-label="Results lab views"]'),
    popover: {
      title: "Results lab",
      description:
        "Three views: the normalization proof, the ranking, and the Bradley–Terry pairwise ranking.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/results`,
    element: at("button", "Run normalization"),
    popover: {
      title: "Normalization",
      description:
        "Z-scores each judge (Min-Max fallback under 5 ballots) and maps to a common scale. Runs are snapshotted, and a live invariant check recomputes the maths from the stored data.",
      side: "left",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/results`,
    element: at("button", "Publish results"),
    popover: {
      title: "Publish results",
      description:
        "Publishing copies the run into the public results — ranks, normalized scores, raw means and judge counts only. Individual ballots are never exposed.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/results`,
    element: at("h3", "Exports & records"),
    popover: {
      title: "Exports & signed records",
      description:
        "Export results, raw scores and judge progress as CSV, and issue Ed25519-signed certificates for judges, participants and winners.",
      side: "top",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/votes`,
    element: at("h3", "Counted votes"),
    popover: {
      title: "Community votes",
      description:
        "Counted, flagged and rejected votes, with a per-project chart and CSV export. Tallies stay hidden from the public until the window closes.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/votes`,
    element: at("h3", "Vote log"),
    popover: {
      title: "Vote log & overrides",
      description:
        "Every vote with its voter key and IP hash. The open-mode Sybil rule flags more than three devices per IP; organizers can override with a reason, and the override is audited.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/audit`,
    element: at("label", "Search summaries and people"),
    popover: {
      title: "Audit trail",
      description:
        "Every sensitive action is hash-chained. The banner verifies the whole chain and reports the head hash; search and filter by action family, then export to CSV.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/integrations`,
    element: at("h3", "Webhooks"),
    popover: {
      title: "Webhooks",
      description:
        "Subscribe to lifecycle events. Deliveries are signed with HMAC-SHA256 (X-Dogfood-Signature), retried with exponential backoff and blocked from cloud metadata targets.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/integrations`,
    element: at("h3", "Export & clone"),
    popover: {
      title: "Export & clone",
      description:
        "Download the full event bundle as JSON and import it to clone the configuration into a new event.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/integrations`,
    element: at("h3", "Embeddable gallery"),
    popover: {
      title: "Embeddable gallery",
      description:
        "A ready-made iframe snippet publishes the project gallery on any site — no external dependencies.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.organizer,
    route: `${organize(SLUGS.judging)}/integrations`,
    element: at("h3", "Bulk registration import"),
    popover: {
      title: "Bulk import",
      description:
        "Paste a CSV of email,name[,team] to register many people at once. New accounts get a one-time password shown once.",
      side: "top",
    },
  },
];

/* ------------------------------------------------------------------ *
 * Judge journey.
 * ------------------------------------------------------------------ */
const judgeSteps: TourStep[] = [
  {
    as: ACCOUNTS.judge,
    route: "/judge",
    element: at("main h1", "Judging"),
    popover: {
      title: "Judging home",
      description:
        "Your assignments across events. You only ever see projects routed to you and your own ballots — enforced in the database.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    route: "/judge",
    element: at("a", "Queue"),
    popover: {
      title: "Per-event queue",
      description:
        "Open the review queue for an event, or jump straight into pairwise comparisons.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    route: judgeEvent(SLUGS.judging),
    element: at("main h1"),
    popover: {
      title: "Review queue",
      description:
        "Progress at a glance and every assigned project, with its scoring status. “Continue” resumes at the next unfinished project.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    route: judgeEvent(SLUGS.judging),
    before: async () => {
      await waitForSelector('main a[href*="/a/"]');
      click("main a[href*='/a/']");
    },
    element: at("main h1"),
    popover: {
      title: "Scoring a project",
      description:
        "Read the team's answers and links, then score each rubric criterion. Your ballot is private: only you and the organizers can see it.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    element: at("h2", "Your ballot"),
    popover: {
      title: "Your ballot",
      description:
        "The weighted total updates as you score. Normalization handles differences in how harsh or lenient you are.",
      side: "left",
    },
  },
  {
    as: ACCOUNTS.judge,
    element: at("input[type='range']"),
    popover: {
      title: "Criterion sliders",
      description:
        "Each slider shows the criterion's weight. Score honestly on your own scale — that is exactly what normalization is for.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    element: at("button", "I have a conflict of interest"),
    popover: {
      title: "Recuse yourself",
      description:
        "Declare a conflict and you are removed from the project and never routed to it again. The declaration is audited.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    element: at("textarea"),
    popover: {
      title: "Private notes",
      description:
        "Optional notes for the organizers. “Save progress” keeps a draft; “Submit ballot” completes the review (and audits the change).",
      side: "left",
    },
  },
  {
    as: ACCOUNTS.judge,
    route: `${judgeEvent(SLUGS.judging)}/pairwise`,
    element: at("main h1", "Which is stronger?"),
    popover: {
      title: "Pairwise ranking",
      description:
        "A Bradley–Terry model turns “which is stronger?” choices into a global ranking — useful when absolute scores are noisy.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    route: `${judgeEvent(SLUGS.judging)}/pairwise`,
    element: at("button", "A is stronger"),
    popover: {
      title: "Make a comparison",
      description:
        "Pairs are chosen where information is scarcest (fewest comparisons, closest strengths) and shown in a randomised order.",
      side: "top",
    },
  },
  {
    as: ACCOUNTS.judge,
    route: "/dashboard",
    element: at("h2", "Certificates & signed records"),
    popover: {
      title: "Your certificate",
      description:
        "Judges receive an Ed25519-signed participation record once the organizers issue certificates.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.judge,
    before: async () => {
      await waitForSelector('a[href^="/verify/"]');
      click("a[href^='/verify/']");
    },
    element: at("main h1"),
    popover: {
      title: "Public verification",
      description:
        "Anyone can verify a record from this link. The page shows the validity banner and the raw payload, signature and public key — no account needed.",
      side: "bottom",
    },
  },
];

/* ------------------------------------------------------------------ *
 * Admin journey.
 * ------------------------------------------------------------------ */
const adminSteps: TourStep[] = [
  {
    as: ACCOUNTS.admin,
    route: "/admin",
    element: at("main h1", "Administration"),
    popover: {
      title: "Administration",
      description:
        "Platform-wide accounts, roles, the global audit trail and the local mail outbox.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: "/admin",
    element: at('[role="tablist"][aria-label="Admin sections"]'),
    popover: {
      title: "Admin sections",
      description: "Overview, Users & roles, Audit trail and Mail outbox.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: "/admin",
    element: at("h3", "Role matrix"),
    popover: {
      title: "Role matrix",
      description:
        "The capability matrix that the API actually enforces. The UI only mirrors it; authorization never trusts the client.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: "/admin",
    before: tab("Users & roles"),
    element: at("label", "Search users"),
    popover: {
      title: "Users & roles",
      description:
        "Search accounts, change a role and enable or disable a user. Changing a role signs that user out of all their sessions.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: "/admin",
    before: tab("Audit trail"),
    element: at("main h1", "Administration"),
    popover: {
      title: "System audit trail",
      description:
        "The same hash-chained log, across every event on the server, verifiable end to end.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: "/admin",
    before: tab("Mail outbox"),
    element: at("main h1", "Administration"),
    popover: {
      title: "Mail outbox",
      description:
        "This offline platform never contacts an email service. Verification codes and bulk-import passwords are delivered here, where admins can read them.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: organize(SLUGS.draft),
    element: at("main h1"),
    popover: {
      title: "Private drafts",
      description:
        "Drafts are invisible to the public. Admins can open and manage any event on the server, including ones owned by other organizers.",
      side: "bottom",
    },
  },
  {
    as: ACCOUNTS.admin,
    route: organize(SLUGS.draft),
    element: at("button", "Publish"),
    popover: {
      title: "Publish when ready",
      description:
        "Publishing reveals the event to everyone. You can return to draft later — as long as nobody has registered yet.",
      side: "bottom",
    },
  },
];

/** Remove session switching so a role tour never logs the viewer in or out. */
function stripAs(steps: TourStep[]): TourStep[] {
  return steps.map(({ as: _as, ...step }) => step);
}

/** A guided tour of the features available to the given role (no login/logout). */
export function roleTour(role: Role | null): TourStep[] {
  switch (role) {
    case "organizer":
      return stripAs([...shellSteps, ...organizerSteps]);
    case "admin":
      return stripAs([...shellSteps, ...adminSteps, ...organizerSteps]);
    case "judge":
      return stripAs([...shellSteps, ...judgeSteps]);
    case "participant":
      return stripAs([...shellSteps, ...participantSteps]);
    case "visitor":
      return stripAs([...shellSteps, ...visitorSteps]);
    default:
      return stripAs([...shellSteps, ...publicSteps]);
  }
}

/**
 * The full, end-to-end product demo: every role and every feature, signing in
 * and out of the seeded demo accounts as it goes.
 */
export const FULL_DEMO: TourStep[] = [
  ...shellSteps,
  ...publicSteps,
  ...visitorSteps,
  ...participantSteps,
  ...organizerSteps,
  ...judgeSteps,
  ...adminSteps,
];
