-- Create table for professional reports
CREATE TABLE IF NOT EXISTS "ProfessionalReport" (
  "id" TEXT PRIMARY KEY,
  "professionalId" TEXT NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
  "reporterUserId" TEXT NULL,
  "comments" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS "ProfessionalReport_professionalId_idx" ON "ProfessionalReport" ("professionalId");
CREATE INDEX IF NOT EXISTS "ProfessionalReport_status_idx" ON "ProfessionalReport" ("status");

-- Optional: if you prefer DB to generate ids, uncomment next line to use UUIDs
-- ALTER TABLE "ProfessionalReport" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
