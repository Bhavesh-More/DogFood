# 21 — Runbook: build, run and test (core + optional AI)

This is the practical, copy-paste guide. `docs/20-ai-service.md` explains the
design; this file explains the commands.

## 0. Prerequisites

| Tool | Needed for |
| --- | --- |
| Docker + Docker Compose v2 | everything containerised |
| Node ≥ 22.12 and pnpm 11 | running the test suites on the host |
| Python 3.10+ | `pnpm ai:test` (the AI service tests) |
| *(optional)* Ollama with Gemma 4 | model-backed summaries/feedback |
| *(optional)* NVIDIA Container Toolkit | `AI_DEVICE=cuda` |

Only Docker is required to **run** the platform. The rest is for **developing
and testing**.

## 1. Configure the environment

`docker compose` reads `.env` at the repo root. The file already ships with
safe defaults; the AI block at the bottom is the only part you may need to
change.

```bash
cp .env.example .env        # only if .env does not exist yet
```

Keep `AI_ENABLED=false` for the normal, offline, single-command platform. To
turn AI on, set `AI_ENABLED=true` and run the `ai` profile (step 4).

## 2. Build and run the core platform (no AI)

```bash
docker compose up --build            # foreground, http://localhost:8000
# or
pnpm dashboard                       # detached, waits until healthy
```

This is the authoritative target (it also proves the API/web bundle builds in a
clean container). Stop with `docker compose down` (`-v` also wipes the DB).

Reset the database (re-seed on next boot):

```bash
docker compose down -v
docker compose exec app node dist/cli.mjs reset --yes
```

## 3. Update the app / AI image after a code change

Only the changed service is rebuilt; Docker layer caching keeps it fast.

```bash
docker compose build app             # rebuild the portal image
docker compose up -d --wait app      # recreate just the app

# AI service:
docker compose --profile ai build ai
docker compose --profile ai up -d --wait ai
```

`docker compose --profile ai up -d --build --wait` rebuilds and recreates
everything at once.

## 4. Run with the AI sidecar

1. Set `AI_ENABLED=true` in `.env`.
2. Bring up all services:

```bash
pnpm services:up                 # docker compose --profile ai up -d --build
pnpm services:ps                 # see what is running
pnpm services:logs               # follow logs
pnpm services:down               # stop everything
```

The portal calls the sidecar at `http://ai:8080` over the internal network. The
default backend is **heuristic** — offline, deterministic, no weights — so
everything works with zero downloads.

Check it from the host:

```bash
curl -s localhost:8080/health | python3 -m json.tool      # sidecar
curl -s localhost:8000/api/ai/status | python3 -m json.tool # portal view
```

## 5. Enable model backends (Laya + Gemma 4)

### 5a. Laya (classification)

The env files ship three presets. Pick one by **commenting the default lines
and uncommenting a preset** in `.env`:

| Preset | Lines to uncomment |
| --- | --- |
| A — default | *(nothing: heuristic is the built-in default)* |
| B — Laya + heuristic generator | `AI_CLASSIFIER_BACKEND=laya`, `AI_CLASSIFIER_MODEL=…`, `AI_GENERATOR_BACKEND=heuristic` |
| C — Laya + Gemma via Ollama | Preset B, plus `AI_GENERATOR_BACKEND=ollama`, the two `gemma-4-…` models, `OLLAMA_URL` |

For Laya, three steps:

```bash
# 1) enable the heavy extras and build the image
#    .env →  AI_INSTALL_MODELS=1
docker compose --profile ai build ai

# 2) download the checkpoint ONCE (downloads are off at runtime)
pnpm ai:provision

# 3) start
AI_ENABLED=true docker compose --profile ai up -d --wait
```

`pnpm ai:provision` runs a one-off container with `HF_HUB_OFFLINE=0` and stores
the weights in the `ai-models` volume (`HF_HOME=/models`). The running service
keeps `HF_HUB_OFFLINE=1`, so it never downloads during a request. For
`AI_DEVICE=cuda`, install the NVIDIA Container Toolkit; on CPU-only Linux hosts
you can keep the default CPU wheels (the `torch` wheel is large either way).

> **“huggingface_hub is not installed” from `pnpm ai:provision`?**
> The image was built **without** the model extras. The Laya preset sets
> `AI_INSTALL_MODELS=1`; make sure that line is uncommented (or set it in
> `.env`), then rebuild. `docker compose --profile ai config | grep INSTALL_MODELS`
> should print `"1"`.
>
> ```bash
> docker compose --profile ai build --no-cache ai   # or just: build ai
> pnpm ai:provision
> ```

### 5a-native. Laya / Gemma on the host (recommended on Apple Silicon)

Docker on macOS has no Metal passthrough and pulls Linux wheels; running the
sidecar natively gets you the Apple-Silicon `torch` wheel and `mps`:

```bash
pnpm ai:install:models          # torch + transformers + laya on the host
cp src/ai/.env.example src/ai/.env   # uncomment the Laya preset
pnpm ai:provision:local          # one-time weight download
AI_DEVICE=mps pnpm ai:dev        # or AI_DEVICE=cpu
```

Then point the app at it: `.env` → `AI_ENABLED=true`,
`AI_SERVICE_URL=http://host.docker.internal:8080` (Dockerised app) or
`http://127.0.0.1:8080` if the app also runs on the host.

### 5b. Gemma 4 (summaries + feedback)

Serve Gemma through a local Ollama and point the sidecar at it:

```bash
ollama pull gemma-4-E2B      # lightest, for summaries
ollama pull gemma-4-E4B      # effective-4B, for judge feedback
```

