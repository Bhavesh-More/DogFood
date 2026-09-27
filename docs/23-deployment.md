# 23 — Deploying the Dogfood Portal on Render + Vercel (free)

This is the complete, step-by-step guide for **Path C**: the backend on
**Render** and the frontend on **Vercel**, both on their free tiers.

The judged artifact is still `docker compose up --build`, which is unchanged by
anything here. This document is only about publishing a live public instance.

---

## 0. The architecture (read this first)

```
   browser
      │  https://your-app.vercel.app
      ▼
┌───────────────────────────────────────────────┐
│ Vercel (Hobby, free)                          │
│  • serves the Vite SPA (static build)         │
│  • rewrites /api, /uploads, /.well-known  ────┼──►  Render
│  • everything else → /index.html (SPA)        │
└───────────────────────────────────────────────┘
                                                  │
                                                  ▼
┌───────────────────────────────────────────────┐
│ Render (free)                                 │
│  dogfood-api  — Docker web service (Express)  │
│                 listens on $PORT, /api/health │
│  dogfood-db   — managed PostgreSQL 16 (1 GB)  │
└───────────────────────────────────────────────┘
```

Three files make this work, all already in the repo:

| File | Purpose |
|---|---|
| `Dockerfile` | Builds the API (and a fallback web build) — Render builds this |
| `render.yaml` | Render Blueprint: creates `dogfood-api` + `dogfood-db` with the right env |
| `src/web/vercel.json` | Vercel build settings + the proxy rewrites + SPA fallback |

### Why the frontend *proxies* the API instead of calling it directly

The web app calls the API with **relative paths** and
`credentials: "same-origin"`, and the API refuses cookie-authenticated writes
whose `Origin` doesn't match `PUBLIC_URL` (CSRF guard). If the browser loaded
the SPA from `vercel.app` and called the API at `onrender.com` directly:

- the session cookie would not be sent (cross-site), and
- every write would fail the CSRF check.

So Vercel **rewrites `/api/*` (etc.) to Render**, and the browser only ever
talks to one origin. **Do not** add `API_URL` / `VITE_API_URL` pointing at
Render — that breaks it.

### Deploy order

Each side needs the other's URL, so this exact order matters:

1. **Render** first → get `https://dogfood-api.onrender.com`
2. Put that URL in `vercel.json` → deploy **Vercel** → get `https://your-app.vercel.app`
3. Put the Vercel URL in Render's `PUBLIC_URL` → Render redeploys

Total time: ~20 minutes, most of it waiting for builds.

---

## 1. Prerequisites

| Need | Notes |
|---|---|
| A GitHub account, with the repo pushed | Both platforms deploy from GitHub |
| A Render account | Sign up at https://render.com with GitHub. Free web service + free Postgres, no card required |
| A Vercel account | Sign up at https://vercel.com with GitHub. Hobby plan, free, no card required |
| `git` locally | Only to push two config edits |

You do **not** need Docker, Node, or pnpm installed locally — Render and Vercel
build in their own images.

Free-tier terms (late 2026):

- **Render:** 1 free web service (512 MB / 0.1 CPU, sleeps after 15 min idle),
  1 free Postgres (1 GB, **expires 30 days** after creation). No card.
- **Vercel Hobby:** free for personal/non-commercial use; 100 GB bandwidth/month.

---

## 2. Push the repo to GitHub

Both platforms read from the default branch. Confirm and push:

```bash
git remote -v                 # must show your GitHub repo
git branch --show-current     # expected: main
git add render.yaml src/web/vercel.json
git commit -m "chore(deploy): add Render blueprint and Vercel config"
git push origin main
```

The two config files **must be on the branch you connect** — otherwise Render
has no Blueprint and Vercel has no rewrites.

> If you keep deploying from a non-default branch (e.g. a PR branch), you will
> select that branch in both dashboards later.

---

## 3. Deploy the backend on Render

### 3.1 Create the Blueprint

1. Sign in at https://dashboard.render.com.
2. Click **New +** (top right) → **Blueprint**.
3. **Connect a repository** → authorize the Render GitHub App if asked →
   pick your DogFood repo.
4. Fill the Blueprint form:
   - **Blueprint Name:** `dogfood` (anything).
   - **Branch:** the branch with `render.yaml` (normally `main`).
   - **Blueprint Path:** `render.yaml` (the default).
5. Click **Next** / **Apply**. Render parses the file and shows two resources:
   `dogfood-db` (PostgreSQL) and `dogfood-api` (Web Service, Docker).
6. Render prompts for the env var marked `sync: false`:
   - **`PUBLIC_URL`** → enter a placeholder for now, e.g.
     `https://placeholder.vercel.app`. You will set the real value in §5.
