-- Manual DB update: support separate professional/client actor identities for next-step actions
-- Run in production manually (no Prisma migration required).

BEGIN;

-- 1) Add nullable professional actor column
ALTER TABLE "NextStepAction"
  ADD COLUMN IF NOT EXISTS "professionalId" text;

-- 2) Make userId nullable (professional actions do not have a User row)
ALTER TABLE "NextStepAction"
  ALTER COLUMN "userId" DROP NOT NULL;

-- 3) Add FK for professional actor if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nextstepaction_professionalid_fkey'
  ) THEN
    ALTER TABLE "NextStepAction"
      ADD CONSTRAINT "nextstepaction_professionalid_fkey"
      FOREIGN KEY ("professionalId") REFERENCES "Professional"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 4) Add index for professional actor queries
CREATE INDEX IF NOT EXISTS "NextStepAction_professionalId_idx"
  ON "NextStepAction" ("professionalId");

-- 5) Guardrail: exactly one actor is set (user or professional), never both/none
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nextstepaction_exactly_one_actor_ck'
  ) THEN
    ALTER TABLE "NextStepAction"
      ADD CONSTRAINT "nextstepaction_exactly_one_actor_ck"
      CHECK (
        (("userId" IS NOT NULL)::int + ("professionalId" IS NOT NULL)::int) = 1
      );
  END IF;
END
$$;

COMMIT;
