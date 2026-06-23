-- Backfill: client-approved site visits should be 'accepted' not 'proposed'
UPDATE "SiteAccessVisit"
SET status = 'accepted'
WHERE "proposedByRole" = 'client'
  AND status = 'proposed';
