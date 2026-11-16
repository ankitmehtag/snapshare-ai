# SnapShare AI — Screen Inventory

| Field | Value |
|---|---|
| Version | 0.1 (Draft, Batch 1) |
| Related | [PRD.md](PRD.md), [USER_JOURNEYS.md](USER_JOURNEYS.md) |

**Conventions**
- **ID prefixes:**
  - `PUB` = public/guest
  - `AUTH` = authentication
  - `ONB` = onboarding
  - `ST` = studio
  - `ME` = personal
  - `AD` = super admin
- **Roles:**
  - Studio roles: `OWN` Owner, `ADM` Admin, `EDT` Editor, `UPL` Uploader, `VWR` Viewer
  - Personal user: `USR`
  - Guest with a valid grant: `GST`
  - Proofing client: `CLI`
  - Platform admin: `PA` (also `PSUP` support, read-mostly)
- **Phase:** the implementation phase from MASTER_SPEC §18.
- **States:** every data screen must implement **Loading**, **Empty**, **Error**, and **Forbidden/Not found** (Definition of Done §20.7). Only special states are listed below.

---

## 1. Public & Marketing

| ID | Screen | Route | Roles | Phase | Special states / notes |
|---|---|---|---|---|---|
| PUB-01 | Landing | `/` | Anyone | 1 | SEO; links to pricing |
| PUB-02 | Pricing | `/pricing` | Anyone | 6 | Plans loaded from the API (never hardcoded); INR |
| PUB-03 | Legal: Terms, Privacy, Biometric notice | `/legal/*` | Anyone | 2 | Versioned docs; EN + HI |
| PUB-04 | Report abuse form | `/report` | Anyone | 9 | Captcha |

## 2. Authentication & Onboarding

| ID | Screen | Route | Roles | Phase | Notes |
|---|---|---|---|---|---|
| AUTH-01 | Sign up | `/signup` | Anyone | 2 | Email + password; Google OAuth |
| AUTH-02 | Log in | `/login` | Anyone | 2 | Lockout after repeated failures; "Too many attempts" state |
| AUTH-03 | Verify email | `/verify?token=` | Anyone | 2 | States: success, expired, already verified |
| AUTH-04 | Forgot password | `/forgot` | Anyone | 2 | Always shows a generic success message |
| AUTH-05 | Reset password | `/reset?token=` | Anyone | 2 | Expired token state |
| AUTH-06 | Accept invitation | `/invite/:token` | Invitee | 2 | Studio or group invite; wrong-account warning |
| ONB-01 | Choose workspace | `/onboarding` | USR | 2 | Studio vs Personal |
| ONB-02 | Studio setup | `/onboarding/studio` | USR | 2 | Slug availability check |
| ONB-03 | Plan selection / trial | `/onboarding/plan` | OWN | 6 | Skippable in Phase 2 (default plan) |

## 3. Global (all authenticated workspaces)

| ID | Screen / Component | Route | Phase | Notes |
|---|---|---|---|---|
| GL-01 | Workspace switcher | Top bar | 2 | Personal + each studio membership |
| GL-02 | Account settings: profile, password | `/account` | 2 | Re-auth before changing email or password |
| GL-03 | Sessions & devices | `/account/sessions` | 2 | Revoke one session or all |
| GL-04 | Notifications center | Drawer | 5 | Real-time through Socket.IO |
| GL-05 | Global upload tray | Floating | 3 | Upload progress survives route changes |

## 4. Photographer Studio (`/studio/:studioSlug/...`)

