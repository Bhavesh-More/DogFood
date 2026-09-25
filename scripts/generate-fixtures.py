#!/usr/bin/env python3
"""Generate fixtures.json (dogfood.fixtures.v1).

The output is fully deterministic: re-running this script produces a
byte-identical file. Timestamps are relative ("now-6h") and resolved by the
seeder at boot so the demo is always in a meaningful state:

  evt_01  Sample Hack 2026      judging + open community voting (normalization demo)
  evt_02  Autumn Build Week     submissions open (drafts, invites, deadline countdown)
  evt_03  Spring Hack 2026      archived, results published, signed certificates
  evt_04  Winter Jam 2027       draft owned by another organizer (tenant isolation)

Usage: python3 scripts/generate-fixtures.py > fixtures.json
"""
import json

DEFAULT_PASSWORD = "dogfood-demo-2026"

users = [
    {"id": "usr_admin", "email": "admin@dogfood.local", "name": "Ada Lovelace", "role": "admin"},
    {"id": "usr_organizer", "email": "organizer@dogfood.local", "name": "Oscar Okafor", "role": "organizer"},
    {"id": "usr_organizer2", "email": "organizer2@dogfood.local", "name": "Grace Hopper", "role": "organizer"},
    {"id": "usr_judge_a", "email": "judge.a@dogfood.local", "name": "Jade Park", "role": "judge"},
    {"id": "usr_judge_b", "email": "judge.b@dogfood.local", "name": "Bruno Silva", "role": "judge"},
    {"id": "usr_judge_c", "email": "judge.c@dogfood.local", "name": "Chen Wei", "role": "judge"},
    {"id": "usr_judge_d", "email": "judge.d@dogfood.local", "name": "Dara Nguyen", "role": "judge"},
    {"id": "usr_judge_e", "email": "judge.e@dogfood.local", "name": "Emeka Obi", "role": "judge"},
    {"id": "usr_judge_f", "email": "judge.f@dogfood.local", "name": "Farah Haddad", "role": "judge"},
    {"id": "usr_participant", "email": "participant@dogfood.local", "name": "Priya Sharma", "role": "participant"},
    {"id": "usr_participant2", "email": "participant2@dogfood.local", "name": "Mateo Rossi", "role": "participant"},
    {"id": "usr_visitor", "email": "visitor@dogfood.local", "name": "Victor Hugo", "role": "visitor"},
]

FIRST = ["Aarav", "Bea", "Carlos", "Divya", "Elif", "Finn", "Gita", "Hana", "Ivan", "Jia", "Kofi", "Lina",
         "Milo", "Nora", "Omar", "Pia", "Quinn", "Rhea", "Sami", "Tara", "Uma", "Vik", "Wen", "Xena",
         "Yusuf", "Zoe", "Arjun", "Bianca", "Cyrus", "Dalia", "Ezra", "Fatima", "Gabe", "Ines", "Joon",
         "Kiara", "Leo", "Maya"]
LAST = ["Mehta", "Novak", "Reyes", "Iyer", "Kaya", "Larsen", "Rao", "Sato", "Petrov", "Li", "Mensah",
        "Haddad", "Fischer", "Costa", "Farouk", "Weber", "Adams", "Kapoor", "Aziz", "Singh", "Menon",
        "Varga", "Zhou", "Nikolaidis", "Demir", "Laurent", "Nair", "Romano", "Tehrani", "Cohen",
        "Mizrahi", "Bello", "Ortiz", "Moreau", "Kim", "Das", "Brennan", "Lopez"]
for i in range(1, 39):
    users.append({
        "id": f"usr_p{i:02d}",
        "email": f"p{i:02d}@dogfood.local",
        "name": f"{FIRST[i - 1]} {LAST[i - 1]}",
        "role": "participant",
    })

