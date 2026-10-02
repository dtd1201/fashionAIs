# API conventions

## Versioning and envelopes

Public endpoints live under `/api/v1`. Successful controller results are wrapped as:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{
  "success": false,
  "error": { "code": "SOME_ERROR_CODE", "message": "Human readable message" }
}
```

Validation errors may include a `details` array. Production responses never expose stack traces.

## Requests

Input DTOs are validated and unknown fields are rejected. JWT bearer authentication will be used for protected routes. Authorization is enforced in backend guards and policies, including admin access and organization membership.

All organization members may read `GET /organizations/:organizationId/credits`. Owners and organization admins may read the cursor-paginated `/credits/ledger`; ordinary members receive a forbidden response. Insufficient generation balance returns HTTP 402 with code `INSUFFICIENT_CREDITS` and safe `requiredCredits`/`availableCredits` details. System-admin credit adjustments are protected by the existing JWT and system-admin guards.

Each response includes `x-request-id`. A syntactically safe incoming ID is reused; otherwise the API creates a UUID. Logs include this ID alongside method, path, status, and duration.

## Authentication

Authentication endpoints are:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/admin/me` for system administrators

Login and registration return a short-lived access token and current user. Clients send the access token as `Authorization: Bearer <token>`. The refresh token is sent only as an HttpOnly cookie and is rotated by every successful refresh request. Browser requests to login, refresh, and logout must use credentials mode. Invalid login responses intentionally do not reveal whether the account exists.

Authenticated frontend requests automatically refresh after an access-token 401 and retry once. Refresh is single-flight within one tab: concurrent failures share the same refresh request. A failed refresh clears frontend authentication state. Auth lifecycle endpoints are excluded from this behavior to prevent recursive refresh loops.

Logout is idempotent: it revokes the matching database session when possible and always clears the browser cookie. A customer account that attempts to enter the admin application is logged out after `/admin/me` denies access, preventing an unused admin-login session from remaining active.

## Pagination

Collection endpoints should prefer cursor pagination. Requests use `limit` (default 20, maximum 100) and optional `cursor`; responses return `items` and `pageInfo: { nextCursor, hasNextPage }`. Offset pagination is reserved for cases that require stable page numbers.

## Asset uploads

Asset uploads use a three-party flow: the authenticated browser initializes an upload with the API, PUTs bytes directly to the exact presigned object-storage URL, then asks the API to complete the upload. Completion never trusts the browser alone; the API verifies the stored object before returning a `READY` asset. Supported declarations are JPEG, PNG, WebP, MP4, WebM, and PDF, with default limits of 20 MB, 200 MB, and 25 MB respectively.

The browser cannot supply an object key or bucket. Asset responses omit both internal fields and all storage credentials. A failed direct upload may be reported through the asset fail endpoint. Private READY assets receive short-lived presigned access URLs.

## Generations

Generation creation accepts an optional `Idempotency-Key` header of at most 128 characters. Its scope is the authenticated user and organization. Repeating the same normalized request returns the existing generation without another database job or queue insertion; changing the request under the same key returns a conflict.

Generation parameters are currently generic JSON limited to 32 KiB. Provider-specific schemas, prompts, billing, and credits are intentionally deferred. Customers poll the generation detail endpoint until `COMPLETED`, `FAILED`, or `CANCELLED` and may request access URLs for READY output assets through the existing Asset API.

## Errors and status codes

Use stable machine-readable uppercase error codes. Apply standard HTTP semantics: 400 invalid input, 401 unauthenticated, 403 unauthorized, 404 missing resource, 409 conflict, 429 rate limited, and 500 unexpected failure. Do not leak secrets, provider payloads, or internal exception details.
