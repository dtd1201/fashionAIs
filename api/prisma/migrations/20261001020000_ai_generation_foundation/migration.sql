CREATE TYPE "GenerationType" AS ENUM ('VIRTUAL_TRY_ON', 'MODEL_GENERATION', 'PHOTOSHOOT', 'IMAGE_GENERATION', 'VIDEO_GENERATION');
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');
CREATE TYPE "GenerationAssetRole" AS ENUM ('PERSON', 'GARMENT', 'REFERENCE', 'SOURCE', 'MASK');
CREATE TYPE "AIProviderName" AS ENUM ('MOCK');
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "Generation" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "createdByUserId" UUID NOT NULL,
  "type" "GenerationType" NOT NULL, "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
  "parameters" JSONB NOT NULL DEFAULT '{}', "idempotencyKey" TEXT, "requestFingerprint" TEXT,
  "errorCode" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GenerationInputAsset" (
  "id" UUID NOT NULL, "generationId" UUID NOT NULL, "assetId" UUID NOT NULL,
  "role" "GenerationAssetRole" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationInputAsset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GenerationOutputAsset" (
  "id" UUID NOT NULL, "generationId" UUID NOT NULL, "assetId" UUID NOT NULL, "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationOutputAsset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AIJob" (
  "id" UUID NOT NULL, "generationId" UUID NOT NULL, "organizationId" UUID NOT NULL,
  "provider" "AIProviderName" NOT NULL DEFAULT 'MOCK', "jobType" "GenerationType" NOT NULL,
  "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED', "queueJobId" TEXT, "providerJobId" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0, "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "errorCode" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Generation_organizationId_createdByUserId_idempotencyKey_key" ON "Generation"("organizationId", "createdByUserId", "idempotencyKey");
CREATE INDEX "Generation_organizationId_createdAt_idx" ON "Generation"("organizationId", "createdAt" DESC);
CREATE INDEX "Generation_organizationId_type_status_idx" ON "Generation"("organizationId", "type", "status");
CREATE UNIQUE INDEX "GenerationInputAsset_generationId_assetId_role_key" ON "GenerationInputAsset"("generationId", "assetId", "role");
CREATE INDEX "GenerationInputAsset_assetId_idx" ON "GenerationInputAsset"("assetId");
CREATE UNIQUE INDEX "GenerationOutputAsset_assetId_key" ON "GenerationOutputAsset"("assetId");
CREATE UNIQUE INDEX "GenerationOutputAsset_generationId_position_key" ON "GenerationOutputAsset"("generationId", "position");
CREATE UNIQUE INDEX "AIJob_generationId_key" ON "AIJob"("generationId");
CREATE UNIQUE INDEX "AIJob_queueJobId_key" ON "AIJob"("queueJobId");
CREATE INDEX "AIJob_organizationId_status_idx" ON "AIJob"("organizationId", "status");
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GenerationInputAsset" ADD CONSTRAINT "GenerationInputAsset_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationInputAsset" ADD CONSTRAINT "GenerationInputAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GenerationOutputAsset" ADD CONSTRAINT "GenerationOutputAsset_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationOutputAsset" ADD CONSTRAINT "GenerationOutputAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
