# Checkpoint 28 October 2026

## User decisions
- Highest priority: acquire first customers quickly.
- Deploy reviewed improvements after successful checks without asking again.
- Real Telegram messages to owner's own account authorized; identity must be verified before sending. This does not authorize messaging other users or charging money.

## Completed
- Read new project handoff; canonical current source is Desktop/flipscan-alerts, not old flipscan-backend.
- Existing dirty source inventory captured in tool output; no application code changed.
- Checked both public custom domain and direct Railway origin: /health 200, /api/founder 404, /api/me and /api/searches 401 unauthenticated. Founder absence also at origin rules out only a Cloudflare routing/cache problem.
- Livefeed refreshed from 13:01 to 13:05 UTC, returned 36 listings from 3 platforms. This proves public feed activity, not subscriber delivery.
- robots/sitemap/canonical still use Railway host.
- Root read auth, Stripe handlers, search mutation and alert worker for concrete security/payment review.
- Flash route doctor static-ready; actual useful worker dispatch FAILED with provider HTTP 401 (invalid stored DeepSeek key). Runtime inference NOT verified. Child /root/reliability marked done via interrupt. No fallback model used.

## Release findings, fix before growth activation
1. index.js PATCH search clears alert_seen by search_id even when owner-scoped UPDATE affects zero rows. Require owner match before reset and preserve transaction consistency.
2. growth.js treats active subscription status as first payment. Use verified positive successful invoice payment instead; a trial ending or a free coupon must not earn referral credit. Persist idempotent reward delivery with retry-safe Stripe keys and avoid setting ref_rewarded before credit has safely been recorded.
3. Stripe webhook catches processing errors but replies 200; failed state changes lose retries. Define atomic/idempotent processing and retry behavior before release. Do not send duplicate user messages on webhook redelivery.
4. Founder allocation checks count before checkout without reserving a slot; simultaneous checkouts can exceed 100. Existing founder boolean remains true after cancellation or week switch. Specify subscription-scoped eligibility and accurate monthly-price reporting.
5. worker.js records all newly found items as seen but sends only first 8; remaining items are lost. Failed Telegram sends also remain seen. First positive results after an initially empty platform can be silently seeded. Must verify first-alert and retry behavior before promising reliability to new customers.
6. User-visible 30s checks are not yet measured end to end; worker scans users/platforms sequentially. Do not claim delivery SLA based on interval constants.
7. Normalize public origin and verify all return/login/SEO links. Live SITE_URL/BASE_URL unknown until Railway access restored.

## Resume update: direct Astra implementation approved
- User explicitly confirmed Railway login and authorized Astra implementation after Flash failure. No need to ask these choices again.
- Railway CLI access restored; exact project ID validated. Production deployment remains 3a36e8dc-b98f-4e71-995b-b1de603f341d (20 October).
- Existing source snapshot before edits: /tmp/flipscan-before-wCk6Wc/source.tar. Excludes credentials, .git, node_modules and old build archives. This is NOT a production database backup.
- BASE_URL in production is still https://flipscan-alerts-production.up.railway.app; SITE_URL is absent.
- Stripe live weekly and monthly prices verified active: EUR499 weekly, EUR1499 monthly. Endpoint we_1UQ3KZ3UAjn74n3nXtvtE12W listens only to checkout.session.completed and subscription updated/deleted. API version 2026-06-24.dahlia. Invoice payment events must be added with compatible implementation before enabling referrals.
- Bot identity verified using getMe: FlipScanAlertsBot. No real messages sent. ADMIN_USERNAME exists; ADMIN_CHAT_IDS absent. Owner identity still unverified against database.

## Local implementation completed, NOT deployed
- origin.js validates/normalizes a common public origin; auth, render, checkout and portal use it. Explicit production env still needs correction at release.
- auth.js rejects malformed identity/type/expiry and malformed cookies safely.
- searches.js serializes per-owner writes in transactions, verifies ownership before history resets, enforces concurrent 25-active limit and strict numeric price validation. Routes in index.js use it.
- index.js imports safely without starting database/webhooks/jobs; explicit startup retained.
- worker.js persists pending listings in alert_seen, drains eight at a time without dropping overflow, retries failures with backoff and Telegram retry_after, keeps deduplication identities and records successful empty platform baselines independently of seen items. Per-search row locking coordinates edits and overlapping workers. Delivery is at-least-once, NOT exactly once.
- db.js additive queue/platform-state schema and safe local hostname recognition. No production migration run.
- telegram.js and scraper fetches have 15s timeouts. Photo retries avoid immediate text fallback on rate limits/ambiguous errors. Missing eBay credentials now signal failure instead of an empty successful baseline.
- npm ci installed dependencies without browser-download scripts. Audit found 12 vulnerabilities (1 moderate, 11 high), including Puppeteer chain; not upgraded blindly. Dependency review remains required.
- Tests: 15/15 passed, including actual local PostgreSQL SQL, empty baseline then alert, 12-item backlog, 429 retry across worker restart, foreign ownership, atomic resets, 30 simultaneous creates capped at 25, bad session/cookie/price validation and import safety.
- Test command: TEST_DATABASE_URL=postgres://wesroelofs@127.0.0.1:55439/postgres npm test
- Local temporary PostgreSQL: /tmp/flipscan-test-pg-erCoHo, port55439. Test schemas were dropped; instance stopped after tests. Restart with pg_ctl -D /tmp/flipscan-test-pg-erCoHo/data -l /tmp/flipscan-test-pg-erCoHo/server.log -o '-h 127.0.0.1 -p 55439' start.

## Current production access blocker
Postgres-KP-2 has no DATABASE_PUBLIC_URL/TCP proxy and app DATABASE_URL uses postgres-kp-2.railway.internal. No public database exposure was added. Railway SSH diagnostic failed because ~/.ssh has no SSH keys. Ask owner to authorize creating/registering a dedicated Railway SSH key (or provide their existing access route) before changing account-level access. Need this to inspect owner identity, create and validate a production DB backup, and establish rollback before additive migration. Local pg_dump is v15, server v18: use pg_dump inside the v18 database container via authorized access rather than incompatible local binary. Never print secrets.

## Remaining release gates
1. Resolve SSH authority/access, back up production DB and deployed source/config with secret-safe storage and validate restore/rollback path.
2. Finish payment webhook reconciliation/idempotency/retry semantics, positive real invoice-based durable referral rewards, concurrency-safe founder allocation and checkout/trial reuse. Existing growth.js and billing handler remain unsafe for release. Do not deploy the entire dirty tree prematurely.
3. Add payment/HTTP/customer-journey tests; review dependency updates and build exclusions.
4. Responsive browser QA375/768/1440, authenticated owner-only Telegram test, then reviewed deploy and domain/SEO/API/subscriber checks.
5. No commits, pushes, real charges, customer broadcasts, production DB mutations or deployment performed this round. Do not delete old Postgres.
