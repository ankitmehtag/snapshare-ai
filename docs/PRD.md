# SnapShare AI — Product Requirements Document

| Field | Value |
|---|---|
| Version | 0.1 (Draft, Batch 1) |
| Status | Awaiting owner approval |
| Owner | Project owner |
| Source | [MASTER_SPEC.md](MASTER_SPEC.md) |
| Launch market | India first (INR, Razorpay, DPDP Act 2023) |

---

## 1. Vision

SnapShare AI helps people get **every photo they appear in, within minutes of an event, privately**. Photographers get one place to run the business side of their work: delivery, proofing, client relationships and their portfolio.

**Product positioning.**
- **For photographers and studios**, SnapShare is the fastest way to deliver an event's photos to hundreds of guests. Guests find themselves with a selfie, so photographers no longer get "send me my pics" WhatsApp messages. Branded galleries also bring in repeat business.
- **For families and individuals**, SnapShare is a private, ad-free place to pool photos from weddings, trips and festivals. AI finds your photos only if you allow it.

**Differentiators.**
1. **Self-hosted AI.** Biometric data never leaves our infrastructure. This is a trust and compliance selling point under DPDP.
2. **Consent-first face discovery.** Guests and family members can use the product without enrolling their face, through non-biometric discovery such as albums, time, photographer tags and search.
3. **One platform, two experiences.** The studio business tools and the personal sharing experience share one backend. Guests convert into personal users, and personal users can find photographers.

## 2. Problem Statements

| # | Who | Problem today |
|---|---|---|
| P1 | Wedding/event photographers | They deliver 2,000–10,000 photos per event through Google Drive or WeTransfer links. Guests can't find their own photos, so photographers spend hours answering requests. |
| P2 | Photographers | Proofing (album selection) happens over WhatsApp or spreadsheets. Selections get lost and revisions drag on. |
| P3 | Studios | No single tool covers team access, client CRM, galleries, branding and billing. |
| P4 | Event guests | They get one giant link and have to scroll thousands of photos to find the ten they're in. |
| P5 | Families | Event photos are scattered across many phones and WhatsApp groups and get compressed and lost. |
| P6 | Privacy-conscious users | Face-recognition apps process biometrics with third parties, unclearly and without consent. |

## 3. Personas

### 3.1 Rohan — Solo Wedding Photographer (primary)
- Age 29, Jaipur. Shoots 40–60 weddings a year, about 5,000 photos per wedding, with 1–2 freelance assistants.
- Works from a laptop and Lightroom. Clients reach him on WhatsApp and Instagram.
- **Goals:** fast delivery; looking premium against competitors; fewer "send my photos" messages; simple proofing for the album.
- **Pain:** Google Drive storage costs; clients losing links; repeated, slow album selection.
- **Pays for:** storage, AI face discovery, branding (no SnapShare logo), proofing.
- **Plan:** Photographer Starter → Pro.

### 3.2 Meera — Studio Owner (primary)
- Runs a 12-person studio in Mumbai covering weddings, corporate work and pre-wedding shoots. About 300 events a year.
- **Goals:** team roles (editors, shooters, sales); tracking leads to bookings to delivery; a custom domain (`gallery.meerastudio.in`); revenue analytics.
- **Pain:** permissions spread across many tools; no visibility into team output.
- **Plan:** Studio Business or Enterprise.

### 3.3 Arjun — Event Organizer (secondary)
- Runs corporate conferences and college fests with 500–5,000 attendees. Hires photographers per event.
- **Goals:** a QR code at the venue so attendees get their photos the same day; sponsor branding on galleries.
- **Pain:** attendee complaints; no post-event engagement.
- **Plan:** Photographer Pro or per-event Enterprise.

### 3.4 Priya — Event Guest (high-volume, usually not paying)
- Scans a QR code at a wedding on her phone.
- **Goals:** see her own photos in under a minute without a long sign-up; download in good quality.
- **Concerns:** "Will they keep my face data?"
- **Conversion path:** guest → free personal account → Personal Pro.

