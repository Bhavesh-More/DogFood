# 20 — Optional AI sidecar (classification, summaries, feedback)

## Why this is a sidecar, not a core feature

The brief is explicit and it constrains every decision here:

- `docs/08 §5`: *“AI functionality is **not** required as an embedded product
  feature within the submission judging platform itself.”*
- `docs/04 §2`: **100% air-gapped** execution, **no external HTTP/HTTPS**, zero
  cloud SaaS, and a single-command `docker compose up --build`.
- `docs/04 §5`: must run on a **standard local Docker** environment.
- Platform reality: **Docker on Apple Silicon has no Metal/MPS passthrough**.
  GPU inference is CUDA (Linux + NVIDIA) or CPU inside containers; Apple
  Silicon GPU (MPS) only works when the service runs natively on macOS.

So the requested AI features were **modified, not dropped**, into an optional,
independently containerized service that:

1. is **never started** by `docker compose up` (compose profile `ai`), so the
   single-command, fast, offline core is untouched;
2. with AI off, the portal behaves **byte-for-byte** as before — no AI routes
   are hit, no AI UI is rendered;
3. downloads **no weights at runtime** and calls no external services; the
   default backend is deterministic and offline;
4. **augments** routing instead of replacing it, so the T2 guarantees
   (scope, conflicts, balance, determinism) and the acceptance suite are
   unchanged;
5. is configurable by env for device (**cpu | cuda | mps**) and models.

If AI is unavailable, every feature degrades to a deterministic fallback and
the UI hides itself. Nothing in T1–T4 or `acceptance-report.txt` depends on it.

## Components

```
docker compose --profile ai up --build
        │
        ├── app  (AI_ENABLED=true, AI_SERVICE_URL=http://ai:8080)
        │     └── src/api/src/ai/client.ts      (timeout + graceful fallback)
        │         └── src/api/src/ai/affinity.ts (tie-break for planAssignments)
        │
        └── ai   (src/ai, FastAPI)
              ├── heuristic backend   (default: offline, no weights, deterministic)
              ├── laya backend        (convaiinnovations/laya, transformers)
              └── ollama backend      (Gemma 4 E2B summaries / E4B feedback)
```

`src/ai` is a small FastAPI service with one responsibility per endpoint
(`/v1/classify`, `/v1/expertise`, `/v1/affinity`, `/v1/summary`,
`/v1/feedback`). Adding a capability means adding an endpoint and a backend —
the portal only needs a matching client method.

## Models

- **Laya** (`convaiinnovations/laya`, Apache-2.0) — a System-1 decision model:
  state + typed questions in, typed answers out. It classifies a project's
  problem statement and a judge's expertise (declared scope + assignment
  history tags). Laya is weak with many labels, so we cap the option set.
- **Gemma 4** — `AI_SUMMARY_MODEL` defaults to the lightest size (`E2B`) and
  `AI_FEEDBACK_MODEL` to the effective-4B size (`E4B`). Both are served through
  a local **Ollama** (`OLLAMA_URL`), configurable per deployment.

Weights are pre-provisioned (baked into the image with
`--build-arg INSTALL_MODELS=1`, or mounted at `/models`). The image sets
`HF_HUB_OFFLINE=1`, so it can never fetch at request time.

## What each feature does, and its limits

| Feature | Endpoint | Fallback | Guarantees |
| --- | --- | --- | --- |
| Project classification (PS) | `POST /api/events/:id/ai/classify` | heuristic tag rules | cached in `project_classifications`; advisory |
| Judge expertise | same call | scope + history tags | cached in `judge_expertise`; advisory |
| Affinity matrix | `GET /api/events/:id/ai/matrix` | heuristic jaccard | read-only preview |
| AI routing tie-break | `POST /api/events/:id/assignments/auto` | deterministic router | **only** breaks ties between equally-loaded judges |
| Project summary | `GET /api/ai/submissions/:id/summary` | extractive summary | public, cached, rate-limited |
| Judge feedback draft | `POST /api/judge/assignments/:id/ai/feedback` | templated draft | private to the judge; never writes a ballot |

Every generated artifact is cached in its own table under Row-Level Security
(`judge_feedback` is owner-only; summaries are public; classifications and
expertise are staff-managed). The sidecar writes through the trusted `system`
role; organizers write classifications through the staff policy.

## Routing: why a tie-break and not a replacement

`planAssignments` is deterministic and is what the acceptance suite verifies.
It now accepts an optional `affinity(judge, submission) => [0,1]` used **after**
load and **before** the stable hash in the sort key. Consequences:

- a higher-affinity judge is chosen only when loads are equal;
- scope, conflicts, team membership, `maxPerJudge` and balance are untouched;
- with no affinity (AI off) the output is identical to before;
- the full ordering is still deterministic for identical inputs.

Verified by `tests/unit/ai.test.ts` and `tests/integration/ai.test.ts`.

## Configuration

See `src/ai/README.md` for the full table. Highlights: `AI_ENABLED`,
`AI_SERVICE_URL`, `AI_DEVICE` (`auto|cpu|cuda|mps`), `AI_CLASSIFIER_BACKEND`
(`heuristic|laya`), `AI_GENERATOR_BACKEND` (`heuristic|ollama`),
`AI_CLASSIFIER_MODEL`, `AI_SUMMARY_MODEL`, `AI_FEEDBACK_MODEL`, `OLLAMA_URL`,
`AI_SERVICE_KEY`.

## Security and trust

- The sidecar is advisory. It cannot read ballots: it only receives text
  already visible to the caller, and it returns text.
- It never runs in the request's DB transaction as the caller; cached writes go
  through the `system` role, and the only caller-scoped reads are RLS-filtered.
- Input is size-capped (`AI_MAX_BATCH`), calls are timeout-bounded, and public
  generation endpoints are rate-limited.
- As with any model, outputs can be wrong; they are always labelled and never
  feed normalization or published results.