checker_sessions = [
    {"userId": "usr_admin", "token": "dfc_admin_4f9c2e7a1b8d60536e21", "label": "checker: admin"},
    {"userId": "usr_organizer", "token": "dfc_organizer_8b1d3f5a7c9e20461a", "label": "checker: organizer"},
    {"userId": "usr_judge_a", "token": "dfc_judge_a_2c4e6a8b0d1f39571b", "label": "checker: judge A"},
    {"userId": "usr_judge_b", "token": "dfc_judge_b_9e7c5a3b1d2f40682c", "label": "checker: judge B"},
    {"userId": "usr_judge_f", "token": "dfc_judge_f_5a1c9e3b7d2f60843d", "label": "checker: track judge"},
    {"userId": "usr_participant", "token": "dfc_participant_7d3b1f9e5c2a48064e", "label": "checker: participant"},
    {"userId": "usr_participant2", "token": "dfc_participant2_3e9a7c1d5b2f86024f", "label": "checker: participant 2"},
    {"userId": "usr_visitor", "token": "dfc_visitor_1b5d9f3a7e2c64080a", "label": "checker: visitor"},
]


def project(pid, title, tagline, description, track, tags, quality, hardest, offline=True,
            license="MIT", status="submitted", submitted_at="now-8h", eligibility="eligible", note="",
            qset=("qst_01_hardest", "qst_01_offline", "qst_01_license")):
    slug = title.lower().replace(" ", "-")
    answers = {qset[0]: hardest, qset[1]: offline, qset[2]: license} if qset else {}
    return {
        "id": pid,
        "title": title,
        "tagline": tagline,
        "description": description,
        "trackId": track,
        "repoUrl": f"https://github.com/dogfood-demo/{slug}",
        "demoVideoUrl": f"https://videos.example.org/{slug}",
        "liveUrl": "",
        "techTags": tags,
        "answers": answers,
        "status": status,
        **({"submittedAt": submitted_at} if status == "submitted" else {}),
        "eligibility": eligibility,
        "eligibilityNote": note,
        "quality": quality,
    }


T_TOOLS, T_AI, T_CIVIC = "trk_01_tools", "trk_01_ai", "trk_01_civic"