### 3.5 The Sharma Family — Personal/Family Users (secondary)
- Three generations sharing photos from a family wedding, a Goa trip and Diwali.
- **Goals:** one private album everyone can add to; grandparents can view easily; each member finds their own photos.
- **Concerns:** privacy; photos of children (minors).
- **Plan:** Free → Personal Pro.

### 3.6 Platform Admin (internal)
- SnapShare operations and support staff.
- **Goals:** platform health; abuse handling; subscription and payment issues; AI and GPU capacity; audits.

## 4. Product Scope

### 4.1 Module A — Photographer Studio

| Capability | Description | MVP |
|---|---|---|
| Studio registration & profile | Studio name, logo, contact details, slug, GST details (India) | ✅ |
| Team & RBAC | Invite members; roles Owner, Admin, Editor, Uploader, Viewer; custom roles later | ✅ (fixed roles) |
| Events | Create, edit, archive and delete events (wedding, corporate, etc.) with date, venue and cover image | ✅ |
| Albums | Sub-albums within an event (Haldi, Mehendi, Reception) | ✅ |
| Bulk uploads | Browser upload of thousands of files; folder upload; resumable; duplicate detection | ✅ |
| Video uploads | Upload, transcode, poster frame, streaming playback (no video AI in MVP) | ⏳ Later (Phase 3b) |
| AI photo discovery | Guests find their own photos with a selfie (consent-gated); face grouping for the photographer | ✅ |
| Guest invitations & QR | QR code and share link per event or album; printable QR poster | ✅ |
| Client galleries | Branded, password/PIN-protected galleries with expiry | ✅ |
| Watermarks | Image or text watermark presets applied to previews | ✅ |
| Client favorites & proofing | Select, approve/reject, comment, submit final selection, export | ✅ |
| Digital albums | Layout-based flipbook album built from selections | ⏳ Later |
| Portfolio builder | Public portfolio site using selected images | ⏳ Later |
| Custom domains | CNAME to a studio domain with automatic TLS | ⏳ Later |
| CRM | Clients, leads, bookings, invoices | ⏳ Later |
| Analytics | Gallery views, downloads, guest matches, storage use | ✅ (basic) |
| Subscription management | Plans, upgrade/downgrade, invoices, usage | ✅ |

### 4.2 Module B — Personal Photo Sharing

| Capability | Description | MVP |
|---|---|---|
| Personal accounts | Email or Google sign-up; works on mobile web | ✅ |
| Private albums | Create albums and upload from phone or desktop | ✅ |
| Family/group sharing | Groups (family, friends) with members who can view or contribute | ✅ |
| Private invitations | Invite by link or email with a role (viewer or contributor) | ✅ |
| AI photo search | Find "my photos" (face, consent-gated) and search by text such as "beach", "cake" | Face ✅ / Semantic ⏳ |
| Consent-based face matching | Selfie enrollment, consent record, revocation, deletion | ✅ |
| Favorites & downloads | Per-user favorites; downloads of originals or web-size images | ✅ |
| Storage management | Usage meter, cleanup suggestions such as duplicates and blurry shots | ✅ (meter) |
| Subscription upgrades | Free → Personal Pro | ✅ |
| Data export | Full zip export of the user's photos and metadata | ✅ |
| Account deletion | Hard delete with a grace period, including biometrics | ✅ |
| "My Event Photos" | Event photos the user was matched in, shown in their personal space | ✅ (bridge feature) |

### 4.3 Module C — Super Admin

| Capability | MVP |
|---|---|
| Global dashboard (accounts, MRR, storage, jobs) | ✅ |
| Account, studio and individual user management (view, suspend, impersonate with audit) | ✅ |
| Subscription and payment management (refund, manual plan override) | ✅ |
| Revenue analytics (MRR, churn, ARPU) | ⏳ basic in MVP |
| Storage monitoring | ✅ |
| AI processing monitoring, GPU utilization, queue monitoring | ✅ |
| Abuse reporting & moderation queue | ✅ |
| Feature flags | ✅ |
| Audit logs (search, export) | ✅ |
| System health | ✅ |

