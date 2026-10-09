# Stripe billing

FashionAIs uses Stripe-hosted Checkout to fund the existing organization credit ledger. The API owns the billing catalog, Stripe Price IDs, credit quantities, customer mapping, and fulfillment rules. The web application sends only a `selectionId`.

## Checkout architecture

1. An authenticated organization `OWNER` or `ADMIN` posts a catalog selection and client-generated checkout operation UUID to `POST /api/v1/organizations/:organizationId/billing/checkout-session`.
2. The API creates or reuses one Stripe Customer for the organization, creates a local checkout record, and requests a Stripe Checkout Session.
3. The browser redirects to the returned Stripe-hosted URL.
4. Stripe posts a signed event to `POST /api/v1/billing/stripe/webhook`.
5. The API verifies the `Stripe-Signature` against the exact raw request body before processing the event.
6. A short database transaction records event idempotency, updates billing state, and grants credits through `CreditsService`.

Browser redirects never grant credits. `/billing/success` uses `session_id` only to poll the authenticated billing APIs and display `processing` or `confirmed` state.

## Catalog and fulfillment

Subscriptions (`starter`, `creator`, and `studio`) use Stripe Checkout `subscription` mode. One-time packages (`topup-100`, `topup-500`, `topup-1000`, and `topup-5000`) use `payment` mode. Price IDs come only from backend environment configuration.

A confirmed top-up creates one `CREDIT_PURCHASE` ledger entry using the idempotency key `stripe-checkout:{checkoutSessionId}`. The credit amount comes from the backend catalog, never from browser input or Stripe `amount_total`.

Subscription Checkout associates the organization, customer, subscription, and plan. It does not grant monthly credits. Each successful `invoice.paid` event creates one `SUBSCRIPTION_GRANT` entry using `stripe-invoice:{invoiceId}`. This covers the initial invoice and later renewals without a double grant. Failed invoices set the local subscription to `PAST_DUE`; subscription lifecycle events synchronize status and billing-period dates without granting credits.

## Idempotency and security

Every Stripe event ID is stored uniquely in `StripeWebhookEvent`. Re-deliveries of the same event are acknowledged without processing it again. Credit-ledger idempotency keys independently prevent duplicate checkout or invoice grants.

Checkout operation UUIDs are unique per organization and user. The API derives
Stripe idempotency keys from the persisted local checkout ID, so an ambiguous
network retry returns the same Stripe Checkout Session. The browser retains an
in-flight operation UUID in session storage until it receives the remote
session response, including across a page reload. Stripe Customer
creation similarly uses the organization ID as its stable idempotency key.

Webhook metadata is reconciled with the local checkout/customer records. It is not trusted by itself. Responses and logs must not contain Stripe secret keys, webhook secrets, full webhook bodies, authorization headers, or payment method/card data.

Nest is bootstrapped with `rawBody: true`; removing that option breaks signature verification. The webhook route intentionally does not use JWT authentication.

## Configuration and test mode

Set `STRIPE_ENABLED=false` to disable billing. To enable it, set
`STRIPE_ENABLED=true`, both Stripe secrets, HTTPS success/cancel URLs in
production, and one `STRIPE_PRICE_*` variable per catalog item. Partial enabled
configuration is rejected during startup. Disabled billing endpoints return
`BILLING_NOT_CONFIGURED` and no Stripe client is constructed.

Automated tests inject a mocked Stripe client and make no Stripe network requests. Customer Portal, refunds, disputes, taxes, coupons, multi-currency accounting, proration policy, seat billing, usage meters, and other payment providers are intentionally out of scope.
