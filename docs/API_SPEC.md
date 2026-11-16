# SnapShare AI — API Specification

| Field | Value |
|---|---|
| Version | 0.1 (Draft, Batch 2) |
| Base URL | `https://api.snapshare.in/api/v1` (dev: `http://localhost:4000/api/v1`) |
| Machine-readable | [openapi/openapi.yaml](openapi/openapi.yaml) (skeleton for core endpoints; generated from Zod from Phase 1 onward) |

## 1. Conventions

### 1.1 Style
- REST + JSON. Resources are plural nouns. Actions are sub-resources (`POST /proofing-sets/:id/submit`).
- **Scope in the path:**
  - Studio routes: `/studios/:studioId/...`
  - Personal routes: `/me/...`
  - Guest routes: `/public/...`
  - Platform routes: `/admin/...`
  - Internal routes (not exposed through Nginx): `/internal/...`
- Field names are `camelCase`. Timestamps are ISO-8601 UTC. Money is `{amountMinor, currency}`.
- **Versioning:** the major version is in the path (`/v1`). Additive changes don't need a version bump. Breaking changes need `/v2` plus a deprecation header.

### 1.2 Authentication

| Client | Mechanism |
|---|---|
| Web app (users) | `at` cookie: access JWT (10 min, HttpOnly, Secure, SameSite=Lax, Domain=.snapshare.in). `rt` cookie: opaque refresh token (Path=/api/v1/auth/refresh, HttpOnly, 30 days, rotating) |
| CSRF | Double-submit: the `csrf` cookie (readable by JS) must equal the `X-CSRF-Token` header on every non-GET request. Requests must also come from an allowed `Origin`/`Referer` |
| Public gallery | `gt` cookie: gallery JWT (12 h), Path=/api/v1/public, from link, PIN, OTP or invite. Also sent as `Authorization: Bearer` for embeds |
| Proofing client | `pt` cookie: proofing JWT, scoped to one proofing set |
| Admin | Same user session, plus `platformRole` and an MFA-verified session (`mfaVerifiedAt` within 12 h). Admin routes reject sessions without MFA |
| Internal (workers → API, orchestrator → ai-service) | mTLS or a shared HMAC service token on a private network; never public |
| Webhooks | Provider signature verification (Razorpay `X-Razorpay-Signature` HMAC-SHA256; Stripe `Stripe-Signature`) on the **raw body** |

### 1.3 Errors (RFC 9457)
```json
HTTP/1.1 403 Forbidden
Content-Type: application/problem+json
{
  "type": "https://docs.snapshare.in/errors/entitlement-required",
  "title": "Your plan does not include custom domains",
  "status": 403,
  "code": "ENTITLEMENT_REQUIRED",
  "detail": "Upgrade to Studio Business to use custom domains.",
  "requestId": "req_01J...",
  "meta": { "feature": "customDomain", "requiredPlans": ["studio_business", "enterprise"] }
}
```

