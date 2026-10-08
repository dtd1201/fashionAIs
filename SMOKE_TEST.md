# Local production-style smoke test

This stack builds the production Dockerfiles and runs the applications with
`NODE_ENV=production`. Caddy terminates local TLS with its internal CA; no
production validation or production Compose behavior is changed.

## Prepare and start

```sh
cp .env.smoke.example .env.smoke
docker compose --env-file .env.smoke -f docker-compose.smoke.yml up --build -d
```

The checked-in example uses mock AI providers, disables Stripe, and contains
only local placeholder secrets. If asset upload/download is part of the smoke
test, put existing R2 Worker gateway values in the untracked `.env.smoke` file.
Do not commit real credentials.

## URLs

- Customer web: <https://localhost:8443>
- Admin web: <https://localhost:8444>
- API base: <https://localhost:8445/api/v1>

## Health checks

Use `-k` because Caddy's local CA is not trusted by the host initially.

```sh
docker compose --env-file .env.smoke -f docker-compose.smoke.yml ps
curl -fk https://localhost:8443/ >/dev/null
curl -fk https://localhost:8444/ >/dev/null
curl -fk https://localhost:8445/api/v1/health/live
curl -fk https://localhost:8445/api/v1/health/ready
```

The ready endpoint verifies PostgreSQL and Redis connectivity.

## Local certificate

Caddy generates a local CA and a certificate covering `localhost`. Browsers
will show a warning until that CA is trusted. For a quick smoke test, open each
URL and accept the browser's advanced/proceed warning.

To trust the CA, start the stack, export the root certificate, then add it to
your operating system or browser's trusted certificate authorities:

```sh
docker compose --env-file .env.smoke -f docker-compose.smoke.yml cp proxy:/data/caddy/pki/authorities/local/root.crt ./fashionais-smoke-root.crt
```

Remove `fashionais-smoke-root.crt` after importing it. Trusting a local CA is a
machine-level security decision; remove it from the trust store when testing is
complete if it is no longer needed.

## Stop

```sh
docker compose --env-file .env.smoke -f docker-compose.smoke.yml down
```

The named smoke-test database, Redis, and Caddy volumes are retained. To remove
only this stack's local data, run the same command with `--volumes`.
