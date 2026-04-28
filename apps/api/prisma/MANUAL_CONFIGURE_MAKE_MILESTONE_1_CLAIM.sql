-- Manual DB patch: fully configure MAKE_MILESTONE_1_CLAIM in NextStepConfig
-- AND extend MilestoneProcurementEvidence schema for scoped chat workflow.
-- Safe to run multiple times (idempotent).
--
-- What this does:
-- 1. Extends MilestoneProcurementEvidence with openingMessage, deadline,
--    and conversation timestamp columns (Phase 2 schema patch).
-- 2. Upserts NextStepConfig rows for MAKE_MILESTONE_1_CLAIM (PROFESSIONAL,
--    CONTRACT_PHASE and PRE_WORK) so the step is fully DB-driven and
--    editable from the admin next-steps panel.
-- 3. Adds RESPOND_TO_MATERIALS_QUESTIONS config row (shown when a pending
--    claim exists — companion to the claim step).
--
-- Run order: this file should be run after
--   MANUAL_UPDATE_NEXT_STEP_WALLET_TRANSFER_MODAL.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — Phase 2 schema: extend MilestoneProcurementEvidence
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "MilestoneProcurementEvidence"
  ADD COLUMN IF NOT EXISTS "openingMessage"            TEXT,
  ADD COLUMN IF NOT EXISTS "deadlineAt"                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "finalizedAt"               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "clientQuestionedAt"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "professionalRespondedAt"   TIMESTAMPTZ;

-- Backfill a default 7-day deadline for still-pending legacy rows.
UPDATE "MilestoneProcurementEvidence"
SET "deadlineAt" = "createdAt" + INTERVAL '7 days'
WHERE "status" = 'pending'
  AND "deadlineAt" IS NULL;

