# Phase 1 Plan — Foundation

| Field | Value |
|---|---|
| Status | ✅ Plan approved 2026-11-17 · Batch 1A ✅ approved · Batch 1B ✅ approved · Batch 1C ✅ approved · Batch 1D ✅ approved · Phase 1 DoD 🔵 in progress |
| Source | IMPLEMENTATION_PLAN.md Phase 1 · ARCHITECTURE.md · DEPLOYMENT.md · TESTING.md |
| Duration | ≈ 2 weeks of effort, delivered in **4 gated batches** |
| Cost | **₹0.** Everything runs on this Mac and in GitHub Actions' free minutes |
| Out of scope | Any product feature (auth, events, uploads, AI models, billing). Phase 1 only builds the empty, working skeleton those phases plug into |

## 1. Goal
One command starts the whole platform locally:
- every service is healthy;
- CI checks every change automatically;
- the rules that protect us later (module boundaries, tenant-isolation test framework, outbox, typed config) exist before the first feature is written.

## 2. Local environment (checked 2026-11-17)

| Tool | Found | Needed | Action |
|---|---|---|---|
| Machine | Apple M1, 16 GB RAM | ≥ 8 GB free for Docker | OK. Dev stack ≈ 3–4 GB RAM |
| Node | v25.6.0 (current, not LTS) | **Node 24 LTS** (stable until 2028) | ✅ Node 24.22.3 installed via fnm (Node 25 untouched); pinned with `.nvmrc` / `engines` |
| pnpm | ✅ 10.34.9 (installed) | pnpm 10.x | Done |
| uv (Python) | ✅ 0.13.8 (installed) | uv (manages Python 3.12 for ai-service) | Done |
| Python | 3.14.3 | **3.12** for ai-service (best ONNX Runtime wheel support) | uv installs 3.12 inside the project only; the system Python is untouched |
| Docker / Compose | 29.9 / v5.6 ✅ | — | OK |
| git / gh | ✅, logged in as `ankitmehtag` | GitHub repo for CI | ✅ Private repo `ankitmehtag/snapshare-ai` created; Phase 0 pushed |

> Docs said Node 22. Node 24 is the current LTS and is supported longer, so ADR-021 updates this. Same code, no cost.

## 3. Batches (each ends with a gate: demo + test evidence → owner approves → commit)

### Batch 1A — Monorepo & shared packages
- **Workspace:**
  - `package.json` (workspace root), `pnpm-workspace.yaml`, `turbo.json`
  - `.nvmrc` (24), `.editorconfig`, Prettier
