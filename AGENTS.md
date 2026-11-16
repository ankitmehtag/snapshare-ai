# AGENTS.md — SnapShare AI

These project instructions **override** any user-level defaults (for example `~/AGENTS.md`).

## Backend: no InsForge

This project does **not** use InsForge (ADR-002 in `docs/DECISIONS.md`). Do not use the InsForge SDK, CLI or skills here. The stack is fixed by `docs/MASTER_SPEC.md` §4: Express + MongoDB + Redis/BullMQ + Qdrant + a FastAPI AI service, with S3-compatible storage (Backblaze B2 / MinIO).

## How work happens (owner-gated, spec-driven)

- Work only on the batch or phase the owner approved (`docs/phases/`). Stop at each gate with a summary, the changed files, test evidence and open questions.
- Commit only after the owner says **approve**. One commit per approved batch.
- Changing a locked decision (MASTER_SPEC §2) or an ADR needs owner approval and a new ADR.
- **Cost-first (ADR-015):** pick the cheapest option that keeps quality good. Any new recurring cost above ₹2,000/month needs owner approval.

## Engineering rules (MASTER_SPEC §19–20)

- **Tenant scope.**
  - Never trust a client-supplied `tenantId`.
  - All queries go through scoped repositories. Lint enforces this: Mongoose models may be imported only from `repositories/`.
- **Modules.** API modules import each other only through `modules/<name>/index.ts` (lint-enforced).
- **Storage and AI safety.**
  - No image binaries in MongoDB.
  - No synchronous GPU/AI inference in HTTP requests.
  - Never expose embeddings to clients.
- **Background jobs.** Every queue must be registered in `packages/config/src/queues.ts`.
- **Honesty about status.** No mock data presented as real functionality, and incomplete features are never marked done.
- **Tests.** Every change ships with tests, and `pnpm lint && pnpm typecheck && pnpm test` must pass.

## Commands

```bash
fnm use            # Node 24 LTS (.nvmrc)
pnpm install
pnpm build | lint | typecheck | test
```

## Key docs

`docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, `docs/API_SPEC.md`, `docs/SECURITY.md`, `docs/AI_ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`.
