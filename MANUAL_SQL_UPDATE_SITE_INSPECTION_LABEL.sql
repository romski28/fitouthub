-- Relabel REQUEST_SITE_ACCESS action to "Site inspection"
-- Run against production DB after deploying code changes.

UPDATE "NextStepConfig"
SET "actionLabel" = 'Site inspection',
    "description" = 'Ask to visit site before finalizing quote.',
    "updatedAt" = NOW()
WHERE "actionKey" = 'REQUEST_SITE_ACCESS'
  AND "role" = 'PROFESSIONAL';
