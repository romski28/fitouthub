ALTER TABLE "Project"
ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastClientActivityAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastProfessionalActivityAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastAdminActivityAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastSystemActivityAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Project_lastActivityAt_idx" ON "Project" ("lastActivityAt" DESC);
CREATE INDEX IF NOT EXISTS "Project_lastClientActivityAt_idx" ON "Project" ("lastClientActivityAt" DESC);
CREATE INDEX IF NOT EXISTS "Project_lastProfessionalActivityAt_idx" ON "Project" ("lastProfessionalActivityAt" DESC);
CREATE INDEX IF NOT EXISTS "Project_lastAdminActivityAt_idx" ON "Project" ("lastAdminActivityAt" DESC);
CREATE INDEX IF NOT EXISTS "Project_lastSystemActivityAt_idx" ON "Project" ("lastSystemActivityAt" DESC);