```bash
# .env
AI_GENERATOR_BACKEND=ollama
AI_SUMMARY_MODEL=gemma-4-E2B
AI_FEEDBACK_MODEL=gemma-4-E4B
OLLAMA_URL=http://host.docker.internal:11434
```

Restart the app and sidecar. The service reaches host Ollama through the
`host.docker.internal` mapping already in `docker-compose.yml`.

### 5c. GPU

- **CUDA (Linux + NVIDIA):** install the NVIDIA Container Toolkit, then set
  `AI_DEVICE=cuda` and add a GPU reservation to the `ai` service (see the
  commented block in `docker-compose.yml`) or run with
  `--gpus all`.
- **Apple Silicon:** Docker on macOS has no Metal passthrough, so `mps` only
  works when you run the service **natively**:
  `AI_DEVICE=mps pnpm ai:dev`. Inside Docker on a Mac, use `cpu`.

## 6. Verify manually

### 6a. Portal UI

- Project page (`/e/sample-hack-2026/p/sub_01_01`): an **AI summary** card with
  tags appears (with a shimmer while it loads).
- Organizer → event → **Judges** (`/organize/sample-hack-2026/judges`):
  **AI classification & routing** panel; click *Analyse projects & judges*.
- Judge → queue → a project (`/judge/sample-hack-2026`): **AI writing assist**;
  click *Draft feedback*, then *Insert into notes*.
- With AI off, none of these render.

### 6b. API (checker tokens from `.dogfood.toml`)

```bash
B=http://localhost:8000
ORG=dfc_organizer_8b1d3f5a7c9e20461a
JA=dfc_judge_a_2c4e6a8b0d1f39571b

curl -s $B/api/ai/status

curl -s -X POST $B/api/events/evt_01/ai/classify \
  -H "authorization: Bearer $ORG" -H 'content-type: application/json' -d '{}'

curl -s $B/api/events/evt_01/ai/matrix -H "authorization: Bearer $ORG"

curl -s $B/api/ai/submissions/sub_03_01/summary

ASG=$(docker compose exec -T db psql -U dogfood -d dogfood -tAc \
  "SELECT id FROM assignments WHERE judge_id='usr_judge_a' AND event_id='evt_01' LIMIT 1" | tr -d '\r')
curl -s -X POST $B/api/judge/assignments/$ASG/ai/feedback \
  -H "authorization: Bearer $JA" -H 'content-type: application/json' -d '{}'
```

### 6c. Guided demo

In the UI, open the **Tour** menu in the nav rail → **Full feature demo**
(97 steps). It signs in/out of the seeded accounts and covers the AI steps too.

## 7. Run the test suites

```bash
pnpm lint                 # eslint everywhere
pnpm check-types          # workspace tsc + tests/tsconfig

pnpm test:unit            # pure core logic (fast, no DB)          ~107 tests
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/dogfood \
  pnpm test:integration   # real Postgres (uses the dev DB)        ~123 tests
pnpm test                 # unit + integration

pnpm ai:test              # pytest for src/ai (offline heuristic backend)

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
E2E_BASE_URL=http://localhost:8000 pnpm test:e2e    # Playwright journeys

python3 acceptance/run.py .dogfood.toml > acceptance-report.txt   # must say PASS / T4
```

Start the dev database once with `pnpm dev:db` (Postgres on `127.0.0.1:5433`)
before the integration tests, or point `TEST_DATABASE_URL` at any superuser DB.

For local API + Vite development instead of Docker:

```bash
pnpm dev                  # devdb + API (:8001) + Vite (:5173)
pnpm ai:dev               # optional AI sidecar on :8080
```

## 8. Command reference

| Command | What it does |
| --- | --- |
| `pnpm dashboard` | core stack (compose) on :8000, detached + healthy |
| `pnpm dashboard:logs` / `:down` / `:reset` | logs / stop / wipe |
| `pnpm ai:install` | install the Python dev deps for `src/ai` |
| `pnpm ai:dev` | run the sidecar natively with reload on :8080 |
| `pnpm ai:test` | pytest for the sidecar |
| `pnpm ai:build` | build the `ai` image |
| `pnpm ai:provision` | one-time weight download for the Laya backend |
| `pnpm ai:up` / `ai:down` / `ai:logs` | start / stop / follow the sidecar |
| `pnpm services:up` | **all** services (core + AI) |
| `pnpm services:down` / `:logs` / `:reset` / `:ps` | manage the full stack |

## 9. Troubleshooting

- **`AI` UI is hidden.** `curl /api/ai/status`. It must report
  `{"enabled":true,"service":"up"}`. If `enabled:false`, set
  `AI_ENABLED=true`; if `service:"down"`, the sidecar is not running or not
  reachable.
- **`503 AI_DISABLED` / `AI_UNAVAILABLE`.** AI is off, or the sidecar failed.
  The core platform is unaffected; check `pnpm ai:logs`.
- **`mps` does nothing in Docker on a Mac.** Expected; use `cpu` (or run
  natively with `pnpm ai:dev`).
- **Local `pnpm build` fails resolving `express`/`pg`.** A stray
  `~/.pnp.cjs` in your home directory makes esbuild use Yarn PnP. Build in
  Docker (`docker compose build app`), which is the canonical target.
- **429 on `/api/ai/submissions/:id/summary`.** Public generation is
  rate-limited (6/min) and cached; wait a minute.
- **Port already in use.** Change `PORT` / `AI_PORT` in `.env`, or
  `pnpm dev:db:stop` if a dev database conflicts.
