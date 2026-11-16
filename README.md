# SnapShare AI

Self-hosted, AI-powered photography SaaS for professional photographers, studios, event organizers, and individuals/families.

> **Status:** Phase 0 — Specification. No application code exists yet.

## How this project is developed (spec-driven, owner-gated)

1. **Spec first.** Every feature is specified in `docs/` before any code is written.
2. **Batches and gates.** Work happens in small batches. At the end of each batch, Claude stops and reports: summary, files changed, open questions, gaps.
3. **Owner decides.** The owner replies `approve`, `change <X>`, or `reject`. Nothing is committed until approved.
4. **One commit per approved batch.** This gives a clean history to review and roll back.
5. **Final decisions are locked.** Changing anything in Master Spec §2 needs explicit owner approval, recorded as an ADR in `docs/DECISIONS.md`.
6. **Each implementation phase (1–10) starts with a phase plan** that the owner approves before any code.

## Phase 0 progress

| Batch | Contents | Status |
|---|---|---|
| 1 — Product | PRD, User Journeys, Screen Inventory | ✅ Approved |
| 2 — Architecture & Data | Architecture, Database Schema, API Spec, OpenAPI, Decisions | ✅ Approved |
| 3 — AI, Security, Infra | AI Architecture, Security & Threat Model, Infrastructure, Deployment, Testing | ✅ Approved |
| 4 — Roadmap & Risks | Implementation Plan, Risk Register, Architectural Gaps | 🟡 In progress |

## Document index

| Document | Purpose | Batch |
|---|---|---|
| [MASTER_SPEC.md](docs/MASTER_SPEC.md) | Owner's original master specification (source of truth) | 1 |
| [PRD.md](docs/PRD.md) | Product requirements, personas, scope, metrics | 1 |
| [USER_JOURNEYS.md](docs/USER_JOURNEYS.md) | End-to-end user flows | 1 |
| [SCREEN_INVENTORY.md](docs/SCREEN_INVENTORY.md) | All screens, routes, roles, states | 1 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design + diagrams | 2 |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Collections, indexes, relationships | 2 |
| [API_SPEC.md](docs/API_SPEC.md) + [openapi/](docs/openapi/openapi.yaml) | REST contract | 2 |
| [DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records | 2 |
| [AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) | Self-hosted AI platform | 3 |
| [SECURITY.md](docs/SECURITY.md) | Threat model, controls, DPDP compliance | 3 |
| [INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) / [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Environments, scaling, costs, ops | 3 |
| [TESTING.md](docs/TESTING.md) | Test strategy and load tests | 3 |
| IMPLEMENTATION_PLAN.md | Phases 1–10 with acceptance criteria | 4 |
| RISK_REGISTER.md | Risks, licensing, cost drivers | 4 |
| ARCHITECTURAL_GAPS.md | Open decisions for the owner | 4 |

## Confirmed decisions (Phase 0)

- **Stack:** exactly as Master Spec §4 (React/Vite/TS, Express/TS, MongoDB, Redis/BullMQ, Qdrant, FastAPI + ONNX Runtime, S3-compatible storage). InsForge is **not** used for this project.
- **Hosting:** Hetzner servers outside India and Backblaze B2 storage behind Cloudflare, chosen for cost (ADR-018/019).
- **Market:** India first. Razorpay is the primary payment provider and Stripe is secondary. Prices are in INR. Privacy compliance focuses on the DPDP Act 2023.
- **Architecture:** modular monolith API, plus independently deployable workers and an AI service.
- **Cost-first (ADR-015):** cheapest viable infrastructure at every stage. Any new recurring cost above ₹2,000/month needs owner approval.
