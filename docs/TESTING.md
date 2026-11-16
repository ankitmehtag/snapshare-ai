# SnapShare AI — Testing Strategy

| Field | Value |
|---|---|
| Version | 0.1 (Draft, Batch 3) |
| Rule | Spec §19: never skip automated tests; spec §20: a module is done only when its tests pass |

## 1. Test pyramid & tools

| Layer | Scope | Tools | Runs |
|---|---|---|---|
| Static | Types, lint, module boundaries | `tsc --noEmit`, ESLint (+ `eslint-plugin-boundaries`), Ruff + mypy (Python) | Every PR |
| Unit | Pure functions, services with fakes, Zod schemas, entitlement resolution, permission matrix | **Vitest** (TS), **pytest** (Python) | Every PR |
| Integration | API routes against real MongoDB (replica set), Redis, MinIO, Qdrant | Vitest + Supertest + Docker Compose services in CI | Every PR |
| Contract | API responses match OpenAPI; orchestrator ↔ ai-service contract | `openapi-response-validator` in integration tests; Schemathesis (free) fuzzing against staging | Every PR / nightly |
| AI quality | Golden embeddings, threshold calibration, eval metrics | pytest + evaluation harness (AI_ARCHITECTURE §4, §7) | On model change |
| E2E | Critical user journeys in a browser | **Playwright** (Chromium + mobile Android emulation) | After staging deploy |
| Security | SAST, secrets, deps, DAST baseline | Semgrep, gitleaks, `pnpm audit`, `pip-audit`, OWASP ZAP baseline | PR / staging |
| Load | Throughput & latency targets (PRD §7.2) | **k6** (free, OSS) | Per phase on staging; Phase 10 full |

**Coverage targets:**
- 80% lines on `kernel`, `billing`, `ai` consent/deletion, and the authorization code.
- 70% elsewhere.
- Coverage is a floor, not a goal: critical paths need explicit scenario tests.

## 2. Test data rules
- Seeded fixtures use factory functions (`buildStudio()`, `buildEvent()`). There are no shared mutable fixtures.
- **Face images in tests:** synthetic faces, or images with **documented consent** from team members only. Never scraped datasets with unclear licences.
- Demo or mock data is **never** shown as production functionality (spec §19). Fakes such as `FakeEmbedder` and `FakePaymentProvider` exist only in test builds and are excluded from production bundles by build config and a CI check.

## 3. Critical scenario suites (must exist before the related phase is "done")

| Suite | Phase | Examples |
|---|---|---|
| Auth | 2 | Login lockout; refresh rotation + reuse detection; session revoke takes effect within the access-token TTL; CSRF rejection; enumeration-safe responses |
| **Tenant isolation** | 2+ | See §4 |
| Uploads | 3 | Multipart resume after a simulated crash; duplicate detection; quota exceeded mid-session; MIME spoof rejected; orphan sweeper aborts multipart uploads |
| Media | 3 | Variants generated; original unchanged (hash equality); GPS stripped; decompression-bomb rejected; job idempotency (run twice → same state) |
| Outbox/queues | 3 | Crash between commit and publish → job still delivered once; DLQ on exhausted retries; admin retry |
| AI privacy | 4 | Search without consent → 403; revoke → vectors gone (Qdrant count = 0); cross-event search impossible; selfie object deleted after match; scope signature tampering rejected |
| Gallery/sharing | 5 | Expired link 410; PIN lockout; token for event A cannot read event B; download permission enforced on originals |
| Proofing | 5 | Selection limit; locked after submit; concurrent selection by two clients |
| Billing | 6 | Webhook signature invalid → 400; duplicate webhook → single effect; plan granted only after webhook; downgrade at period end; grace → read-only; entitlement cache invalidation |
| Deletion | 2/4/7 | Account deletion cascade removes every collection, storage prefix and Qdrant point (verified by an "orphan scanner" test) |

## 4. Tenant isolation suite (automated, mandatory)
- **Route registry.** Every Express route registers metadata: `{method, path, scope:'studio'|'personal'|'public'|'admin', resourceParams}`.
- **Generated tests.** For each route, the suite generates cases:
  1. User A (studio S1) accesses an S1 resource → 2xx.
  2. User B (studio S2) uses B's own session with **S1's IDs** in the path, body or query → **404**.
  3. User B tries S1's `studioId` as the selector → 404.
  4. A user with a lower role → 403 for permission-gated actions.
  5. Guest token for event E1 accessing E2 photos → 404.
- **CI rule.** CI fails if a route has no registry metadata. You can't add a route without isolation coverage.
- **Vector store.** The same idea applies in pytest: a search for scope X with any filter manipulation never returns points from scope Y.

## 5. Load testing (k6)

| Scenario | Target (PRD §7.2) | Stage tested |
|---|---|---|
| Concurrent uploads: 20 photographers × 500 files, presign + complete | Presign p95 < 200 ms; ≥ 200 photos/min per uploader (MinIO/R2) | S0 staging |
| Gallery burst: 2,000 virtual guests open one gallery in 2 min, scroll 5 pages | API p95 < 300 ms; 0 errors; CDN hit ratio > 95% (checked in Cloudflare analytics) | S1 |
| API mixed traffic | 500 RPS mixed reads/writes, p99 < 1 s | S1 |
| Queue throughput | Media: ≥ 1 photo/s per vCPU; DLQ empty | S0 |
| AI throughput | Indexing photos/hour on CPU box (validates AI_ARCHITECTURE §6.2) and GPU node | Phase 4 |
| Selfie match latency | p95 < 30 s end to end under 50 concurrent searches | Phase 4 |
| Vector search | Qdrant p95 < 50 ms on a 10M-point collection with event filter | Phase 4 |

- **Results** are stored in `docs/perf/<date>.md` with the hardware used. Regressions over 20% fail the phase gate.
- **Cost control:** load tests run against staging on the same box or a temporary VPS that is destroyed afterwards. They never run against production.

## 6. Definition of Done: test evidence
Each phase gate summary shows the owner:
1. CI run link (all green).
2. New and changed test counts per suite.
3. Isolation suite: number of routes covered = number of routes registered.
4. Any skipped tests (none allowed without an owner-approved reason).
5. Load test results where applicable.