evt01_teams = [
    ("team_01_01", "Null Pointers", ["usr_participant", "usr_p01"], project(
        "sub_01_01", "Deadline Sentinel", "A server-clock-true countdown you can embed anywhere",
        "Deadline Sentinel is a tiny widget and CLI that shows the authoritative server-side time to every "
        "participant, flags client clock drift, and posts a warning to the team channel an hour before cutoff. "
        "It never trusts the browser clock.",
        T_TOOLS, ["typescript", "cli", "time"], 0.71,
        "Clock drift detection without NTP: we estimate offset from round-trip timing to the portal.")),
    ("team_01_02", "Byte Club", ["usr_p02", "usr_p03"], project(
        "sub_01_02", "Schema Scout", "Visual, reviewable Postgres schema diffs",
        "Schema Scout renders two database schemas side by side, highlights breaking changes (dropped columns, "
        "narrowed types, missing indexes) and generates a reversible migration plan with a risk score.",
        T_TOOLS, ["postgres", "go", "migrations"], 0.86,
        "Detecting renames versus drop-and-add without false positives.")),
    ("team_01_03", "Merge Conflict", ["usr_p04", "usr_p05", "usr_p06"], project(
        "sub_01_03", "Flaky Hunter", "Finds and quarantines flaky tests before they waste your CI minutes",
        "Flaky Hunter replays your test suite under controlled randomness (seed, ordering, timing) and uses "
        "Bayesian failure-rate estimates to separate flaky tests from real regressions.",
        T_TOOLS, ["python", "ci", "testing"], 0.62,
        "Reproducing timing-dependent failures deterministically.")),
    ("team_01_04", "Stack Smashers", ["usr_p07"], project(
        "sub_01_04", "Offline Docs", "Instant full-text search across your dependencies' docs, no network",
        "Offline Docs indexes the documentation of every package in your lockfile into a 20 MB local index "
        "and serves sub-10ms search in the terminal and editor.",
        T_TOOLS, ["rust", "search", "offline"], 0.78,
        "Fitting a BM25 index with typo tolerance into a small memory budget.")),
    ("team_01_05", "The Linters", ["usr_p08", "usr_p09"], project(
        "sub_01_05", "Commit Coach", "Commit message feedback that actually teaches",
        "Commit Coach reviews staged changes and suggests a conventional-commit message, explaining each "
        "suggestion so junior developers learn the convention rather than copy it.",
        T_TOOLS, ["typescript", "git", "dx"], 0.41,
        "Summarising large diffs without a language model.")),
    ("team_01_06", "Race Condition", ["usr_p10", "usr_p11"], project(
        "sub_01_06", "Lock Radar", "Visualise lock contention in production Postgres",
        "Lock Radar samples pg_locks and pg_stat_activity to build a live wait-for graph, spotting deadlock "
        "cycles and the queries that cause them.",
        T_TOOLS, ["postgres", "observability", "graphs"], 0.55,
        "Sampling often enough to catch short waits without adding load.")),
    ("team_01_07", "Gradient Descent", ["usr_p12", "usr_p13"], project(
        "sub_01_07", "Whisper Notes", "On-device meeting transcription and action items",
        "Whisper Notes runs a quantised speech model locally, diarises speakers and extracts action items, "
        "so sensitive meetings never leave the laptop.",
        T_AI, ["python", "speech", "on-device"], 0.83,
        "Real-time diarisation on a CPU-only laptop.")),
    ("team_01_08", "Overfitters", ["usr_p14", "usr_p15", "usr_p16"], project(
        "sub_01_08", "Tiny Tutor", "A patient maths tutor that works on a 2 GB phone, offline",
        "Tiny Tutor pairs a small local language model with a curriculum graph so students in low-bandwidth "
        "regions get step-by-step hints instead of answers.",
        T_AI, ["kotlin", "llm", "education"], 0.91,
        "Keeping a 1B-parameter model responsive on low-end Android devices.")),
    ("team_01_09", "Tensor Tots", ["usr_p17", "usr_p18"], project(
        "sub_01_09", "Alt-Text Lens", "Meaningful image descriptions for screen-reader users",
        "Alt-Text Lens generates context-aware alt text for images in documents and flags decorative images, "
        "with a review queue for editors.",
        T_AI, ["accessibility", "vision", "typescript"], 0.67,
        "Evaluating description quality with blind and low-vision testers.")),
    ("team_01_10", "Prompt Injection", ["usr_p19", "usr_p20"], project(
        "sub_01_10", "Guardrail Bench", "A reproducible benchmark for prompt-injection defences",
        "Guardrail Bench ships 1,200 adversarial cases and a harness that scores guardrail libraries on "
        "precision, recall and latency, fully offline.",
        T_AI, ["security", "llm", "benchmark"], 0.58,
        "Writing attacks that generalise instead of overfitting to one model.")),
    ("team_01_11", "Latent Space", ["usr_p21", "usr_p22"], project(
        "sub_01_11", "Crop Doctor", "Plant disease detection from a phone photo, no signal needed",
        "Crop Doctor classifies 38 crop diseases on-device and recommends locally available treatments, "
        "designed with smallholder farmers.",
        T_AI, ["mobile", "vision", "agriculture"], 0.74,
        "Collecting field photos that match real lighting conditions.")),
    ("team_01_12", "Open Ballot", ["usr_p23", "usr_p24"], project(
        "sub_01_12", "Ward Watch", "Residents report, the council responds, everyone sees the SLA",
        "Ward Watch is a municipal issue tracker with public response-time dashboards and duplicate report "
        "merging, deployable on a single council server.",
        T_CIVIC, ["civic", "maps", "postgres"], 0.64,
        "Merging duplicate reports by location and description similarity.")),
    ("team_01_13", "Public Good", ["usr_p25", "usr_p26"], project(
        "sub_01_13", "Transit Pulse", "Crowd-sourced bus reliability for cities without open data",
        "Transit Pulse lets riders tap when a bus arrives and turns those taps into reliability scores per "
        "route and stop, with privacy-preserving aggregation.",
        T_CIVIC, ["mobility", "privacy", "react"], 0.47,
        "Making aggregated data useful without exposing individual trips.")),
    ("team_01_14", "Civic Hackers", ["usr_p27", "usr_p28"], project(
        "sub_01_14", "Budget Lens", "Explore your city's budget like a map",
        "Budget Lens turns council budget PDFs into an explorable treemap with year-over-year diffs and "
        "plain-language explanations.",
        T_CIVIC, ["data-viz", "pdf", "civic"], 0.69,
        "Extracting tables reliably from inconsistent PDF layouts.")),
    ("team_01_15", "Mesh Makers", ["usr_p29", "usr_p30", "usr_p31"], project(
        "sub_01_15", "FloodNet", "LoRa mesh flood alerts that work when the grid is down",
        "FloodNet uses cheap LoRa river sensors and a mesh of solar relays to push flood warnings to "
        "villages downstream, with no dependence on cellular networks.",
        T_CIVIC, ["hardware", "lora", "resilience"], 0.88,
        "Keeping relays alive through a week of monsoon cloud cover.")),
    ("team_01_16", "Data Commons", ["usr_p32", "usr_p33"], project(
        "sub_01_16", "Clinic Queue", "Fair, SMS-free queueing for walk-in clinics",
        "Clinic Queue gives patients a paper ticket with a QR code and shows a live queue on a TV, so no one "
        "waits outside and priority cases are visible to staff.",
        T_CIVIC, ["health", "qr", "offline"], 0.52,
        "Designing for clinics with one shared computer and unreliable power.")),
    ("team_01_17", "Time Travellers", ["usr_p34", "usr_p35"], project(
        "sub_01_17", "Retro Relay", "A community radio schedule for neighbourhood announcements",
        "Retro Relay publishes neighbourhood announcements to low-power FM and a web page simultaneously.",
        T_CIVIC, ["radio", "community"], 0.60,
        "Scheduling around licensing windows.", eligibility="ineligible",
        note="Repository history shows the project was built before kickoff.")),
    ("team_01_18", "Late Night Crew", ["usr_p36"], project(
        "sub_01_18", "Half Baked", "We ran out of time",
        "An unfinished idea about recipe sharing.", T_TOOLS, ["wip"], 0.30,
        "Time management.", status="draft")),
]

