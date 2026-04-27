-- Manual DB patch: normalize wallet-transfer next-step modal metadata
-- Safe to run multiple times.
--
-- Why this exists:
-- - Wallet transfer flows are being unified in web modal handling.
-- - Production NextStepConfig rows should carry explicit modal action metadata.
--
-- Note:
-- - This updates table-driven config only.
-- - Any runtime hard-coded next-step overrides in API code must still provide modalContent in code.

BEGIN;

-- 1) Ensure CLIENT AUTHORIZE_MATERIALS_WALLET rows have wallet-transfer modal metadata
UPDATE "NextStepConfig"
SET
  "actionLabel" = COALESCE(NULLIF("actionLabel", ''), 'Transfer materials funds to professional wallet'),
  "description" = COALESCE(
    NULLIF("description", ''),
    'Escrow is funded. Transfer milestone materials funds to the professional holding wallet. Funds are not withdrawable until purchase evidence is reviewed.'
  ),
  "modalTitle" = COALESCE(NULLIF("modalTitle", ''), 'Transfer materials funds'),
  "modalBody" = COALESCE(
    NULLIF("modalBody", ''),
    'Move {amount} from client escrow to the professional materials holding wallet for milestone purchases.'
  ),
  "modalDetailsBody" = COALESCE(
    NULLIF("modalDetailsBody", ''),
    'This transfer allocates funds for project materials. The professional cannot withdraw these funds until purchase evidence is approved.'
  ),
  "modalSuccessTitle" = COALESCE(NULLIF("modalSuccessTitle", ''), 'Funds have been transferred!'),
  "modalSuccessBody" = COALESCE(NULLIF("modalSuccessBody", ''), '{amount} has been moved to the professional holding wallet.'),
  "modalPrimaryButtonLabel" = COALESCE(NULLIF("modalPrimaryButtonLabel", ''), 'Transfer now'),
  "modalSecondaryButtonLabel" = COALESCE(NULLIF("modalSecondaryButtonLabel", ''), 'Cancel'),
  "modalPrimaryActionType" = 'confirm_transfer',
  "modalPrimaryActionTarget" = '{"kind":"authorize_milestone_cap","sourceWallet":"client_escrow","destinationWallet":"professional_materials_holding","amountMode":"milestone_amount","milestoneSequence":1}',
  "modalSecondaryActionType" = 'close_modal',
  "updatedAt" = NOW()
WHERE "role" = 'CLIENT'
  AND "actionKey" = 'AUTHORIZE_MATERIALS_WALLET';

-- 2) Backfill a canonical CONTRACT_PHASE row if missing (kept idempotent)
INSERT INTO "NextStepConfig"
  (
    "id", "projectStage", "role", "actionKey", "actionLabel", "description",
    "modalTitle", "modalBody", "modalDetailsBody", "modalSuccessTitle", "modalSuccessBody",
    "modalPrimaryButtonLabel", "modalSecondaryButtonLabel",
    "modalPrimaryActionType", "modalSecondaryActionType",
    "isPrimary", "isElective", "requiresAction", "displayOrder", "createdAt", "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'CONTRACT_PHASE',
    'CLIENT',
    'AUTHORIZE_MATERIALS_WALLET',
    'Transfer materials funds to professional wallet',
    'Escrow is funded. Transfer milestone materials funds to the professional holding wallet. Funds are not withdrawable until purchase evidence is reviewed.',
    'Transfer materials funds',
    'Move {amount} from client escrow to the professional materials holding wallet for milestone purchases.',
    'This transfer allocates funds for project materials. The professional cannot withdraw these funds until purchase evidence is approved.',
    'Funds have been transferred!',
    '{amount} has been moved to the professional holding wallet.',
    'Transfer now',
    'Cancel',
    'confirm_transfer',
    'close_modal',
    true,
    false,
    true,
    1,
    NOW(),
    NOW()
  )
ON CONFLICT ("projectStage", "role", "actionKey") DO UPDATE
SET
  "actionLabel" = EXCLUDED."actionLabel",
  "description" = EXCLUDED."description",
  "modalTitle" = EXCLUDED."modalTitle",
  "modalBody" = EXCLUDED."modalBody",
  "modalDetailsBody" = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle" = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody" = EXCLUDED."modalSuccessBody",
  "modalPrimaryButtonLabel" = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel" = EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType" = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "isPrimary" = EXCLUDED."isPrimary",
  "isElective" = EXCLUDED."isElective",
  "requiresAction" = EXCLUDED."requiresAction",
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = NOW();

-- 3) Upsert REVIEW_MATERIALS_PURCHASE row for client review path (fires during CONTRACT_PHASE)
-- This is a runtime-generated step (no DB source) — the row provides modal content fallback.
INSERT INTO "NextStepConfig"
  (
    "id", "projectStage", "role", "actionKey", "actionLabel", "description",
    "modalTitle", "modalBody", "modalDetailsBody", "modalSuccessTitle", "modalSuccessBody",
    "modalSuccessNextStepBody",
    "modalPrimaryButtonLabel", "modalSecondaryButtonLabel",
    "modalPrimaryActionType", "modalSecondaryActionType", "detailsTarget",
    "isPrimary", "isElective", "requiresAction", "displayOrder", "createdAt", "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'CONTRACT_PHASE',
    'CLIENT',
    'REVIEW_MATERIALS_PURCHASE',
    'Review materials purchase receipts',
    'The professional has submitted purchase receipts. Review and approve to release the confirmed amount to their withdrawable wallet.',
    'Review materials purchase receipts',
    'The professional has submitted purchase evidence. Review and approve the confirmed amount — any unspent balance will be returned to your escrow.',
    'Carefully review each receipt. Only approve amounts that match actual project materials. Unspent funds will be automatically returned to your escrow wallet.',
    'Purchase receipts approved!',
    'The confirmed amount has been released to the professional''s withdrawable wallet.',
    'What''s next? The professional can now withdraw the approved amount. Any unspent balance has been returned to your escrow.',
    'Review now',
    'Later',
    'navigate_tab',
    'close_modal',
    '{"tab":"financials"}',
    true,
    false,
    true,
    1,
    NOW(),
    NOW()
  )
ON CONFLICT ("projectStage", "role", "actionKey") DO UPDATE
SET
  "actionLabel" = EXCLUDED."actionLabel",
  "description" = EXCLUDED."description",
  "modalTitle" = EXCLUDED."modalTitle",
  "modalBody" = EXCLUDED."modalBody",
  "modalDetailsBody" = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle" = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody" = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalPrimaryButtonLabel" = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel" = EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType" = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget" = EXCLUDED."detailsTarget",
  "isPrimary" = EXCLUDED."isPrimary",
  "isElective" = EXCLUDED."isElective",
  "requiresAction" = EXCLUDED."requiresAction",
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = NOW();

COMMIT;

-- Verification
-- SELECT "projectStage", "role", "actionKey", "actionLabel",
--        "modalPrimaryButtonLabel", "modalPrimaryActionType", "modalPrimaryActionTarget", "detailsTarget"
-- FROM "NextStepConfig"
-- WHERE "role" = 'CLIENT'
--   AND "actionKey" IN ('AUTHORIZE_MATERIALS_WALLET', 'REVIEW_MATERIALS_PURCHASE')
-- ORDER BY "projectStage", "actionKey";
