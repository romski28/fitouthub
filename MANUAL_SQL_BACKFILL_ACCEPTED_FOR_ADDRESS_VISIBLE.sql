-- Backfill: for professionals who already have address access,
-- promote status from 'pending' to 'accepted' (matching new auto-accept logic)
UPDATE "ProjectProfessional"
SET status = 'accepted',
    "respondedAt" = COALESCE("respondedAt", "addressVisibleAt", NOW())
WHERE "addressVisible" = true
  AND status = 'pending';
