# SnapShare AI — Master Product & Engineering Specification

> Source of truth provided by the project owner. Changes to this file require owner approval and an entry in `CHANGELOG-SPEC.md`.
> Phase 0 confirmed additions: **India-first market** (Razorpay primary, INR, DPDP Act 2023), **stack exactly as §4** (no InsForge), **batch-gated delivery**.

## 1. Role
Build SnapShare AI, a production-grade, scalable, self-hosted AI photography SaaS platform. The goal is a complete business and personal photo-sharing ecosystem, not a basic photo gallery. Kwikpic's capabilities are the inspiration, but the branding, UX, architecture and implementation are original.

## 2. Final Product Decisions (locked)
- **Customers:** professional photographers, studios, wedding photographers, event organizers, individual users, families/private groups.
- **AI:** 100% self-hosted inference; no external AI APIs; GPU inference workers; CPU processing workers; model provider abstraction.
- **Business model:** monthly + annual subscriptions, configurable plans, feature entitlements, storage quotas, usage limits within plans, enterprise subscriptions.
- **Scale:** 10,000+ photographer accounts, high-volume event uploads, concurrent gallery visitors, horizontal scaling, independent worker scaling, separate AI compute.

## 3. Product Modules
**A. Photographer Studio:** studio registration, studio profile, team management, RBAC, events, albums, bulk photo uploads, video uploads, AI photo discovery, guest invitations, QR sharing, client galleries, watermarks, client favorites, client proofing, digital albums, portfolio builder, custom domains, CRM, analytics, subscription management.

**B. Personal Photo Sharing:** personal accounts, private albums, family sharing, group sharing, private invitations, AI photo search, consent-based face matching, favorites, downloads, storage management, subscription upgrades, data export, account deletion.

Both experiences share infrastructure but have separate dashboards, navigation and access rules.

**C. Super Admin:** global dashboard, account/studio/individual-user management, subscriptions, revenue analytics, payments, storage monitoring, AI processing monitoring, GPU utilization, queue monitoring, abuse reporting, feature flags, audit logs, system health.

## 4. Mandatory Stack
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, React Router, React Hook Form, Zod.
- **Backend:** Node.js, Express, TypeScript, MongoDB, Mongoose, Redis, BullMQ, Socket.IO, REST, OpenAPI.
- **AI:** Python, FastAPI, OpenCV, InsightFace-compatible models, SCRFD-compatible detection, ONNX Runtime, PyTorch, CUDA, Qdrant.
- **Media:** Sharp, FFmpeg, EXIF extraction, perceptual hashing, compression, thumbnails, watermarking.
- **Storage:** Cloudflare R2 / S3-compatible, signed URLs, multipart uploads, CDN, lifecycle policies.
- **Infra:** Docker, Docker Compose, Nginx, Kubernetes-ready, GitHub Actions, Prometheus, Grafana, Sentry, OpenTelemetry.
- **Payments:** Razorpay, Stripe, webhook verification.

## 5. Architectural Principles
- Modular monolith for the core API.
- Independently deployable: frontend, API, media workers, AI service, AI workers, notification workers.
- No unnecessary microservices. Keep clear boundaries so modules can be extracted later.
- Expensive operations run asynchronously.
- API instances are stateless.
- No image binaries in MongoDB.
- No synchronous GPU inference in API requests.

## 6. Multi-Tenancy
- **Supported account shapes:** individual accounts, studio tenants, multiple users per studio, multiple studios per authorized user, and platform admins.
- **Required controls:** tenant isolation, RBAC, permission-based authorization, resource ownership, audit logging, and subscription entitlements.
- **Scoping rules:**
  - Every tenant-owned resource is scoped by `tenantId`.
  - Personal resources use a separate ownership scope.
  - The design prevents IDOR and cross-tenant access.
  - The backend never trusts a frontend-supplied `tenantId` without validating membership.

## 7. Auth & Security
- **Account flows:** email registration and verification, login/logout, password reset, refresh tokens, session revocation, device/session management, and optional Google OAuth.
- **Abuse protection:** rate limiting and brute-force protection.
- **Credential handling:** secure password hashing and HTTP-only cookies.
- **Request safety:** CSRF protection, Zod validation, security headers, and safe CORS.
- **Auditing:** audit logs for sensitive operations.

