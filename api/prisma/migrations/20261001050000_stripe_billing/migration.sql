CREATE TYPE "BillingCheckoutMode" AS ENUM ('SUBSCRIPTION', 'PAYMENT');
CREATE TYPE "BillingCheckoutStatus" AS ENUM ('CREATED', 'COMPLETED', 'EXPIRED', 'FAILED');
CREATE TYPE "SubscriptionProvider" AS ENUM ('STRIPE');
CREATE TYPE "OrganizationSubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'UNPAID');

CREATE TABLE "BillingCustomer" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingCheckoutSession" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "selectionId" TEXT NOT NULL,
  "mode" "BillingCheckoutMode" NOT NULL,
  "status" "BillingCheckoutStatus" NOT NULL DEFAULT 'CREATED',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "amountTotal" INTEGER,
  "currency" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCheckoutSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" UUID NOT NULL,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "processingError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationSubscription" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "provider" "SubscriptionProvider" NOT NULL DEFAULT 'STRIPE',
  "stripeSubscriptionId" TEXT,
  "stripeCustomerId" TEXT,
  "planId" TEXT NOT NULL,
  "status" "OrganizationSubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCustomer_organizationId_key" ON "BillingCustomer"("organizationId");
CREATE UNIQUE INDEX "BillingCustomer_stripeCustomerId_key" ON "BillingCustomer"("stripeCustomerId");
CREATE UNIQUE INDEX "BillingCheckoutSession_stripeCheckoutSessionId_key" ON "BillingCheckoutSession"("stripeCheckoutSessionId");
CREATE INDEX "BillingCheckoutSession_organizationId_createdAt_idx" ON "BillingCheckoutSession"("organizationId", "createdAt" DESC);
CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");
CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");
CREATE UNIQUE INDEX "OrganizationSubscription_stripeSubscriptionId_key" ON "OrganizationSubscription"("stripeSubscriptionId");

ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutSession" ADD CONSTRAINT "BillingCheckoutSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
