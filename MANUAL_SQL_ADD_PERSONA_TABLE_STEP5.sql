-- ============================================================================
-- MANUAL SQL: Step 5 — Create Persona table + backfill from User & Professional
-- Forward: creates Persona table, backfills rows, adds personaId to User/Professional
-- Reverse: MANUAL_SQL_REVERSE_PERSONA_TABLE_STEP5.sql
-- Depends on: Steps 1-4 (Identity table populated, identityId columns linked)
-- Safe to run: additive — no FK changes to downstream tables yet
-- ============================================================================

-- 1. Create Persona table
CREATE TABLE IF NOT EXISTS "Persona" (
    "id"              TEXT NOT NULL,
    "identityId"      TEXT NOT NULL,
    "type"            TEXT NOT NULL DEFAULT 'CLIENT',
    "userId"          TEXT,
    "professionalId"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- 2. Add nullable personaId to User and Professional (no FK yet)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "personaId" TEXT;

-- 3. Backfill Persona rows from User (type = CLIENT)
INSERT INTO "Persona" ("id", "identityId", "type", "userId", "createdAt", "updatedAt")
SELECT
    'pers_user_' || u."id",
    u."identityId",
    'CLIENT',
    u."id",
    u."createdAt",
    u."updatedAt"
FROM "User" u
WHERE u."identityId" IS NOT NULL
  AND u."personaId" IS NULL;

-- 4. Link User → Persona
UPDATE "User" u
SET "personaId" = 'pers_user_' || u."id"
WHERE u."identityId" IS NOT NULL
  AND u."personaId" IS NULL;

-- 5. Backfill Persona rows from Professional (type = PROFESSIONAL)
INSERT INTO "Persona" ("id", "identityId", "type", "professionalId", "createdAt", "updatedAt")
SELECT
    'pers_pro_' || p."id",
    p."identityId",
    'PROFESSIONAL',
    p."id",
    p."createdAt",
    p."updatedAt"
FROM "Professional" p
WHERE p."identityId" IS NOT NULL
  AND p."personaId" IS NULL;

-- 6. Link Professional → Persona
UPDATE "Professional" p
SET "personaId" = 'pers_pro_' || p."id"
WHERE p."identityId" IS NOT NULL
  AND p."personaId" IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to check)
-- ============================================================================
-- SELECT count(*) AS persona_count FROM "Persona";
-- SELECT "type", count(*) FROM "Persona" GROUP BY "type";
-- SELECT count(*) AS user_linked FROM "User" WHERE "personaId" IS NOT NULL;
-- SELECT count(*) AS pro_linked FROM "Professional" WHERE "personaId" IS NOT NULL;
-- SELECT pe.id, pe.type, u.email FROM "Persona" pe JOIN "Identity" i ON pe."identityId" = i."id" LEFT JOIN "User" u ON pe."userId" = u."id" LIMIT 5;
