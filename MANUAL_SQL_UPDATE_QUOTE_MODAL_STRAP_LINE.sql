-- Update SUBMIT_QUOTE modal body to "basic quote" phrasing
UPDATE "NextStepConfig" SET
  "modalBody" = 'Provide a basic quote for this project. Include your pricing breakdown, key dates and duration, adding assumptions or site visit requirements.'
WHERE "actionKey" = 'SUBMIT_QUOTE' AND "role" = 'PROFESSIONAL'
  AND "modalBody" LIKE 'Provide a detailed quote%';