evt01 = {
    "id": "evt_01",
    "slug": "sample-hack-2026",
    "name": "Sample Hack 2026",
    "tagline": "72 hours. One spec. Judged by the platform you build.",
    "description": (
        "Sample Hack 2026 is a 72-hour online sprint for builders of developer tools, applied AI and civic "
        "technology. Teams of one to four ship a working project, submit before the hard UTC deadline and are "
        "judged by a panel using a weighted rubric. Scores are normalized across judges so a strict judge "
        "cannot sink a project and a generous one cannot float it."
    ),
    "rules": (
        "1. Teams of 1–4. One team per person.\n"
        "2. All code must be written during the event and published under an OSI-approved licence.\n"
        "3. The submission deadline is enforced by the server clock in UTC. There are no late submissions.\n"
        "4. Judges score against the published rubric; conflicts of interest are declared and excluded.\n"
        "5. Community voting is open to everyone; automated or duplicate votes are flagged and not counted."
    ),
    "location": "Online · Worldwide",
    "status": "published",
    "startsAt": "now-3d6h",
    "submissionDeadline": "now-6h",
    "judgingEndsAt": "now+7d",
    "votingOpensAt": "now-6h",
    "votingClosesAt": "now+2d",
    "minTeamSize": 1,
    "maxTeamSize": 4,
    "votingMode": "open",
    "votingStyle": "single",
    "voteBudget": 3,
    "reviewsPerSubmission": 3,
    "organizers": ["usr_organizer"],
    "tracks": [
        {"id": T_TOOLS, "name": "Developer Tools", "description": "Make developers faster, safer or happier."},
        {"id": T_AI, "name": "Applied AI", "description": "Useful machine learning that runs where people are."},
        {"id": T_CIVIC, "name": "Civic Tech", "description": "Technology for communities and public services."},
    ],
    "prizes": [
        {"name": "Grand Prize", "description": "Best overall project across all tracks.", "value": "₹80,000"},
        {"name": "Runner-up", "description": "Second place overall.", "value": "₹50,000"},
        {"name": "Best Developer Tool", "description": "Top project in Developer Tools.", "value": "₹15,000", "trackId": T_TOOLS},
        {"name": "Best Applied AI", "description": "Top project in Applied AI.", "value": "₹15,000", "trackId": T_AI},
        {"name": "Best Civic Tech", "description": "Top project in Civic Tech.", "value": "₹15,000", "trackId": T_CIVIC},
        {"name": "Community Choice", "description": "Most community votes after anti-abuse filtering.", "value": "₹10,000"},
    ],
    "questions": [
        {"id": "qst_01_hardest", "label": "What was the hardest technical problem you solved?", "kind": "textarea", "required": True},
        {"id": "qst_01_offline", "label": "Does your project run fully offline?", "kind": "boolean", "required": False},
        {"id": "qst_01_license", "label": "Open-source licence", "kind": "select", "required": True,
         "options": ["MIT", "Apache-2.0", "GPL-3.0", "MPL-2.0", "Other OSI-approved"]},
    ],
    "criteria": [
        {"id": "crt_01_impact", "name": "Impact", "description": "Does it solve a real problem for real people?", "weight": 0.30, "maxScore": 10},
        {"id": "crt_01_tech", "name": "Technical depth", "description": "Difficulty, correctness and engineering quality.", "weight": 0.30, "maxScore": 10},
        {"id": "crt_01_design", "name": "Design & UX", "description": "Is it usable, accessible and polished?", "weight": 0.20, "maxScore": 10},
        {"id": "crt_01_pitch", "name": "Presentation", "description": "Clarity of the demo and documentation.", "weight": 0.20, "maxScore": 10},
        {"id": "crt_01_ai_safety", "name": "Responsible AI", "description": "Privacy, bias and failure modes are handled.", "weight": 0.15, "maxScore": 10, "trackId": T_AI},
    ],
    "judges": [
        {"userId": "usr_judge_a"}, {"userId": "usr_judge_b"}, {"userId": "usr_judge_c"},
        {"userId": "usr_judge_d"}, {"userId": "usr_judge_e"},
        {"userId": "usr_judge_f", "trackIds": [T_CIVIC]},
    ],
    "teams": [{"id": tid, "name": name, "members": members, "submission": sub} for tid, name, members, sub in evt01_teams],
    "judging": {
        "assign": True,
        "noise": 0.7,
        "judgeProfiles": {
            "usr_judge_a": {"leniency": -2.6, "spread": 0.75, "completion": 1.0},
            "usr_judge_b": {"leniency": 2.4, "spread": 0.55, "completion": 1.0},
            "usr_judge_c": {"leniency": 0.0, "spread": 1.0, "completion": 1.0},
            "usr_judge_d": {"leniency": -0.6, "spread": 1.1, "completion": 0.8},
            "usr_judge_e": {"leniency": 0.9, "spread": 0.9, "completion": 1.0},
            "usr_judge_f": {"leniency": 0.3, "spread": 1.0, "completion": 0.6},
        },
        "pairwise": {"judges": ["usr_judge_c", "usr_judge_e"], "comparisonsPerJudge": 14},
        "conflicts": [{"judgeId": "usr_judge_c", "submissionId": "sub_01_13", "reason": "Former colleague of a team member"}],
    },
    "votes": {"voters": 48, "perVoter": 2, "sybil": {"submissionId": "sub_01_05", "voters": 7}},
    "comments": [
        {"submissionId": "sub_01_08", "userId": "usr_visitor", "body": "This is exactly what rural schools need. Does it support Hindi?"},
        {"submissionId": "sub_01_08", "userId": "usr_p15", "body": "Hindi and Tamil curricula are in progress — thanks!"},
        {"submissionId": "sub_01_15", "userId": "usr_p02", "body": "The relay power budget write-up is fantastic."},
        {"submissionId": "sub_01_02", "userId": "usr_visitor", "body": "Would love a GitHub Action for this."},
        {"submissionId": "sub_01_07", "userId": "usr_p24", "body": "Diarisation accuracy in the demo is impressive for CPU-only."},
    ],
    "pendingJudgeInvites": [{"note": "Guest judge from a sponsor", "trackIds": [T_AI]}],
}

