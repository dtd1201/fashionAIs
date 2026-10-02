# Production Deployment

## Topology and domains

Run four independent processes: API, AI worker, customer web, and admin web. PostgreSQL, Redis, and a private R2 bucket are required. Typical domains are `app.example.com`, `admin.example.com`, and `api.example.com`. Terminate HTTPS at a trusted reverse proxy and prevent direct public access to PostgreSQL, Redis, and the API container port.

## Configuration

Copy `api/.env.example`, `web/.env.example`, `admin/.env.example`, and `workers/r2-gateway/.dev.vars.example` into the deployment secret manager. Never commit populated files. Production requires strong distinct JWT secrets, explicit HTTPS CORS origins, HTTPS Stripe return URLs, PostgreSQL/Redis connectivity, and complete configuration for the selected storage and AI transports. Browser bundles receive only `NEXT_PUBLIC_API_URL`.

Worker mode is the preferred R2 transport. Deploy `workers/r2-gateway`, bind `ASSETS_BUCKET`, store `R2_GATEWAY_SIGNING_SECRET` as a Worker secret, and set `ALLOWED_ORIGINS` to the exact customer origins. Keep the bucket private. The API controls object namespaces and short-lived URL expiry.

## Release procedure

1. Back up PostgreSQL and verify the backup is readable.
2. Build and test all workspaces.
3. Run `npm run prisma:deploy --workspace @fashion-ais/api` once as a controlled migration job.
4. Start API and worker with the same immutable image and environment; override the worker command with `node dist/worker.js`.
5. Deploy web and admin builds compiled with the production HTTPS API URL.
6. Configure the Stripe webhook to `https://api.example.com/api/v1/billing/webhook` and verify signatures before enabling checkout.
7. Check `/api/v1/health/live`, `/api/v1/health/ready`, and `/api/v1/health`.

The included `docker-compose.production.yml` is a single-host template. Managed PostgreSQL and Redis are preferred for higher availability; remove those services and point `DATABASE_URL`/Redis settings at the managed endpoints.

## Process and shutdown behavior

The API handles SIGTERM/SIGINT through Nest shutdown hooks, stops accepting HTTP work, then closes BullMQ/Redis and Prisma. The worker stops taking new jobs and waits for active BullMQ jobs before closing. Give the worker at least a two-minute termination grace period, or longer than the configured provider timeout.

## Queue operations

Configure concurrency, attempts, exponential backoff, queue prefix, and completed/failed retention with the `AI_*` variables in `api/.env.example`. Generation identifiers and idempotency remain database-authoritative. Final failure handling continues through the existing processor and credit-refund semantics.

## Reverse proxy and security

Forward the real request scheme and IP only through the trusted proxy chain, then set `TRUST_PROXY` to the exact hop count or subnet. Preserve `X-Request-Id` or allow the API to create one. Do not log authorization headers, cookies, signed URLs, provider payloads, or request bodies. Allow credentials only for the explicit customer/admin origins.

## Backups and data authority

PostgreSQL is authoritative for users, organizations, assets, generation state, billing reconciliation, and the append-only credit ledger. Take encrypted automated backups with point-in-time recovery where possible and perform regular restore drills. Take a fresh backup before every schema migration. R2 supplies object durability, but object inventory and PostgreSQL Asset records should be reconciled operationally. Redis persistence helps queue recovery but is not a substitute for PostgreSQL backups.

## Rollback and rotation

Rollback application images independently. Do not roll back a database migration unless a reviewed down-migration is known safe; prefer forward fixes. Rotate JWT, provider, Stripe, Redis, database, R2, and Worker-signing secrets through the platform secret manager. JWT secret rotation invalidates affected sessions; Worker-signing rotation must be coordinated with the API because outstanding signed URLs use the previous key.

## Monitoring

Collect structured stdout/stderr logs, alert on readiness failure, repeated worker failures, growing failed queues, Stripe webhook processing errors, and database backup failures. No paid observability service is required.
