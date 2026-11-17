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
| 015 | Cost-first infrastructure (owner directive) | **Accepted** (owner, 2026-11-17) |
| 016 | CPU-first AI inference, GPU on demand (scale-to-zero) | Accepted (Batch 3) |
| 017 | Self-hosted observability on the same box at launch | Accepted (Batch 3) |
| 018 | Cheaper hosting outside India (Hetzner) | **Accepted** (owner, 2026-11-17) |
| 019 | Backblaze B2 behind Cloudflare as primary object storage | Accepted (owner cost directive) |
| 020 | Free security self-assessment at launch; paid pentest after revenue | **Accepted** (owner, 2026-11-17) |
| 021 | Node 24 LTS and TypeScript 6.0 | **Accepted** (owner, 2026-11-17) |
| 022 | Local ESLint architecture rules instead of eslint-plugin-boundaries | **Accepted** (owner, 2026-11-17) |
| 023 | Local dev storage = SeaweedFS (MinIO images discontinued); Redis = Valkey | **Accepted** (owner, 2026-11-17) |
| 024 | `packages/server-kit` for server-only shared code | **Accepted** (owner, 2026-11-17) |

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

## ADR-015 — Cost-first infrastructure (owner directive)
**Context.** The owner's instruction (2026-11-17) was: "expenses dhyan rakhna, kam se kam aaye", meaning keep expenses as low as possible. Revenue starts at zero, and spec §2 (self-hosted, scalable) still applies.

**Decision.** These principles apply to every infrastructure and vendor choice:
1. **Pay for usage, not capacity.** Prefer scale-to-zero (GPU), egress-free storage (Cloudflare R2), and free tiers.
2. **Self-host open source on cheap VPS/bare metal** rather than managed SaaS, while the operational burden stays reasonable.
3. **Start on as few machines as possible.** Compose on 1–2 servers. Kubernetes only when it pays for itself.
4. **Architecture stays scale-ready** (stateless services, queues, separate deployables), so growing means adding machines, not rewriting.
5. **Every doc that adds infrastructure shows an INR monthly estimate.** Any new recurring cost above ₹2,000/month needs owner approval.

**Consequences.**
- ✅ Very low burn at launch.
- ⚠️ We take on more ops work (backups, patching), which is mitigated by scripts and runbooks.
- ⚠️ Some availability targets (99.9%) only apply from Stage 2 (INFRASTRUCTURE.md).

## ADR-016 — CPU-first AI, GPU on demand
**Context.** GPUs are the single largest potential cost. Light face detection and embedding models run acceptably on modern CPUs through ONNX Runtime. Spec §2 asks for GPU workers but doesn't require them to run all the time.

**Decision.**
- The ai-service supports `cpu` and `cuda` execution providers from the same code.
- At launch, indexing runs on **CPU workers**.
- An on-demand GPU node, billed hourly and scaled from zero, is started automatically **only when** `ai.face.index` lag exceeds the SLA threshold, for example during a big wedding upload.
- Selfie matching (one image) always runs on CPU.

**Consequences.**
- ✅ GPU cost is ₹0 when idle.
- ⚠️ Indexing during peaks is slower until the GPU node boots (about 3–5 minutes).
- ⚠️ The provider choice must support hourly billing and an API to start and stop nodes.

## ADR-017 — Self-hosted observability, minimal footprint
**Decision.**
- Prometheus + Grafana + Loki run on the ops/primary box.
- Errors go to **GlitchTip**, which is self-hosted and Sentry-SDK compatible, or to the Sentry free tier while volume stays inside it.
- OpenTelemetry traces are sampled at 5% and sent to Grafana Tempo with 7-day retention.

**Consequences.** Spec §4 tooling is kept (the Sentry SDK and the OTel SDK) at no or near-zero cost. If error volume outgrows the free tier, we stay on GlitchTip.

## ADR-018 — Cheaper hosting outside India
**Context.** Batch 3 asked whether to host in India (safer under DPDP, more expensive) or outside India (cheaper). The owner chose cheaper on 2026-11-17: "move it to cheaper".

**Decision.**
- Compute runs on **Hetzner**: dedicated AX-line servers for steady load, cloud instances for flexible load. Use the Singapore location if available for lower latency, otherwise Germany/Finland.
- GPU bursts use hourly marketplaces (RunPod/Vast.ai).

**Consequences.**
- ✅ Compute costs about 3–5× less for the same hardware, with no quality reduction.
- ⚠️ API latency rises about 120–150 ms from India. Images are unaffected because they are served from Cloudflare's India edge.
- ⚠️ The privacy policy must disclose cross-border processing, and a lawyer confirms this (SECURITY §8).
- ⚠️ Biometric vectors live outside India, which is lawful under DPDP s.16 unless the destination country is restricted. This is re-checked when the restricted list is published.

## ADR-019 — Backblaze B2 behind Cloudflare
**Context.** Storage is the biggest variable cost (INFRASTRUCTURE §4.1).

