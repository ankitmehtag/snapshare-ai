# SnapShare AI — Architectural Gaps & Open Decisions

| Field | Value |
|---|---|
| Version | 0.1 (Draft, Batch 4) |
| Purpose | Things the master spec leaves open, or where a choice changes cost or scope. Each has a **recommendation** that follows the owner's directive: *cheapest option that keeps quality good, no wasteful spend* |
| How to answer | Reply with an ID and a choice, e.g. `G1 approve, G3 option B`. Anything unanswered uses the recommendation provisionally and stays changeable until the related phase starts |

## Summary

| ID | Decision | Recommendation | Needed by |
|---|---|---|---|
| G1 | Plan quotas & prices | Keep prices, trim quotas, ₹399/500 GB add-on (RISK_REGISTER §3) | Phase 6 |
| G2 | Guest verification before selfie search | **Email OTP** (free); SMS optional per studio | Phase 4 |
| G3 | Children (under 18) and face search | v1: **blocked**; guardian flow later | Phase 4 |
| G4 | Bystander handling | Event-scoped indexing + notice + removal request (current design) | Phase 4 |
| G5 | Face model | Start with free YuNet + SFace; decide on a paid licence at 4.6 | Phase 4.6 |
| G6 | Media delivery stack | Cloudflare Worker + B2 (ADR-006/019) | Phase 3 |
| G7 | Video scope | **Post-launch**; then upload + playback only, no video AI | Phase 3b |
| G8 | Mobile apps | **PWA only** for v1 (no app-store fees or extra codebases) | Phase 7 |
| G9 | Semantic search ("beach", "cake") | Optional in Phase 7, only with a commercially licensed model that runs on CPU | Phase 7 |
| G10 | Email provider | Brevo/Resend free tier → Amazon SES when volume grows | Phase 2 |
| G11 | Custom domains TLS | Caddy on-demand TLS (free Let's Encrypt) | Phase 8 |
| G12 | Brand name & domain | Trademark + domain check before Phase 6 spend | Phase 6 |
| G13 | Paid guest downloads (selling photos) | v2 | Post-launch |
| G14 | Guest identity across events | One guest identity per email, reused across galleries; matches are still event-scoped | Phase 4 |
| G15 | Account & data retention for non-payment | Read-only after grace → keep 90 days → warn → delete | Phase 6 |
| G16 | Queue fairness tool | Own round-robin (free), not BullMQ Pro | Phase 3 |
| G17 | Languages | English + Hindi for consent/legal at launch; full UI Hindi later | Phase 4 |
| G18 | Legal review budget | One-time ≈ ₹20k–50k (privacy lawyer + CA) before paid launch | Phase 6 |

---

## Details

### G1 — Plan quotas & prices
Covered in RISK_REGISTER §3. If approved, PRD §6 changes as follows:
- **Quotas:** Personal Pro 100 GB, Photographer Pro 1.5 TB, Studio Business 4 TB.
- **Add-ons:** storage add-on ₹399 per 500 GB.
- **Archive:** archived events count at half quota.
- **Prices:** unchanged, shown excluding GST.

### G2 — Guest verification
- **Option A: email OTP (recommended).**
  - ≈ free, and gives good abuse control.
  - Guests type their email once on their phone.
  - Matches can later be saved to an account with the same email.
- **Option B: phone OTP.**
  - More familiar to Indian users and faster on mobile.
  - Costs ₹0.15–0.25 per SMS plus DLT registration.
  - A 500-guest wedding costs about ₹100 in SMS.
  - Can be enabled per studio as a premium setting.
- **Option C: no verification.**
  - Cheapest, but abuse-prone: anyone could run selfie searches for other people.
  - Not recommended.

### G3 — Minors
- **v1 (recommended):** the consent screen asks "Are you 18 or older?". If the answer is no, the guest browses albums with no selfie search. Studios can still tag names manually.
- **Later:** a parent or guardian enrolls a child from their own verified account, with a recorded guardian consent (DPDP s.9). ⚖️ Needs the lawyer's sign-off on what counts as "verifiable" parental consent.

### G4 — Bystanders (people in photos who never sign up)
Keep the Batch 2/3 design:
- Faces are indexed only within an event the studio enabled AI for.
- They are compared only against a consenting searcher's selfie.
- The QR poster carries a notice.
- A "remove my face from this event" request deletes that person's face points.
- Retention is short.

**Stricter alternative:** match only people who enrolled *before* the event's photos were indexed. This harms usefulness a lot, because guests usually arrive after the photos, so it isn't recommended for India. It stays available as a per-region flag for GDPR/BIPA markets later.

### G5 — Face model
- **Start free** with YuNet + SFace. They run fast on CPU, cost ₹0, and their licence looks permissive pending a check.
- **At Phase 4.6** the owner sees real accuracy numbers on Indian wedding photos.
- **If the numbers fall short** of the targets (match success ≥ 85%, not-me ≤ 3%), get a quote for the InsightFace commercial licence. Switching is a registry change plus re-indexing active events.

### G6 — Media delivery
Already decided by ADR-006 and ADR-019 (Cloudflare Worker gateway + B2). The fallback without Cloudflare is Nginx `secure_link` + cache in front of MinIO on Hetzner storage servers. Revisit only if Cloudflare terms change.

### G7 — Video
Video storage is very large and transcoding is CPU-heavy, so video is deferred until after paid launch.

Then: upload + a single 720p HLS rendition + a poster frame, with no 4K renditions and no face search in video. Quality is still good on phones, and this saves both storage and CPU. Video counts against the storage quota.

### G8 — Mobile
A PWA (installable from the browser, camera access for selfies, works on Android) covers v1.
- **Native apps** add store fees, a second codebase and review delays.
- **iOS caveat:** background uploads on iOS Safari are limited. Users must keep the tab open, and the UI says so.
- **When to revisit:** native apps only if customers ask for them.

### G9 — Semantic search
Nice to have, not core.
- It needs a CLIP-style model with clear commercial terms and must run on CPU.
- If no such model exists, skip it. Albums, dates, favorites and face search cover most needs.

### G10 — Email
Start on a free tier (Brevo ≈ 300/day or Resend ≈ 3,000/month; verify the current limits), then move to Amazon SES (≈ $0.10 per 1,000) when volume grows.

Sending goes through an `EmailProvider` interface, so switching takes one config change. A custom sending domain is set up with SPF, DKIM and DMARC for deliverability, at no cost.

### G11 — Custom domains
Caddy's on-demand TLS issues free Let's Encrypt certificates when the first request arrives, gated by an "ask" endpoint that checks `customDomains`.

Cloudflare for SaaS is an alternative: free for the first 100 hostnames, then paid. Caddy is free with no limit. **Recommendation: Caddy.**

### G12 — Brand
"SnapShare" is a generic name and may conflict with existing trademarks or apps. Before printing posters or buying ads:
1. Search the Indian trademark registry (free online).
2. Check `.in`/`.com` domain availability.
3. Only then file in one class (≈ ₹4.5k–9k).

The folder name "Festival Posture" is not used as a brand.

### G13 — Selling photos to guests
A good v2 revenue feature (photographers earn, we take a small fee). Not needed for launch.

### G14 — Guest identity reuse
One `guestIdentities` record per verified email or phone, so the guest doesn't re-verify at every event. **Face references are still per event or scope**: a guest at two weddings by different studios has two separate consents and reference sets. Cross-tenant matching is never allowed (spec §9).

### G15 — Non-payment
Proposal:
1. 7-day grace period.
2. Read-only: galleries still viewable by guests, no uploads.
3. Data kept 90 days.
4. Two warning emails.
5. Deletion.

Storage costs during read-only are small (B2), and keeping galleries alive protects the photographer's clients.

### G16 — Queue fairness
BullMQ Pro groups is a paid licence. Our own round-robin in the outbox relay (ADR-005) is free and enough for S0–S2.

### G17 — Languages
At launch:
- English throughout.
- Hindi for the consent notice, privacy notice and key guest screens: about 50 strings, translated once, little cost.

Other Indian languages can follow customer demand.

### G18 — Legal review
This is the one spend before launch that we shouldn't skip:
- **Privacy lawyer:** biometric consent text, DPA with studios, privacy policy, cross-border disclosure, minors.
- **CA:** GST invoice format, GST registration timing.

Get 2–3 quotes. Startup-focused firms often offer fixed fees.

---

## Spec gaps found during Phase 0 (already handled in the docs)

| Gap in MASTER_SPEC | Where handled |
|---|---|
| No consent collection listed | `consents` (ADR-014) |
| No guest identity model | `guestIdentities` + gallery tokens (ARCHITECTURE §5.3) |
| No groups for family sharing | `personalGroups` |
| No proofing state machine | `proofingSets` + USER_JOURNEYS J4 |
| Bystander biometrics not addressed | AI_ARCHITECTURE §9, SECURITY §8, G4 |
| Minors not addressed | G3 |
| Webhook idempotency store | `webhookEvents` |
| Selfie storage and retention | Deleted after embedding (AI_ARCHITECTURE §5.2) |
| Plan prices vs storage cost | RISK_REGISTER §3, G1 |
| Custom domain + cookie auth conflict | Same-origin API proxy (ARCHITECTURE §6.8) |
| Queue fairness between tenants | ADR-005, G16 |
| GPU always-on cost | ADR-016 CPU-first |
