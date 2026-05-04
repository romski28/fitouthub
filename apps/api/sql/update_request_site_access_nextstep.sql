-- Update the REQUEST_SITE_ACCESS NextStepConfig row with improved description and modal content.
-- Run this once against the production database after deploying the code changes.

UPDATE "NextStepConfig"
SET
  "description"              = 'The client has made the site available for inspection. Book a visit before the decision is made to sharpen your quote and stand out from other bidders.',
  "modalTitle"               = 'Book a site visit',
  "modalBody"                = 'The client has shared an available inspection date. Visiting the site before the client selects a professional gives you a much clearer picture of the scope — and shows the client you are thorough and serious.\n\nHead to the **Access & Schedule** tab to confirm your preferred time.',
  "modalPrimaryButtonLabel"    = 'Book site visit',
  "modalPrimaryActionType"     = 'custom_submit',
  "modalPrimaryActionTarget"   = 'site-access',
  "modalSecondaryButtonLabel"  = 'Open project information',
  "modalSecondaryActionType"   = 'navigate_tab',
  "modalSecondaryActionTarget" = 'site-access',
  "requiresAction"             = TRUE,
  "updatedAt"                  = NOW()
WHERE "actionKey" = 'REQUEST_SITE_ACCESS'
  AND "role"      = 'PROFESSIONAL';