### 4.4 Explicitly out of scope (v1)
- Native iOS/Android apps. We ship a responsive web app and PWA first. See ARCHITECTURAL_GAPS (Batch 4).
- Photo editing. We do not compete with Lightroom.
- Printing and fulfillment marketplace.
- AI on video, such as face search in video.
- Public social feed or discovery.
- Cross-tenant face search ("find me in every event on SnapShare"). The spec forbids this.
- Selling photos to guests (paid downloads). This is a candidate for v2.

## 5. Experience Boundaries

| Area | Studio app | Personal app | Public gallery | Admin |
|---|---|---|---|---|
| Base route | `/studio/:studioSlug/*` | `/me/*` | `/g/:shareCode`, custom domains | `/admin/*` (separate auth and role) |
| Ownership scope | `tenantId` (studio) | `ownerUserId` (personal) | Access grant (link, PIN, invite) | Platform role |
| Navigation | Events, Clients, Portfolio, Team, Billing, Analytics | Albums, Groups, My Photos, Storage, Settings | Gallery only | Ops consoles |
| Who | Studio members | Personal account holders | Anyone with a valid grant | Platform staff |

One user account can be personal, belong to several studios, or both. An account switcher in the top bar moves between "Personal" and each studio workspace. Each workspace is a separate authorization context.

## 6. Subscription Plans (initial proposal, INR, configurable in the database)

| Plan | Audience | Price/mo (annual) | Storage | Events/mo | AI face indexing | Team | Branding |
|---|---|---|---|---|---|---|---|
| Free | Personal | ₹0 | 5 GB | n/a | 1,000 photos/mo | — | SnapShare branding |
| Personal Pro | Personal/family | ₹199 (₹1,990/yr) | 100 GB | n/a | 20k photos/mo | Family group of up to 10 | — |
| Photographer Starter | Solo | ₹999 (₹9,990/yr) | 500 GB | 10 active | 50k photos/mo | 2 | Logo, no SnapShare badge |
| Photographer Pro | Solo/small | ₹2,499 (₹24,990/yr) | 1.5 TB | Unlimited active | 200k photos/mo | 5 | Full branding, watermarks, proofing |
| Studio Business | Studios | ₹6,999 (₹69,990/yr) | 4 TB | Unlimited | 600k photos/mo | 20 | Custom domain, CRM, portfolio |
| Enterprise | Large studios/organizers | Custom | Custom | Custom | Custom | Custom | White-label, SLA |

> **Quotas updated per G1 (provisionally approved 2026-11-17)** so every plan keeps about 60% or more gross margin even at full storage use (RISK_REGISTER §3). Prices exclude 18% GST. Storage add-on: ₹399 per 500 GB/month. Archived events (> 12 months) count at half quota. Final prices are confirmed before the Phase 6 launch. All limits live in `plans.entitlements` and are never hardcoded.

## 7. Key Requirements

### 7.1 Functional (selected, numbered for traceability)

- **FR-AUTH-1:** Email registration, verification, login, logout, password reset, refresh tokens, session/device list with revoke, optional Google OAuth.
- **FR-TEN-1:** A user can belong to several studios with different roles. All studio resources are scoped by `tenantId`, which the server resolves from membership.
- **FR-EVT-1:** A studio can create events with albums, a cover, a date, a venue, gallery settings (visibility, PIN, expiry, downloads) and a watermark preset.
- **FR-UPL-1:** Uploads go directly to object storage through presigned multipart URLs. They are resumable after a refresh and support 10,000+ files per session. Duplicates are detected by content hash and perceptual hash.
- **FR-MED-1:** Each photo gets thumbnail (400px), preview (1200px), web (2048px) and watermarked-preview derivatives, sized for low storage cost without visible quality loss (INFRASTRUCTURE §4.1). The original is never modified.
- **FR-AI-1:** A guest who has given consent uploads a selfie. Within 30 seconds (p95, warm GPU) they see the photos they matched in that event only.
- **FR-AI-2:** Consent is recorded with its version, timestamp, scope (one event, one studio, or personal) and an IP hash. Revocation deletes embeddings within 24 hours.
- **FR-AI-3:** Non-biometric discovery is always available (album browsing, time filter, photographer-tagged names).
- **FR-SHR-1:** Share links and QR codes have an optional PIN, an expiry, download rules and per-guest invites.
- **FR-PRF-1:** Proofing lets clients favorite, approve/reject, comment and submit a final selection, which then locks. Photographers export it as CSV or Lightroom filenames.
- **FR-BIL-1:** Plans, entitlements and usage metering. Razorpay subscriptions are primary and Stripe secondary. Webhooks are signature-verified and idempotent. GST invoices are generated for India.
- **FR-PER-1:** Personal albums, groups, invites, a "My Photos" AI view, data export and account deletion.
- **FR-ADM-1:** The super-admin console covers spec §3C. Impersonation needs a stated reason and is audited.

