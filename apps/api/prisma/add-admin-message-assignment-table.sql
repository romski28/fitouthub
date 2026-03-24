-- Migration: Add admin message assignment table for unified dashboard claim/assign workflow.
-- Run this against your database manually.

CREATE TABLE IF NOT EXISTS "AdminMessageAssignment" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "claimedByAdminId" TEXT,
  "assignedToAdminId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'unassigned',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminMessageAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminMessageAssignment_claimedByAdminId_fkey" FOREIGN KEY ("claimedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AdminMessageAssignment_assignedToAdminId_fkey" FOREIGN KEY ("assignedToAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminMessageAssignment_sourceType_sourceId_key"
  ON "AdminMessageAssignment" ("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "AdminMessageAssignment_claimedByAdminId_idx"
  ON "AdminMessageAssignment" ("claimedByAdminId");

CREATE INDEX IF NOT EXISTS "AdminMessageAssignment_assignedToAdminId_idx"
  ON "AdminMessageAssignment" ("assignedToAdminId");

CREATE INDEX IF NOT EXISTS "AdminMessageAssignment_status_idx"
  ON "AdminMessageAssignment" ("status");
