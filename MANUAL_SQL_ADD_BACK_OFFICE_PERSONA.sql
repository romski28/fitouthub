-- ============================================================================
-- Persona BACK_OFFICE — regroup back-office staff under one persona type.
--
-- admin / surveyor / mimo_boh / project_manager are internal staff roles that
-- previously fell through to the CLIENT persona. Reclassify their personas to a
-- new BACK_OFFICE type so the admin People list can distinguish staff from
-- tenants / owners / professionals.
--
-- Also retire the PROJECT_DELEGATE persona: delegates are now a sub-role flag on
-- the tenant/owner, so any legacy PROJECT_DELEGATE personas become CLIENT.
--
-- Idempotent. Apply in Supabase SQL Editor (dev -> prod). No prisma generate
-- required (Persona.type is a free-form string column).
-- ============================================================================

-- 1. Back-office users -> BACK_OFFICE
UPDATE "Persona"
SET "type" = 'BACK_OFFICE',
    "updatedAt" = NOW()
WHERE "userId" IN (
    SELECT "id" FROM "User" WHERE "role" IN ('admin', 'surveyor', 'mimo_boh', 'project_manager')
  )
  AND "type" <> 'BACK_OFFICE';

-- 2. Legacy PROJECT_DELEGATE personas -> CLIENT (delegates are a sub-role now)
UPDATE "Persona"
SET "type" = 'CLIENT',
    "updatedAt" = NOW()
WHERE "type" = 'PROJECT_DELEGATE';
