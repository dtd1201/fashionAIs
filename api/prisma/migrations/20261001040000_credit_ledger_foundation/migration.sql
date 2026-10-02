CREATE TYPE "CreditLedgerEntryType" AS ENUM ('INITIAL_GRANT', 'SUBSCRIPTION_GRANT', 'CREDIT_PURCHASE', 'GENERATION_DEBIT', 'GENERATION_REFUND', 'ADMIN_ADJUSTMENT', 'EXPIRATION');

ALTER TABLE "Generation"
ADD COLUMN "creditCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "creditsReservedAt" TIMESTAMP(3),
ADD COLUMN "creditsFinalizedAt" TIMESTAMP(3),
ADD COLUMN "creditsRefundedAt" TIMESTAMP(3);

CREATE TABLE "OrganizationCreditBalance" (
  "organizationId" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationCreditBalance_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "CreditLedgerEntry" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "CreditLedgerEntryType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "generationId" UUID,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "description" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditLedgerEntry_idempotencyKey_key" ON "CreditLedgerEntry"("idempotencyKey");
CREATE INDEX "CreditLedgerEntry_organizationId_createdAt_idx" ON "CreditLedgerEntry"("organizationId", "createdAt" DESC);
CREATE INDEX "CreditLedgerEntry_generationId_idx" ON "CreditLedgerEntry"("generationId");

ALTER TABLE "OrganizationCreditBalance" ADD CONSTRAINT "OrganizationCreditBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
