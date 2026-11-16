# SnapShare AI — Risk Register

| Field | Value |
|---|---|
| Version | 0.1 (Draft, Batch 4) |
| Scale | Likelihood (L) and Impact (I): 1 = low … 5 = high. **Score = L × I**. 🔴 ≥ 15 · 🟠 8–14 · 🟢 ≤ 7 |
| Review | At every phase gate. The owner sees changes in the gate summary |

## 1. Top risks (summary)

| ID | Risk | L | I | Score | Owner action needed? |
|---|---|---|---|---|---|
| R1 | Face model licence blocks commercial launch | 4 | 5 | 🔴 20 | Yes, at Phase 4.6 |
| R2 | Storage costs outgrow plan revenue | 3 | 5 | 🔴 15 | Approve pricing (§3) |
| R3 | Biometric/DPDP legal exposure (bystanders, minors, cross-border) | 3 | 5 | 🔴 15 | Budget a one-time legal review |
| R4 | Cross-tenant data leak (IDOR) | 2 | 5 | 🟠 10 | — (mitigated by design + tests) |
| R5 | Free face model accuracy too low for Indian wedding conditions | 3 | 4 | 🟠 12 | Phase 4.6 checkpoint |
| R6 | Single-server launch = downtime on hardware failure | 3 | 3 | 🟠 9 | Accept for S0; move to S1 when revenue starts |
| R7 | Cost attacks (SMS pumping, upload abuse, zip abuse) | 3 | 3 | 🟠 9 | — (caps + kill switches) |
| R8 | Scope creep delays paid launch | 4 | 3 | 🟠 12 | Hold the line on the Phase 1–6 scope |
| R9 | Vendor pricing or terms change (Hetzner, B2, Cloudflare free tier) | 2 | 3 | 🟢 6 | — (S3-compatible, portable) |
| R10 | Payment / GST compliance mistakes | 2 | 4 | 🟠 8 | CA review of the invoice format (cheap) |

## 2. Full register

