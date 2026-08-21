-- ============================================================================
-- Worker persona + address-link primary flag.
-- Worker = employee of a company/reseller/contractor Professional (no own address).
-- Idempotent. Apply after MANUAL_SQL_ADD_PROPERTY_ADDRESS.sql.
-- Rollback: DROP TABLE "Worker"; ALTER TABLE "Persona" DROP COLUMN "workerId";
--           ALTER TABLE "PropertyAccountLink" DROP COLUMN "isPrimary";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Worker" (
  "id"                     TEXT NOT NULL,
  "userId"                 TEXT NOT NULL,
  "employerProfessionalId" TEXT NOT NULL,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Worker_userId_key" ON "Worker"("userId");
CREATE INDEX IF NOT EXISTS "Worker_employerProfessionalId_idx" ON "Worker"("employerProfessionalId");

ALTER TABLE "Worker"
  DROP CONSTRAINT IF EXISTS "Worker_userId_fkey";
ALTER TABLE "Worker"
  ADD CONSTRAINT "Worker_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Worker"
  DROP CONSTRAINT IF EXISTS "Worker_employerProfessionalId_fkey";
ALTER TABLE "Worker"
  ADD CONSTRAINT "Worker_employerProfessionalId_fkey"
  FOREIGN KEY ("employerProfessionalId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Persona -> Worker (unique, like the other persona profile links)
ALTER TABLE "Persona"
  ADD COLUMN IF NOT EXISTS "workerId" TEXT;

ALTER TABLE "Persona"
  DROP CONSTRAINT IF EXISTS "Persona_workerId_fkey";
ALTER TABLE "Persona"
  ADD CONSTRAINT "Persona_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "Persona_workerId_key" ON "Persona"("workerId");

-- Primary flag for multi-address personas (landlord / estate agent / property manager)
ALTER TABLE "PropertyAccountLink"
  ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "PropertyAccountLink_personaId_isPrimary_idx"
  ON "PropertyAccountLink"("personaId", "isPrimary");
