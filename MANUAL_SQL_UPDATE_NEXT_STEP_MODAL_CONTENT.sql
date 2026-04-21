-- Manual schema/data update for DB-backed next-step modal content.
-- Run this directly against Postgres (no Supabase dependency).

BEGIN;

ALTER TABLE "NextStepConfig"
  ADD COLUMN IF NOT EXISTS "modalTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "modalBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalDetailsBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSuccessTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSuccessBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSuccessNextStepBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "modalPrimaryButtonLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSecondaryButtonLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "modalPrimaryActionType" TEXT,
  ADD COLUMN IF NOT EXISTS "modalPrimaryActionTarget" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSecondaryActionType" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSecondaryActionTarget" TEXT;

-- Content-only row for the new materials-wallet modal.
-- isPrimary/isElective are false so it behaves as content storage only.
INSERT INTO "NextStepConfig" (
  "id",
  "projectStage",
  "role",
  "actionKey",
  "actionLabel",
  "description",
  "modalTitle",
  "modalBody",
  "modalDetailsBody",
  "modalSuccessTitle",
  "modalSuccessBody",
  "modalSuccessNextStepBody",
  "modalImageUrl",
  "modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel",
  "modalPrimaryActionType",
  "modalPrimaryActionTarget",
  "modalSecondaryActionType",
  "modalSecondaryActionTarget",
  "isPrimary",
  "isElective",
  "requiresAction",
  "displayOrder",
  "createdAt",
  "updatedAt"
)
VALUES (
  'manual-authorize-materials-wallet-content',
  'CONTRACT_PHASE',
  'CLIENT',
  'AUTHORIZE_MATERIALS_WALLET',
  'Transfer materials funds to professional wallet',
  'Escrow is funded. Transfer milestone 1 materials funds to the professional holding wallet.',
  'Transfer materials funds',
  'OK {clientName}, you need to move {amount} from your wallet to {professionalName}''s holding wallet.',
  'This amount is moved from {clientName}''s wallet to {professionalName}''s materials holding wallet. It is not withdrawable until you review and approve submitted purchase invoices.',
  'Funds have been transferred!',
  '{amount} has been moved to {professionalName}''s holding wallet.',
  'What''s next? We are working on it!',
  '/assets/images/chatbot-avatar-icon.webp',
  'OK',
  'Cancel',
  'confirm_transfer',
  NULL,
  'close_modal',
  NULL,
  false,
  false,
  false,
  999,
  NOW(),
  NOW()
)
ON CONFLICT ("projectStage", "role", "actionKey")
DO UPDATE SET
  "modalTitle" = EXCLUDED."modalTitle",
  "modalBody" = EXCLUDED."modalBody",
  "modalDetailsBody" = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle" = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody" = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalImageUrl" = EXCLUDED."modalImageUrl",
  "modalPrimaryButtonLabel" = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel" = EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType" = EXCLUDED."modalPrimaryActionType",
  "modalPrimaryActionTarget" = EXCLUDED."modalPrimaryActionTarget",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "modalSecondaryActionTarget" = EXCLUDED."modalSecondaryActionTarget",
  "updatedAt" = NOW();

COMMIT;