| ID | Category | Risk | L | I | Mitigation | Trigger / signal |
|---|---|---|---|---|---|---|
| R1 | Licensing | InsightFace SCRFD/ArcFace pretrained weights are **non-commercial**. Most strong open face models were trained on non-commercial datasets | 4 | 5 | Launch with YuNet + SFace (OpenCV Zoo, permissive listing; **legal check of the model card and training data terms**). Registry blocks unlicensed activation. Budget option: InsightFace commercial licence (quote needed) | Phase 4.6 evaluation |
| R1b | Licensing | Semantic search (CLIP-family) weights or training data not commercial | 3 | 2 | Optional feature; choose a model with clear commercial terms or skip it | Phase 7 |
| R1c | Licensing | Third-party code licences (AGPL in a dependency, e.g. some vector/ML tools) | 2 | 3 | `license-checker` / `pip-licenses` in CI with an allowlist (MIT, Apache-2.0, BSD, ISC, MPL-2.0). Note: **Qdrant is Apache-2.0**; **MongoDB Community is SSPL** (fine for self-hosting our own app; we don't offer MongoDB as a service); **Grafana/Loki/Tempo are AGPL** (fine when used unmodified internally) | CI |
| R2 | Cost | Storage per customer exceeds price at full quota | 3 | 5 | B2 storage (ADR-019), right-sized variants, quotas enforced, storage add-ons priced above cost (≈ 1.6×), archive lifecycle, optional original-retention. Pricing in §3 | Monthly gross-margin dashboard < 70% |
| R2b | Cost | GPU bill surprise | 2 | 4 | CPU-first, hourly GPU with **hard monthly budget** + auto-stop (ADR-016) | `ai_gpu_hours_month` alert at 80% |
| R2c | Cost | Bandwidth/egress charges (downloads bypassing Cloudflare) | 2 | 4 | All downloads go through the gateway (ADR-019); zip exports streamed through Cloudflare | B2 egress line item > 0 |
| R2d | Cost | SMS OTP spend | 3 | 2 | Email OTP default; SMS opt-in per studio with daily cap + kill switch | Daily SMS budget alert |
| R3 | Legal | Bystanders' faces processed without their consent | 3 | 5 | Event-scoped indexing; matching only for a consenting searcher; venue notice on QR posters; studio DPA; short retention; "remove my face" request flow. **One-time privacy-lawyer review** (≈ ₹15k–40k for a startup-friendly review: get quotes) | Before Phase 6 launch |
| R3b | Legal | Children's photos at family events / weddings | 3 | 5 | Minors blocked from selfie search in v1; guardian flow later (G3); no behavioural tracking | Complaint or report |
| R3c | Legal | Cross-border hosting (ADR-018) | 2 | 3 | Disclosed in the privacy policy; encrypted; not to a restricted country; re-check when the government publishes its list | Government notification |
| R3d | Legal | CERT-In 6-hour incident reporting missed | 2 | 3 | Runbook + contact templates (SECURITY §7) | Incident |
| R3e | Legal | Copyright / illegal content uploaded by users | 2 | 4 | Terms + abuse reporting + moderation + takedown flow | Reports |
| R4 | Security | IDOR / cross-tenant access | 2 | 5 | ScopedRepository, 404-on-foreign, generated isolation suite mandatory in CI | Any isolation test failure blocks merge |
| R4b | Security | Account takeover | 2 | 4 | argon2id, lockout, Turnstile, breached-password check, session revoke, MFA for admins | Login anomaly alerts |
| R4c | Security | Launching without a paid pentest (ADR-020) | 3 | 3 | Free ASVS self-assessment + scanners; paid pentest once MRR > ₹2 lakh | MRR milestone |
| R5 | Product/AI | Free model under-performs (makeup, turbans, veils, low light, crowds) | 3 | 4 | Evaluation on a realistic consented set; query expansion; quality gates; "Not me"; fallback to a licensed model | Match success < 85% or not-me > 3% |
| R5b | Product/AI | False matches show a person someone else's photos | 2 | 4 | Thresholds tuned for precision (FAR ≤ 1e-3); show only high/medium bands; the gallery itself is already shared with all guests, which limits the harm | Not-me rate |
| R6 | Ops | Single server failure at S0 | 3 | 3 | Nightly encrypted backups to B2, scripted rebuild (target < 8 h), originals safe in object storage; move to S1 once paying | Hardware alert |
| R6b | Ops | Hetzner location latency for Indian users | 2 | 2 | Images from Cloudflare India edge; API cached where safe; Singapore location if available | p95 API > 500 ms from India |
| R6c | Ops | Solo developer / bus factor | 3 | 4 | Everything documented (this repo); infrastructure as code; runbooks; owner holds all keys (SOPS/age) | — |
| R7 | Abuse | Free plan used as free photo hosting / for illegal content | 3 | 3 | Free plan: small quota, AI limits, inactive accounts expire, abuse reports, rate limits | Storage growth on free plan |
| R8 | Delivery | Scope creep before launch | 4 | 3 | Owner-gated phases; anything new goes to the post-launch backlog | Phase overrun > 30% |
| R9 | Vendor | Cloudflare free-tier or B2 policy change | 2 | 3 | S3 abstraction (R2/MinIO fallback); gateway can move to Nginx `secure_link` | Vendor notice |
| R10 | Finance | GST invoicing format errors; Razorpay KYC delays | 2 | 4 | Use a CA-reviewed invoice template (one-time small fee); start Razorpay KYC in Phase 5 (it can take weeks) | KYC status |
| R11 | Market | Competitors (e.g. Kwikpic and others) undercut on price | 3 | 3 | Our low infrastructure cost lets us price competitively; differentiate on privacy (self-hosted AI, consent-first) and the proofing workflow | Win/loss notes from beta |
| R12 | Brand | "SnapShare" name or domain conflicts | 3 | 3 | Trademark search + domain check before spending on branding (G12) | Before Phase 6 |

## 3. Pricing & margin check (resolves the Batch 3 finding)

**Cost basis (per month, at FULL quota use, which is the worst case):**
- **Storage:** B2 ≈ ₹0.5/GB.
- **AI:** CPU, almost free per photo. Compute is shared and allocated at about ₹1 per 1,000 photos indexed.
- **Payment fees:** ≈ 2% + 18% GST on the fee, so about 2.4%.
- **Email:** negligible.

| Plan | Price/mo (excl. GST) | Storage quota | Storage cost at 100% use | AI quota cost | Payment fee | **Gross margin at 100% use** | Typical (50% use) |
|---|---|---|---|---|---|---|---|
| Free | ₹0 | 5 GB | ₹2.5 | ₹1 | — | Loss ₹3.5/user (acceptable acquisition cost; inactive accounts expire) | — |
| Personal Pro | ₹199 | 200 GB | ₹100 | ₹20 | ₹5 | **37%** ⚠️ | ~67% |
| Photographer Starter | ₹999 | 500 GB | ₹250 | ₹50 | ₹24 | **68%** | ~83% |
| Photographer Pro | ₹2,499 | 2 TB | ₹1,000 | ₹200 | ₹60 | **50%** ⚠️ | ~74% |
| Studio Business | ₹6,999 | 5 TB | ₹2,500 | ₹600 | ₹168 | **53%** ⚠️ | ~76% |
| Enterprise | Custom | Custom | Priced as cost × 3 minimum | | | ≥ 66% | |

**Recommendation (cheap for customers, healthy for us, no quality cut).** Keep the headline prices, because they are competitive, and adjust the quotas a little:
- **Personal Pro:** 200 GB → **100 GB** (≈ 10,000 phone photos; most families use less). Margin at 100% use rises to about 62%.
- **Photographer Pro:** 2 TB → **1.5 TB** (≈ 25 weddings). Margin at 100% use rises to about 60%.
- **Studio Business:** 5 TB → **4 TB**. Margin at 100% use rises to about 62%.
- **Storage add-on:** **₹399 per 500 GB/month** (cost ₹250 → about 37% margin; customers can also archive or delete old events instead).
- **Archive option:** events older than 12 months move to "archive". Originals are kept, with view-only galleries, and cost the studio **half** quota. This uses a cheaper storage class where the provider offers one.
- **Annual plans:** about 17% discount (2 months free). This is good for cash flow.
- **Prices are shown excluding 18% GST.**

The PRD §6 table is updated with these quotas **only if the owner approves** (G1).

## 4. Expensive dependencies (spec §21 asks for these explicitly)

| Dependency | Why expensive | Our approach | Expected monthly |
|---|---|---|---|
| GPU compute | Always-on GPUs cost ₹25k–80k+/month | CPU-first; hourly GPU with budget cap | ₹0–2k at launch |
| Object storage + egress | Photos are huge; egress on AWS/GCP costs ₹7–8/GB | B2 + Cloudflare (zero egress) | Scales with paid quotas |
| Vector DB at scale | Billions of vectors need RAM | 128-d SFace + int8 + on-disk + retention deletes | Fits on existing servers to S2 |
| Managed MongoDB | Atlas dedicated tiers cost ₹5k–50k+/month | Self-hosted | ₹0 extra |
| Observability SaaS | Datadog/New Relic cost per host or GB | Self-hosted Grafana stack + GlitchTip | ₹0 extra |
| SMS | DLT + per-SMS cost; pumping attacks | Email OTP default, capped SMS | ₹0–500 |
| Commercial face licence | One-time or annual fee | Only if the free model fails Phase 4.6 | TBD (quote) |
| Legal review | Privacy lawyer + CA | One-time, before paid launch | ≈ ₹20k–50k one-time |
| Pentest | ₹1–3 lakh | Deferred until revenue (ADR-020) | ₹0 now |
| Trademark | Filing fee per class | One class (software/SaaS) first | ≈ ₹4.5k–9k one-time (government fee, startup/individual rate) |
