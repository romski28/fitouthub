-- Add requiresAction flag to NextStepConfig
-- Distinguishes between passive monitoring steps vs actionable tasks

ALTER TABLE "NextStepConfig" ADD COLUMN "requiresAction" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "NextStepConfig"."requiresAction" IS 'Whether this action requires user input/decision (false for passive monitoring like "Wait for quotes")';

-- Update existing passive actions to requiresAction = false
UPDATE "NextStepConfig" SET "requiresAction" = false 
WHERE "actionKey" IN (
  'WAIT_FOR_QUOTES',
  'WAIT_FOR_UPDATED_QUOTES',
  'WAIT_FOR_DECISION',
  'AWAIT_MILESTONE_APPROVAL',
  'ENTER_WARRANTY_PERIOD',
  'VIEW_DEFECT',
  'VIEW_ARCHIVE'
);
