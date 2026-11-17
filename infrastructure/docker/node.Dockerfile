# syntax=docker/dockerfile:1.7
# Images for the Node apps (DEPLOYMENT §1). Build from the repo root:
#   docker build -f infrastructure/docker/node.Dockerfile --target api    -t snapshare/api .
#   docker build -f infrastructure/docker/node.Dockerfile --target worker -t snapshare/worker .
#   docker build -f infrastructure/docker/node.Dockerfile --target web    -t snapshare/web .
# Production is linux/amd64 (Hetzner); CI builds that platform.

ARG NODE_IMAGE=node:24.22.3-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI_SKIP_HOOKS=1
RUN corepack enable
WORKDIR /repo
# Lockfile first: dependency download is cached until the lockfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN pnpm exec turbo run build \
      --filter=@snapshare/api --filter=@snapshare/worker --filter=@snapshare/web
# Self-contained production trees (prod deps only, workspace packages copied in).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@snapshare/api deploy --prod --legacy /out/api && \
    pnpm --filter=@snapshare/worker deploy --prod --legacy /out/worker

# --- api: distroless (no shell, no package manager), non-root -------------------------
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/api ./
USER nonroot
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["dist/main.js"]

# --- worker: slim Debian (libvips/ffmpeg arrive with the media pipeline in Phase 3) ---
FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
EXPOSE 4100
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Role is the argument: relay | media | ai | notify | system | all
ENTRYPOINT ["node", "dist/main.js"]
CMD ["all"]

# --- web: static SPA on unprivileged nginx --------------------------------------------
FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY infrastructure/docker/web-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
