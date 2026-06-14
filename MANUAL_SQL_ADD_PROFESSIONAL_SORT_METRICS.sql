-- ============================================================
-- Professional Sort Metrics — new columns + backfill
-- ============================================================

-- 1. Add new columns
ALTER TABLE "Professional"
ADD COLUMN IF NOT EXISTS "completedProjectsCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Professional"
ADD COLUMN IF NOT EXISTS "avgResponseHours" DOUBLE PRECISION;

ALTER TABLE "Professional"
ADD COLUMN IF NOT EXISTS "awardRate" DOUBLE PRECISION;

-- 2. Backfill completed projects count
-- A project counts as "completed" when the professional was awarded AND the project stage is COMPLETE
WITH completed_counts AS (
  SELECT
    pp."professionalId",
    COUNT(DISTINCT pp."projectId")::INTEGER AS cnt
  FROM "ProjectProfessional" pp
  INNER JOIN "Project" p ON p.id = pp."projectId"
  WHERE pp.status = 'awarded'
    AND p."currentStage" = 'COMPLETE'
  GROUP BY pp."professionalId"
)
UPDATE "Professional" pro
SET "completedProjectsCount" = cc.cnt
FROM completed_counts cc
WHERE pro.id = cc."professionalId"
  AND pro."completedProjectsCount" = 0;

-- 3. Backfill average response time (hours)
-- Response time = time between being invited (createdAt) and submitting a quote (quotedAt)
WITH response_times AS (
  SELECT
    "professionalId",
    AVG(EXTRACT(EPOCH FROM ("quotedAt" - "createdAt")) / 3600.0) AS avg_hrs
  FROM "ProjectProfessional"
  WHERE "quotedAt" IS NOT NULL
    AND "createdAt" IS NOT NULL
  GROUP BY "professionalId"
)
UPDATE "Professional" pro
SET "avgResponseHours" = rt.avg_hrs
FROM response_times rt
WHERE pro.id = rt."professionalId"
  AND pro."avgResponseHours" IS NULL;

-- 4. Backfill award rate (%)
-- Only compute for professionals with ≥3 quotes to avoid misleading 100% rates
WITH award_rates AS (
  SELECT
    "professionalId",
    ROUND(
      (COUNT(*) FILTER (WHERE status = 'awarded')::DECIMAL / COUNT(*)::DECIMAL) * 100.0,
      1
    ) AS rate
  FROM "ProjectProfessional"
  GROUP BY "professionalId"
  HAVING COUNT(*) >= 3
)
UPDATE "Professional" pro
SET "awardRate" = ar.rate
FROM award_rates ar
WHERE pro.id = ar."professionalId"
  AND pro."awardRate" IS NULL;
