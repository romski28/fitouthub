-- Migration: Add quoteReminderSentAt and quoteExtendedUntil to ProjectProfessional
-- Run this against your database manually.

ALTER TABLE "ProjectProfessional"
  ADD COLUMN IF NOT EXISTS "quoteReminderSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quoteExtendedUntil"  TIMESTAMP(3);