CREATE INDEX IF NOT EXISTS "MilestoneProcurementEvidence_status_deadlineAt_idx"
  ON "MilestoneProcurementEvidence" ("status", "deadlineAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — NextStepConfig: MAKE_MILESTONE_1_CLAIM (CONTRACT_PHASE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Fired by next-step.service.ts when:
--   role = PROFESSIONAL, stage = CONTRACT_PHASE,
--   scale = SCALE_1 or SCALE_2, wallet transfer not yet skipped.

INSERT INTO "NextStepConfig"
  (
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
    "modalPrimaryButtonLabel",
    "modalSecondaryButtonLabel",
    "modalPrimaryActionType",
    "modalSecondaryActionType",
    "detailsTarget",
    "isPrimary",
    "isElective",
    "requiresAction",
    "displayOrder",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'CONTRACT_PHASE',
    'PROFESSIONAL',
    'MAKE_MILESTONE_1_CLAIM',
    'Submit materials claim',
    'Submit purchase receipts and claimed amount for milestone 1 materials. The client will review and approve the confirmed amount to your withdrawable wallet.',
    'Milestone 1 payment - Materials Purchase',
    'Upload receipts or photos for each item you purchased, add the amount for each, then submit for client review. The client has 7 days to approve or query.',
    'Only include materials directly tied to this project. The client will review each item and approve the total. Any pre-authorised amount not claimed will be returned to their escrow.',
    'Materials claim submitted!',
    'Your claim has been sent to the client for review. You will be notified once they respond.',
    'What''s next? The client has 7 days to review your claim. Keep an eye on the claim thread for any questions.',
    'Submit for payment',
    'Skip until final payment',
    'open_custom_modal',
    'close_modal',
    '{"tab":"financials"}',
    true,
    false,
    true,
    2,
    NOW(),
    NOW()
  )
ON CONFLICT ("projectStage", "role", "actionKey") DO UPDATE
SET
  "actionLabel"              = EXCLUDED."actionLabel",
  "description"              = EXCLUDED."description",
  "modalTitle"               = EXCLUDED."modalTitle",
  "modalBody"                = EXCLUDED."modalBody",
  "modalDetailsBody"         = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle"        = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody"         = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalPrimaryButtonLabel"  = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel"= EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType"   = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget"            = EXCLUDED."detailsTarget",
  "isPrimary"                = EXCLUDED."isPrimary",
  "isElective"               = EXCLUDED."isElective",
  "requiresAction"           = EXCLUDED."requiresAction",
  "displayOrder"             = EXCLUDED."displayOrder",
  "updatedAt"                = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — NextStepConfig: MAKE_MILESTONE_1_CLAIM (PRE_WORK)
-- ─────────────────────────────────────────────────────────────────────────────
-- Same action key, same content — duplicated for PRE_WORK stage so the
-- modalContentByActionKey map resolves correctly regardless of which stage
-- is active when the step is surfaced.

INSERT INTO "NextStepConfig"
  (
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
    "modalPrimaryButtonLabel",
    "modalSecondaryButtonLabel",
    "modalPrimaryActionType",
    "modalSecondaryActionType",
    "detailsTarget",
    "isPrimary",
    "isElective",
    "requiresAction",
    "displayOrder",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'PRE_WORK',
    'PROFESSIONAL',
    'MAKE_MILESTONE_1_CLAIM',
    'Submit materials claim',
    'Submit purchase receipts and claimed amount for milestone 1 materials. The client will review and approve the confirmed amount to your withdrawable wallet.',
    'Milestone 1 payment - Materials Purchase',
    'Upload receipts or photos for each item you purchased, add the amount for each, then submit for client review. The client has 7 days to approve or query.',
    'Only include materials directly tied to this project. The client will review each item and approve the total. Any pre-authorised amount not claimed will be returned to their escrow.',
    'Materials claim submitted!',
    'Your claim has been sent to the client for review. You will be notified once they respond.',
    'What''s next? The client has 7 days to review your claim. Keep an eye on the claim thread for any questions.',
    'Submit for payment',
    'Skip until final payment',
    'open_custom_modal',
    'close_modal',
    '{"tab":"financials"}',
    true,
    false,
    true,
    2,
    NOW(),
    NOW()
  )
ON CONFLICT ("projectStage", "role", "actionKey") DO UPDATE
SET
  "actionLabel"              = EXCLUDED."actionLabel",
  "description"              = EXCLUDED."description",
  "modalTitle"               = EXCLUDED."modalTitle",
  "modalBody"                = EXCLUDED."modalBody",
  "modalDetailsBody"         = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle"        = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody"         = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalPrimaryButtonLabel"  = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel"= EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType"   = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget"            = EXCLUDED."detailsTarget",
  "isPrimary"                = EXCLUDED."isPrimary",
  "isElective"               = EXCLUDED."isElective",
  "requiresAction"           = EXCLUDED."requiresAction",
  "displayOrder"             = EXCLUDED."displayOrder",
  "updatedAt"                = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 4 — NextStepConfig: RESPOND_TO_MATERIALS_QUESTIONS (CONTRACT_PHASE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Shown when a pending claim already exists and the client has posted questions.

INSERT INTO "NextStepConfig"
  (
    "id",
    "projectStage",
    "role",
    "actionKey",
    "actionLabel",
    "description",
    "modalTitle",
    "modalBody",
    "modalPrimaryButtonLabel",
    "modalSecondaryButtonLabel",
    "modalPrimaryActionType",
    "modalSecondaryActionType",
    "detailsTarget",
    "isPrimary",
    "isElective",
    "requiresAction",
    "displayOrder",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'CONTRACT_PHASE',
    'PROFESSIONAL',
    'RESPOND_TO_MATERIALS_QUESTIONS',
    'Respond to client questions on materials claim',
    'Your materials claim is under client review. Respond to any questions in the claim thread so authorisation can proceed.',
    'Materials claim — client response required',
    'The client has reviewed your purchase receipts and has questions. Reply in the claim thread to continue. Once they are satisfied, the confirmed amount will be released to your withdrawable wallet.',
    'View claim thread',
    'Later',
    'open_custom_modal',
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
  "actionLabel"              = EXCLUDED."actionLabel",
  "description"              = EXCLUDED."description",
  "modalTitle"               = EXCLUDED."modalTitle",
  "modalBody"                = EXCLUDED."modalBody",
  "modalPrimaryButtonLabel"  = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel"= EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType"   = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget"            = EXCLUDED."detailsTarget",
  "isPrimary"                = EXCLUDED."isPrimary",
  "isElective"               = EXCLUDED."isElective",
  "requiresAction"           = EXCLUDED."requiresAction",
  "displayOrder"             = EXCLUDED."displayOrder",
  "updatedAt"                = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 5 — NextStepConfig: RESPOND_TO_MATERIALS_QUESTIONS (PRE_WORK)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "NextStepConfig"
  (
    "id",
    "projectStage",
    "role",
    "actionKey",
    "actionLabel",
    "description",
    "modalTitle",
    "modalBody",
    "modalPrimaryButtonLabel",
    "modalSecondaryButtonLabel",
    "modalPrimaryActionType",
    "modalSecondaryActionType",
    "detailsTarget",
    "isPrimary",
    "isElective",
    "requiresAction",
    "displayOrder",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'PRE_WORK',
    'PROFESSIONAL',
    'RESPOND_TO_MATERIALS_QUESTIONS',
    'Respond to client questions on materials claim',
    'Your materials claim is under client review. Respond to any questions in the claim thread so authorisation can proceed.',
    'Materials claim — client response required',
    'The client has reviewed your purchase receipts and has questions. Reply in the claim thread to continue. Once they are satisfied, the confirmed amount will be released to your withdrawable wallet.',
    'View claim thread',
    'Later',
    'open_custom_modal',
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
  "actionLabel"              = EXCLUDED."actionLabel",
  "description"              = EXCLUDED."description",
  "modalTitle"               = EXCLUDED."modalTitle",
  "modalBody"                = EXCLUDED."modalBody",
  "modalPrimaryButtonLabel"  = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel"= EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType"   = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget"            = EXCLUDED."detailsTarget",
  "isPrimary"                = EXCLUDED."isPrimary",
  "isElective"               = EXCLUDED."isElective",
  "requiresAction"           = EXCLUDED."requiresAction",
  "displayOrder"             = EXCLUDED."displayOrder",
  "updatedAt"                = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 6 — NextStepConfig: REVIEW_MATERIALS_PURCHASE (CONTRACT_PHASE, CLIENT)
-- ─────────────────────────────────────────────────────────────────────────────
-- Shown to the client after a pending procurement-evidence row exists.
-- The dispatcher routes this to the review-materials-claim custom modal.

INSERT INTO "NextStepConfig"
  (
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
    "modalPrimaryButtonLabel",
    "modalSecondaryButtonLabel",
    "modalPrimaryActionType",
    "modalSecondaryActionType",
    "detailsTarget",
    "isPrimary",
    "isElective",
    "requiresAction",
    "displayOrder",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'CONTRACT_PHASE',
    'CLIENT',
    'REVIEW_MATERIALS_PURCHASE',
    'Review materials claim',
    'The professional has submitted purchase receipts for milestone 1 materials. Review the receipts and authorise payment or request confirmation.',
    'Milestone 1 — Review materials claim',
    'Check each receipt, review the total amount claimed, and either authorise payment or ask the professional for clarification.',
    'Once you authorise, the confirmed amount is transferred to the professional''s withdrawable wallet. Any unspent cap balance is returned to your escrow.',
    'Materials claim reviewed!',
    'Your decision has been recorded. You will be notified of any updates.',
    'What''s next? If you authorised, the professional will receive the funds shortly. If you requested confirmation, keep an eye on the claim thread.',
    'Review claim',
    'Later',
    'open_custom_modal',
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
  "actionLabel"              = EXCLUDED."actionLabel",
  "description"              = EXCLUDED."description",
  "modalTitle"               = EXCLUDED."modalTitle",
  "modalBody"                = EXCLUDED."modalBody",
  "modalDetailsBody"         = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle"        = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody"         = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalPrimaryButtonLabel"  = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel"= EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType"   = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget"            = EXCLUDED."detailsTarget",
  "isPrimary"                = EXCLUDED."isPrimary",
  "isElective"               = EXCLUDED."isElective",
  "requiresAction"           = EXCLUDED."requiresAction",
  "displayOrder"             = EXCLUDED."displayOrder",
  "updatedAt"                = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 7 — NextStepConfig: REVIEW_MATERIALS_PURCHASE (PRE_WORK, CLIENT)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "NextStepConfig"
  (
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
    "modalPrimaryButtonLabel",
    "modalSecondaryButtonLabel",
    "modalPrimaryActionType",
    "modalSecondaryActionType",
    "detailsTarget",
    "isPrimary",
    "isElective",
    "requiresAction",
    "displayOrder",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    gen_random_uuid()::text,
    'PRE_WORK',
    'CLIENT',
    'REVIEW_MATERIALS_PURCHASE',
    'Review materials claim',
    'The professional has submitted purchase receipts for milestone 1 materials. Review the receipts and authorise payment or request confirmation.',
    'Milestone 1 — Review materials claim',
    'Check each receipt, review the total amount claimed, and either authorise payment or ask the professional for clarification.',
    'Once you authorise, the confirmed amount is transferred to the professional''s withdrawable wallet. Any unspent cap balance is returned to your escrow.',
    'Materials claim reviewed!',
    'Your decision has been recorded. You will be notified of any updates.',
    'What''s next? If you authorised, the professional will receive the funds shortly. If you requested confirmation, keep an eye on the claim thread.',
    'Review claim',
    'Later',
    'open_custom_modal',
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
  "actionLabel"              = EXCLUDED."actionLabel",
  "description"              = EXCLUDED."description",
  "modalTitle"               = EXCLUDED."modalTitle",
  "modalBody"                = EXCLUDED."modalBody",
  "modalDetailsBody"         = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle"        = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody"         = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalPrimaryButtonLabel"  = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel"= EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType"   = EXCLUDED."modalPrimaryActionType",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "detailsTarget"            = EXCLUDED."detailsTarget",
  "isPrimary"                = EXCLUDED."isPrimary",
  "isElective"               = EXCLUDED."isElective",
  "requiresAction"           = EXCLUDED."requiresAction",
  "displayOrder"             = EXCLUDED."displayOrder",
  "updatedAt"                = NOW();

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (uncomment to run after applying)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT "projectStage", "role", "actionKey", "actionLabel",
--        "modalTitle", "modalPrimaryButtonLabel", "modalPrimaryActionType",
--        "detailsTarget", "isPrimary", "displayOrder"
-- FROM "NextStepConfig"
-- WHERE "actionKey" IN (
--   'MAKE_MILESTONE_1_CLAIM',
--   'RESPOND_TO_MATERIALS_QUESTIONS',
--   'REVIEW_MATERIALS_PURCHASE'
-- )
-- ORDER BY "role", "projectStage", "actionKey";
-- ORDER BY "projectStage", "displayOrder";

-- SELECT "id", "status", "createdAt", "deadlineAt", "openingMessage"
-- FROM "MilestoneProcurementEvidence"
-- ORDER BY "createdAt" DESC
-- LIMIT 20;
