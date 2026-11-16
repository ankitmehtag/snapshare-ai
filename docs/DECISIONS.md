# Architecture Decision Records

Format: each ADR has **Context → Decision → Consequences**, with a status of `Proposed`, `Accepted` or `Superseded by ADR-x`.
Any ADR that changes a locked decision in MASTER_SPEC §2 needs explicit owner approval.

| # | Title | Status |
|---|---|---|
| 001 | Modular monolith API + separately deployable workers and AI service | Accepted (Batch 2) |
| 002 | Use the spec stack (MongoDB/Express), not InsForge | **Accepted** (owner, 2026-11-17) |
| 003 | Transactional outbox + BullMQ for async work | Accepted |
| 004 | AI service owns Qdrant; embeddings never leave it | Accepted |
| 005 | Per-tenant fairness in queues | Accepted |
| 006 | Direct-to-storage uploads + token-verified media gateway | Accepted |
| 007 | Dual ownership scope: `tenantId` vs `scopeType/scopeId` | Accepted |
| 008 | Cookie-based auth with rotating refresh tokens + CSRF double-submit | Accepted |
| 009 | Razorpay primary, Stripe secondary, behind a `PaymentProvider` adapter | **Accepted** (owner, 2026-11-17) |
| 010 | Node orchestrator calls a FastAPI inference service (no Python BullMQ) | Accepted |
| 011 | Denormalized photo variant summary + `photoVariants` source records | Accepted |
| 012 | Versioned plans; entitlements resolved and cached per scope | Accepted |
| 013 | Monorepo with pnpm workspaces + Turborepo | Accepted |
| 014 | Collections added beyond spec §10 | **Accepted** (owner, 2026-11-17) |

---

## ADR-001 — Modular monolith API
**Context.** Spec §5 asks for a modular monolith with independently deployable workers and an AI service. The team is small and must reach 10k studios.

**Decision.**
- One `api` deployable with strict internal modules (ARCHITECTURE §4).
- Lint rules enforce module boundaries.
- Workers ship as one image with several entrypoints. The AI service is a separate Python image.

**Consequences.**
- ✅ Simple deploys, shared transactions and fast iteration.
- ✅ Modules can be extracted later.
- ⚠️ Discipline is needed to stop modules reaching into each other's models. Lint rules and code review provide it.

## ADR-002 — Spec stack, not InsForge
**Context.** The user-level `~/AGENTS.md` makes InsForge (a Postgres BaaS) the default backend. The SnapShare master spec mandates Express, MongoDB, Redis/BullMQ, Qdrant and self-hosting.

**Decision.** Follow the master spec. InsForge is not used for this project. The owner confirmed this on 2026-11-17.

**Consequences.**
- ✅ Full control over infrastructure, data residency and the AI pipeline.
- ⚠️ More infrastructure to run ourselves (auth, storage, email).
- ⚠️ The InsForge skills and AGENTS.md instructions don't apply to this repo. A project-level `AGENTS.md`/`CLAUDE.md` will be added in Phase 1 to override them.

## ADR-003 — Transactional outbox + BullMQ
**Context.** State changes must reliably trigger async jobs, with no lost or phantom jobs.

**Decision.**
- Write `outbox` docs in the same MongoDB transaction as the state change.
- A relay publishes them to BullMQ with `jobId = outbox._id`.
- Consumers are idempotent.
- Every queue has a registered retry policy and a DLQ.

**Consequences.**
- ✅ At-least-once delivery, with no dual-write bugs.
- ⚠️ MongoDB must run as a replica set, even locally (single-node replica set).
- ⚠️ The relay adds a small amount of latency (under 1 s with change streams).

## ADR-004 — AI service owns Qdrant
**Context.** Biometric vectors are the most sensitive data we hold. Spec §9 says embeddings are never exposed to clients and matching is never cross-tenant.

**Decision.**
- Only `ai-service` holds Qdrant credentials and network access.
- Its API returns face metadata and match results, never vectors.
- Every search requires a scope filter.

**Consequences.**
- ✅ Smallest possible blast radius, and one place to audit biometric access.
- ⚠️ The orchestrator can't run ad-hoc vector queries. New capabilities need new ai-service endpoints, which is intended.

## ADR-005 — Per-tenant queue fairness
**Context.** One studio uploading 50,000 photos must not delay a guest's selfie match or other studios' processing.

**Decision.**
- Selfie matching gets its own **priority** queue (`ai.face.match`).
- For bulk queues, start with a **per-tenant round-robin producer**: the relay limits each scope to N pending jobs and holds the rest in the outbox.
- Evaluate **BullMQ Pro groups** (a commercial licence) if that proves insufficient.

**Consequences.**
- ✅ Fair latency without a paid dependency at launch.
- ⚠️ Slightly more complex relay logic.

## ADR-006 — Direct uploads + media gateway
**Context.** API servers must never carry image bytes. Galleries must be private but still CDN-cacheable.

