ALTER TABLE "AIJob"
ADD COLUMN "leaseOwner" TEXT,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "AIJob_status_leaseExpiresAt_idx"
ON "AIJob"("status", "leaseExpiresAt");
