-- =============================================================================
-- SEED_NEXT_STEP_CONFIG.sql
-- =============================================================================
-- Purpose : Ensure NextStepConfig rows exist for every project stage + role.
--           Safe to run multiple times – uses ON CONFLICT DO NOTHING.
--           Run this once on any environment where seed-next-steps.ts was
--           never executed (e.g. production DB bootstrapped without seeding).
--
-- How next-steps work (no per-project SQL needed):
--   1. acceptQuote()  →  Project.currentStage = 'CONTRACT_PHASE'
--   2. GET /projects/:id/next-steps  →  queries NextStepConfig WHERE
--        projectStage = project.currentStage AND role = caller's role
--   3. Returns sorted rows – frontend shows the PRIMARY[0] action as next step.
--
-- Verify before inserting:
--   SELECT "projectStage", "role", "actionKey", "actionLabel", "requiresAction",
--          "isPrimary", "displayOrder"
--   FROM   "NextStepConfig"
--   ORDER  BY "projectStage", "role", "displayOrder";
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CREATED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'CREATED', 'CLIENT',
   'WAIT_FOR_QUOTES', 'Wait for quotes',
   'Monitor responses from invited professionals.',
   true, false, false, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'CREATED', 'CLIENT',
   'INVITE_PROFESSIONALS', 'Invite professionals',
   'Invite professionals so they can start quoting on your project.',
   false, true, true, 2, NOW(), NOW()),

  (gen_random_uuid()::text, 'CREATED', 'PROFESSIONAL',
   'REPLY_TO_INVITATION', 'Reply to invitation',
   'Accept and proceed to quote workflow.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- BIDDING_ACTIVE stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'CLIENT',
   'REVIEW_INCOMING_QUOTES', 'Review incoming quotes',
   'Compare submitted pricing and notes.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'CLIENT',
   'REQUEST_SITE_VISIT', 'Request site visit',
   'Allow professionals to inspect site before final quote.',
   false, true, true, 2, NOW(), NOW()),

  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'PROFESSIONAL',
   'SUBMIT_QUOTE', 'Submit quote',
   'Provide quote and timeline.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'PROFESSIONAL',
   'REQUEST_SITE_ACCESS', 'Request site access',
   'Ask for visit access before finalizing quote.',
   false, true, true, 2, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- SITE_VISIT_SCHEDULED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'SITE_VISIT_SCHEDULED', 'CLIENT',
   'CONFIRM_SITE_VISIT', 'Confirm site visit',
   'Confirm date/time and access instructions.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'SITE_VISIT_SCHEDULED', 'PROFESSIONAL',
   'ATTEND_SITE_VISIT', 'Attend site visit',
   'Attend the scheduled visit and gather details.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- SITE_VISIT_COMPLETE stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'SITE_VISIT_COMPLETE', 'CLIENT',
   'WAIT_FOR_UPDATED_QUOTES', 'Wait for updated quotes',
   'Professionals will submit revised quotes after visit.',
   true, false, false, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'SITE_VISIT_COMPLETE', 'PROFESSIONAL',
   'PREPARE_REVISED_QUOTE', 'Prepare revised quote',
   'Update quote based on site findings.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- QUOTE_RECEIVED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'QUOTE_RECEIVED', 'CLIENT',
   'COMPARE_QUOTES', 'Compare quotes',
   'Review all received quotes side by side.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'QUOTE_RECEIVED', 'PROFESSIONAL',
   'WAIT_FOR_DECISION', 'Wait for client decision',
   'Client is evaluating submitted quotes.',
   true, false, false, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- BIDDING_CLOSED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'BIDDING_CLOSED', 'CLIENT',
   'SELECT_PROFESSIONAL', 'Select professional',
   'Choose a professional to proceed.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'BIDDING_CLOSED', 'PROFESSIONAL',
   'PREPARE_CONTRACT', 'Prepare contract',
   'Prepare terms for contract stage if selected.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- CONTRACT_PHASE stage  ← most critical for post-quote-acceptance flow
--
-- Flow after client accepts a quote:
--   1. acceptQuote() sets Project.currentStage = 'CONTRACT_PHASE'
--   2. Professional sees REVIEW_AGREEMENT (SUBMIT_CONTRACT action key) first
--   3. Client sees REVIEW_CONTRACT (requiresAction=false = waiting for professional)
--   4. Once contract submitted: client sees SIGN_CONTRACT (requiresAction=true)
--   5. After both sign: client sees DEPOSIT_ESCROW_FUNDS
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  -- Client steps (ordered by contract lifecycle)
  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'CLIENT',
   'REVIEW_CONTRACT', 'Review agreement',
   'Review terms and confirm the contract is ready for signature.',
   true, false, false, 1, NOW(), NOW()),
  -- requiresAction=false: contract not yet submitted by professional; client is waiting.
  -- The service overrides this with synthetic steps once signing begins.

  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'CLIENT',
   'SIGN_CONTRACT', 'Sign agreement',
   'Sign the agreement once terms are confirmed.',
   true, false, true, 2, NOW(), NOW()),

  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'CLIENT',
   'DEPOSIT_ESCROW_FUNDS', 'Deposit funds to escrow',
   'After both signatures are complete, deposit funds to escrow before work starts.',
   true, false, true, 3, NOW(), NOW()),

  -- Professional steps
  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'PROFESSIONAL',
    'SUBMIT_CONTRACT', 'Review agreement',
   'Submit draft contract with milestones and schedule.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'PROFESSIONAL',
   'SIGN_CONTRACT', 'Sign agreement',
   'Sign the agreement after client review to unlock escrow funding.',
   true, false, true, 2, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO UPDATE SET
  "actionLabel"    = EXCLUDED."actionLabel",
  "description"    = EXCLUDED."description",
  "isPrimary"      = EXCLUDED."isPrimary",
  "isElective"     = EXCLUDED."isElective",
  "requiresAction" = EXCLUDED."requiresAction",   -- critical: fixes REVIEW_CONTRACT true→false
  "displayOrder"   = EXCLUDED."displayOrder",
  "updatedAt"      = NOW();

