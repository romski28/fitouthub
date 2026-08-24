-- ============================================================================
-- People symmetry: workers get mobile + trade + notes like address-book contacts.
-- 1) WorkerInvite carries phone/trade/notes so the pro captures them at invite
--    time; they are applied to the worker's Professional row on acceptance.
-- 2) Professional gains a notes column (mirrors ProfessionalContact.notes).
-- Idempotent. Apply after MANUAL_SQL_ADD_PROFESSIONAL_CONTACTS.sql.
-- ============================================================================

ALTER TABLE "WorkerInvite"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

ALTER TABLE "WorkerInvite"
  ADD COLUMN IF NOT EXISTS "trade" TEXT;

ALTER TABLE "WorkerInvite"
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "Professional"
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