**Decision.**
- Uploads use presigned multipart URLs.
- Media is delivered through a token-verifying gateway (Cloudflare Worker + R2 recommended; Nginx `secure_link` + cache as the alternative), with a cache key that excludes the token.
- Originals and zips are downloaded through short-lived presigned GETs, after an authorization check.

**Consequences.**
- ✅ API bandwidth stays near zero and CDN cache hit rates stay high.
- ⚠️ The gateway is a small piece of extra code to secure and test.
- ⚠️ The provider choice is a pending owner decision (Batch 4 gaps).

## ADR-007 — Dual ownership scope
**Context.** Spec §6 says tenant resources are scoped by `tenantId` and personal resources use a separate ownership scope. Photos, uploads, faces and favorites exist in both.

**Decision.**
- Studio-only collections use `tenantId`.
- Shared collections use `scopeType: 'studio'|'personal'` + `scopeId`. When the type is `studio`, `scopeId` equals the tenantId.
- `ScopedRepository` injects the scope from the server-resolved `AuthContext`.

**Consequences.**
- ✅ One upload, media and AI pipeline for both products, with an explicit and testable scope on every query.
- ⚠️ Developers must use scoped repositories. Lint rules and isolation tests enforce this.

## ADR-008 — Cookie auth + rotating refresh tokens
**Context.** This is a browser SPA on a subdomain of the API (`app.` and `api.snapshare.in`), and XSS-safe storage of tokens is required.

**Decision.**
- A 10-minute access JWT in an HttpOnly cookie.
- An opaque, rotating refresh token with reuse detection.
- A double-submit CSRF token plus an Origin check.
- Sessions in MongoDB, with a revocation cache in Redis.
- Separate signing keys for gallery and proofing tokens.

**Consequences.**
- ✅ Tokens can't be read by JS, and sessions can be revoked.
- ⚠️ Custom domains need a same-origin API proxy (ARCHITECTURE §6.8).

## ADR-009 — Payments: Razorpay primary
**Context.** The product launches in India first, where UPI, cards and netbanking are expected.

**Decision.**
- A `PaymentProvider` interface (`createCustomer`, `createSubscription`, `changePlan`, `cancel`, `verifyWebhook`, `parseEvent`, `refund`) with `RazorpayAdapter` and `StripeAdapter` implementations.
- Webhooks are the source of truth.
- GST invoices are generated in-house.

**Consequences.**
- ✅ Payment methods that suit the local market, and Stripe is ready for global expansion.
- ⚠️ Plan IDs must be mapped per provider (`plans.prices[].providerPriceIds`).

## ADR-010 — Node orchestrator + FastAPI inference service
**Context.** BullMQ is Node-native. Python consumers (the `bullmq` PyPI port) don't have full feature parity.

**Decision.**
- `ai-orchestrator` (Node) consumes the `ai.*` queues, builds batches and calls `ai-service` over internal HTTP.
- `ai-service` (FastAPI) is a stateless inference server with an internal dynamic batcher, model registry and Qdrant access.

**Consequences.**
- ✅ One queue technology, and the GPU service is easy to scale and health-check.
- ⚠️ An extra network hop, though it is negligible compared with inference time.
- ⚠️ Backpressure is enforced by orchestrator concurrency plus ai-service `429` responses when its batch queue is full.

## ADR-011 — Variant storage
**Decision.**
- `photos.variants` holds a compact summary (key, width, height) for single-read gallery queries.
- The `photoVariants` collection (required by the spec) is the full record, used for lifecycle, regeneration and accounting.
- The media worker writes both in one transaction.

## ADR-012 — Versioned plans & entitlement cache
**Decision.**
- Plans are immutable once published. Changes create a new `version`, and existing subscribers keep their version unless migrated.
- Resolved entitlements are computed in this order: `plan.entitlements ⊕ addOns ⊕ subscription.overrides`.
- The result is cached in Redis per scope.
- Business code calls only `entitlements.can()` and `entitlements.limit()`, never plan keys.

## ADR-013 — Monorepo tooling
**Decision.**
- pnpm workspaces + Turborepo for `apps/*` and `packages/*`.
- The Python `ai-service` lives in the same repo, managed with `uv`.
- Turborepo only orchestrates its Docker build.

**Consequences.** Shared Zod types reach web, api and workers directly. Python models are generated from OpenAPI for the internal AI contract.

## ADR-014 — Collections added beyond spec §10
**These need owner approval.** Each is required by a spec feature:

| Collection | Required by |
|---|---|
| `consents` | §9 consent version tracking and revocation |
| `faceDetections` | §9 face grouping and photographer face view; keeps `photos` small |
| `personalGroups` | §3B family and group sharing |
| `guestIdentities` | §3A guest invitations and selfie search without an account |
| `proofingSets` | §13 client proofing (selection limit, submit/lock) |
| `watermarkPresets` | §3A watermark management |
| `webhookEvents` | §11 webhook idempotency |
| `outbox` | §8 outbox pattern |
| `exportJobs` | §3B data export, zip downloads, selection export |
| `abuseReports` | §3C abuse reporting |
| `customDomains` | §14 custom domains |
