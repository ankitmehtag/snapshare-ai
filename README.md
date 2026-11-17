# SnapShare AI

Self-hosted, AI-powered photography SaaS for professional photographers, studios, event organizers, and individuals/families.

> **Status:** Phase 0 (Specification) ✅ · Phase 1 (Foundation) ✅ complete: monorepo, local infrastructure, API/worker/web/ai-service skeletons, CI. **No product features yet**: every screen shows an honest "Coming in Phase N" page. Next: Phase 2 (Identity & tenancy) plan.
>
> [![CI](https://github.com/ankitmehtag/snapshare-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/ankitmehtag/snapshare-ai/actions/workflows/ci.yml)

## Getting started

Prerequisites: Node 24 (`fnm use`), pnpm 10, Docker, uv, gitleaks.

```bash
pnpm install        # also installs git hooks (secret scan + format check)
cp .env.example .env
pnpm infra:up       # MongoDB (replica set), Valkey, Qdrant, SeaweedFS (S3), Mailpit
pnpm build && pnpm migrate
pnpm dev            # web on :5173, api on :4000, workers (all roles) with health on :4100

pnpm lint && pnpm typecheck && pnpm test   # fast checks
pnpm test:integration                      # needs pnpm infra:up
pnpm test:e2e                              # Playwright + axe (first run: pnpm --filter @snapshare/web exec playwright install chromium)

# Optional (each off by default to spare laptop memory)
pnpm infra:ai          # ai-service (CPU) on :8000 — cd apps/ai-service && uv sync && uv run pytest
pnpm infra:monitoring  # Prometheus :9090, Grafana :3001 (dashboard "SnapShare — API RED")
pnpm infra:down        # stop everything (infra:reset also deletes local data)
```

Local tools: web app at http://localhost:5173, Mailpit UI at http://localhost:8025, API probes at http://localhost:4000/health and /ready, OpenAPI at http://localhost:4000/openapi.json (dev only), API metrics at http://localhost:9464/metrics.

CI (`.github/workflows/ci.yml`) runs on every PR and push to `main`, with path filters: Node checks, integration tests, ai-service checks, gitleaks + Semgrep, licence allowlist and dependency audits. Images are built on `main` and pushed to GHCR only for `v*` tags.

## How this project is developed (spec-driven, owner-gated)

1. **Spec first.** Every feature is specified in `docs/` before any code is written.
2. **Batches and gates.** Work happens in small batches. At the end of each batch, Claude stops and reports: summary, files changed, open questions, gaps.
3. **Owner decides.** The owner replies `approve`, `change <X>`, or `reject`. Nothing is committed until approved.
4. **One commit per approved batch.** This gives a clean history to review and roll back.
5. **Final decisions are locked.** Changing anything in Master Spec §2 needs explicit owner approval, recorded as an ADR in `docs/DECISIONS.md`.
6. **Each implementation phase (1–10) starts with a phase plan** that the owner approves before any code.

## Phase 0 progress

| Batch                   | Contents                                                                      | Status      |
| ----------------------- | ----------------------------------------------------------------------------- | ----------- |
| 1 — Product             | PRD, User Journeys, Screen Inventory                                          | ✅ Approved |
| 2 — Architecture & Data | Architecture, Database Schema, API Spec, OpenAPI, Decisions                   | ✅ Approved |
| 3 — AI, Security, Infra | AI Architecture, Security & Threat Model, Infrastructure, Deployment, Testing | ✅ Approved |
| 4 — Roadmap & Risks     | Implementation Plan, Risk Register, Architectural Gaps                        | ✅ Approved |

## Phase 1 progress

| Batch                         | Contents                                                                          | Status      |
| ----------------------------- | --------------------------------------------------------------------------------- | ----------- |
| 1A — Monorepo & packages      | pnpm + Turborepo, TypeScript, ESLint architecture rules, shared packages, hooks   | ✅ Approved |
| 1B — Infra, API, worker       | Docker Compose services, Express kernel, outbox relay, BullMQ workers, migrations | ✅ Approved |
| 1C — Web shell & design       | `@snapshare/ui`, all 89 inventory screens routed, en/hi, dark mode, a11y tests    | ✅ Approved |
| 1D — AI service, CI, monitors | FastAPI skeleton with scoped vectors, Dockerfiles, GitHub Actions, Prometheus     | ✅ Approved |

## Document index

| Document                                                                          | Purpose                                                 | Batch |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- | ----- |
| [MASTER_SPEC.md](docs/MASTER_SPEC.md)                                             | Owner's original master specification (source of truth) | 1     |
| [PRD.md](docs/PRD.md)                                                             | Product requirements, personas, scope, metrics          | 1     |
| [USER_JOURNEYS.md](docs/USER_JOURNEYS.md)                                         | End-to-end user flows                                   | 1     |
| [SCREEN_INVENTORY.md](docs/SCREEN_INVENTORY.md)                                   | All screens, routes, roles, states                      | 1     |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                                           | System design + diagrams                                | 2     |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)                                     | Collections, indexes, relationships                     | 2     |
| [API_SPEC.md](docs/API_SPEC.md) + [openapi/](docs/openapi/openapi.yaml)           | REST contract                                           | 2     |
| [DECISIONS.md](docs/DECISIONS.md)                                                 | Architecture Decision Records                           | 2     |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)                                     | Self-hosted AI platform                                 | 3     |
| [SECURITY.md](docs/SECURITY.md)                                                   | Threat model, controls, DPDP compliance                 | 3     |
| [INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) / [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Environments, scaling, costs, ops                       | 3     |
| [TESTING.md](docs/TESTING.md)                                                     | Test strategy and load tests                            | 3     |
| [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)                             | Phases 1–10 with acceptance criteria                    | 4     |
| [RISK_REGISTER.md](docs/RISK_REGISTER.md)                                         | Risks, licensing, cost drivers, pricing check           | 4     |
| [ARCHITECTURAL_GAPS.md](docs/ARCHITECTURAL_GAPS.md)                               | Open decisions for the owner                            | 4     |
| [CHANGELOG-SPEC.md](docs/CHANGELOG-SPEC.md)                                       | Approved spec changes                                   | all   |

## Confirmed decisions (Phase 0)

- **Stack:** exactly as Master Spec §4 (React/Vite/TS, Express/TS, MongoDB, Redis/BullMQ, Qdrant, FastAPI + ONNX Runtime, S3-compatible storage). InsForge is **not** used for this project.
- **Hosting:** Hetzner servers outside India and Backblaze B2 storage behind Cloudflare, chosen for cost (ADR-018/019).
- **Market:** India first. Razorpay is the primary payment provider and Stripe is secondary. Prices are in INR. Privacy compliance focuses on the DPDP Act 2023.
- **Architecture:** modular monolith API, plus independently deployable workers and an AI service.
- **Cost-first (ADR-015):** cheapest viable infrastructure at every stage. Any new recurring cost above ₹2,000/month needs owner approval.

## Spec coverage (MASTER_SPEC → docs)

| Spec § | Topic                             | Covered in                                                  |
| ------ | --------------------------------- | ----------------------------------------------------------- |
| 1–2    | Role, final decisions             | PRD, DECISIONS                                              |
| 3      | Product modules                   | PRD §4, SCREEN_INVENTORY, USER_JOURNEYS                     |
| 4      | Tech stack                        | ARCHITECTURE §3, DECISIONS                                  |
| 5      | Architectural principles          | ARCHITECTURE §1, §4; ADR-001/003                            |
| 6      | Multi-tenancy                     | ARCHITECTURE §5, DATABASE_SCHEMA §0/§3, ADR-007, TESTING §4 |
| 7      | Auth & security                   | API_SPEC §1.2, SECURITY §3.1, ADR-008                       |
| 8      | Media upload                      | ARCHITECTURE §6.1–6.2, API_SPEC §2.4                        |
| 9      | Self-hosted AI + privacy          | AI_ARCHITECTURE, SECURITY §8                                |
| 10     | Database                          | DATABASE_SCHEMA                                             |
| 11     | Subscriptions                     | DATABASE_SCHEMA §11, API_SPEC §2.10, RISK_REGISTER §3       |
| 12–13  | Gallery, proofing                 | USER_JOURNEYS J3/J4, API_SPEC §2.6–2.7                      |
| 14     | Business tools                    | PRD §4.1, API_SPEC §2.11, IMPLEMENTATION_PLAN Phase 8       |
| 15     | Infra & scalability               | INFRASTRUCTURE, DEPLOYMENT, TESTING §5                      |
| 16     | Monitoring                        | INFRASTRUCTURE §6, AI_ARCHITECTURE §11                      |
| 17     | Repo structure                    | ARCHITECTURE §3–4, DEPLOYMENT §2                            |
| 18     | Phases                            | IMPLEMENTATION_PLAN                                         |
| 19–20  | Engineering rules, DoD            | TESTING, SECURITY §4, IMPLEMENTATION_PLAN                   |
| 21     | Phase 0 outputs, costs, licensing | All docs; RISK_REGISTER §2/§4                               |
