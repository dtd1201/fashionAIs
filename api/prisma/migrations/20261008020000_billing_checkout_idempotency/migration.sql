ALTER TABLE "BillingCheckoutSession"
ADD COLUMN "operationId" UUID;

UPDATE "BillingCheckoutSession"
SET "operationId" = "id"
WHERE "operationId" IS NULL;

ALTER TABLE "BillingCheckoutSession"
ALTER COLUMN "operationId" SET NOT NULL;

CREATE UNIQUE INDEX "BillingCheckoutSession_organizationId_createdByUserId_operationId_key"
ON "BillingCheckoutSession"("organizationId", "createdByUserId", "operationId");
