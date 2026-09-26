# Dogfood AI sidecar

An **optional**, independent service the portal can call for project
classification, expertise-aware routing, summaries and judge-feedback drafts.
It is deliberately isolated from the main stack: `docker compose up` never
starts it, and the portal works with AI off. See `docs/20-ai-service.md` for the
design rationale and the constraints it respects.

## Run it

```bash
# container (default: offline heuristic backend)
docker compose --profile ai up -d --build ai

# or locally
cd src/ai
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8080
```

Then point the portal at it and turn AI on:

```bash
AI_ENABLED=true AI_SERVICE_URL=http://127.0.0.1:8080 docker compose up --build
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness and the effective device/backends/models |
| POST | `/v1/classify` | project tags and primary category |
| POST | `/v1/expertise` | judge expertise tags |
| POST | `/v1/affinity` | judge ⇄ project affinity scores |
| POST | `/v1/summary` | project summary |
| POST | `/v1/feedback` | judge feedback draft |

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_DEVICE` | `auto` | `auto`, `cpu`, `cuda`, `mps` (mps only natively on macOS) |
| `AI_CLASSIFIER_BACKEND` | `heuristic` | `heuristic` or `laya` |
| `AI_GENERATOR_BACKEND` | `heuristic` | `heuristic` or `ollama` |
| `AI_CLASSIFIER_MODEL` | `convaiinnovations/laya` | Laya checkpoint |
| `AI_SUMMARY_MODEL` | `gemma-4-E2B` | lightest Gemma 4 for summaries |
| `AI_FEEDBACK_MODEL` | `gemma-4-E4B` | effective-4B Gemma 4 for feedback |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | local Ollama for the Gemma backends |
| `AI_SERVICE_KEY` | *(unset)* | optional Bearer key for the sidecar |
| `AI_VOCAB` | *(unset)* | extra comma-separated tag vocabulary |

Model backends never download at request time (`HF_HUB_OFFLINE=1`). Provision
weights into the image or mount them at `/models`; run Gemma through a local
Ollama. If a configured backend is unavailable the service answers with the
heuristic backend and says so in each response's `source`/`model` fields.

## Using Laya

Uncomment the Laya preset in `.env` (or `src/ai/.env`), then:

```bash
# 1) install the heavy extras at build time
#    .env → AI_INSTALL_MODELS=1
docker compose --profile ai build ai

# 2) download the checkpoint once (the running service stays offline)
pnpm ai:provision        # or: python -m app.provision with HF_HUB_OFFLINE=0

# 3) start with AI on
AI_ENABLED=true docker compose --profile ai up -d --wait
```

`convaiinnovations/laya` works zero-shot but is weakest on many-label choices;
`convaiinnovations/laya-typed-decisions` (fine-tuned) is more accurate. Keep
the option set small (the adapter caps it at ~12), which is the model's sweet
spot. The service falls back to the heuristic classifier if the package or
weights are missing.
