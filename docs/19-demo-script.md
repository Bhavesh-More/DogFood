# 19 — Demo Video Script (≈ 4 minutes)

Record on a freshly seeded stack. Seed times are relative, so every event
lands in the phase the script expects. Browser window: 1440×900, light
theme; switch to dark once in scene 6.

```bash
docker compose down -v && docker compose up --build   # wait for "listening on http://localhost:8000"
```

Keep a second terminal ready for scene 8. Demo password for every account:
`dogfood-demo-2026`.

---

## 0:00 — Hook (15 s)
**Screen:** the home page (`/`).
**Say:** "Hackathon judging is unfair in a predictable way: one strict judge
can sink a great project. Dogfood Portal runs the whole competition and
corrects for that, with statistics you can check. It's all offline, from
one `docker compose up`."

## 0:15 — Participant: hard deadline (40 s)
1. Sign in as `participant@dogfood.local`. Open **Autumn Build Week → Team**,
   copy an invite link, and point out that it's single-use and expires in 72 h.
2. Open **Submit**. The countdown is driven by the server clock. Edit the
   tagline, then **Save**.
3. Open **Sample Hack 2026 → Submit**. Its deadline has passed, so the
   editor is locked.

**Say:** "The deadline is the server's UTC clock. The API refuses late
edits, and even if it didn't, a database trigger would."

## 0:55 — Judge: isolation and rubric (40 s)
1. Sign in as `judge.a@dogfood.local` (the strict judge). Open **Judging →
   Sample Hack 2026**. The queue was routed to her: balanced, with no
   conflicts.
2. Open a project and move the rubric sliders. The weighted total updates
   live. Point at the banner: "Only you and the organizers can see this
   ballot."
3. Paste another judge's assignment URL. The page shows **You don't have
   access**, `NOT_YOUR_ASSIGNMENT`.

**Say:** "Isolation is enforced by Postgres Row-Level Security, not only by
the API. Our tests run raw SQL as the app role and still see nothing."

## 1:35 — Organizer: routing and the Results Lab (60 s)
1. Sign in as `organizer@dogfood.local`. Open **Sample Hack 2026 → Judges**: progress per judge, one track-scoped judge, and
   **Preview**, the routing dry run.
2. Open **Results lab → Run normalization**.
   - *Judge leniency* chart: Jade −27.5 (strict), Bruno +13.6 (lenient).
   - *Before and after* strip plots: every judge centred on 70 afterwards.
   - The Farah row: Min-Max fallback, because she has only 4 ballots.
   - Stat tiles: invariants hold; Spearman 0.865.
3. Open **Ranking**. Point out that *Tiny Tutor* moves from raw rank 3 to 1:
   the strict judge's 58 was a top mark for her.

**Say:** "A judge's Z-score cancels both their leniency and how much of the
scale they use. JUDGING.md has the proof, and the acceptance runner
recomputes every number."

## 2:35 — Community voting and abuse controls (35 s)
1. Open the **Sample Hack gallery** in a private window. The banner reads
   *Community voting is open*; the order is shuffled per viewer, and the
   tallies are hidden.
2. **Back** two projects. The budget meter fills; a third pick is refused.
3. As the organizer, open **Voting**. The seeded Sybil cluster is *flagged*
   (7 devices behind one IP) and excluded until reviewed.

## 3:10 — Results, records, platform (35 s)
1. Open **Spring Hack 2026 → Results**: the podium, the leaderboard with raw
   vs normalized scores, pairwise rank, and community choice.
2. Open a certificate (**Verify**). It shows *Signature valid* and the
   Ed25519 public key.
3. Open **API docs** (`/api-docs`): 116 operations, generated from the live
   route table.
4. Toggle **dark theme** once and show the Results Lab.

## 3:45 — Proof it works (15 s)
**Screen:** the terminal.

```bash
python3 acceptance/run.py .dogfood.toml > acceptance-report.txt; tail -12 acceptance-report.txt
```

**Say:** "38 checks, tier by tier. It waits for a real deadline, verifies
signatures with its own Ed25519 code and re-derives the normalization.
Tier 4 is verified. MIT licensed, and it works offline."

---

### Recording checklist
- [ ] Fresh stack (`down -v`) so the seed windows are current.
- [ ] Browser zoom at 100 %, no extensions, notifications off.
- [ ] Private windows for the anonymous voter and the second judge.
- [ ] Terminal font ≥ 16 pt for the acceptance run.
