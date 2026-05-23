-- Adds invite/quote trade scope snapshots to ProjectProfessional.
-- quoteRequestedTrades = what this professional is being asked to quote for.
-- projectTradesSnapshot = full required trade list at the time of selection/invitation.

ALTER TABLE "ProjectProfessional"
  ADD COLUMN IF NOT EXISTS "quoteRequestedTrades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "projectTradesSnapshot" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill existing rows conservatively: if we do not already know the per-professional
-- requested subset, default it to the project's full required trade list.
UPDATE "ProjectProfessional" pp
SET
  "projectTradesSnapshot" = COALESCE(p."tradesRequired", ARRAY[]::TEXT[]),
  "quoteRequestedTrades" = CASE
    WHEN COALESCE(array_length(pp."quoteRequestedTrades", 1), 0) > 0 THEN pp."quoteRequestedTrades"
    ELSE COALESCE(p."tradesRequired", ARRAY[]::TEXT[])
  END
FROM "Project" p
WHERE p.id = pp."projectId"
  AND (
    COALESCE(array_length(pp."projectTradesSnapshot", 1), 0) = 0
    OR COALESCE(array_length(pp."quoteRequestedTrades", 1), 0) = 0
  );