-- ---------------------------------------------------------------------------
-- PRE_WORK stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'PRE_WORK', 'CLIENT',
   'CONFIRM_START_DETAILS', 'Confirm start details',
   'Accept or update the proposed start date before work begins.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'PRE_WORK', 'PROFESSIONAL',
   'CONFIRM_START_DATE', 'Confirm start date',
   'Confirm kickoff date and resource plan.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- WORK_IN_PROGRESS stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'WORK_IN_PROGRESS', 'CLIENT',
   'REVIEW_PROGRESS', 'Review progress',
   'Check updates and milestone readiness.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'WORK_IN_PROGRESS', 'PROFESSIONAL',
   'SUBMIT_PROGRESS_UPDATE', 'Submit progress update',
   'Post work updates and evidence.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- MILESTONE_PENDING stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'MILESTONE_PENDING', 'CLIENT',
   'APPROVE_MILESTONE', 'Approve milestone',
   'Approve or request correction for milestone.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'MILESTONE_PENDING', 'PROFESSIONAL',
   'AWAIT_MILESTONE_APPROVAL', 'Wait for milestone approval',
   'Await client review.',
   true, false, false, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- PAYMENT_RELEASED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'PAYMENT_RELEASED', 'CLIENT',
   'CONFIRM_NEXT_PHASE', 'Confirm next phase',
   'Proceed with upcoming milestone or completion.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'PAYMENT_RELEASED', 'PROFESSIONAL',
   'PROCEED_TO_NEXT_PHASE', 'Proceed to next phase',
   'Continue to next milestone or final phase.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- NEAR_COMPLETION stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'NEAR_COMPLETION', 'CLIENT',
   'SCHEDULE_FINAL_INSPECTION', 'Schedule final inspection',
   'Arrange final walkthrough.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'NEAR_COMPLETION', 'PROFESSIONAL',
   'REQUEST_FINAL_WALKTHROUGH', 'Request final walkthrough',
   'Request final inspection appointment.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- FINAL_INSPECTION stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'FINAL_INSPECTION', 'CLIENT',
   'APPROVE_FINAL_WORK', 'Approve final work',
   'Confirm completion and close outstanding items.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'FINAL_INSPECTION', 'PROFESSIONAL',
   'ADDRESS_FINAL_ITEMS', 'Address final items',
   'Resolve punch-list items if any.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- COMPLETE stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'COMPLETE', 'CLIENT',
   'ENTER_WARRANTY_PERIOD', 'Enter warranty period',
   'Project completed; monitor warranty period.',
   true, false, false, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'COMPLETE', 'PROFESSIONAL',
   'PROVIDE_WARRANTY_DETAILS', 'Provide warranty details',
   'Share warranty terms and support contacts.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- WARRANTY_PERIOD stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'WARRANTY_PERIOD', 'CLIENT',
   'REPORT_DEFECT', 'Report a defect',
   'Report any defect covered under warranty.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'WARRANTY_PERIOD', 'PROFESSIONAL',
   'VIEW_DEFECT', 'View defect',
   'Review and respond to reported defects.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- PAUSED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'PAUSED', 'CLIENT',
   'RESUME_PROJECT', 'Resume project',
   'Resume project when ready.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'PAUSED', 'PROFESSIONAL',
   'CONFIRM_RESUME_PLAN', 'Confirm resume plan',
   'Confirm timeline for project resumption.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- DISPUTED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'DISPUTED', 'CLIENT',
   'PROVIDE_DISPUTE_DETAILS', 'Provide dispute details',
   'Submit details for resolution workflow.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'DISPUTED', 'PROFESSIONAL',
   'RESPOND_TO_DISPUTE', 'Respond to dispute',
   'Provide response and supporting evidence.',
   true, false, true, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- CLOSED stage
-- ---------------------------------------------------------------------------
INSERT INTO "NextStepConfig"
  ("id","projectStage","role","actionKey","actionLabel","description",
   "isPrimary","isElective","requiresAction","displayOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'CLOSED', 'CLIENT',
   'START_NEW_PROJECT', 'Start new project',
   'Launch a new renovation request.',
   true, false, true, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'CLOSED', 'PROFESSIONAL',
   'VIEW_ARCHIVE', 'View archived project',
   'Review closed project records.',
   true, false, false, 1, NOW(), NOW())

ON CONFLICT ("projectStage","role","actionKey") DO NOTHING;

-- =============================================================================
-- Verification query – run after insert to confirm rows exist
-- =============================================================================
-- SELECT "projectStage", "role", "actionKey", "actionLabel",
--        "requiresAction", "isPrimary", "displayOrder"
-- FROM   "NextStepConfig"
-- ORDER  BY "projectStage", "role", "displayOrder";
