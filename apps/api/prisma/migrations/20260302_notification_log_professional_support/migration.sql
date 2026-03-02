-- Allow NotificationLog entries for both User and Professional recipients

-- 1) Remove old FK so we can change nullability/behavior
ALTER TABLE "NotificationLog"
  DROP CONSTRAINT IF EXISTS "NotificationLog_userId_fkey";

-- 2) userId becomes optional (professional notifications may not have a User row)
ALTER TABLE "NotificationLog"
  ALTER COLUMN "userId" DROP NOT NULL;

-- 3) Add optional professional reference
ALTER TABLE "NotificationLog"
  ADD COLUMN IF NOT EXISTS "professionalId" TEXT;

-- 4) Add/restore FKs with SetNull behavior
ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "NotificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationLog"
  DROP CONSTRAINT IF EXISTS "NotificationLog_professionalId_fkey";

ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "NotificationLog_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Index for professional lookups
CREATE INDEX IF NOT EXISTS "NotificationLog_professionalId_idx"
  ON "NotificationLog"("professionalId");