**Decision.**
- Primary bucket: Backblaze B2 (EU region, S3-compatible API). Delivery goes through the Cloudflare Worker media gateway, which signs origin requests (aws4fetch).
- B2 → Cloudflare egress is free (Bandwidth Alliance).
- Cloudflare R2 is the drop-in fallback through the same S3 abstraction.
- Where other docs say "R2", read it as "the primary S3-compatible bucket".

**Consequences.**
- ✅ About 60% cheaper storage with the same 11-nines durability design and zero egress.
- ⚠️ Downloads that bypass Cloudflare (direct presigned original downloads) are billed by B2 beyond the free allowance (3× stored data per month). To avoid this, route original downloads through the gateway as well.
- ⚠️ Verify current B2 pricing and Bandwidth Alliance terms before Phase 1 setup.

## ADR-020 — Security testing on a budget
**Decision.**
- At launch: a free self-assessment against ASVS L2, plus ZAP, Nuclei, Semgrep and Trivy, plus the automated tenant-isolation suite.
- A paid external pentest happens once MRR passes ₹2 lakh or an Enterprise customer requires it.

**Consequences.**
- ✅ Saves ₹1–3 lakh before revenue.
- ⚠️ Somewhat higher residual risk at launch. It is mitigated by keeping the tenant-isolation test suite mandatory.

## ADR-021 — Node 24 LTS and TypeScript 6.0
**Context.** The docs said Node 22. By Nov 2026, Node 24 is the active LTS, supported until 2028. TypeScript 7.0 (the native Go port) is out, but typescript-eslint supports only TypeScript versions below 6.1.

**Decision.**
- Use Node 24 LTS, pinned in `.nvmrc` and `engines`.
- Use TypeScript **6.0.3**, the newest version the lint tooling supports. Revisit TS 7 when typescript-eslint supports it.
- Since TS 6 no longer loads Node types by default, the shared base config sets `"types": ["node"]`, and browser packages override it.

**Consequences.** Longer runtime support at no cost. Docker images use `node:24`.

## ADR-022 — Local architecture lint rules
**Context.** The Phase 1 plan named `eslint-plugin-boundaries`. Its v7 rewrite moved the module-entry-point rules to a new policy API that is documented only on its website, so its behaviour was hard to verify.

**Decision.** A small local ESLint plugin (`tooling/eslint/architecture-plugin.js`, about 60 lines) enforces exactly the two rules needed:
1. Cross-module imports go only through `modules/<name>/index`.
2. Mongoose models are imported only from the same module's `repositories/` (ADR-007).

Fixture tests in `tooling/architecture-rules.test.ts` prove both rules.

**Consequences.**
- ✅ One fewer dependency, and the rule behaviour is fully known and tested.
- ⚠️ We maintain these ~60 lines ourselves.

## ADR-023 — SeaweedFS for local S3 and Valkey for Redis
**Context.**
- **MinIO:** the plan named MinIO for local S3-compatible storage, but MinIO stopped publishing free Docker images; `minio/minio` returns 404 on Docker Hub as of Nov 2026.
- **Redis:** Redis 8 is distributed under AGPL/SSPL-style terms.

**Decision.**
- **Local storage:** SeaweedFS 4.50 (Apache-2.0), with buckets created automatically by `storage-init`. Production storage is unchanged: Backblaze B2 (ADR-019). The app only speaks the S3 API, so the backend is swappable.
- **Redis:** Valkey 8.1 (BSD-3, the Linux Foundation Redis fork), run with `maxmemory-policy noeviction` as BullMQ requires. The same choice applies in production at no cost.

**Consequences.** Both are free and permissively licensed, and the app code is unaffected.

## ADR-024 — `packages/server-kit`
**Context.** The api and the workers both need the outbox model and writer, queue factories with DLQ handling, the logger with redaction, and the Mongo/Redis connection helpers. MASTER_SPEC §17 lists only `ui`, `types`, `config` and `validators` packages.

**Decision.** Add `packages/server-kit`, holding server-only code that is never imported by the web app.

**Consequences.**
- ✅ One tested implementation of the outbox and DLQ logic instead of two copies.
- This is a small extension of the spec's §17 structure, recorded here.

## ADR-025 — Public GitHub repository
**Context.** The repo was private on GitHub's free plan. That plan meters Actions at 2,000 minutes a month and does not allow branch protection on private repos; Pro costs about ₹340 a month. The owner chose not to spend on GitHub (2026-11-17).

**Decision.** Make `ankitmehtag/snapshare-ai` public. Before the switch, a full-history gitleaks scan found no secrets, and no `.env`, key or certificate files are tracked.

**Consequences.**
- ✅ Unmetered GitHub-hosted CI and free branch protection, at ₹0.
- ⚠️ Code, docs (including pricing and roadmap) and the commit author email are visible to anyone. Secrets must never be committed: gitleaks runs in pre-commit and CI.
- ⚠️ Forks can reuse the code. Add a licence (or an explicit "all rights reserved" notice) before launch; until then, default copyright applies.
