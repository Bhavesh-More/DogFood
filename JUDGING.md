# Judging, normalization and ranking

This document specifies every number the platform produces between the moment a
judge moves a slider and the moment a leaderboard is published, and proves
the properties we rely on. The code is in `src/core/src/normalization.ts`,
`bradley-terry.ts` and `assignment.ts`. It is covered by `tests/unit/*` and
recomputed independently by the acceptance runner (`acceptance/run.py`, checks
T2.06, T2.07, B.01 and B.02).

```
rubric scores ──► weighted total T (0–100) ──► per-judge normalization z ──► N = 70 + 15·z
                                                                                 │
                           rank ◄── mean N per project (+ disagreement σ_N) ◄─────┘
```

## 1. Routing: who judges what

`planAssignments` gives every submitted, eligible project `k` distinct judges
(`reviewsPerSubmission`, default 3), subject to these hard constraints:

- **Track scope.** A judge scoped to tracks only receives projects in those tracks.
- **Conflicts.** Team members of a project are never assigned to it, and neither
  are judges with a declared or self-reported conflict (recusal).
- **Uniqueness.** A judge never gets the same project twice.
- **Optional cap.** No judge exceeds `maxPerJudge`.

**Strategy.** Projects with the fewest eligible judges are placed first, so
scarce specialists are not used up by easy projects. For each project, the
least-loaded eligible judges are chosen. Ties are broken with a 32-bit
FNV-1a hash of `(judge, project)` finished with the murmur3 `fmix32`
avalanche. That spreads pairings, so the same judges don't always end up
together, while keeping the plan fully deterministic for auditing. A
regression test checks that the hash is well distributed. Existing
assignments are kept, so re-running only fills gaps.

**Balance.** When constraints allow it, loads differ by at most one. The
greedy rule adds each review to a minimum-load judge, so the spread can only
exceed one when the eligible pool itself is restricted. Anything left
unplaced is reported as a *shortfall* (`no_eligible_judges` or
`insufficient_judges`), never silently dropped. The organizer previews every
plan with `dryRun: true` before anything is written.

## 2. The weighted rubric total

Criteria are event-wide, or belong to a single track. A project in track `t`
is scored on the event-wide criteria plus the criteria of track `t`. For those
criteria `c`, with weight `w_c > 0`, maximum `M_c` and score `s_c ∈ [0, M_c]`:

$$T = 100 \cdot \frac{\sum_c w_c \, s_c / M_c}{\sum_c w_c}$$

`T` is always on a 0–100 scale. Weights are relative, so `2 : 1 : 1` equals
`50 % : 25 % : 25 %`. `T` is recomputed from the stored per-criterion scores
every time normalization runs; a cached total is never trusted. Ballots
missing any applicable criterion are rejected on submit (`INVALID_BALLOT`),
and scores above `M_c` are rejected at write time by the API and by a
database trigger.

## 3. Per-judge normalization

Let judge `j` have submitted `n_j` ballots with totals `T_1 … T_n`,
mean `μ_j`, population standard deviation `σ_j`, and `ε = 10⁻⁶`.
Organizers configure the display target `(m*, s*) = (70, 15)` and the
sample-size threshold `n_min = 5`.

**Z-score** (`n_j ≥ n_min`):

$$z_{ij} = \frac{T_{ij} - \mu_j}{\sigma_j + \varepsilon}$$

**Min-Max fallback** (`n_j < n_min`):

$$x_{ij} = \frac{T_{ij} - \min_j}{\max_j - \min_j + \varepsilon}, \qquad x_{ij} = \tfrac12 \text{ if } \max_j = \min_j, \qquad z_{ij} = (2x_{ij} - 1)\sqrt{3}$$

**Display score:** `N_ij = m* + s*·z_ij`

### Proofs

**Theorem 1 — standardization.** For a Z-score judge, the mean of `z` is
exactly 0 and its SD is `σ/(σ+ε)`. The normalized scores therefore have mean
exactly `m*` and SD `s*·σ/(σ+ε)`, which is within `10⁻⁶·s*/σ` of `s*`.

*Proof.* `Σ_i (T_i − μ) = 0`, so `mean(z) = 0`. `z` is `T` shifted by `−μ`
and scaled by `1/(σ+ε)`, so `sd(z) = σ/(σ+ε)`. The map `z ↦ m* + s*z` is
affine, which gives `mean(N) = m*` and `sd(N) = s*·sd(z)`. ∎

