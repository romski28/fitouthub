-- ============================================================================
-- PM role — expand User.role CHECK constraint to allow 'project_manager'.
--
-- Creating a Project Manager account currently fails with:
--   PostgresError code 23514 — "new row for relation \"User\" violates check
--   constraint \"user_role_check\"".
-- The User.role column is a DB-level CHECK constraint that Prisma does not
-- manage, so this must be applied manually.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod).
-- ============================================================================

BEGIN;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "User"
  ADD CONSTRAINT user_role_check
  CHECK (role IN (
    'client',
    'professional',
    'admin',
    'reseller',
    'surveyor',
    'mimo_boh',
    'landlord',
    'property_manager',
    'estate_agent',
    'project_delegate',
    'project_manager'
  ));

COMMIT;
