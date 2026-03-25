-- Migration: Add closure/audit fields for support + assist + in-app chat threads.
-- Run this against your database manually.

ALTER TYPE "SupportRequestStatus" ADD VALUE IF NOT EXISTS 'closure_pending';

ALTER TABLE "SupportRequest"
  ADD COLUMN IF NOT EXISTS "closureRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closureDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionMode" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusTimeline" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ProjectAssistRequest"
  ADD COLUMN IF NOT EXISTS "closureRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closureDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionMode" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusTimeline" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "PrivateChatThread"
  ADD COLUMN IF NOT EXISTS "closureRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closureDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionMode" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusTimeline" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "AnonymousChatThread"
  ADD COLUMN IF NOT EXISTS "closureRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closureDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionMode" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusTimeline" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "SupportRequest_closureDueAt_idx" ON "SupportRequest" ("closureDueAt");
CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_closureDueAt_idx" ON "ProjectAssistRequest" ("closureDueAt");
CREATE INDEX IF NOT EXISTS "PrivateChatThread_closureDueAt_idx" ON "PrivateChatThread" ("closureDueAt");
CREATE INDEX IF NOT EXISTS "AnonymousChatThread_closureDueAt_idx" ON "AnonymousChatThread" ("closureDueAt");