| Status | `code` examples | Notes |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `errors: [{path, message}]` from Zod |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `MFA_REQUIRED` | The client calls `/auth/refresh` once on `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `ENTITLEMENT_REQUIRED`, `CSRF_FAILED`, `CONSENT_REQUIRED` | |
| 404 | `NOT_FOUND` | **Also returned for resources in another tenant** (anti-enumeration) |
| 409 | `CONFLICT`, `DUPLICATE`, `STATE_INVALID` | e.g. editing a submitted selection |
| 410 | `GALLERY_EXPIRED` | |
| 413 | `FILE_TOO_LARGE` | |
| 422 | `QUOTA_EXCEEDED` | `meta: {metric, limit, used}` |
| 423 | `LOCKED` | PIN or OTP lockout; `Retry-After` |
| 429 | `RATE_LIMITED` | `Retry-After` |

### 1.4 Pagination
Cursor-based on every list endpoint:
```
GET /studios/:studioId/events/:eventId/photos?limit=100&cursor=eyJzIjoiMjAyNi0xMi0xMlQwNjozMDowMFoiLCJpZCI6IjY2Ni4uLiJ9
→ { "data": [...], "page": { "nextCursor": "...", "hasMore": true } }
```
- `limit`: default 50, max 200 (photos 500).
- The cursor is opaque base64url of `{sortKey, _id}`, signed so clients can't tamper with it.

### 1.5 Idempotency
- These requests accept `Idempotency-Key`:
  - `POST /billing/checkout`
  - upload completion
  - `POST .../faces/match`
  - export requests
- Keys are stored in Redis for 24 h, and a repeated request returns the first response.

### 1.6 Rate limits (initial)

| Route class | Limit |
|---|---|
| `/auth/login` | 5/min per IP+email; 20/h per IP; account lock after 10 failures (15 min) |
| `/auth/signup`, `/auth/forgot` | 5/h per IP |
| OTP send | 3 per 10 min per phone/email; 10/day per IP; captcha after 2 |
| Gallery PIN | 5 per 15 min per IP+code |
| Face match | 5/h per guest per event |
| Presign parts | 600/min per user |
| Public gallery reads | 300/min per IP (CDN absorbs image traffic) |
| Authenticated default | 1,000/min per user |

## 2. Endpoint catalogue

`Perm` is the permission checked; `Ent` is the entitlement checked; `Phase` is the build phase.

### 2.1 Auth & Account — Phase 2
| Method | Path | Description | Notes |
|---|---|---|---|
| POST | `/auth/signup` | Create account, send verification | Generic response on an existing email |
| POST | `/auth/verify-email` | `{token}` | |
| POST | `/auth/resend-verification` | | Rate limited |
| POST | `/auth/login` | `{email, password}` → sets cookies | Brute-force protection |
| POST | `/auth/logout` | Revoke current session | |
| POST | `/auth/refresh` | Rotate refresh → new access | Reuse detection |
| POST | `/auth/forgot-password` / `/auth/reset-password` | | Reset revokes all sessions |
| GET | `/auth/oauth/google` / `/auth/oauth/google/callback` | OIDC with PKCE + state | |
| GET | `/auth/csrf` | Issues the CSRF cookie | |
| GET | `/me` | Profile + workspaces (memberships) + platform role | |
| PATCH | `/me` | Update profile | Email change needs re-verification |
| POST | `/me/password` | Change password (requires current) | |
| GET | `/me/sessions` | List devices | |
| DELETE | `/me/sessions/:sessionId` / `DELETE /me/sessions` | Revoke one / all others | |
| GET | `/me/flags` | Feature flags evaluated for the user | |
| POST | `/admin/auth/mfa/setup` / `/verify` | TOTP | Phase 9 (Phase 2 for API) |

### 2.2 Studios, Team, Roles — Phase 2
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/studios` | (any verified user) | Caller becomes owner |
| GET | `/studios/:studioId` | member | |
| PATCH | `/studios/:studioId` | `studio.settings` | Branding is entitlement-gated |
| DELETE | `/studios/:studioId` | owner + re-auth | 30-day grace |
| GET | `/studios/:studioId/members` | `team.view` | |
| POST | `/studios/:studioId/invitations` | `team.manage` | Ent: `limits.seats` |
| DELETE | `/studios/:studioId/invitations/:id` | `team.manage` | |
| POST | `/invitations/:token/accept` | authenticated | Any invitation kind |
| PATCH | `/studios/:studioId/members/:userId` | `team.manage` | Change role; can't demote the last owner |
| DELETE | `/studios/:studioId/members/:userId` | `team.manage` | Revokes access immediately |
| POST | `/studios/:studioId/transfer-ownership` | owner + re-auth | |
| GET | `/studios/:studioId/roles` | `team.view` | System roles (custom roles later) |
| GET | `/studios/:studioId/audit-logs` | `audit.view` | Cursor paged |

### 2.3 Events & Albums — Phase 3
| Method | Path | Perm | Notes |
|---|---|---|---|
| GET/POST | `/studios/:studioId/events` | `event.read` / `event.create` | Ent: `limits.activeEvents` |
| GET/PATCH/DELETE | `/studios/:studioId/events/:eventId` | read / `event.update` / `event.delete` | |
| POST | `/studios/:studioId/events/:eventId/archive` | `event.update` | |
| GET/POST | `/studios/:studioId/events/:eventId/albums` | | |
| PATCH/DELETE | `/studios/:studioId/events/:eventId/albums/:albumId` | | |
| POST | `/studios/:studioId/events/:eventId/albums/reorder` | `event.update` | |
| GET | `/studios/:studioId/events/:eventId/photos` | `event.read` | Filters: `albumId,status,visibility,hasFaces`; cursor |
| GET | `/studios/:studioId/photos/:photoId` | `event.read` | Includes delivery URLs and faces (boxes only) |
| PATCH | `/studios/:studioId/photos/:photoId` | `photo.edit` | Move album, hide |
| POST | `/studios/:studioId/photos/bulk` | `photo.edit`/`photo.delete` | `{action:'move'\|'hide'\|'delete'\|'restore', photoIds[] ≤ 1000}` |
| POST | `/studios/:studioId/photos/:photoId/reprocess` | `photo.edit` | Failed photos |
| GET/POST/PATCH/DELETE | `/studios/:studioId/watermark-presets[/:id]` | `studio.settings` | |