evt02 = {
    "id": "evt_02",
    "slug": "autumn-build-week",
    "name": "Autumn Build Week 2026",
    "tagline": "Ship something open source in a week. Submissions are open now.",
    "description": (
        "A relaxed, week-long build for open-source tools and learning resources. Form a team with an invite "
        "link, keep your draft up to date and lock it in before the countdown hits zero."
    ),
    "rules": "Teams of 1–3. Drafts can be edited until the deadline; after that the server rejects every change.",
    "location": "Online",
    "status": "published",
    "startsAt": "now-1d",
    "submissionDeadline": "now+3d",
    "judgingEndsAt": "now+10d",
    "votingOpensAt": "now+3d",
    "votingClosesAt": "now+5d",
    "maxTeamSize": 3,
    "votingMode": "email",
    "votingStyle": "quadratic",
    "voteBudget": 25,
    "reviewsPerSubmission": 2,
    "organizers": ["usr_organizer"],
    "registrations": ["usr_participant2", "usr_p37"],
    "tracks": [
        {"id": "trk_02_oss", "name": "Open Source", "description": "Libraries, tools and infrastructure."},
        {"id": "trk_02_edu", "name": "Education", "description": "Teaching and learning resources."},
    ],
    "prizes": [
        {"name": "Best Project", "description": "Highest normalized score.", "value": "₹25,000"},
        {"name": "Community Choice", "description": "Quadratic community vote.", "value": "₹5,000"},
    ],
    "questions": [
        {"id": "qst_02_license", "label": "Licence", "kind": "select", "required": True, "options": ["MIT", "Apache-2.0", "GPL-3.0"]},
        {"id": "qst_02_help", "label": "What kind of help would you like from mentors?", "kind": "textarea"},
    ],
    "criteria": [
        {"id": "crt_02_useful", "name": "Usefulness", "weight": 0.4, "maxScore": 10},
        {"id": "crt_02_quality", "name": "Code quality", "weight": 0.35, "maxScore": 10},
        {"id": "crt_02_docs", "name": "Documentation", "weight": 0.25, "maxScore": 5},
    ],
    "judges": [{"userId": "usr_judge_a"}, {"userId": "usr_judge_c"}],
    "teams": [
        {"id": "team_02_01", "name": "Night Owls", "members": ["usr_participant"], "submission": project(
            "sub_02_01", "Pantry Planner", "Turn what's in your cupboard into a week of meals",
            "Pantry Planner suggests recipes from what you already have and builds a shopping list for the gaps.",
            "trk_02_oss", ["svelte", "food"], 0.6, "", status="draft", qset=None)},
        {"id": "team_02_02", "name": "Pixel Pushers", "members": ["usr_p38", "usr_p36"], "submission": project(
            "sub_02_02", "Colour Contrast Coach", "Teach designers WCAG contrast by example",
            "An interactive tutorial that fixes contrast failures live in your palette.",
            "trk_02_edu", ["a11y", "design"], 0.7, "", status="draft", qset=None)},
        {"id": "team_02_03", "name": "Quantum Quokkas", "members": ["usr_p37"], "submission": project(
            "sub_02_03", "Regex Dojo", "Learn regular expressions through tiny daily katas",
            "Regex Dojo serves one bite-sized regex challenge per day with instant, visual feedback on what "
            "your pattern matched and why.",
            "trk_02_edu", ["education", "regex", "typescript"], 0.75, "", submitted_at="now-2h",
            qset=("qst_02_license", "qst_02_help", "qst_02_license"))},
    ],
    "pendingJudgeInvites": [{"note": "Mentor from the community", "trackIds": []}],
}
# Fix the answers for the submitted evt_02 project (single licence answer + help text).
evt02["teams"][2]["submission"]["answers"] = {"qst_02_license": "MIT", "qst_02_help": "Feedback on the difficulty curve."}

