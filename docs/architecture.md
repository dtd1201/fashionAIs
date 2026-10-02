# Architecture

## System shape

FashionAIs is an organization-first SaaS monorepo with three independently deployable applications. The customer and admin frontends communicate only with the versioned backend API. The API is the trust boundary for business logic, authorization, database access, queues, storage credentials, and future third-party providers.

```text
Customer Web (Cloudflare) ----\
                               > HTTPS /api/v1 -> API (VPS) -> PostgreSQL
Admin Web (Cloudflare) -------/                    |       -> Redis/BullMQ -> Worker
                                                    |       -> R2/S3 (future)
                                                    \-------> AI providers (future)
```

## Applications

- `api` is a modular NestJS service. Implemented foundation modules cover configuration, Prisma, Redis/BullMQ, health checks, structured request logging, validation, request IDs, security headers, and centralized errors.
- `web` is the public/customer Next.js application. It owns presentation and calls the backend through a typed API client.
- `admin` is a separate Next.js application for internal operations. Its UI may hide unauthorized actions, but the backend must enforce every admin permission.

## Data and asynchronous work

PostgreSQL is the source of truth. Redis supports queues and short-lived infrastructure concerns, not durable business records. Long-running generation requests will create a durable database job, reserve credits, enqueue work with BullMQ, and return immediately. A worker later updates the job and consumes or refunds reserved credits.

## Authentication and authorization

The API authenticates both customer and system-admin users. Public registration creates a customer user, organization, and OWNER membership in one database transaction; it can never create a system administrator. Passwords use Argon2id hashes.

Access tokens are short-lived JWT bearer tokens held only in frontend runtime memory. Refresh JWTs are longer-lived, stored in an HttpOnly cookie, and represented in PostgreSQL by a SHA-256 hash in `AuthSession`. Every refresh revokes the current session and creates a replacement session. Logout revokes the session and clears the cookie. Protected requests also confirm that the user remains active in PostgreSQL.

Each frontend exposes one auth-aware request function from its existing auth provider. A protected request that receives 401 performs one refresh, updates the provider-owned in-memory access token, and retries the original request once. Concurrent 401 responses in one browser runtime await one shared refresh promise. Login, registration, refresh, and logout calls never invoke automatic refresh.

Strict refresh rotation is not yet coordinated across browser tabs. If two tabs refresh the same cookie simultaneously, one can rotate it while the other receives 401. Future work may coordinate tabs with `BroadcastChannel` or an equivalent browser mechanism; this limitation does not change the server-side rotation policy.

System-admin access is independent of organization roles. Backend guards require `isSystemAdmin = true` for `/api/v1/admin/*`; frontend route hiding is not a security control.

Organization authorization is membership-based and enforced by the API. `OWNER` and `ADMIN` may update the organization name; every member may view organization details and the member list. `OWNER` may manage all roles and memberships while preserving at least one owner. `ADMIN` may promote `MEMBER` to `ADMIN`, demote another `ADMIN`, and remove `MEMBER` or another `ADMIN`, but cannot act on an `OWNER`, assign `OWNER`, or modify/remove themselves. `MEMBER` has read-only organization access. Non-members receive `404 ORGANIZATION_NOT_FOUND` for organization-scoped resources so private organization existence is not disclosed.

The customer auth provider loads `/api/v1/organizations` after authentication through the existing refresh-aware request client. It exposes the organization list, current organization, and current role. The first returned organization is selected for now (including when several memberships exist); selection is not persisted and organization switching UI is future work. Frontend role state supports UX only—the API remains the authorization boundary.

The admin frontend uses the shared login endpoint and then verifies `/api/v1/admin/me`. When verification returns 403, it immediately calls logout to revoke the newly created `AuthSession` and clear the refresh cookie, clears its access token and user state, and enters the denied state.

## AI and storage boundaries

AI capabilities are represented by backend interfaces and selected through an AI routing layer. Provider credentials never reach either frontend. Large media will use backend-issued presigned URLs so browsers upload directly to Cloudflare R2 or another S3-compatible service; the backend stores authoritative asset metadata.

The implemented asset flow creates organization-owned `PENDING_UPLOAD` metadata, issues an exact-key presigned R2 PUT, and lets the browser send bytes directly to R2. The completion endpoint performs a backend HEAD request and verifies available content length and content type before changing the asset to `READY`. Organization membership protects every asset route; only `OWNER` and `ADMIN` may delete. Access URLs are short-lived private presigned GET URLs, and deletion removes the object before soft-deleting its metadata.

Initial MIME checks use browser-declared metadata and R2 HEAD metadata, not content inspection. Magic-byte validation, malware scanning, media probing, checksum enforcement, thumbnails, and CDN/public delivery are future work. Pending-upload and orphan-object cleanup also needs a future scheduled process.

