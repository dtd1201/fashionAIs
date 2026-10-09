# FashionAIs R2 Gateway

This Cloudflare Module Worker avoids the R2 S3 endpoint TLS path by using the
`ASSETS_BUCKET` R2 binding. It exposes no bucket listing and accepts only
short-lived HMAC-signed object requests created by the FashionAIs API.

## Deploy

```bash
cd workers/r2-gateway
npm install
npx wrangler login
npx wrangler secret put R2_GATEWAY_SIGNING_SECRET
npx wrangler deploy
```

The default environment is for local/dev smoke origins. Production deployment
is deliberately explicit. Replace `https://app.example.com` in
`wrangler.jsonc` with the real customer origin, then run:

```bash
npx wrangler secret put R2_GATEWAY_SIGNING_SECRET --env production
npx wrangler deploy --env production
npx wrangler tail --env production
```

Use `npx wrangler tail` for the default smoke/dev Worker. Secrets are stored by
Wrangler and must never be added to `wrangler.jsonc`.

The secret must match the API's `R2_GATEWAY_SIGNING_SECRET` and should contain
at least 32 random characters. Set `ALLOWED_ORIGINS` in `wrangler.jsonc` to a
comma-separated list containing the local and production web origins. The
`ASSETS_BUCKET` binding targets the existing `fashionais-assets` bucket.

## API configuration

```dotenv
R2_TRANSPORT=worker
R2_BUCKET=fashionais-assets
R2_GATEWAY_BASE_URL=https://fashionais-r2-gateway.<subdomain>.workers.dev
R2_GATEWAY_SIGNING_SECRET=<same-random-secret-as-the-worker>
```

Use `R2_TRANSPORT=s3` to retain the existing AWS SDK-compatible transport.
Worker mode needs no R2 access key or secret because all storage operations use
the bucket binding.

## Routes

- `PUT /objects/:encodedKey`
- `GET /objects/:encodedKey`
- `HEAD /objects/:encodedKey`
- `DELETE /objects/:encodedKey` for backend use

The signed canonical message binds the HTTP method, exact object key, expiry,
optional content type, and optional maximum size. Upload bodies stream from the
browser to the Worker and then to R2; they never pass through the API VPS. For
signed PUTs, the Worker rejects an invalid or oversized `Content-Length`. When
the header is present, it pumps and counts the body through a native
`FixedLengthStream`, preserving the fixed-length upload required by R2 while
also rejecting header/body mismatches. Requests without the header are securely
buffered up to the lower of the signed maximum and 32 MiB before writing. R2
puts are atomic, so a rejected upload does not publish a partial replacement.