### 2.4 Uploads — Phase 3 (studio and personal share one design)
`:scopePath` is either `/studios/:studioId` or `/me`.

| Method | Path | Notes |
|---|---|---|
| POST | `{scopePath}/upload-sessions` | `{target, files:[{clientFileId, name, size, mime, sha256}] ≤ 2000 per call}` → per-file status (`new`/`duplicate`/`rejected`). Ent: storage quota, `maxFileBytes`, allowed MIME types |
| POST | `{scopePath}/upload-sessions/:sessionId/files` | Append more files (folder uploads > 2,000) |
| GET | `{scopePath}/upload-sessions/:sessionId` | Resume: files + completed parts |
| POST | `{scopePath}/upload-sessions/:sessionId/files/:fileId/parts` | `{partNumbers:[...]}` → presigned URLs (15 min). Small files: `{single:true}` → one PUT URL |
| POST | `{scopePath}/upload-sessions/:sessionId/files/:fileId/complete` | `{parts:[{partNumber, etag}]}` → photo created (`uploaded`); outbox → `media.process`. Idempotent |
| POST | `{scopePath}/upload-sessions/:sessionId/files/:fileId/abort` | |
| POST | `{scopePath}/upload-sessions/:sessionId/cancel` | Aborts all pending files |

### 2.5 Sharing, QR, Guests — Phase 5
| Method | Path | Perm | Notes |
|---|---|---|---|
| GET/POST | `/studios/:studioId/events/:eventId/share-links` | `share.manage` | PIN, expiry, permissions, OTP requirement |
| PATCH/DELETE | `/studios/:studioId/share-links/:linkId` | `share.manage` | Revoke |
| POST | `/studios/:studioId/share-links/:linkId/qr` | `share.manage` | → `202` async render (PNG/SVG/poster PDF) |
| GET | `/studios/:studioId/share-links/:linkId/qr` | | Asset URLs |
| GET/POST | `/studios/:studioId/events/:eventId/guests` | `share.manage` | Guest list, invite by email/phone |
| DELETE | `/studios/:studioId/events/:eventId/guests/:guestId` | `share.manage` | Block a guest |

### 2.6 Public gallery (guest) — Phases 3/4/5
All routes need a valid `gt` gallery token for `:code` unless marked otherwise.

| Method | Path | Notes |
|---|---|---|
| GET | `/public/galleries/:code` | **No token needed.** Branding, cover, requirements `{pin, otp, faceSearch}`, status (active/expired/suspended) |
| POST | `/public/galleries/:code/session` | `{pin?}` → issues `gt` (when no OTP is needed). Lockout |
| POST | `/public/guests/otp/send` / `/public/guests/otp/verify` | `{phone\|email, code}` → guest identity → `gt` with guestId |
| GET | `/public/galleries/:code/albums` | Visible albums |
| GET | `/public/galleries/:code/photos` | `?albumId&cursor&limit` → photos with **delivery URLs only** |
| GET | `/public/galleries/:code/photos/:photoId` | |
| POST | `/public/galleries/:code/consents` | `{purpose:'face_match', textVersion, locale, accepted:true, isMinor?:false}` → consentId. Requires guestId |
| DELETE | `/public/galleries/:code/consents/:consentId` | Revoke → deletion job |
| POST | `/public/galleries/:code/selfie-upload-url` | Presigned PUT for `tmp/selfies/` (≤ 8 MB, image/jpeg\|png\|webp) |
| POST | `/public/galleries/:code/face-searches` | `{selfieKey}` → `202 {jobId}`. Requires active consent. **Asynchronous** |
| GET | `/public/galleries/:code/face-searches/:jobId` | Status + results `[{photoId, confidence:'high'\|'medium'}]` (raw scores are never returned) |
| POST | `/public/galleries/:code/matches/:photoId/not-me` | Feedback |
| GET | `/public/galleries/:code/me/photos` | The guest's matched photos |
| PUT/DELETE | `/public/galleries/:code/favorites/:photoId` | |
| GET | `/public/galleries/:code/favorites` | |
| POST | `/public/galleries/:code/downloads` | `{photoIds[] \| 'favorites' \| 'matches', size:'web'\|'original'}` → a single presigned URL or `202 {exportJobId}` for a zip |
| GET | `/public/exports/:exportJobId` | Zip status + URL |
| POST | `/public/reports` | Abuse report (captcha, no token needed) |