- **TypeScript and linting:**
  - `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, ESM)
  - ESLint flat config with `eslint-plugin-boundaries`. Modules may import only another module's `index.ts`.
  - A lint rule banning direct Mongoose model calls outside `repositories/` (ADR-007).
- **Packages:**
  - `packages/config`: Zod-validated env loader + queue registry (`queues.ts`: name, retries, backoff, timeout, DLQ, owner).
  - `packages/types`: shared types (Scope, AuthContext, Problem, Page).
  - `packages/validators`: Zod primitives (ObjectId, cursor, pagination, email, phone E.164).
  - `packages/ui`: empty Tailwind/shadcn component library scaffold (filled in Batch 1C).
- **Project instructions:** a project-level `AGENTS.md` + `CLAUDE.md` that say "this repo does **not** use InsForge" (ADR-002) and point to the gated workflow and docs.
- **Hooks:** a `gitleaks` pre-commit hook via `lefthook` (free).
- **Gate evidence:** `pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm test` green on a clean clone. A boundary violation fixture fails lint as expected.

### Batch 1B — Local infrastructure + API & worker skeletons
- **`infrastructure/docker/compose.yml` + `compose.dev.yml`:**
  - MongoDB 7 (single-node replica set, auto-initiated)
  - Redis 7
  - Qdrant (pinned version)
  - MinIO (stands in for B2) with buckets auto-created
  - Mailpit
  - Healthchecks for all of them, and memory limits sized for a 16 GB Mac
- **`.env.example`:** every variable documented, no secrets.
- **`apps/api`:** Express 5 + TS:
  - **kernel:** request ID, pino logger with redaction, RFC 9457 error handler, Zod request validation middleware, cursor helpers.
  - **Route registry** with scope metadata, plus a test that fails if any route lacks it (TESTING §4).
  - **Rate-limit middleware** (Redis sliding window).
  - **Security:** headers (helmet + CSP from SECURITY §5) and the CORS allowlist.
  - **Endpoints:** `/health` and `/ready`, which check Mongo, Redis and Qdrant.
  - **Docs:** OpenAPI generated from Zod at `/docs` in dev only.
  - **Plumbing:** Socket.IO with the Redis adapter and an auth hook stub that rejects every connection until Phase 2. Graceful shutdown.
- **`apps/worker`:** a single image with the `relay | media | ai | notify | system` entrypoints:
  - **Outbox:** model + writer helper (in-transaction), and a relay (change stream + polling fallback, `jobId = outbox._id`).
  - **Jobs:** a BullMQ worker factory with retry/DLQ wiring from the queue registry, plus a `system.ping` demo job (test-only queue, clearly labeled).
- **DB tooling:** `migrate-mongo` set up with `autoIndex: false` and a first migration that creates the `outbox` and `auditLogs` indexes.
- **Gate evidence:**
  - `docker compose up` → all healthy.
  - `/ready` is green.
  - **Integration tests (real Mongo/Redis):**
    1. outbox write → job runs exactly once, even if the relay restarts mid-publish;
    2. a failing job lands in the DLQ after its configured retries;
    3. an invalid env var stops the service from starting with a clear message.

### Batch 1C — Web app shell & design system
- **`apps/web`:**
  - **Stack:** Vite + React + TS + Tailwind + shadcn/ui, React Router, TanStack Query, Zustand, React Hook Form + Zod, react-i18next (en + hi scaffolding).
  - **Shells:** the 4 app shells with placeholder navigation: Public/Gallery, Studio, Personal, Admin.
  - **Routes:** every route from SCREEN_INVENTORY is registered, each rendering a "Coming in Phase N" placeholder. This is honest: no fake data (spec §19).
- **`packages/ui`:**
  - **Theming:** design tokens (color, type, spacing, radius), light/dark themes, a brand placeholder until G12.
  - **State components:** EmptyState, ErrorState, Forbidden, LoadingSkeleton.
  - **Primitives:** AppShell variants, DataTable base, StatCard, UsageMeter.
- **API client:** `credentials: 'include'`, CSRF header injection, problem+json error mapping, cursor pagination hook.
- **Gate evidence:** `pnpm dev` opens all shells; Lighthouse ≥ 90 (performance and accessibility) on the landing page; component tests (Vitest + Testing Library) for the state components; Playwright smoke test that each shell renders.

### Batch 1D — AI service skeleton + CI pipeline
- **`apps/ai-service`:**
  - **Runtime:** FastAPI on Python 3.12 managed by uv.
  - **Providers:** `FaceDetector` / `FaceEmbedder` / `QualityScorer` Protocols. No real models yet; those come in Phase 4. A `FakeEmbedder` exists **only** in the test package.
  - **Auth:** service-token middleware (HMAC) and signed-scope verification helper (AI_ARCHITECTURE §10).
  - **Vectors:** VectorStore wrapper that **refuses searches without a scope filter**, with a unit test proving it.
  - **Ops endpoints:** `/health`, `/ready` (gated on warmup), `/metrics`.
  - **Image:** Dockerfile with a `cpu` target (`cuda` target stubbed for Phase 4).
  - **Quality:** Ruff + mypy + pytest.
- **`compose.dev.yml` `ai` profile:** ai-service + Qdrant.
- **GitHub Actions** (`.github/workflows/ci.yml`):
  - **PR checks:** lint, typecheck, unit tests, integration tests (Compose services), Semgrep, gitleaks, `pnpm audit` + `pip-audit`, licence allowlist check (RISK R1c).
  - **Image builds:** linux/amd64 for Hetzner, pushed to GHCR **only on main**.
  - **Efficiency:** path filters and caching to save free minutes.
- **Monitoring:** `infrastructure/monitoring/` holds a Prometheus scrape config + one starter Grafana dashboard (API RED metrics). This is the compose profile `monitoring`, optional locally.
- **Gate evidence:**
  - CI green on a PR.
  - Run time under 15 minutes.
  - **Free-minute usage per run recorded.** The target is under 2,000 min/month, the private-repo free quota.
  - The ai-service scope-filter test passes.

## 4. Repository after Phase 1
```
apps/
  web/            React SPA (shells + placeholders)
  api/            Express modular monolith (kernel only; modules/ empty)
  worker/         relay | media | ai | notify | system entrypoints
  ai-service/     FastAPI skeleton (no models yet)
packages/
  config/  types/  validators/  ui/
infrastructure/
  docker/  monitoring/  scripts/  (nginx/ and kubernetes/ stubs + README)
docs/             (existing) + phases/PHASE_1_PLAN.md + perf/
.github/workflows/ci.yml
AGENTS.md  CLAUDE.md  .env.example  .nvmrc  turbo.json  pnpm-workspace.yaml
```

## 5. Definition of Done for Phase 1
1. A fresh clone → one setup command → all services healthy (documented in README "Getting started").
2. All 4 batch gates approved.
3. CI green and enforced on `main` (branch protection on the private repo).
4. No product features and no mock data presented as features.
5. Docs updated: README getting started, DECISIONS (ADR-021 Node 24 LTS), CHANGELOG-SPEC.
6. Tag `phase-1-complete`.

## 6. Risks for this phase
| Risk | Mitigation |
|---|---|
| Apple Silicon (arm64) locally vs Hetzner x86 in production | All images multi-arch or amd64-built in CI; ONNX Runtime has arm64 wheels for local work |
| 16 GB Mac under memory pressure | Compose memory limits; the `ai` and `monitoring` profiles are optional |
| CI minutes on a private repo | Path filters, caching, integration tests only when backend code changes |
