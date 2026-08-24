-- ============================================================================
-- Private contractor address book.
-- A professional's off-platform contacts (contractors they may subcontract to).
-- Pros are encouraged (not forced) to invite these contacts into Mimo: an
-- invite sets inviteStatus to 'invited' and links linkedProfessionalId once
-- the contact registers on the platform.
-- Idempotent. Apply to dev then prod.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ProfessionalContact" (
  "id"                   TEXT PRIMARY KEY,
  "ownerProfessionalId"  TEXT NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
  "name"                 TEXT NOT NULL,
  "trades"               TEXT[] NOT NULL DEFAULT '{}',
  "phone"                TEXT,
  "email"                TEXT,
  "notes"                TEXT,
  "inviteStatus"         TEXT NOT NULL DEFAULT 'external',
  "inviteToken"          TEXT UNIQUE,
  "inviteSentAt"         TIMESTAMP(3),
  "linkedProfessionalId" TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProfessionalContact_ownerProfessionalId_idx"
  ON "ProfessionalContact"("ownerProfessionalId");

CREATE INDEX IF NOT EXISTS "ProfessionalContact_email_idx"
  ON "ProfessionalContact"("email");