### 2.7 Proofing — Phase 5
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/studios/:studioId/events/:eventId/proofing-sets` | Perm `proofing.manage` |
| PATCH | `/studios/:studioId/proofing-sets/:setId` | Limits, deadline, clients |
| POST | `/studios/:studioId/proofing-sets/:setId/open` / `/reopen` | State transitions |
| GET | `/studios/:studioId/proofing-sets/:setId/selections` | Review |
| POST | `/studios/:studioId/proofing-sets/:setId/exports` | `{format:'csv'\|'lightroom'\|'zip'}` → 202 |
| GET | `/public/proofing/:code` | Client view (`pt` token via invite + OTP) |
| PUT | `/public/proofing/:code/selections/:photoId` | `{decision}`; 409 if submitted; 422 if over the limit |
| POST | `/public/proofing/:code/comments` | `{photoId, body}` |
| POST | `/public/proofing/:code/submit` | Locks the selection |

### 2.8 AI (authenticated users and studio settings) — Phase 4
| Method | Path | Notes |
|---|---|---|
| GET | `/consent-texts/:purpose/current?locale=` | Versioned consent copy (public) |
| GET | `/me/consents` | All consents (ME-40) |
| POST | `/me/consents` | Personal face-match consent |
| DELETE | `/me/consents/:consentId` | Revoke → `ai.face.delete` (SLA 24 h) |
| POST | `/me/face-profile/enroll` | `{selfieKeys[1..3]}` → 202 job |
| DELETE | `/me/face-profile` | Delete biometrics |
| PATCH | `/studios/:studioId/events/:eventId/ai` | Enable/disable (disabling deletes the event's embeddings), Perm `ai.settings`, Ent `faceSearch` |
| POST | `/studios/:studioId/events/:eventId/ai/reindex` | Admin or owner; quota |
| GET | `/studios/:studioId/events/:eventId/ai/status` | Indexed / pending / failed counts |
| GET | `/studios/:studioId/events/:eventId/face-clusters` | Phase 4+ grouping (thumbnails only) |

### 2.9 Personal — Phase 7
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/me/albums` | |
| GET/PATCH/DELETE | `/me/albums/:albumId` | Owner; members read |
| GET | `/me/albums/:albumId/photos` | Cursor |
| POST | `/me/albums/:albumId/share` | Groups or users + role |
| GET/POST | `/me/groups` | |
| GET/PATCH/DELETE | `/me/groups/:groupId` | |
| POST | `/me/groups/:groupId/invitations` | Link or email |
| DELETE | `/me/groups/:groupId/members/:userId` | |
| GET | `/me/photos-of-me` | Requires a personal consent + face profile |
| GET | `/me/event-photos` | Matches saved from studio galleries |
| GET/PUT/DELETE | `/me/favorites[/:photoId]` | |
| GET | `/me/usage` | Storage meter |
| POST | `/me/exports` | Full data export → 202 |
| POST | `/me/delete-account` | Re-auth; 7-day grace |
| POST | `/me/delete-account/cancel` | |

### 2.10 Billing — Phase 6
| Method | Path | Notes |
|---|---|---|
| GET | `/plans?audience=studio\|personal` | Public; current plan versions |
| GET | `{scopePath}/billing/subscription` | Plan, status, period, pending change |
| GET | `{scopePath}/billing/entitlements` | Resolved features + limits + usage |
| POST | `{scopePath}/billing/checkout` | `{planKey, interval, provider?}` → Razorpay subscription id / Stripe Checkout URL. Idempotency-Key |
| POST | `{scopePath}/billing/change-plan` | Upgrade now (prorated) / downgrade at period end |
| POST | `{scopePath}/billing/cancel` / `/resume` | |
| GET | `{scopePath}/billing/payments` | History + invoice PDF URLs |
| PATCH | `{scopePath}/billing/profile` | GSTIN, legal name, address |
| POST | `/webhooks/razorpay` | Raw body; signature verified; stored in `webhookEvents`; processed async |
| POST | `/webhooks/stripe` | Same |

Studio billing routes need `billing.manage`.

### 2.11 Business (CRM) — Phase 8
CRUD under `/studios/:studioId/{clients,leads,bookings,invoices}`, plus:
- `POST /leads/:id/convert`
- `POST /invoices/:id/send`
- `GET/POST/DELETE /studios/:studioId/custom-domains` and `POST .../verify`
- `GET/PUT /studios/:studioId/portfolio`
- `/studios/:studioId/digital-albums/*`

Phase 8 specifies these in detail.

### 2.12 Notifications & realtime — Phase 5
| Method | Path | Notes |
|---|---|---|
| GET | `/me/notifications` | Cursor |
| POST | `/me/notifications/read` | `{ids[] \| 'all'}` |
| WS | `/socket.io` | Auth: `at` cookie (users) or `gt` (guests). Server-authorized rooms (ARCHITECTURE §6.7) |