## AI generation jobs

Generation requests validate organization membership and READY same-organization input assets, create Generation and AIJob records transactionally, enqueue an `ai-generation` BullMQ job containing only their IDs, and return without waiting for processing. Queue insertion failure leaves an auditable database record but marks both records FAILED.

### FASHN Virtual Try-On

`VIRTUAL_TRY_ON` accepts exactly one `PERSON` image and one `GARMENT` image. Both must be organization-owned, `READY`, present in private storage, and JPEG, PNG, or WebP. The backend maps `PERSON` to FASHN `model_image` and `GARMENT` to `product_image`; only `prompt`, `resolution`, `generation_mode`, and `num_images` are forwarded.

The provider resolver chooses `MOCK` or `FASHN` from backend configuration. The browser submits a generation type, inputs, and parameters only; it cannot choose a provider and never receives provider credentials or signed provider input URLs. FASHN is supported only for virtual try-on.

Immediately before `POST /run`, the worker creates 15-minute presigned GET URLs for the two private inputs. After FASHN returns a prediction ID, the provider persists it to `AIJob.providerJobId` before status polling. Retries resume `GET /status/{id}` when that ID exists, avoiding another chargeable submission. A process crash after FASHN accepts `/run` but before the ID update remains an unavoidable duplicate-submission window because no provider idempotency contract is available.

Polling is bounded and checks cooperative cancellation between requests. FASHN has no assumed cancellation endpoint, so cancellation stops local polling and follows the existing Generation/AIJob cancellation transitions. HTTP 429 and 5xx responses are retryable; authentication, malformed responses, and provider-declared generation failures are terminal. Poll frequency is configurable and should respect FASHN rate limits.

Completed provider URLs are temporary transfer locations, not canonical assets. The provider accepts HTTPS output URLs only, rejects literal loopback/private addresses, disables redirects, validates image content type, and streams with a configured byte limit. The worker then writes normalized bytes through `StorageProvider`, creates organization-owned `READY` Assets, links ordered Generation outputs, and only then marks the generation complete. DNS resolution is not currently pinned, so hostname-based DNS rebinding protection remains a future hardening item.

### Organization credits

Credits belong to an organization and are shared by all of its members. `CreditLedgerEntry` is the authoritative append-only accounting history, while `OrganizationCreditBalance` is a transactionally maintained read cache. Integer amounts are positive for grants/refunds and negative for generation consumption; conditional balance updates prevent the cached balance from becoming negative under concurrent requests.

Generation pricing is centralized and deterministic. Virtual Try-On currently costs one credit per requested output (`num_images` 1–4); resolution and generation mode do not yet affect price. This is temporary product configuration and may change with provider economics.

Generation creation reserves credits in the same short transaction that creates the Generation and AIJob. A unique `generation-debit:{generationId}` ledger key prevents duplicate charges. Queue insertion failure, final provider failure, output storage failure, queued cancellation, and processing cancellation before an output commit create a single `generation-refund:{generationId}` entry. Successful completion finalizes the existing charge and is never charged again or refunded.

The frontend balance and estimated cost are advisory. PostgreSQL's conditional debit is the security and concurrency boundary. Payment providers, subscriptions, purchases, and Stripe-funded grants are not implemented; future billing will append grant entries rather than mutate accounting history.

The separately launched worker conditionally claims QUEUED database state, calls the provider abstraction, writes generated bytes through the storage abstraction, creates and links organization-owned READY output Assets, then marks the job SUCCEEDED and generation COMPLETED. It never holds a database transaction open during provider delays or object-storage calls. Deterministic output asset IDs and `(generationId, position)` uniqueness prevent duplicate final outputs during retries.

Generation states are `QUEUED`, `PROCESSING`, `CANCEL_REQUESTED`, `COMPLETED`, `FAILED`, and `CANCELLED`. Job states are `QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`. Terminal states are not reopened. QUEUED cancellation is immediate; PROCESSING cancellation is cooperative and checked before provider work and output commit. Future providers may add provider-specific cancellation, but hard third-party cancellation is not claimed.

`MockAiProvider` is the only provider and is strictly a development/test proof mechanism, not production AI. It performs no network request and returns a tiny deterministic artifact. No real AI provider or API key is integrated. Retries are bounded and use exponential BullMQ backoff. HTTP polling is the current customer status mechanism; SSE or WebSockets may be added later.

## Deployment

Customer and admin builds target Cloudflare-compatible Next.js hosting. The API and worker run as separate processes on a VPS behind Nginx. PostgreSQL and Redis initially share the VPS with persistent backups and restricted network access. See `deployment.md` for the operational topology.