### 7.2 Non-Functional

| Category | Requirement |
|---|---|
| Scale | 10,000+ studios; up to 50,000 photos per event; 5,000 concurrent visitors per gallery |
| Upload throughput | ≥ 200 photos/min per uploader on a 100 Mbps link; the system absorbs 1M photos/day at launch |
| Processing latency | Derivatives ready p95 < 60 s after upload; face indexing p95 < 5 min at normal queue depth |
| API latency | p95 < 300 ms for metadata reads; p99 < 1 s |
| Gallery performance | LCP < 2.5 s on 4G (Indian mobile networks matter); images served through the CDN |
| Availability | 99.9% for API and gallery; AI pipeline best effort with queue durability |
| Durability | Originals at 11 nines (object storage); MongoDB PITR backups with RPO ≤ 15 min and RTO ≤ 4 h |
| Security | OWASP ASVS L2 target; tenant isolation tests in CI |
| Privacy | DPDP Act 2023 compliant; biometric data stays inside our infrastructure |
| Accessibility | WCAG 2.1 AA for galleries and dashboards |
| Localization | English at launch; the i18n framework is ready for Hindi and regional languages; INR formatting |
| Browsers | Last 2 versions of Chrome, Safari, Firefox and Edge; Android Chrome is the primary mobile target |

## 8. Success Metrics

| Metric | Target (6 months post-launch) |
|---|---|
| Paying photographer accounts | 500 |
| Guest selfie match success (guest finds ≥ 1 photo) | ≥ 85% of consenting guests |
| Time from event upload complete to guest access | p50 < 10 min |
| Guest → personal account conversion | ≥ 8% |
| Photographer monthly churn | < 4% |
| Proofing cycle time (gallery shared → selection submitted) | Median < 7 days |
| Gross margin per paid account | ≥ 70% (watch GPU and storage cost) |
| Consent revocation SLA met | 100% within 24 h |

## 9. Assumptions
1. Most guests are on Android phones with mid-range cameras and 4G.
2. Photographers upload JPEG exports from Lightroom. RAW upload is not needed in v1.
3. One GPU (e.g. NVIDIA L4 or T4 class) can index roughly 15–40 photos per second for detection and embedding. Batch 3 validates this.
4. We can get a commercially licensed face recognition model. This is a **critical dependency** (see the Batch 4 risk register).
5. Studios accept a short consent screen before a guest's selfie search.

## 10. Open Questions for Owner (Batch 1)
1. **Guest identity:** must guests verify an email or phone (OTP) before a selfie search, or is the search anonymous and session-based? (Recommendation: phone OTP. It is common in India and helps prevent abuse. SMS has a cost.)
2. **Paid downloads:** do you want photographers to sell photos to guests in v1? (Recommendation: v2.)
3. **Plan prices:** are the INR placeholders roughly in the right range?
4. **Video:** is upload and playback (no AI) enough for v1?
5. **Mobile:** is a PWA acceptable for v1, with native apps later?
6. **Brand name:** is "SnapShare AI" final? The directory is named "Festival Posture". We need a domain and trademark check.
