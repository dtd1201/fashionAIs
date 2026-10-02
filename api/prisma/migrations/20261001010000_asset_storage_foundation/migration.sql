CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER');
CREATE TYPE "AssetStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'FAILED', 'DELETED');
CREATE TYPE "AssetStorageProvider" AS ENUM ('R2');

CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "storageProvider" "AssetStorageProvider" NOT NULL DEFAULT 'R2',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");
CREATE INDEX "Asset_organizationId_createdAt_idx" ON "Asset"("organizationId", "createdAt" DESC);
CREATE INDEX "Asset_organizationId_kind_status_idx" ON "Asset"("organizationId", "kind", "status");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
