# Database

## Current schema

The Prisma schema contains `User`, `Organization`, `OrganizationMember`, `AuthSession`, and `Asset`. UUID primary keys and timestamps are used throughout. Membership is the many-to-many boundary that lets a user belong to multiple organizations, with an organization-scoped role of `OWNER`, `ADMIN`, or `MEMBER`.

Email uniqueness is currently global. Organization slugs are unique for stable routing. Membership has a composite uniqueness constraint on `(userId, organizationId)`, an organization lookup index, and an `(organizationId, role)` index for owner-invariant checks.

`User` stores a normalized email, Argon2id password hash, account status, and the separate `isSystemAdmin` flag. `AuthSession` stores only a hash of each refresh token, its expiry and revocation timestamps, rotation replacement ID, and limited request metadata. Plaintext passwords and refresh tokens are never persisted.

## Planned organization model

Business data will belong to an organization rather than directly to a single user:

```text
User -> OrganizationMember -> Organization
                               |- CreditWallet / CreditTransaction
                               |- Subscription / Plan
                               |- Asset
                               |- Generation / AIJob
                               \- AuditLog
```

System administration is separate from organization membership roles. Future additions such as providers, API keys, plans, subscriptions, and audit logs should be introduced only when their behavior is implemented.

An organization must always have at least one `OWNER`. Any role change or removal that affects an owner runs in a serializable database transaction, rechecks the remaining owner count inside that transaction, and retries serialization conflicts. This invariant is separate from `User.isSystemAdmin`; system administrators do not implicitly bypass organization membership authorization.

Each `Asset` belongs to one organization and records its creating user, lifecycle status, kind, original metadata, and backend-controlled object-storage location. File bytes are never stored in PostgreSQL. Asset keys use `organizations/{organizationId}/assets/{assetId}/source.{extension}`; the extension comes from the validated MIME type rather than the supplied filename. The original filename is retained only as metadata.

Asset lifecycle transitions are controlled by the API: `PENDING_UPLOAD` may become `READY` after storage verification or `FAILED`; `READY` and `FAILED` may become soft-deleted `DELETED`. Width, height, duration, and SHA-256 remain nullable until future processing support exists.

`Generation` stores organization ownership, type, lifecycle state, generic JSON parameters, safe errors, timestamps, and optional user/organization-scoped idempotency metadata. Inputs and outputs use `GenerationInputAsset` and `GenerationOutputAsset` relations rather than unvalidated asset-ID arrays. Input assets must already be READY and belong to the same organization. Outputs are canonical Asset records.

`AIJob.providerJobId` stores the external FASHN prediction ID as soon as submission succeeds. It is used to resume polling on retry; provider credentials, presigned input URLs, response bodies, and temporary output CDN URLs are never stored.

`CreditLedgerEntry` records every organization credit mutation with an integer amount, resulting balance, optional generation/reference, actor, and globally unique idempotency key. The ledger is authoritative and append-only. `OrganizationCreditBalance` is a one-row-per-organization cache updated in the same transaction as every ledger entry. Generation rows retain their charged cost and reservation/finalization/refund timestamps for auditability.

Each Generation has one `AIJob`, which records the provider, job type, bounded attempt count, queue/provider identifiers, lifecycle state, and safe errors. PostgreSQL remains authoritative; Redis/BullMQ is delivery infrastructure rather than the source of truth.

## Credit consistency

Credits require available and reserved balances plus immutable transactions. A generation reserves credits before enqueueing, consumes the reservation on success, and refunds it on failure. Reconciliation must be possible; a direct `balance -= cost` design is not acceptable.

All schema changes require a named Prisma migration committed with the corresponding code and documentation updates.