evt03_projects = [
    ("Pocket Planetarium", "Offline star maps for night-sky walks", 0.82, ["usr_p01", "usr_p02"]),
    ("Queue Tips", "Shorter lines at the canteen with a 3-button kiosk", 0.55, ["usr_p03"]),
    ("Leaf Ledger", "Community garden plot sharing", 0.64, ["usr_p04", "usr_p05"]),
    ("Bug Bounty Board", "A friendly on-ramp to responsible disclosure", 0.71, ["usr_p06", "usr_p07"]),
    ("Sign Sprint", "Learn sign language alphabets with your webcam", 0.9, ["usr_p08", "usr_p09", "usr_p10"]),
    ("Repair Radar", "Find someone nearby who can fix it", 0.48, ["usr_p11"]),
    ("Study Swarm", "Anonymous study groups by course code", 0.6, ["usr_p12", "usr_p13"]),
    ("Water Watch", "Borewell level logging for farmers", 0.77, ["usr_p14", "usr_p15"]),
]
evt03 = {
    "id": "evt_03",
    "slug": "spring-hack-2026",
    "name": "Spring Hack 2026",
    "tagline": "Last season's hackathon — results, certificates and signed judge records.",
    "description": "A 48-hour spring hackathon. Judging is complete, results are published and every judge and participant received a signed, verifiable record.",
    "rules": "Teams of 1–4. Quadratic community voting with 25 credits per voter.",
    "location": "Online",
    "status": "archived",
    "startsAt": "now-120d",
    "submissionDeadline": "now-118d",
    "judgingEndsAt": "now-110d",
    "votingOpensAt": "now-118d",
    "votingClosesAt": "now-115d",
    "votingMode": "open",
    "votingStyle": "quadratic",
    "voteBudget": 25,
    "reviewsPerSubmission": 3,
    "organizers": ["usr_organizer", "usr_organizer2"],
    "tracks": [],
    "prizes": [{"name": "Winner", "description": "Top normalized score.", "value": "₹30,000"}],
    "criteria": [
        {"id": "crt_03_idea", "name": "Idea", "weight": 1, "maxScore": 10},
        {"id": "crt_03_build", "name": "Build", "weight": 2, "maxScore": 10},
        {"id": "crt_03_demo", "name": "Demo", "weight": 1, "maxScore": 10},
    ],
    "judges": [{"userId": "usr_judge_a"}, {"userId": "usr_judge_b"}, {"userId": "usr_judge_c"}, {"userId": "usr_judge_e"}],
    "teams": [
        {"id": f"team_03_{i + 1:02d}", "name": f"Team {title.split()[0]}", "members": members, "submission": project(
            f"sub_03_{i + 1:02d}", title, tagline, f"{title}: {tagline}. Built in 48 hours during Spring Hack 2026.",
            None, ["spring-hack"], q, "", submitted_at="now-118d1h", qset=None)}
        for i, (title, tagline, q, members) in enumerate(evt03_projects)
    ],
    "judging": {
        "assign": True,
        "noise": 0.6,
        "judgeProfiles": {
            "usr_judge_a": {"leniency": -2.0, "spread": 0.8},
            "usr_judge_b": {"leniency": 2.0, "spread": 0.6},
        },
        "pairwise": {"judges": ["usr_judge_c"], "comparisonsPerJudge": 10},
    },
    "votes": {"voters": 30, "perVoter": 3},
    "publishResultsAt": "now-109d",
    "issueRecords": True,
}

evt04 = {
    "id": "evt_04",
    "slug": "winter-jam-2027",
    "name": "Winter Jam 2027",
    "tagline": "Draft — only its organizers can see this.",
    "description": "Planning in progress.",
    "status": "draft",
    "startsAt": "now+60d",
    "submissionDeadline": "now+63d",
    "organizers": ["usr_organizer2"],
    "tracks": [{"id": "trk_04_games", "name": "Games", "description": "Small games with big ideas."}],
    "criteria": [{"id": "crt_04_fun", "name": "Fun", "weight": 1, "maxScore": 10}],
}

fixtures = {
    "format": "dogfood.fixtures.v1",
    "description": (
        "Deterministic demo data for the Dogfood portal. Every account uses the password "
        f"'{DEFAULT_PASSWORD}'. Checker session tokens are mirrored in .dogfood.toml."
    ),
    "defaultPassword": DEFAULT_PASSWORD,
    "users": users,
    "checkerSessions": checker_sessions,
    "events": [evt01, evt02, evt03, evt04],
}

print(json.dumps(fixtures, indent=2, ensure_ascii=False))
