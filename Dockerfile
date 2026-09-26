# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build: install the workspace, bundle the API into one ESM file and build the
# static web app. Needs registry access once; the runtime image does not.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN npm install -g pnpm@11.25.0 --no-fund --no-audit
WORKDIR /repo

# Manifests first so dependency installs are cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY src/api/package.json src/api/
COPY src/core/package.json src/core/
COPY src/web/package.json src/web/
COPY tooling/eslint-config/package.json tooling/eslint-config/
COPY tooling/typescript-config/package.json tooling/typescript-config/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @dogfood/api build && pnpm --filter @dogfood/web build

# ---------------------------------------------------------------------------
# Runtime: node + two bundles + static files. No node_modules, no compilers,
# non-root, and nothing that calls out to the internet.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8000 \
    WEB_DIST=/app/web \
    FIXTURES_PATH=/app/fixtures.json \
    MIGRATIONS_DIR=/app/migrations \
    UPLOAD_DIR=/app/data/uploads
WORKDIR /app
RUN addgroup -S dogfood && adduser -S -G dogfood dogfood \
    && mkdir -p /app/data/uploads && chown -R dogfood:dogfood /app/data
COPY --from=build /repo/src/api/dist ./dist
COPY --from=build /repo/src/api/migrations ./migrations
COPY --from=build /repo/src/web/dist ./web
COPY --from=build /repo/fixtures.json ./fixtures.json
USER dogfood
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 \
  CMD wget -qO- http://127.0.0.1:8000/api/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/server.mjs"]
