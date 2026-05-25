-- Create table to persist per-image AI vision insights for intake conversations.
-- Run this manually in production/staging before deploying code that writes these records.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_intake_image_insights (
  id text PRIMARY KEY DEFAULT ('aiimg_' || replace(gen_random_uuid()::text, '-', '')),
  "intakeId" text NOT NULL,
  "imageUrl" text NOT NULL,
  provider text NULL,
  model text NULL,
  status text NULL,
  "requestId" text NULL,
  "durationMs" integer NULL,
  summary text NULL,
  "conditionFindings" jsonb NULL,
  "safetyFlags" jsonb NULL,
  "followUpQuestions" jsonb NULL,
  confidence double precision NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_intake_image_insights_intake_fkey
    FOREIGN KEY ("intakeId") REFERENCES ai_intakes(id) ON DELETE CASCADE,
  CONSTRAINT ai_intake_image_insights_unique_intake_image
    UNIQUE ("intakeId", "imageUrl")
);

CREATE INDEX IF NOT EXISTS ai_intake_image_insights_intake_idx
  ON ai_intake_image_insights ("intakeId");

CREATE INDEX IF NOT EXISTS ai_intake_image_insights_created_idx
  ON ai_intake_image_insights ("createdAt");

COMMIT;

-- Optional quick verification query:
-- SELECT "intakeId", "imageUrl", provider, status, confidence, "createdAt"
-- FROM ai_intake_image_insights
-- ORDER BY "createdAt" DESC
-- LIMIT 20;
