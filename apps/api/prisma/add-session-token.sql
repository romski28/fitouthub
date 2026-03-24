-- Migration: Add sessionToken for last-writer-wins single-session enforcement.
-- Run this against your database manually.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;

ALTER TABLE "Professional"
  ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;

CREATE INDEX IF NOT EXISTS "User_sessionToken_idx"
  ON "User" ("sessionToken");

CREATE INDEX IF NOT EXISTS "Professional_sessionToken_idx"
  ON "Professional" ("sessionToken");