## 8. Media Upload
- **Uploads:**
  - Direct-to-storage via presigned URLs, with multipart and resumable uploads.
  - Retry, cancel and progress tracking.
  - Bulk and folder uploads.
- **Validation:** duplicate detection, file validation, size limits, MIME verification, and EXIF extraction.
- **Sessions:** upload session management.
- **Derivatives:** original, thumbnail, preview, web-optimized, and watermarked preview. Originals are never overwritten.
- **Storage:** lifecycle management.
- **Jobs:** BullMQ jobs with retries, idempotency, dead-letter handling, and an outbox pattern.

## 9. Self-Hosted AI Platform
**Pipeline:**
1. Receive an authorized job.
2. Download the image via a short-lived URL.
3. Detect faces.
4. Generate embeddings.
5. Store access-controlled biometric records.
6. Index the embeddings in Qdrant.
7. Match only against enrolled, consenting participants.
8. Store the authorized results.
9. Notify the users.

**Capabilities:** face detection, recognition, similarity matching, face grouping, semantic image search, categorization, blur detection, quality scoring, duplicate detection, similar-photo detection.

**Model architecture:**
- Model registry, versions and configuration.
- Confidence thresholds.
- GPU inference with CPU fallback.
- Batch inference and warmup.
- Inference monitoring, retries and rollback.
- ONNX Runtime + CUDA.
- Model interfaces that are decoupled from business logic.
- Qdrant for vectors; MongoDB for metadata and ownership.

**Privacy:**
- Facial recognition is opt-in, with explicit informed consent and consent version tracking.
- Consent can be revoked, and biometric data can be deleted.
- Retention policies, access restrictions and audit logging apply.
- Users get non-biometric discovery alternatives.
- Embeddings are never exposed to clients.
- Matching never runs across unrelated tenants.
- The product never claims perfect accuracy.
- Model and weight licenses must be verified before shipping.

## 10. Database
Collections:
- **Identity:** users, sessions, refreshTokens, verificationTokens
- **Tenancy:** studios, memberships, roles, invitations
- **Personal:** personalProfiles, personalAlbums
- **Photography:** events, albums, photos, photoVariants
- **Uploads:** uploadSessions, uploadParts, uploadJobs
- **AI:** faceProfiles, faceMatches, aiJobs, aiModelVersions
- **Sharing:** galleryAccess, shareLinks, qrCodes
- **Engagement:** favorites, comments, selections
- **Business:** clients, leads, bookings, invoices
- **Billing:** plans, subscriptions, payments, usageRecords
- **Platform:** notifications, auditLogs, featureFlags

Qdrant: `face_embeddings`, `image_embeddings`. The schema includes indexing, pagination, retention and deletion policies. DATABASE_SCHEMA.md covers relationships and example documents.

## 11. Subscription Engine
- **Plans:** Free, Personal Pro, Photographer Starter, Photographer Pro, Studio Business, Enterprise. Plans are dynamically configurable.
- **Entitlements:** an entitlement engine gates features.
- **Usage tracked:** storage, events, upload volume, AI usage, team members, gallery traffic, retention.
- **Billing flows:** upgrade, downgrade, cancel, renew, grace periods, failed payments, webhooks, invoices and payment history.
- **Providers:** Razorpay and Stripe through separate adapters.
- **No hardcoded plan limits.**

## 12. Gallery
- **Layouts:** masonry, grid, fullscreen viewer.
- **Browsing:** infinite scroll, lazy load, search.
- **Engagement:** favorites, comments.
- **Access:** download permissions, private links, password protection, QR access, expiration.
- **Branding:** custom branding.
- **Enforcement:** permissions are checked on every request and download.

## 13. Client Proofing
- **Clients can:** select favorites, comment, approve or reject photos, submit final selections, and download approved photos.
- **Photographers can:** export selections.

