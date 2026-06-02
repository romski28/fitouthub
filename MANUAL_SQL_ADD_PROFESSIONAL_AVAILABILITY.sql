-- Professional Availability windows
-- Phase A: additive migration, no reseed required.

BEGIN;

CREATE TABLE IF NOT EXISTS "ProfessionalAvailability" (
  id TEXT PRIMARY KEY,
  "professionalId" TEXT NOT NULL REFERENCES "Professional"(id) ON DELETE CASCADE,
  "dayOfWeek" INTEGER,           -- 0=Sun..6=Sat, NULL means date-specific
  "date" DATE,                   -- NULL means recurring by dayOfWeek
  "startTime" TEXT,              -- "HH:mm" HKT, NULL means all day
  "endTime" TEXT,                -- "HH:mm" HKT, NULL means all day
  "maxProjects" INTEGER NOT NULL DEFAULT 1,
  "availableForEmergency" BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professional_availability_professional
  ON "ProfessionalAvailability" ("professionalId");
CREATE INDEX IF NOT EXISTS idx_professional_availability_day
  ON "ProfessionalAvailability" ("professionalId", "dayOfWeek");
CREATE INDEX IF NOT EXISTS idx_professional_availability_date
  ON "ProfessionalAvailability" ("professionalId", "date");

COMMIT;