7. Click **Apply** / **Create Resources**.

Render creates the database first, then starts building the Docker image.
The first build runs `pnpm install` + the API/web bundles — expect **5–10
minutes**.

### 3.2 What the Blueprint created

| Resource | Type | Plan | Key settings |
|---|---|---|---|
| `dogfood-db` | PostgreSQL 16 | free | 1 GB; internal connection string |
| `dogfood-api` | Web Service (Docker) | free | `dockerfilePath: ./Dockerfile`, health check `/api/health` |

Environment variables Render sets on `dogfood-api` (from `render.yaml`):

| Key | Value | Source |
|---|---|---|
| `DATABASE_URL` | `postgres://…` | from `dogfood-db` (internal) |
| `APP_SECRET` | random | `generateValue: true` |
| `PUBLIC_URL` | placeholder | you entered it (change in §5) |
| `COOKIE_SECURE` | `true` | blueprint |
| `TRUST_PROXY` | `true` | blueprint |
| `CHECKER_SESSIONS` | `false` | blueprint (keeps the public tokens off) |
| `SEED_ON_BOOT` | `true` | blueprint (seeds demo data on first boot) |
| `PORT` | injected by Render | the app reads it and binds `0.0.0.0` |

> Keep the database and the web service in the **same region** (the defaults
> do this). If you change one region, the internal `DATABASE_URL` stops
> working and you must switch to the database's **external** connection string.

### 3.3 Watch the first deploy

Open `dogfood-api` → **Logs**. You are looking for, in order:

```
[boot] waiting for database…            (may repeat a few times — normal)
[boot] applying migrations…
[boot] seeding fixtures…                 (first boot only)
[boot] Dogfood portal <version> listening on https://… (port 10000)
```

When the service shows **Live** (green) at the top, the boot succeeded.

### 3.4 Copy the API URL

At the top of `dogfood-api`, copy the URL under its name, e.g.

```
https://dogfood-api.onrender.com
```

Your name may be taken — use whatever Render assigned. Keep it for §4.

### 3.5 Smoke-test the API

```bash
curl -s https://dogfood-api.onrender.com/api/health
# {"status":"ok","db":true,"version":"...","time":"..."}
```

- `db:true` → migrations ran, the `dogfood_app` role was created, Postgres is
  reachable.
- If it hangs or errors, the free instance was asleep and is waking — try once
  more after ~1 minute, otherwise see §10.

You can also open `https://dogfood-api.onrender.com/` — it renders the bundled
web build too ("Vercel is optional", §5.4).

---

## 4. Deploy the frontend on Vercel

### 4.1 Point the proxy at your Render URL

Open `src/web/vercel.json`. Replace **all three** occurrences of
`https://dogfood-api.onrender.com` with the URL from §3.4:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*",        "destination": "https://YOUR-API.onrender.com/api/:path*" },
    { "source": "/uploads/:path*",    "destination": "https://YOUR-API.onrender.com/uploads/:path*" },
    { "source": "/.well-known/:path*","destination": "https://YOUR-API.onrender.com/.well-known/:path*" },
    { "source": "/(.*)",              "destination": "/index.html" }
  ]
}
```

Commit and push:

```bash
git add src/web/vercel.json
git commit -m "chore(deploy): point Vercel proxy at Render API"
git push origin main
```

> The last rewrite (`/(.*)` → `/index.html`) is the SPA fallback so deep links
> like `/e/sample-hack-2026` work on refresh. It must stay **last** — Vercel
> matches rewrites top to bottom.

### 4.2 Import the project into Vercel

1. Go to https://vercel.com/new.
2. Under **Import Git Repository**, pick your DogFood repo
   (install the Vercel GitHub App and grant access if prompted).
3. On the configuration screen, set:
   - **Root Directory:** click **Edit** → choose **`src/web`**.
   - Framework Preset, Build Command, Output Directory: Vercel fills these
     from `vercel.json` (see §4.3 — leave them).
   - **Environment Variables:** none needed.
4. Click **Deploy**.
5. First build takes ~1–3 minutes. When it finishes, note the production URL,
   e.g. `https://dogfood-web.vercel.app`.

### 4.3 Build settings (confirm these)

| Setting | Value | Where it comes from |
|---|---|---|
| Framework Preset | Vite | `vercel.json` |
| Root Directory | `src/web` | you set it |
| Build Command | `pnpm build` (runs `vite build && node scripts/compress.mjs`) | `vercel.json` |
| Output Directory | `dist` | `vercel.json` |
| Install Command | `pnpm install` (default) | Vercel detects the pnpm workspace and installs from the repo root |
| Node.js Version | 22.x | repo `engines` (`>=22.12`) |

