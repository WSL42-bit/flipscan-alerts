# FlipScan Alerts reliability, 28 October 2026

Objective: prepare and validate the current website/dashboard/bot journey, reconcile local growth code with public production, and make release readiness explicit. Preserve the existing dirty working tree. No redesign, SDK migration, infrastructure deletion, customer export or bulk messaging.

Evidence: live /api/founder returns 404 although local index.js defines it. Canonical, Open Graph and sitemap point at Railway. Public livefeed returns all three platforms. Railway CLI authentication currently fails invalid_grant. Local growth awards credit on subscription status, not invoice payment. Search edit clears seen entries without validating ownership first.

Phase 1, one Flash bundle: capture safe source baseline; implement configuration/tenant-boundary fixes and safe testable startup; add deterministic journey tests with fake external services; audit payment/growth correctness and document exact production release blockers. Root retains payment policy and production actions.

Contracts:
- Production public origin is https://flipscanalerts.nl. Normalize URL origins centrally; explicit valid local/staging overrides remain supported. Login, checkout returns, canonical, sitemap and portal must use the same configured origin; Telegram webhook transport may use Railway domain.
- Importing app for tests must not connect DB, register Telegram webhooks, scan, schedule or create Stripe resources. Running node index.js keeps production startup behavior.
- Authenticated search mutation must scope every write, including seen reset, to the authenticated owner. Return 404 for another owner's or missing search; do not erase another user's deduplication history. Reject invalid ranges and invalid numeric prices. Malformed cookie must yield controlled 401, not 500. Signed auth payload must have valid type, identity and finite future expiry.
- Pricing remains week 499 cents / month 1499 cents, founder 999 cents. Trial 2 days once per Telegram identity, referral trial 7 days. Do not redesign billing or silently change business rules.
- Payment review must distinguish checkout completion, subscription entitlement and actual positive invoice payment. Subscription status alone must never be claimed as payment proof. Existing founder allocation, retries/idempotency, concurrent checkouts, stale/out-of-order webhooks, 25-search limits and referral rewards are release gates to assess. Complex financial remediation is a subsequent root-approved contract, not worker discretion.
- No production writes, real messages, payments, Stripe product creation, deployment, commits or pushes in worker scope. Never print/read production secrets or personal customer records. Tests use synthetic users and credentials.

Acceptance: public origin and authenticated login/search/checkout-request/portal/logout flows covered with local deterministic tests; unauthorized requests and cross-user writes rejected; no external calls during tests; responsive website baseline at 375/768/1440 if browser tooling permits; actual limitations recorded. Report growth deployment readiness honestly, never equate HTTP 200 with successful billing/notification.

Root-owned file: this PLAN.md. Worker owns application source, tests and docs/agent-work/reliability/WORKER-REPORT.md within this repo, excluding archives, old copies, .git, credentials, cloudflare infra. Preserve current source before changes in a secret-free temporary baseline and provide path and changed-file list.

Release: user approved direct deployment after successful checks and real Telegram tests to owner's account. Priority is first customers. Railway authentication and Flash provider credentials currently block execution; see CHECKPOINT.md. Any deployment requires root acceptance, captured prior deployment and rollback, and verified environment/webhook configuration. Existing growth startup has external side effects, so no blind railway up.
