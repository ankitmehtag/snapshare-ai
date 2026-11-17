# Phase 2 Plan — Identity & Tenancy

| Field | Value |
|---|---|
| Status | ✅ Plan approved 2026-11-17 (owner: "aage ka kaam bhi continue rakhna, approved h sab") · Batch 2A 🔵 in progress |
| Source | IMPLEMENTATION_PLAN.md Phase 2 · API_SPEC §1.2, §2.1–2.2 · DATABASE_SCHEMA §2–3 · SECURITY §3.1–3.2, §4, §6 · TESTING §3–4 · ARCHITECTURE §5 · ARCHITECTURAL_GAPS G10 |
| Duration | ≈ 3 weeks of effort, delivered in **4 gated batches** |
| Cost | **₹0.** Email goes to Mailpit locally; Turnstile uses Cloudflare's public test keys; Google OAuth is tested against a local fake OIDC issuer (test-only). Real keys are created at deploy time (Phase 6), all on free tiers |
| Out of scope | Events, uploads, photos (Phase 3); billing and plan limits (Phase 6: `limits.seats` reads the default plan config); personal albums (Phase 7); admin consoles (Phase 9) |

## 1. Goal
A photographer can sign up, verify their email, log in on several devices, create a studio, invite team members with roles, and see an audit trail — and **no request can ever read or change another studio's data**, proven by generated tests for every route.

## 2. Key choices (recommended defaults; changeable at any gate)

| Topic | Choice | Why |
|---|---|---|
| Password hashing | `@node-rs/argon2` (MIT), argon2id m=64 MB, t=3, p=1 (SECURITY §3.1) | Prebuilt binaries: works in the distroless image with no compiler |
| Tokens | `jose` (MIT): access JWT 10 min, signed EdDSA with `kid` for rotation; opaque refresh token, rotating, family reuse detection | Matches API_SPEC §1.2; no server-side JWT secret sharing |
| CSRF | Double-submit (`csrf` cookie = `X-CSRF-Token`) + Origin/Referer allowlist on every non-GET | API_SPEC §1.2; the web client already sends the header (Batch 1C) |
| Email | `EmailProvider` interface + one **SMTP adapter** (Mailpit locally). Brevo, Resend and Amazon SES all speak SMTP, so the G10 choice is a config value, not code | ₹0, no vendor lock-in, no account needed until deploy |
| Email delivery | Written to the outbox in the same transaction → `notify.email` queue → notify worker | No lost or duplicate mail if the API crashes mid-request (ADR-003) |
| Bot protection | Cloudflare Turnstile (free), required after 2 failed logins and on signup/forgot | SECURITY §3.1 |
| Breached passwords | HIBP k-anonymity range API (free, no key), fail-open with a log if unreachable | SECURITY §3.1 |
| Google sign-in | OIDC with PKCE + state + nonce (`openid-client`, MIT) | API_SPEC §2.1 |
| Onboarding "Personal" | Shown, but leads to an honest "Personal workspace arrives in Phase 7" page; no fake features | MASTER_SPEC §19 |
| Legal pages | Terms, Privacy, Biometric notice as **drafts marked "pending legal review"** (EN + HI) | ⚖️ reviewed before launch (G18) |
| Admin MFA | TOTP API only (`otpauth`, MIT); admin UI stays Phase 9 | API_SPEC §2.1 says "Phase 2 for API" |
| pnpm 7-day cooldown | Turned on in the first batch committed on/after 2026-11-24 | Phase 1 deferral (pnpm-workspace.yaml TODO) |

## 3. Batches (each ends with a gate: demo + test evidence → owner approves → commit)