| ID | Screen | Route | Roles | Phase | Notes |
|---|---|---|---|---|---|
| ST-01 | Dashboard | `/` | All studio roles | 3 | Onboarding checklist (empty state), recent events, storage meter |
| ST-02 | Studio profile & branding | `/settings/profile` | OWN, ADM | 2 | Logo, colors, contact details, GST details |
| ST-10 | Events list | `/events` | All | 3 | Filter by status or date; archive |
| ST-11 | Create / edit event | `/events/new`, `/events/:id/edit` | OWN, ADM, EDT | 3 | Plan limit state |
| ST-12 | Event detail: photos grid | `/events/:id` | All | 3 | Tabs: All / Albums / Processing / Failed / Hidden; bulk select actions |
| ST-13 | Upload manager | `/events/:id/upload` | OWN, ADM, EDT, UPL | 3 | Pause / resume / cancel; duplicate review; quota-exceeded state |
| ST-14 | Album management | `/events/:id/albums` | OWN, ADM, EDT | 3 | Drag to reorder; move photos |
| ST-15 | Photo detail (internal) | `/events/:id/photos/:photoId` | All | 3 | EXIF, variants, faces (boxes only, no embeddings), hide/delete |
| ST-16 | Event sharing & access | `/events/:id/share` | OWN, ADM, EDT | 5 | Share links, QR (download PNG/PDF poster), PIN, expiry, download rules |
| ST-17 | Guest list & invitations | `/events/:id/guests` | OWN, ADM, EDT | 5 | Invite by email/phone; who viewed or downloaded |
| ST-18 | Event AI settings | `/events/:id/ai` | OWN, ADM | 4 | Enable AI; consent text preview; face clusters view; reindex |
| ST-19 | Event analytics | `/events/:id/analytics` | OWN, ADM | 5 | Views, downloads, matches, top photos |
| ST-20 | Proofing setup | `/events/:id/proofing` | OWN, ADM, EDT | 5 | Selection limit, deadline, clients |
| ST-21 | Proofing review & export | `/events/:id/proofing/review` | OWN, ADM, EDT | 5 | Submitted vs open; export CSV/filenames/zip |
| ST-22 | Video library | `/events/:id/videos` | OWN, ADM, EDT, UPL | 3b | Transcode status |
| ST-23 | Digital album builder | `/events/:id/album-design` | OWN, ADM, EDT | 8 | Spread editor |
| ST-30 | Watermark presets | `/settings/watermarks` | OWN, ADM | 3 | Live preview |
| ST-31 | Gallery themes | `/settings/themes` | OWN, ADM | 8 | |
| ST-32 | Custom domains | `/settings/domains` | OWN | 8 | DNS verification, TLS states (pending/active/failed) |
| ST-33 | Portfolio builder | `/portfolio` | OWN, ADM, EDT | 8 | |
| ST-40 | Team & roles | `/team` | OWN, ADM (VWR read-only) | 2 | Seat limit state |
| ST-41 | Studio audit log | `/team/activity` | OWN, ADM | 2 | |
| ST-50 | Clients (CRM) | `/clients` | OWN, ADM | 8 | |
| ST-51 | Client profile | `/clients/:id` | OWN, ADM | 8 | Events, invoices, notes |
| ST-52 | Leads pipeline | `/leads` | OWN, ADM | 8 | Kanban |
| ST-53 | Bookings calendar | `/bookings` | OWN, ADM, EDT | 8 | |
| ST-54 | Invoices (to clients) | `/invoices` | OWN, ADM | 8 | GST invoice |
| ST-60 | Studio analytics | `/analytics` | OWN, ADM | 5 → 8 | Basic in 5; revenue in 8 |
| ST-70 | Billing & subscription | `/billing` | OWN | 6 | Plan, usage meters, invoices, payment method, cancel |

## 5. Public Gallery & Client Proofing (`/g/:shareCode/...` or custom domain)

| ID | Screen | Route | Roles | Phase | Notes |
|---|---|---|---|---|---|
| PUB-10 | Gallery landing / cover | `/g/:code` | GST | 3 | Studio branding; expired and suspended states |
| PUB-11 | PIN gate | `/g/:code/unlock` | GST | 5 | Lockout state |
| PUB-12 | Gallery browse | `/g/:code/a/:albumId?` | GST | 3 | Masonry/grid toggle, infinite scroll, "Report" |
| PUB-12a | Fullscreen viewer | Modal | GST | 3 | Swipe, keyboard; download button if allowed |
| PUB-13 | Face search consent | `/g/:code/find-me` | GST | 4 | Versioned text; decline → browse; minor path |
| PUB-14 | Guest verification (OTP) | `/g/:code/verify` | GST | 4 | Pending owner decision (PRD Q1) |
| PUB-15 | Selfie capture | `/g/:code/selfie` | GST | 4 | Camera permission denied state; no-face / several-faces guidance |
| PUB-16 | My matches | `/g/:code/me` | GST | 4 | Processing state ("Searching...", Socket.IO); no-match state; "Not me" |
| PUB-17 | Download center | Modal / `/g/:code/downloads` | GST | 5 | Zip generation progress (async); download disabled state |
| PUB-18 | Favorites (guest) | `/g/:code/favorites` | GST | 5 | Stored per guest identity |
| PUB-20 | Proofing gallery | `/p/:code` | CLI | 5 | Selection counter, approve/reject, comments, deadline banner |
| PUB-21 | Submit selection | Modal | CLI | 5 | Locked state after submission |
| PUB-30 | Public portfolio | `/:studioSlug` or custom domain | Anyone | 8 | |

## 6. Personal (`/me/...`)

