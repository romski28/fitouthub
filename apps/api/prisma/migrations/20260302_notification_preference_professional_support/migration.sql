-- AlterTable: NotificationPreference - Support both User and Professional
-- Drop the old NOT NULL constraint and unique index on userId
ALTER TABLE "NotificationPreference" DROP CONSTRAINT IF EXISTS "NotificationPreference_userId_key";
ALTER TABLE "NotificationPreference" ALTER COLUMN "userId" DROP NOT NULL;

-- Add professionalId column
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "professionalId" TEXT;

-- Create unique constraints for both user and professional preferences
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_professionalId_key" ON "NotificationPreference"("professionalId") WHERE "professionalId" IS NOT NULL;

-- Add the foreign key for professionalId
ALTER TABLE "NotificationPreference" DROP CONSTRAINT IF EXISTS "NotificationPreference_professionalId_fkey";
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_professionalId_fkey" 
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index on professionalId
CREATE INDEX IF NOT EXISTS "NotificationPreference_professionalId_idx" ON "NotificationPreference"("professionalId");
