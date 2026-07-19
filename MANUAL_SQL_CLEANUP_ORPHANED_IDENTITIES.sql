-- Clean up orphaned Identity records — identities with no linked User or Professional
-- These were left behind by failed registrations during the schema migration

-- First, check how many orphans exist:
-- SELECT COUNT(*) FROM "Identity" i
--   LEFT JOIN "User" u ON u."identityId" = i.id
--   LEFT JOIN "Professional" p ON p."identityId" = i.id
--   WHERE u.id IS NULL AND p.id IS NULL;

-- Delete orphaned Identity records (no linked User or Professional):
DELETE FROM "Identity"
WHERE id IN (
  SELECT i.id FROM "Identity" i
    LEFT JOIN "User" u ON u."identityId" = i.id
    LEFT JOIN "Professional" p ON p."identityId" = i.id
    WHERE u.id IS NULL AND p.id IS NULL
);
