DO $$ BEGIN
  CREATE TYPE "CertificationHolderType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CertificationRequirementLevel" AS ENUM ('MANDATORY', 'OPTIONAL', 'RECOMMENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CertificationVerificationStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CertificationType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "regulator" TEXT,
  "appliesTo" "CertificationHolderType",
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificationType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TradeCertificationRequirement" (
  "id" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "certificationTypeId" TEXT NOT NULL,
  "requirementLevel" "CertificationRequirementLevel" NOT NULL DEFAULT 'MANDATORY',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeCertificationRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProfessionalCertification" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "certificationTypeId" TEXT NOT NULL,
  "tradeId" TEXT,
  "holderType" "CertificationHolderType" NOT NULL DEFAULT 'INDIVIDUAL',
  "registrationNumber" TEXT,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "documentStorageKey" TEXT,
  "verificationStatus" "CertificationVerificationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "verifiedAt" TIMESTAMP(3),
  "verifiedByAdminId" TEXT,
  "verificationNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalCertification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CertificationType_code_key" ON "CertificationType"("code");
CREATE INDEX IF NOT EXISTS "CertificationType_isActive_idx" ON "CertificationType"("isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "TradeCertificationRequirement_tradeId_certificationTypeId_key" ON "TradeCertificationRequirement"("tradeId", "certificationTypeId");
CREATE INDEX IF NOT EXISTS "TradeCertificationRequirement_tradeId_idx" ON "TradeCertificationRequirement"("tradeId");
CREATE INDEX IF NOT EXISTS "TradeCertificationRequirement_certificationTypeId_idx" ON "TradeCertificationRequirement"("certificationTypeId");
CREATE INDEX IF NOT EXISTS "ProfessionalCertification_professionalId_idx" ON "ProfessionalCertification"("professionalId");
CREATE INDEX IF NOT EXISTS "ProfessionalCertification_certificationTypeId_idx" ON "ProfessionalCertification"("certificationTypeId");
CREATE INDEX IF NOT EXISTS "ProfessionalCertification_tradeId_idx" ON "ProfessionalCertification"("tradeId");
CREATE INDEX IF NOT EXISTS "ProfessionalCertification_verificationStatus_idx" ON "ProfessionalCertification"("verificationStatus");

DO $$ BEGIN
  ALTER TABLE "TradeCertificationRequirement"
    ADD CONSTRAINT "TradeCertificationRequirement_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Tradesman"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TradeCertificationRequirement"
    ADD CONSTRAINT "TradeCertificationRequirement_certificationTypeId_fkey"
    FOREIGN KEY ("certificationTypeId") REFERENCES "CertificationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProfessionalCertification"
    ADD CONSTRAINT "ProfessionalCertification_professionalId_fkey"
    FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProfessionalCertification"
    ADD CONSTRAINT "ProfessionalCertification_certificationTypeId_fkey"
    FOREIGN KEY ("certificationTypeId") REFERENCES "CertificationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProfessionalCertification"
    ADD CONSTRAINT "ProfessionalCertification_tradeId_fkey"
    FOREIGN KEY ("tradeId") REFERENCES "Tradesman"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "CertificationType" ("id", "code", "name", "regulator", "appliesTo", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('certtype_rew', 'REGISTERED_ELECTRICAL_WORKER', 'Registered Electrical Worker (REW)', 'EMSD', 'INDIVIDUAL', 'Required for regulated electrical work in Hong Kong.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_lp', 'LICENSED_PLUMBER', 'Licensed Plumber (LP)', 'WSD', 'INDIVIDUAL', 'Required for licensed plumbing work in Hong Kong.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_rgi', 'REGISTERED_GAS_INSTALLER', 'Registered Gas Installer', 'EMSD', 'INDIVIDUAL', 'Required for regulated gas installation work in Hong Kong.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_rgc', 'REGISTERED_GAS_CONTRACTOR', 'Registered Gas Contractor', 'EMSD', 'BUSINESS', 'Company registration for regulated gas contracting work.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_brc', 'BUSINESS_REGISTRATION_CERTIFICATE', 'Business Registration Certificate (BRC)', 'IRD', 'BUSINESS', 'Required for companies registered in Hong Kong.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_cwr', 'CONSTRUCTION_WORKERS_REGISTRATION', 'Construction Workers Registration', 'CIC', 'INDIVIDUAL', 'Construction Industry Council worker registration.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_cic_trade_test', 'CIC_TRADE_TEST_CERTIFICATE', 'CIC Trade Test Certificate', 'CIC', 'INDIVIDUAL', 'Trade test certification for skilled construction trades.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('certtype_cic_grade_a', 'CIC_GRADE_A_ELECTRICAL_WORK_TEST', 'CIC Grade A Electrical Work Test', 'CIC', 'INDIVIDUAL', 'Electrical work competency certification recognised by CIC.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "regulator" = EXCLUDED."regulator",
  "appliesTo" = EXCLUDED."appliesTo",
  "description" = EXCLUDED."description",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TradeCertificationRequirement" ("id", "tradeId", "certificationTypeId", "requirementLevel", "notes", "createdAt", "updatedAt")
SELECT 'req_electrician_rew', t."id", 'certtype_rew', 'MANDATORY', 'Required before electrical works can be advertised or booked.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tradesman" t
WHERE lower(t."title") = lower('Electrician')
ON CONFLICT ("tradeId", "certificationTypeId") DO NOTHING;

INSERT INTO "TradeCertificationRequirement" ("id", "tradeId", "certificationTypeId", "requirementLevel", "notes", "createdAt", "updatedAt")
SELECT 'req_plumber_lp', t."id", 'certtype_lp', 'MANDATORY', 'Required before licensed plumbing works can be advertised or booked.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tradesman" t
WHERE lower(t."title") = lower('Plumber')
ON CONFLICT ("tradeId", "certificationTypeId") DO NOTHING;