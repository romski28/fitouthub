-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportRequestStatus') THEN
    CREATE TYPE "SupportRequestStatus" AS ENUM ('unassigned', 'claimed', 'in_progress', 'resolved');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportRequestChannel') THEN
    CREATE TYPE "SupportRequestChannel" AS ENUM ('whatsapp', 'callback');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupportRequest" (
  "id" TEXT NOT NULL,
  "channel" "SupportRequestChannel" NOT NULL,
  "fromNumber" TEXT,
  "clientName" TEXT,
  "clientEmail" TEXT,
  "body" TEXT NOT NULL,
  "twilioMessageSid" TEXT,
  "status" "SupportRequestStatus" NOT NULL DEFAULT 'unassigned',
  "assignedAdminId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "projectId" TEXT,
  "notes" TEXT,
  "replies" JSONB[] NOT NULL DEFAULT ARRAY[]::JSONB[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportRequest_status_idx" ON "SupportRequest"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportRequest_assignedAdminId_idx" ON "SupportRequest"("assignedAdminId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportRequest_channel_idx" ON "SupportRequest"("channel");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportRequest_createdAt_idx" ON "SupportRequest"("createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportRequest_assignedAdminId_fkey'
  ) THEN
    ALTER TABLE "SupportRequest"
      ADD CONSTRAINT "SupportRequest_assignedAdminId_fkey"
      FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportRequest_projectId_fkey'
  ) THEN
    ALTER TABLE "SupportRequest"
      ADD CONSTRAINT "SupportRequest_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;