Because `Root Directory` is a subfolder of a pnpm workspace, Vercel installs the
**whole workspace** from the repo root and then builds only `src/web` — this is
what resolves the `@dogfood/core` workspace dependency.

> **If the build fails** because it can't find `@dogfood/core` or the
> workspace: Project → **Settings → Build & Development Settings** → enable
> **"Include source files outside of the Root Directory in the Build Step"**,
> then redeploy. Alternatively set **Root Directory** to the repo root and use
> Build Command `pnpm --filter @dogfood/web build` and Output Directory
> `src/web/dist`.

---

## 5. Wire the two together

### 5.1 Set the real `PUBLIC_URL` on Render

Back in **Render → `dogfood-api` → Environment**, edit:

| Key | Value |
|---|---|
| `PUBLIC_URL` | `https://dogfood-web.vercel.app` (your Vercel URL from §4.2) |

Click **Save Changes**. Render redeploys automatically.

`PUBLIC_URL` is used for invite links and as the CSRF origin allow-list, so it
must be **exactly the URL you browse** (scheme + host, no trailing slash).

### 5.2 Wait for Render to finish

When `dogfood-api` is **Live** again, visit your Vercel URL.

### 5.3 End-to-end check

Open `https://dogfood-web.vercel.app` and:

- the home page loads and lists the seeded **Sample Hack 2026** event;
- **Sign in** as `organizer@dogfood.local` / `dogfood-demo-2026`;
- open **/api-docs** — the API reference renders (it is proxied, same origin);
- in the organizer console, make one small edit (e.g. save a setting) — this
  proves cookie auth + CSRF + a write all work through the proxy.

### 5.4 Vercel is optional

The Render image already bundles the web build and serves the whole app. If you
skip Vercel: set `PUBLIC_URL` to the **Render** URL and browse that. Use Vercel
when you want the split, the `.vercel.app` domain, or a custom domain on the
frontend.

---

## 6. Verification checklist

```bash
API=https://YOUR-API.onrender.com
WEB=https://YOUR-WEB.vercel.app

curl -s $API/api/health                       # db:true
curl -s $WEB/api/health                        # same JSON, through the proxy
curl -s $WEB/api/openapi.json | head -c 120    # OpenAPI document
curl -s -o /dev/null -w '%{http_code}\n' $WEB/           # 200 (SPA shell)
curl -s -o /dev/null -w '%{http_code}\n' $WEB/e/sample-hack-2026  # 200 (deep link)
```

All four should succeed. Then complete the browser check in §5.3.

---

## 7. Optional: a custom domain

Frontend on a domain you own:

1. Vercel → your project → **Settings → Domains → Add**.
2. Enter `portal.example.com`; add the DNS record Vercel shows
   (usually a `CNAME` to `cname.vercel-dns.com`).
3. Wait for the certificate to issue.
4. Update Render's `PUBLIC_URL` to `https://portal.example.com` and let it
   redeploy.

You can add a domain to Render too, but it is not required — the API is only
reached through the Vercel proxy.

---

## 8. Day-2 operations

| Task | How |
|---|---|
| **Deploy a code change** | Push to the connected branch. Render and Vercel auto-deploy. |
| **Force a redeploy** | Render: service → **Manual Deploy → Deploy latest commit**. Vercel: project → **Deployments → … → Redeploy**. |
| **Roll back** | Vercel: **Deployments** → pick an older build → **Promote to Production** (instant). Render: **Events** → pick a previous deploy → **Rollback**. |
| **View logs** | Render: service → **Logs**. Vercel: project → **Deployments** → a build → **Build Logs**; runtime logs are in **Logs**. |
| **Open a DB shell** | Render: `dogfood-db` → **Connect** → `psql` (use the **external** URL from your laptop; internal only works inside Render). |
| **Reseed the database** | Render → `dogfood-api` → **Shell** → `node dist/cli.mjs reset --yes` (destructive). |
| **Stop seeding on boot** | Render → `dogfood-api` → **Environment** → set `SEED_ON_BOOT=false`. Do this **after** the first successful boot so restarts never reseed. |
| **Change the demo password** | Sign in as admin → **Admin → Users & roles**, or deactivate the demo accounts. |
| **Back up** | Free Render Postgres has **no backups**. For anything you care about, connect from your laptop and `pg_dump`. |

---

## 9. Free-tier limits and caveats