| ID | Screen | Route | Roles | Phase | Notes |
|---|---|---|---|---|---|
| ME-01 | Home | `/me` | USR | 7 | Recent albums, "My Event Photos", storage meter |
| ME-10 | Albums list | `/me/albums` | USR | 7 | |
| ME-11 | Album detail | `/me/albums/:id` | USR (owner/member) | 7 | Grid, viewer, contributors |
| ME-12 | Upload (mobile-first) | `/me/albums/:id/upload` | Owner, contributor | 7 | "Keep tab open" warning on mobile web |
| ME-20 | Groups | `/me/groups` | USR | 7 | Family / friends |
| ME-21 | Group detail & members | `/me/groups/:id` | Group members | 7 | Roles: owner/contributor/viewer; invite links |
| ME-30 | My Photos (AI) | `/me/photos-of-me` | USR | 7 | Requires enrollment; shows a CTA if not consented |
| ME-31 | My Event Photos | `/me/events` | USR | 5 | Matches saved from studio events |
| ME-32 | Search | `/me/search` | USR | 7 (semantic later) | |
| ME-33 | Favorites | `/me/favorites` | USR | 7 | |
| ME-40 | Privacy & face data | `/me/privacy` | USR | 4 | Consent list, revoke, re-enroll, delete biometrics |
| ME-41 | Storage management | `/me/storage` | USR | 7 | Usage by album; duplicate/blur cleanup suggestions |
| ME-42 | Billing | `/me/billing` | USR | 6 | Personal Pro upgrade |
| ME-50 | Data export & delete account | `/me/data` | USR | 7 | Export job progress; deletion grace period |

## 7. Super Admin (`/admin/...`, separate login policy, MFA required)

| ID | Screen | Route | Roles | Phase | Notes |
|---|---|---|---|---|---|
| AD-00 | Admin login + MFA | `/admin/login` | PA | 9 | TOTP required |
| AD-01 | Global dashboard | `/admin` | PA, PSUP | 9 | Accounts, MRR, storage, queue health, alerts |
| AD-10 | Accounts (users) | `/admin/users` | PA, PSUP | 9 | Search, suspend, impersonate (with reason, audited) |
| AD-11 | Studios | `/admin/studios` | PA, PSUP | 9 | Plan, usage, members |
| AD-12 | Account / studio detail | `/admin/{users,studios}/:id` | PA, PSUP | 9 | |
| AD-13 | Subscriptions & payments | `/admin/billing` | PA | 9 | Refunds, manual overrides (audited) |
| AD-14 | Plans & entitlements editor | `/admin/plans` | PA | 6 | Versioned plan configs |
| AD-15 | Revenue analytics | `/admin/revenue` | PA | 9 | MRR, churn, ARPU, by plan |
| AD-20 | Moderation / abuse queue | `/admin/moderation` | PA, PSUP | 9 | |
| AD-30 | Queues & jobs | `/admin/queues` | PA | 9 | Depth, failures, DLQ retry |
| AD-31 | AI & GPU monitoring | `/admin/ai` | PA | 9 | GPU utilization/memory, inference latency, model versions, rollback |
| AD-32 | Storage monitoring | `/admin/storage` | PA | 9 | Per tenant, growth, orphaned objects |
| AD-33 | System health | `/admin/health` | PA | 9 | Mongo/Redis/Qdrant/storage status; Grafana links |
| AD-40 | Audit logs | `/admin/audit` | PA | 2 (API) / 9 (UI) | Filter, export |
| AD-41 | Feature flags | `/admin/flags` | PA | 9 | Global, per plan, per tenant |

## 8. Totals

| App | Screens |
|---|---|
| Public / marketing | 4 |
| Auth & onboarding | 9 |
| Global | 5 |
| Studio | 29 |
| Public gallery & proofing | 13 |
| Personal | 14 |
| Super admin | 15 |
| **Total** | **89** |

MVP (Phases 1–7) covers about 60 screens. The rest are Phases 8–9.

## 9. Shared UI components (`packages/ui`, built in Phase 1)
- **Layouts:** AppShell (studio, personal, admin variants), PublicGalleryShell (themeable).
- **Data display:**
  - Grids: PhotoGrid (virtualized masonry/grid), Lightbox.
  - Tables: DataTable (TanStack Table + shadcn), with pagination.
  - StatCard and UsageMeter.
- **Inputs:** Uploader (dropzone, queue, progress), ConsentDialog (versioned), OtpInput, SelfieCapture, QRCodeCard.
- **States:** EmptyState, ErrorState, Forbidden, LoadingSkeleton.
- **Account and access:** PlanGate (entitlement-aware wrapper with upgrade CTA), RoleGate.