**Socket events (server → client):**
- `upload.progress`
- `photo.processed`
- `photo.failed`
- `ai.index.progress`
- `faceSearch.completed`
- `proofing.selection.updated`
- `plan.updated`
- `notification.new`

### 2.13 Admin — Phase 9
All admin routes need `platformRole ∈ {admin, support}` plus MFA. Support users are read-only except for moderation.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/overview` | KPIs |
| GET | `/admin/users`, `/admin/users/:id` | Search |
| POST | `/admin/users/:id/suspend` / `/unsuspend` | Reason required; audited |
| POST | `/admin/impersonate` | `{userId, reason}` → impersonation session (30 min, banner, audited; no billing actions) |
| GET | `/admin/studios`, `/admin/studios/:id` | |
| GET/POST/PATCH | `/admin/plans` | New plan **versions** only; a published version is never edited in place |
| POST | `/admin/subscriptions/:id/override` | Limits/features override |
| POST | `/admin/payments/:id/refund` | Through the provider |
| GET | `/admin/revenue` | MRR, churn, ARPU |
| GET | `/admin/queues`, POST `/admin/queues/:name/jobs/:id/retry` | DLQ ops |
| GET | `/admin/ai` | GPU, latency, model versions |
| POST | `/admin/ai/models/:id/activate` / `/rollback` | Blocked if `license.commercialUse !== true` |
| GET | `/admin/storage` | Usage by scope, orphans |
| GET | `/admin/health` | Dependency status |
| GET/PATCH | `/admin/moderation`, `/admin/moderation/:reportId` | |
| GET | `/admin/audit-logs` | Filter + export |
| GET/POST/PATCH | `/admin/feature-flags` | |

### 2.14 Internal (private network only) — Phases 3/4
| Method | Path | Caller | Notes |
|---|---|---|---|
| POST | `ai-service: /v1/faces/index` | ai-orchestrator | Batch detect + embed + upsert. Returns faces without vectors |
| POST | `ai-service: /v1/faces/match` | ai-orchestrator | `{selfieUrl, filter:{scopeId, eventId}, modelVersion}` → `[{photoId, faceId, score}]` |
| POST | `ai-service: /v1/faces/enroll` | ai-orchestrator | Reference embeddings |
| POST | `ai-service: /v1/vectors/delete` | ai-orchestrator | By `photoId`/`eventId`/`faceProfileId`/`scopeId` filter |
| POST | `ai-service: /v1/images/quality` | ai-orchestrator | Blur and quality scores |
| GET | `ai-service: /health`, `/ready`, `/metrics`, `/v1/models` | k8s, Prometheus | `/ready` stays false until the models are warmed up |

Batch 3 (AI_ARCHITECTURE.md) defines the full contracts.

## 3. Entitlement-gated endpoints (summary)

| Entitlement | Gated endpoints |
|---|---|
| `limits.storageBytes`, `limits.maxFileBytes` | upload-sessions create/append |
| `limits.activeEvents` | events create / un-archive |
| `limits.seats` | invitations (studio_member) |
| `limits.aiPhotosPerMonth` | AI indexing (soft: photos stay browsable, indexing pauses) |
| `features.faceSearch` | event AI enable, public face-searches |
| `features.customBranding` | studio branding fields, `hideSnapshareBadge` |
| `features.proofing` | proofing-sets |
| `features.customDomain` | custom-domains |
| `features.crm` | clients, leads, bookings, invoices |
| `limits.galleryExpiryMaxDays` | share-links/event gallery expiry |

## 4. Traceability: API → collections

| API area | Collections |
|---|---|
| Auth | users, sessions, refreshTokens, verificationTokens, auditLogs |
| Studios/team | studios, memberships, roles, invitations |
| Events | events, albums, photos, photoVariants, watermarkPresets |
| Uploads | uploadSessions, uploadJobs, uploadParts, photos, outbox |
| Sharing | shareLinks, qrCodes, galleryAccess, guestIdentities |
| AI | consents, faceProfiles, faceDetections, faceMatches, aiJobs, aiModelVersions + Qdrant |
| Engagement | favorites, comments, proofingSets, selections |
| Personal | personalProfiles, personalAlbums, personalGroups |
| Billing | plans, subscriptions, payments, usageRecords, webhookEvents |
| CRM | clients, leads, bookings, invoices, customDomains |
| Platform | notifications, featureFlags, abuseReports, exportJobs, auditLogs |