Every run evaluates these two equalities per judge (tolerance `10⁻⁶`) and
stores the result in the run's `invariants` array. The Results Lab shows them
and the acceptance runner re-derives every entry from the raw totals.

**Theorem 2 — leniency and harshness cancel.** Suppose judge `j` applies
an increasing affine distortion to a common latent quality `q`:
`T_ij = a_j + b_j·q_i` with `b_j > 0`. `a_j` is the judge's leniency and
`b_j` how much of the scale they use. Then, as `ε → 0`,
`z_ij = (q_i − q̄_j)/σ_q,j`. That value does not depend on `a_j` or `b_j`.

*Proof.* `μ_j = a_j + b_j q̄_j` and `σ_j = b_j σ_q,j`. Therefore
`z_ij = b_j(q_i − q̄_j)/(b_j σ_q,j) = (q_i − q̄_j)/σ_q,j`. ∎

Worked example: three judges see the same five projects. Strict **A** gives
`40 50 55 60 70`. Lenient **B** gives exactly 30 points more,
`70 80 85 90 100`. Spread-out **C** gives `2·A − 40 = 40 60 70 80 100`.
All three produce `z = −1.5 −0.5 0 +0.5 +1.5`, so all three display
`47.5 62.5 70 77.5 92.5`. The raw averages would have ranked every project
by whoever happened to review it; after normalization the three judges agree
exactly.

**Theorem 3 — each judge's own ordering is preserved.** For `σ_j > 0`,
or for `max_j > min_j` in Min-Max mode, `T ↦ N` is strictly increasing. For
each judge, the Spearman correlation between raw and normalized scores is
therefore exactly 1. Normalization changes *comparisons across judges*,
never a judge's own verdict. *Proof.* Both maps are affine with positive
slope `s*/(σ+ε)` or `2√3·s*/(range+ε)`. ∎

**Degenerate judges.** When every score a judge gives is identical, `σ = 0`
(Z mode) or `range = 0` (Min-Max mode). Then `ε` prevents a division by zero
and `z = 0`: a judge who expresses no preference contributes exactly `m*` to
every project they reviewed and moves nobody.

**Why Min-Max, and why `(2x − 1)√3`.** With very few ballots, `σ̂` is
unreliable: with `n = 2`, Z-scores are always `±1` whatever the scores were.
Min-Max needs only the observed range. We then put its output on the
Z-scale. If `x ~ U(0, 1)`, then `2x − 1 ~ U(−1, 1)` has mean 0 and variance
`1/3`, so `(2x − 1)√3` has mean 0 and variance 1. That is the same first two
moments as a Z-score, so fallback judges sit on the same axis as everyone
else. The output is bounded in `[−√3, √3]`, i.e. display scores in
`[44.0, 96.0]`. One ballot from a small-sample judge cannot produce an
extreme outlier. Theorem 1 does not hold exactly in this mode, because the
mean depends on where the interior points fall. For fallback judges the
invariant record therefore carries `expectedSd = NaN` (not applicable) and
only the Z-score judges are held to the equalities.

**Why `n_min = 5`.** For roughly normal scores, the sample SD has a
relative standard error of about `1/√(2(n−1))`: 35 % at `n = 5`, 41 % at
`n = 4` and 71 % at `n = 2`. Below five ballots, Z-scores would add more
noise than they remove. The threshold is configurable per event.

## 4. Aggregation and ranking

For a project reviewed by the judges in set `J_i`:

- `N̄_i = mean_{j∈J_i} N_ij` is the published score.
- `σ_N,i = sd_{j∈J_i} N_ij` is the **disagreement indicator**. The Results Lab
  flags high values for a human look or an extra review.
- `rawMean` and `rawRank` are kept for transparency, together with
  `Spearman(rawRank, rank)`.

Projects are sorted by `N̄` descending. Ties break on the raw mean, then on
the number of judges, then on id. Standard competition ranking (1-2-2-4)
applies only when both score keys tie exactly. Ineligible projects and
ballots that are not submitted are excluded before normalization.

**Seeded evidence** (`evt_01`, 46 ballots from 6 judges; reproduce with
`POST /api/events/evt_01/normalize`):