| Limit | Effect | Mitigation |
|---|---|---|
| Free web service **sleeps after 15 min** idle | First request after a nap takes ~1 min (Render shows a loading page) | Accept it for a demo, or point a free uptime monitor at `https://YOUR-API.onrender.com/api/health` every 10 min |
| Free Postgres **expires 30 days** after creation | DB becomes inaccessible; deleted after a 14-day grace period | Move to an always-free external Postgres (e.g. Neon) before day 30, or recreate |
| **No persistent disk** on the free web service | User-uploaded thumbnails vanish on redeploy/restart (the seeded data lives in Postgres and is safe) | Re-upload after a deploy, or upgrade to a paid disk |
| **750 instance-hours/month** per Render workspace (free) | Enough for one always-on service; exhausting it suspends free services until the next month | Keep only one free service running |
| Uploads through the proxy | Images are capped at 5 MB by the app; very large uploads may be limited by the proxy | Use images under ~4 MB |
| Vercel Hobby | Personal/non-commercial only | Fine for a hackathon demo |

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Render build fails at `pnpm install` | Node/pnpm mismatch | Check the build log; confirm `packageManager: pnpm@11.25.0` and `engines.node >=22.12` are on the connected branch |
| Render deploy "no open ports detected" | App not listening on `$PORT` | Confirm the revision includes the current `src/api/src/index.ts` (binds `0.0.0.0`, reads `PORT`) |
| `dogfood-api` deploy fails with `permission denied to create role "dogfood_app"` | DB user lacks `CREATEROLE` | Render's default user supports it; if you rotated the DB user, connect as the default user and run `CREATE ROLE dogfood_app NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT dogfood_app TO your_user;` |
| Boot loops `waiting for database` | Wrong `DATABASE_URL`, or DB/region mismatch | Keep the DB and service in the same region; re-sync the Blueprint so `DATABASE_URL` updates |
| API returns 500 / migrations error | DB connected as owner (RLS setup incomplete) | Read the Render logs — migration 002 must complete before boot |
| Vercel build fails: cannot find `@dogfood/core` | Workspace not installed | Enable **Include source files outside of the Root Directory** (or use the root-directory fallback in §4.3) |
| `$WEB/api/...` returns 404 | `vercel.json` destinations wrong, or not deployed | Re-check the three URLs in `src/web/vercel.json`; confirm the latest commit deployed |
| Deep link 404s on refresh | SPA fallback missing | Ensure the `/(.*)` → `/index.html` rewrite is present and **last** |
| Login seems to work but writes fail (CSRF) | `PUBLIC_URL` ≠ the browser URL | Set `PUBLIC_URL` to the exact Vercel URL (or custom domain) and let Render redeploy |
| Session lost on every request | `COOKIE_SECURE`/`TRUST_PROXY` wrong, or cross-origin | Keep both `true`; never call the Render URL directly from the SPA |
| `429` errors during a demo | Anonymous rate limits | Wait ~1 minute between bursts |
| Everyone is logged out after a restart | `APP_SECRET` changed | Render's `generateValue` `APP_SECRET` is stable; don't replace it |

---

## 11. Security checklist before you share the link

- [ ] `CHECKER_SESSIONS=false` on Render (the tokens in `.dogfood.toml` are
      public — with this `true`, they are live **admin** logins).
- [ ] `APP_SECRET` set (Render generates one; keep it).
- [ ] Demo accounts (`organizer@…`, `admin@…`, …) all use
      `dogfood-demo-2026`. Either keep the link private to reviewers, change
      their passwords, or deactivate them in **Admin → Users & roles**.
- [ ] `SEED_ON_BOOT=false` once the first boot is done.
- [ ] `.env` is not committed (it is git-ignored).
- [ ] You did **not** add `API_URL` / `VITE_API_URL`, and the Postgres port is
      not published.

---

## Appendix A — `render.yaml`

```yaml
databases:
  - name: dogfood-db
    plan: free
    postgresMajorVersion: "16"

services:
  - type: web
    name: dogfood-api
    runtime: docker
    plan: free
    dockerfilePath: ./Dockerfile
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: PUBLIC_URL
        sync: false
      - key: DATABASE_URL
        fromDatabase:
          name: dogfood-db
          property: connectionString
      - key: APP_SECRET
        generateValue: true
      - key: COOKIE_SECURE
        value: "true"
      - key: TRUST_PROXY
        value: "true"
      - key: CHECKER_SESSIONS
        value: "false"
      - key: SEED_ON_BOOT
        value: "true"
```

## Appendix B — `src/web/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-API.onrender.com/api/:path*" },
    { "source": "/uploads/:path*", "destination": "https://YOUR-API.onrender.com/uploads/:path*" },
    { "source": "/.well-known/:path*", "destination": "https://YOUR-API.onrender.com/.well-known/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
