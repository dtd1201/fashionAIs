# Deployment

## Intended topology

Cloudflare hosts the customer and admin Next.js applications and will later provide R2 object storage. A VPS runs Nginx, the NestJS API process, a separately scalable BullMQ worker, PostgreSQL, and Redis.

Example DNS (replace with the chosen domain):

```text
domain.example       -> customer frontend on Cloudflare
admin.domain.example -> admin frontend on Cloudflare
api.domain.example   -> Nginx/API on the VPS
```

Only Nginx ports 80/443 and tightly controlled administration access should be public. PostgreSQL and Redis bind to a private interface or container network. TLS terminates at Cloudflare and/or Nginx according to the selected Cloudflare SSL mode.

## Release outline

1. Build and test all workspaces in CI.
2. Run Prisma migrations as a controlled release step before the new API receives traffic.
3. Deploy API and worker artifacts with immutable versions and validated environment variables.
4. Deploy customer and admin frontends independently with their public API URL.
5. Verify API, database, Redis, queue, and frontend smoke checks.

Use a process manager or container orchestrator for API/worker restarts. Back up PostgreSQL, test restoration, persist Redis only for queue recovery, rotate secrets, and centralize structured logs. R2/S3 service credentials belong only on the backend.

## Cloudflare R2 asset storage

Configure the API with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. `R2_ENDPOINT` is optional and defaults to `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; set it explicitly for another S3-compatible endpoint. `R2_PUBLIC_BASE_URL` is reserved for future public/CDN delivery and is not used to expose private assets. Upload and access URL expiry plus image, video, and PDF limits are configurable through the variables documented in `api/.env.example`.

Development and automated tests may start without R2 credentials; storage operations then return `ASSET_STORAGE_ERROR`. Production environment validation requires credentials and fails during startup when they are missing. There is no local-disk production fallback.

The R2 bucket must allow browser requests from the customer frontend. A conceptual CORS policy is:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://customer.example"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the example production origin with the deployed customer origin. Do not include storage credentials in frontend configuration. Pending uploads older than an operational threshold and any orphaned objects require a future cleanup scheduler.

## Generation worker

Run the API and worker as separate processes. The worker command is `npm run start:worker --workspace @fashion-ais/api`; both processes share PostgreSQL, Redis, storage configuration, and the `ai-generation` queue. Configure `AI_JOB_MAX_ATTEMPTS`, `AI_JOB_BACKOFF_MS`, and `MOCK_AI_DELAY_MS` as needed.

`AI_DEFAULT_PROVIDER=mock` preserves the local/test flow and makes no provider network calls. To route only virtual try-on to FASHN, set `AI_VIRTUAL_TRY_ON_PROVIDER=fashn` and provide `FASHN_API_KEY`. Configure `FASHN_BASE_URL`, `FASHN_MODEL_NAME=tryon-max`, status poll interval/timeout, request timeout, and maximum output bytes using `api/.env.example`. Missing FASHN credentials fail configuration validation when FASHN is selected; there is no silent fallback to Mock. Worker SIGTERM/SIGINT handling closes the BullMQ worker and Nest application context cleanly.

### Manual FASHN live verification

The manual verifier is never run by tests, builds, CI, installation, or application startup. It requires explicit asset, user, and organization IDs and defaults to dry-run mode. PostgreSQL, Redis, and R2 must be configured and reachable. In paid mode the command starts a temporary BullMQ worker using the existing `AiGenerationProcessor`, then closes it when verification finishes; it does not duplicate provider or output-processing logic.

Stage A performs database, Redis, storage, membership, asset, object, and signed-download preflight checks. It does not create a Generation or call FASHN:

```bash
FASHN_LIVE_TEST_ENABLED=true \
FASHN_LIVE_TEST_DRY_RUN=true \
FASHN_TEST_ORGANIZATION_ID="<ORG_ID>" \
FASHN_TEST_USER_ID="<USER_ID>" \
FASHN_TEST_PERSON_ASSET_ID="<PERSON_ASSET_ID>" \
FASHN_TEST_GARMENT_ASSET_ID="<GARMENT_ASSET_ID>" \
npm run verify:fashn-live --workspace @fashion-ais/api
```

Stage B consumes FASHN credits. It enqueues exactly one virtual try-on fixed to `1k`, `fast`, and one output, then observes the existing Generation, AIJob, BullMQ worker, FASHN, R2, and Asset pipeline. Set the API key in the environment, never in source or shell scripts committed to the repository:

```bash
FASHN_API_KEY="<SET_IN_ENV_NOT_SOURCE>" \
FASHN_LIVE_TEST_ENABLED=true \
FASHN_LIVE_TEST_DRY_RUN=false \
FASHN_TEST_ORGANIZATION_ID="<ORG_ID>" \
FASHN_TEST_USER_ID="<USER_ID>" \
FASHN_TEST_PERSON_ASSET_ID="<PERSON_ASSET_ID>" \
FASHN_TEST_GARMENT_ASSET_ID="<GARMENT_ASSET_ID>" \
npm run verify:fashn-live --workspace @fashion-ais/api
```

The verifier waits at most 180 seconds by default and never creates a replacement Generation after failure or timeout. Reports contain identifiers and safe persisted errors only. Signed URLs, authorization headers, provider response bodies, and image bytes are not printed. FASHN credit headers are not currently captured because they are not part of the persisted provider result contract.

## Authentication cookies

Local development uses an HttpOnly, `SameSite=Lax` refresh cookie without the Secure flag. Production enables Secure cookies automatically. If the frontends and API use different sites rather than subdomains of one site, cookie settings must be changed to `SameSite=None; Secure` and CORS must continue to use an explicit origin allowlist with credentials enabled. For cross-subdomain sharing, configure the intended parent cookie domain during deployment; never use a broad public-suffix domain.

## Proxy trust

The API does not trust forwarded client-IP headers by default. Set `TRUST_PROXY` only when the API is reachable exclusively through the intended trusted proxy chain. The value is passed to Express and may be a hop count such as `1` or an Express-compatible trusted address or subnet expression. For Cloudflare → Nginx → API, restrict direct API ingress and choose a value matching the actual network path; do not use an unrestricted boolean trust setting. Correct proxy trust is required for reliable request IP metadata and IP-based rate limiting.
