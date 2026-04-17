-- Update NextStepConfig label from "Review contract" to "Review agreement"
UPDATE "NextStepConfig" 
SET "actionLabel" = 'Review agreement'
WHERE "actionKey" = 'REVIEW_CONTRACT' 
  AND "role" = 'CLIENT' 
  AND "projectStage" = 'CONTRACT_PHASE';