| Judge | n | method | raw mean | raw SD | bias vs global (67.2) |
|---|---|---|---|---|---|
| Jade Park (strict) | 8 | z_score | 39.6 | 12.3 | **−27.5** |
| Bruno Silva (lenient) | 9 | z_score | 80.8 | 7.5 | **+13.6** |
| Chen Wei | 8 | z_score | 74.3 | 13.4 | +7.2 |
| Dara Nguyen | 8 | z_score | 64.1 | 13.8 | −3.1 |
| Emeka Obi | 9 | z_score | 73.1 | 13.3 | +5.9 |
| Farah Haddad (civic only) | 4 | min_max | 70.0 | 16.3 | +2.8 |

After normalization every Z judge has mean 70.000000 and SD 15.0000.
14 of 16 projects change rank, and Spearman(raw, normalized) is 0.865. The
raw leader, *FloodNet* (raw 91.7), was reviewed by three judges who all score
above average, and normalizes to 91.6. *Tiny Tutor* had a raw mean of only
78.8, because the strictest judge gave it 58.3. For her that was a top mark:
it normalizes to 92.7. The project's normalized mean is 92.2, and it ranks
first.

## 5. Pairwise judging (Bradley–Terry)

Judges can also compare two projects head to head. The model is
`P(i beats j) = p_i / (p_i + p_j)`. Strengths are the maximum *a posteriori*
estimate under a prior of `α = ½` pseudo-win and `½` pseudo-loss for each
project against a phantom opponent of strength 1. The fit uses Hunter's
(2004) minorization–maximization iteration:

$$p_i \leftarrow \frac{W_i + \alpha}{\sum_j \frac{n_{ij}}{p_i + p_j} + \frac{2\alpha}{p_i + 1}}$$

`W_i` is `i`'s number of wins and `n_ij` the number of comparisons between
`i` and `j`. Each step increases the log-posterior, and it converges to
`|Δp|/p < 10⁻¹⁰`.

- **Existence and uniqueness.** Without the prior, a project that never loses
  has an infinite MLE. The phantom comparisons make the log-posterior strictly
  concave, so the estimate always exists and is unique, even for unbeaten or
  never-compared projects.
- **No renormalization needed.** The phantom has a fixed strength of 1, which
  anchors the scale, so the fixed point of the update is the exact MAP. The
  common trick of rescaling strengths every iteration would change the prior's
  meaning; we don't do it.
- **Fixed-point identity (the acceptance runner checks this).** Summing the
  update equation over `i` at convergence gives
  `Σ_i (W_i + α) = Σ_i p_i Σ_j n_ij/(p_i+p_j) + 2α Σ_i p_i/(p_i+1)`.
  The double sum pairs up to `Σ_{i<j} n_ij = C = Σ_i W_i`, which leaves
  `Σ_i p_i/(p_i + 1) = n/2`. *On average, a project is exactly as strong as
  the phantom anchor.*
- **Choosing the next pair** (`selectNextPair`). Pairs this judge has not
  compared come first. Among those, pairs whose projects have the fewest total
  comparisons win, then pairs with the closest current strengths (least
  predictable outcome), then a hash tie-break seeded by the judge. The
  left/right order is also hash-determined, which controls position bias.

The pairwise rank is published next to the rubric rank. When both methods
are used, organizers see where they disagree.

## 6. Community voting (separate from judging)

Community votes never enter the judged score. They produce a separate
*Community choice* result.

- **Single style.** Each voter backs up to `budget` projects, one vote each.
- **Quadratic style.** `v` votes on one project cost `v²` credits from a
  budget (default 25). Voters can express intensity, but it gets
  progressively more expensive to concentrate power.
- **Voter identity** depends on the event's mode: an authenticated user; a
  verified email (keyed HMAC of the canonical address, with lowercase and
  `+tag` removed, so `ada+1@x.org` and `ADA+2@x.org` are one voter); or an
  open-link device cookie. In open mode, more than 3 distinct devices voting
  from one IP are recorded as *flagged* and not counted until an organizer
  reviews them. Every override is audit-logged.
- **Position bias.** During voting, the gallery shows each viewer a stable
  per-viewer shuffle.
- **Tallies are hidden** from everyone except organizers until the window
  closes. That stops herding and bandwagon effects.

## 7. What is locked when

| Moment | Effect |
|---|---|
| Submission deadline (server UTC; per-team extensions audited) | Drafts, submit/unsubmit and rosters freeze. Enforced by the API and a database trigger. |
| Ballot submitted | Later edits are allowed until judging closes, but each one is audit-logged with the before and after totals. |
| `judgingEndsAt`, or results published | Ballots lock (`JUDGING_CLOSED`). |
| Results published | The normalization run is frozen into `published_results`. Records are signed with Ed25519. |