## 14. Business Tools
- **Customers:** CRM, customer profiles, leads, bookings.
- **Presentation:** portfolio builder, custom domains, branding, gallery themes, digital albums.
- **Operations:** revenue analytics, team management.

## 15. Infrastructure & Scalability
- **Local dev:**
  - Docker Compose with MongoDB, Redis, Qdrant, MinIO, API, web, media workers and the AI service.
  - CPU AI mode.
- **Production:**
  - API replicas, separate worker pools and dedicated GPU workers.
  - Mongo replica sets, with sharding later.
  - Redis HA and Qdrant replication.
  - Object storage + CDN, load balancing.
  - Centralized logs, metrics, tracing and automated backups.
  - Kubernetes-ready manifests that don't require K8s initially.
- **Load tests:** concurrent uploads, gallery access, API traffic, queue throughput, AI inference throughput and vector search.

## 16. Monitoring
Monitoring covers API latency, error rate, upload throughput, queue backlog, worker failures, GPU memory/utilization, inference latency, MongoDB/Redis/Qdrant health, storage consumption and subscription revenue. An internal operations dashboard shows these.

## 17. Repository Structure
```
apps/        web/ api/ worker/ ai-service/
packages/    ui/ types/ config/ validators/
infrastructure/ docker/ nginx/ kubernetes/ monitoring/ scripts/
docs/        PRD, ARCHITECTURE, DATABASE_SCHEMA, API_SPEC, SECURITY, AI_ARCHITECTURE,
             INFRASTRUCTURE, IMPLEMENTATION_PLAN, DEPLOYMENT, TESTING, DECISIONS
```

## 18. Development Phases
| Phase | Name | Scope |
|---|---|---|
| 0 | Research & Spec | Research and full specification |
| 1 | Foundation | Monorepo, shared packages, Docker, DBs, design system, CI |
| 2 | Identity & Tenancy | Auth, accounts, memberships, RBAC, isolation, audit |
| 3 | Core Photography | Events, albums, uploads, processing, gallery |
| 4 | AI Platform | FastAPI, model registry, detection, embeddings, Qdrant, consent, matching, monitoring |
| 5 | Client Experience | Invitations, QR, sharing, favorites, comments, proofing, downloads |
| 6 | Monetization | Plans, entitlements, metering, Razorpay, Stripe, invoices, webhooks |
| 7 | Personal Sharing | Personal albums, family sharing, private galleries, AI discovery, storage plans |
| 8 | Business Expansion | CRM, portfolio, custom domains, white-label, digital albums |
| 9 | Admin & Ops | Super admin, analytics, revenue, storage, AI dashboard, feature flags |
| 10 | Production Hardening | Security audits, load testing, DR, backup-restore tests, deploy, docs |

## 19. Engineering Rules
- **Honesty about status:**
  - No mock data presented as production functionality.
  - Incomplete features are never marked done.
  - Automated tests are never skipped.
- **Tenant and storage safety:**
  - Tenant authorization is never bypassed.
  - Storage credentials are never exposed.
  - Originals are never stored in MongoDB.
- **Jobs and billing:**
  - No synchronous GPU inference.
  - No uncontrolled background jobs, and no ignored failed jobs.
  - No billing without webhook verification.
- **Working practices:**
  - Files are inspected before they are overwritten.
  - Code stays modular and typed, with reusable components and stable API contracts.
  - Decisions are documented, licenses verified, and privacy/deletion workflows included.

## 20. Definition of Done
A module is done only when:
1. The frontend is built.
2. The backend integration works.
3. The database integration works.
4. Authorization is in place.
5. Validation is in place.
6. Error handling works.
7. Loading, empty and failure states exist.
8. Automated tests pass.
9. The documentation is updated.
10. Integration with dependent modules is verified.

## 21. First Execution
Phase 0 only. Produce:
- PRD
- Architecture with diagrams
- Database schema
- API spec
- AI architecture
- Infrastructure plan
- Security threat model
- User journeys
- Screen inventory
- Roadmap
- Risk register

Identify expensive infrastructure dependencies and licensing risks. Do not implement the app. Present the results, identify gaps, and wait.
