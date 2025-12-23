-- AddPasswordHashToProfessional

-- AlterTable - Only add if not exists (idempotent)
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