### Batch 2A — Accounts & sessions (API)
- **Collections + migration:** `users`, `sessions`, `refreshTokens`, `verificationTokens`, `auditLogs` (append-only), with the indexes from DATABASE_SCHEMA §2. Models only inside `repositories/` (lint-enforced).
- **Endpoints:** `GET /auth/csrf`, `POST /auth/signup`, `/verify-email`, `/resend-verification`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/reset-password`; `GET/PATCH /me`, `POST /me/password`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `DELETE /me/sessions`.
- **Protections:** rate-limit classes from API_SPEC §1.6; lockout after 10 failures for 15 min; uniform responses + timing on signup/login/forgot (anti-enumeration); reset revokes every session; revoked sessions cached in Redis so revocation bites within the access-token TTL.
- **Email:** outbox → notify worker → SMTP; verify and reset templates in EN + HI; no tokens or emails in logs.
- **Audit:** `audit.record()` for login, failed login, logout, password change/reset, session revoke.
- **Gate evidence:** TESTING §3 auth suite green (lockout, rotation + reuse detection, revoke within TTL, CSRF rejection, enumeration-safe responses); a real email arrives in Mailpit.

### Batch 2B — Studios, roles, permissions, isolation framework (API)
- **Collections + migration:** `studios`, `roles` (system roles + full permission matrix seeded), `memberships`, `invitations`.
- **Auth context middleware** (ARCHITECTURE §5.2): JWT → session check → `resolveMembership` (Redis cache, cleared on any membership change) → `req.ctx`; **non-members get 404**.
- **`ScopedRepository.forScope(scope)`** injecting the tenant filter into every query, update and delete.
- **Endpoints:** API_SPEC §2.2 (studios, members, invitations, accept, role change, last-owner protection, transfer ownership, roles, audit-log list), `POST /studios` slug rules (reserved words), `DELETE /studios/:id` → 30-day `pending_deletion` with cancel.
- **Isolation framework** (TESTING §4): route metadata gains `resourceParams` and `permission`; a generator builds the 5 cases per route; CI fails on any route without metadata.
- **Gate evidence:** every studio route covered by generated isolation tests; privilege-escalation tests (can't grant above own role, last owner protected).

### Batch 2C — Web: auth, onboarding, account, team
- Screens: AUTH-01…06, ONB-01/02, GL-01 (workspace switcher), GL-02, GL-03, ST-02, ST-40, ST-41, PUB-03 — each with loading, empty, error and success states.
- React Hook Form + Zod (shared schemas from `packages/validators`), auth state, one silent refresh on `TOKEN_EXPIRED`, route guards, Turnstile widget, EN + HI strings.
- **Gate evidence:** Playwright journey — sign up → open the verify email in Mailpit → log in → create studio → invite → accept in a second browser → change role → audit entry visible; axe zero violations on every new screen; mobile overflow check; Lighthouse ≥ 90 on login.

### Batch 2D — Google sign-in, admin MFA API, hardening
- Google OIDC login + account linking (verified email only), tested against a local fake issuer.
- Admin TOTP setup/verify API; admin routes reject sessions without `mfaVerifiedAt` < 12 h.
- Studio deletion sweeper job (registered queue) honouring the 30-day grace.
- SECURITY §4 checklist walked for every Phase 2 module; ZAP baseline scan against the local stack (free).
- **Gate evidence:** OAuth CSRF/PKCE tests; MFA tests; ZAP baseline with no high findings; Phase 2 Definition of Done (§5).

## 4. Owner actions needed
**None during Phase 2.** Optional and free: create a Google OAuth client if you want to try "Sign in with Google" by hand before launch.

## 5. Definition of Done for Phase 2
1. All 4 batch gates approved; CI green.
2. TESTING §3 auth suite and §4 tenant-isolation suite green; every route has isolation metadata.
3. SECURITY §4 checklist completed per module.
4. Screens AUTH-01…06, ONB-01/02, GL-01…03, ST-02, ST-40, ST-41, PUB-03 marked `ready` (no mock data).
5. Docs updated (API_SPEC/OpenAPI generated from routes, CHANGELOG-SPEC, any new ADRs). Tag `phase-2-complete`.

## 6. Risks for this phase
| Risk | Mitigation |
|---|---|
| Subtle auth bugs (session fixation, token reuse) | Spec'd test suite written first for each flow; ZAP baseline in 2D |
| Cross-tenant leak through a forgotten filter | `ScopedRepository` + lint rule + generated isolation tests on every route |
| Email deliverability at launch | SMTP adapter now; SPF/DKIM/DMARC on the sending domain at deploy (G10) |
| Free email tier limits | Brevo ≈ 300/day is ample for beta; SES at ≈ $0.10/1,000 later |
