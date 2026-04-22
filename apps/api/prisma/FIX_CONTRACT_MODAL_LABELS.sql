-- Normalize client contract modal labels/content to current UX.
-- Safe to run multiple times.

UPDATE "NextStepConfig"
SET
  "modalTitle" = 'Review the agreement',
  "modalBody" = 'Carefully review all agreement terms including scope, timeline, payment schedule, change order procedures, and warranty.',
  "modalDetailsBody" = 'Make sure the agreement accurately reflects everything you discussed. Fitout Hub admin coordinates formal amendment requests when needed.',
  "modalSuccessTitle" = 'Agreement reviewed',
  "modalSuccessBody" = 'You''ve reviewed the agreement terms.',
  "modalSuccessNextStepBody" = 'When satisfied with the terms, sign the agreement to proceed.',
  "modalPrimaryButtonLabel" = 'Review agreement',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal',
  "updatedAt" = NOW()
WHERE "projectStage" = 'CONTRACT_PHASE'
  AND "role" = 'CLIENT'
  AND "actionKey" = 'REVIEW_CONTRACT';

UPDATE "NextStepConfig"
SET
  "actionLabel" = 'Review agreement',
  "modalTitle" = 'Review the agreement',
  "modalBody" = 'Review your drafted agreement terms, milestones, and payment schedule before sending to the client for signature.',
  "modalDetailsBody" = 'Ensure the agreement is complete and accurate. Once sent, the client reviews and signs before you complete your signature.',
  "modalPrimaryButtonLabel" = 'Review agreement',
  "updatedAt" = NOW()
WHERE "projectStage" = 'CONTRACT_PHASE'
  AND "role" = 'PROFESSIONAL'
  AND "actionKey" = 'SUBMIT_CONTRACT';

-- Verification
-- SELECT "projectStage", "role", "actionKey", "modalPrimaryButtonLabel", "modalSecondaryButtonLabel"
-- FROM "NextStepConfig"
-- WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'CLIENT' AND "actionKey" = 'REVIEW_CONTRACT';
