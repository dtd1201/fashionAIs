# Production Deployment

## Topology and exposure

The single-host template runs API, AI worker, customer web, admin web,
PostgreSQL, and Redis. Only the reverse proxy should be Internet-facing. The
Compose ports bind to `127.0.0.1`; never expose PostgreSQL (`5432`) or Redis
(`6379`) through the firewall. Permit inbound `80/443` and restricted SSH only.

Use managed PostgreSQL/Redis when higher availability is required. Production
validation rejects loopback database and Redis addresses, but accepts Compose
service names such as `postgres` and `redis`, private DNS, and private IPs.

## Create configuration

Create the secret file without making it world-readable:

```bash
install -m 600 /dev/null .env.production
editor .env.production
chmod 600 .env.production
```

Start from `api/.env.example`, then add `POSTGRES_DB`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `NEXT_PUBLIC_API_URL`. Use distinct random JWT
secrets, a non-empty Redis password, explicit HTTPS CORS origins, and real R2
values. Do not set `ALLOW_LOCAL_PRODUCTION_SMOKE=true` in production.

`AI_VIRTUAL_TRY_ON_PROVIDER=mock` is rejected in production unless
`ALLOW_MOCK_AI_IN_PRODUCTION=true`. That override is for controlled staging or
an emergency paid-AI shutdown, not a public launch.

Billing is atomic: use `STRIPE_ENABLED=false` with empty Stripe values, or set
`STRIPE_ENABLED=true` and provide both secrets, HTTPS success/cancel URLs, and
all seven `STRIPE_PRICE_*` IDs. Partial configuration fails startup.

Validate interpolation and the final service definition before every release:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config >/tmp/fashionais-compose.yml
```

Review `/tmp/fashionais-compose.yml` securely and remove it afterward because
Compose output may contain resolved secrets.

## R2 Worker

Edit the production `ALLOWED_ORIGINS` in `workers/r2-gateway/wrangler.jsonc`,
then set the secret and deploy the explicit production environment:

```bash
cd workers/r2-gateway
npx wrangler secret put R2_GATEWAY_SIGNING_SECRET --env production
npx wrangler deploy --env production
npx wrangler tail --env production
```

The secret must match the API and is never stored in Wrangler configuration.
Keep the R2 bucket private.

## Release procedure

Back up PostgreSQL first using `docs/BACKUP_RESTORE.md`, then build images:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
```

Run migrations as a controlled one-off before starting the new application:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm api \
  /app/node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
docker compose --env-file .env.production -f docker-compose.production.yml run --rm api \
  /app/node_modules/.bin/prisma migrate status --schema prisma/schema.prisma
```

Start or update the stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Verify health through the public TLS endpoint:

```bash
curl -fsS https://api.example.com/api/v1/health/live
curl -fsS https://api.example.com/api/v1/health/ready
```

The worker has no HTTP health endpoint. Verify it is running and connected by
inspecting logs and completing one MOCK/staging generation:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 worker
```

## Operations

Inspect logs and restart individual services:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=200 api worker
docker compose --env-file .env.production -f docker-compose.production.yml restart api
docker compose --env-file .env.production -f docker-compose.production.yml restart worker
```

Stop and start without deleting persistent volumes:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml stop
docker compose --env-file .env.production -f docker-compose.production.yml start
```

Never use `down --volumes` in production. Compose rotates container logs at
five 10 MiB files per service. Monitor host filesystem usage, Docker volumes,
PostgreSQL growth, R2 usage, and backup storage independently.

## Initial system administrator

There is no public system-admin registration. Register the intended account
normally, identify it by exact email, then use a reviewed one-off database
command in the PostgreSQL container:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "UPDATE \"User\" SET \"isSystemAdmin\" = true WHERE email = '\''admin@example.com'\'' RETURNING id,email,\"isSystemAdmin\";"'
```

Replace the email, confirm exactly one returned row, and retain an audit record
of who approved the change. Do not expose an admin-creation HTTP endpoint.

## Functional verification

For R2, create an upload through the authenticated API, PUT the exact file with
the returned `Content-Type`, call completion, then verify authenticated GET and
HEAD. Also send a fresh small-limit URL a larger chunked body and confirm `413`
without an object being published.

Configure Stripe's endpoint as:

```text
https://api.example.com/api/v1/billing/stripe/webhook
```

Use Stripe test mode/CLI before enabling live billing. Confirm signature
verification, one local checkout record per operation ID, and one credit grant
after duplicate webhook delivery. Never perform a live charge as a deployment
check.

## Rollback and emergencies

Pin immutable image tags in the deployment environment. To roll back code,
restore the previous tags and run:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d api worker web admin
```

Do not casually reverse an applied production migration. Prefer a reviewed
forward-fix migration; restore a database only for a declared recovery event.

Emergency billing disable: set `STRIPE_ENABLED=false`, then recreate API and
worker. Checkout and webhook endpoints return controlled unavailable behavior.

Emergency paid-AI disable: set virtual try-on to `mock` together with
`ALLOW_MOCK_AI_IN_PRODUCTION=true`, recreate API and worker, and clearly mark
the environment as degraded/internal-only.

Rotate database, Redis, JWT, AI provider, Stripe, R2, and Worker-signing secrets
through the deployment secret manager. Worker-signing rotation must be
coordinated with the API because outstanding signed URLs use the old key.
