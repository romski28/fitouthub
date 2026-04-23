-- Align PRE_WORK step naming with updated workflow semantics.
-- Safe to run multiple times.

-- 1) Rename professional start-date step to "Agree start date"
UPDATE "NextStepConfig"
SET
  "actionLabel" = 'Agree start date',
  "description" = 'Propose and agree the kickoff start date with the client before final schedule sign-off.',
  "modalTitle" = COALESCE("modalTitle", 'Agree start date'),
  "modalBody" = COALESCE("modalBody", 'Propose or confirm the kickoff start date and time with the client.'),
  "modalDetailsBody" = COALESCE("modalDetailsBody", 'Duration is fixed. Align on a realistic start date and time first.'),
  "modalSuccessTitle" = COALESCE("modalSuccessTitle", 'Start date proposal sent'),
  "modalSuccessBody" = COALESCE("modalSuccessBody", 'Your proposed start date has been sent to the client for confirmation.'),
  "modalSuccessNextStepBody" = COALESCE("modalSuccessNextStepBody", 'Once the client agrees the start date, finalize the milestone schedule.'),
  "modalPrimaryButtonLabel" = COALESCE("modalPrimaryButtonLabel", 'Agree start date'),
  "updatedAt" = NOW()
WHERE "projectStage" = 'PRE_WORK'
  AND "role" = 'PROFESSIONAL'
  AND "actionKey" = 'CONFIRM_START_DATE';

-- 2) Ensure professional schedule agreement step exists in PRE_WORK
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'PRE_WORK', 'PROFESSIONAL',
   'CONFIRM_SCHEDULE', 'Agree milestone schedule',
   'Start date is agreed. Finalize and agree the detailed milestone schedule.',
   true, false, true, 2, NOW(), NOW())
ON CONFLICT ("projectStage","role","actionKey") DO UPDATE
SET
  "actionLabel" = EXCLUDED."actionLabel",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();

-- 3) Seed optional parallel professional step: start work on site
-- This is intended as an elective option when backend prerequisites are met.
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'PRE_WORK', 'PROFESSIONAL',
   'START_PROJECT', 'Start work on site',
   'Escrow prerequisites are ready. You may begin work on site while finalizing the detailed schedule.',
   false, true, true, 3, NOW(), NOW())
ON CONFLICT ("projectStage","role","actionKey") DO UPDATE
SET
  "actionLabel" = EXCLUDED."actionLabel",
  "description" = EXCLUDED."description",
  "isPrimary" = false,
  "isElective" = true,
  "requiresAction" = EXCLUDED."requiresAction",
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = NOW();

-- 4) Keep client wording explicit for schedule agreement (if present)
UPDATE "NextStepConfig"
SET
  "actionLabel" = 'Agree milestone schedule',
  "description" = 'Start date is agreed. Review and confirm the milestone schedule before funding escrow.',
  "updatedAt" = NOW()
WHERE "projectStage" = 'PRE_WORK'
  AND "role" = 'CLIENT'
  AND "actionKey" = 'CONFIRM_SCHEDULE';

-- Verification
-- SELECT "projectStage", "role", "actionKey", "actionLabel", "isPrimary", "isElective", "requiresAction", "displayOrder"
-- FROM "NextStepConfig"
-- WHERE "projectStage" = 'PRE_WORK'
--   AND "actionKey" IN ('CONFIRM_START_DATE', 'CONFIRM_SCHEDULE', 'START_PROJECT')
-- ORDER BY "role", "displayOrder", "actionKey";
