-- Seed NextStepConfig and AdminNextStepTemplate
-- Safe to run multiple times (uses ON CONFLICT DO UPDATE)

-- =========================================================
-- NextStepConfig
-- =========================================================

INSERT INTO "NextStepConfig" (
  "id", "projectStage", "role", "actionKey", "actionLabel", "description", "isPrimary", "isElective", "estimatedDurationMinutes", "displayOrder", "createdAt", "updatedAt"
)
VALUES
  (gen_random_uuid()::text, 'CREATED', 'CLIENT', 'WAIT_FOR_QUOTES', 'Wait for quotes', 'Monitor responses from invited professionals.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'CREATED', 'CLIENT', 'INVITE_PROFESSIONALS', 'Invite professionals', 'Invite additional professionals to increase quote options.', false, true, NULL, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'CREATED', 'PROFESSIONAL', 'REPLY_TO_INVITATION', 'Reply to invitation', 'Accept and proceed to quote workflow.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'CLIENT', 'REVIEW_INCOMING_QUOTES', 'Review incoming quotes', 'Compare submitted pricing and notes.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'CLIENT', 'REQUEST_SITE_VISIT', 'Request site visit', 'Allow professionals to inspect site before final quote.', false, true, NULL, 2, NOW(), NOW()),
  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'PROFESSIONAL', 'SUBMIT_QUOTE', 'Submit quote', 'Provide quote and timeline.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'BIDDING_ACTIVE', 'PROFESSIONAL', 'REQUEST_SITE_ACCESS', 'Request site access', 'Ask for visit access before finalizing quote.', false, true, NULL, 2, NOW(), NOW()),

  (gen_random_uuid()::text, 'SITE_VISIT_SCHEDULED', 'CLIENT', 'CONFIRM_SITE_VISIT', 'Confirm site visit', 'Confirm date/time and access instructions.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'SITE_VISIT_SCHEDULED', 'PROFESSIONAL', 'ATTEND_SITE_VISIT', 'Attend site visit', 'Attend the scheduled visit and gather details.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'SITE_VISIT_COMPLETE', 'CLIENT', 'WAIT_FOR_UPDATED_QUOTES', 'Wait for updated quotes', 'Professionals will submit revised quotes after visit.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'SITE_VISIT_COMPLETE', 'PROFESSIONAL', 'PREPARE_REVISED_QUOTE', 'Prepare revised quote', 'Update quote based on site findings.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'QUOTE_RECEIVED', 'CLIENT', 'COMPARE_QUOTES', 'Compare quotes', 'Review all received quotes side by side.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'QUOTE_RECEIVED', 'PROFESSIONAL', 'WAIT_FOR_DECISION', 'Wait for client decision', 'Client is evaluating submitted quotes.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'BIDDING_CLOSED', 'CLIENT', 'SELECT_PROFESSIONAL', 'Select professional', 'Choose a professional to proceed.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'BIDDING_CLOSED', 'PROFESSIONAL', 'PREPARE_CONTRACT', 'Prepare contract', 'Prepare terms for contract stage if selected.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'CLIENT', 'REVIEW_CONTRACT', 'Review contract', 'Review terms and approve or request changes.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'PROFESSIONAL', 'SUBMIT_CONTRACT', 'Submit contract', 'Submit draft contract with milestones and schedule.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'PRE_WORK', 'CLIENT', 'CONFIRM_START_DETAILS', 'Confirm start details', 'Confirm schedule, access and payment setup.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'PRE_WORK', 'PROFESSIONAL', 'CONFIRM_START_DATE', 'Confirm start date', 'Confirm kickoff date and resource plan.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'WORK_IN_PROGRESS', 'CLIENT', 'REVIEW_PROGRESS', 'Review progress', 'Check updates and milestone readiness.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'WORK_IN_PROGRESS', 'PROFESSIONAL', 'SUBMIT_PROGRESS_UPDATE', 'Submit progress update', 'Post work updates and evidence.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'MILESTONE_PENDING', 'CLIENT', 'APPROVE_MILESTONE', 'Approve milestone', 'Approve or request correction for milestone.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'MILESTONE_PENDING', 'PROFESSIONAL', 'AWAIT_MILESTONE_APPROVAL', 'Wait for milestone approval', 'Await client review.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'PAYMENT_RELEASED', 'CLIENT', 'CONFIRM_NEXT_PHASE', 'Confirm next phase', 'Proceed with upcoming milestone or completion.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'PAYMENT_RELEASED', 'PROFESSIONAL', 'PROCEED_TO_NEXT_PHASE', 'Proceed to next phase', 'Continue to next milestone or final phase.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'NEAR_COMPLETION', 'CLIENT', 'SCHEDULE_FINAL_INSPECTION', 'Schedule final inspection', 'Arrange final walkthrough.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'NEAR_COMPLETION', 'PROFESSIONAL', 'REQUEST_FINAL_WALKTHROUGH', 'Request final walkthrough', 'Request final inspection appointment.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'FINAL_INSPECTION', 'CLIENT', 'APPROVE_FINAL_WORK', 'Approve final work', 'Confirm completion and close outstanding items.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'FINAL_INSPECTION', 'PROFESSIONAL', 'ADDRESS_FINAL_ITEMS', 'Address final items', 'Resolve punch-list items if any.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'COMPLETE', 'CLIENT', 'ENTER_WARRANTY_PERIOD', 'Enter warranty period', 'Project completed; monitor warranty period.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'COMPLETE', 'PROFESSIONAL', 'PROVIDE_WARRANTY_DETAILS', 'Provide warranty details', 'Share warranty terms and support contacts.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'WARRANTY_PERIOD', 'CLIENT', 'REPORT_DEFECT', 'Report a defect', 'Report any defect covered under warranty.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'WARRANTY_PERIOD', 'PROFESSIONAL', 'VIEW_DEFECT', 'View defect', 'Review and respond to reported defects.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'PAUSED', 'CLIENT', 'RESUME_PROJECT', 'Resume project', 'Resume project when ready.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'PAUSED', 'PROFESSIONAL', 'CONFIRM_RESUME_PLAN', 'Confirm resume plan', 'Confirm timeline for project resumption.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'DISPUTED', 'CLIENT', 'PROVIDE_DISPUTE_DETAILS', 'Provide dispute details', 'Submit details for resolution workflow.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'DISPUTED', 'PROFESSIONAL', 'RESPOND_TO_DISPUTE', 'Respond to dispute', 'Provide response and supporting evidence.', true, false, NULL, 1, NOW(), NOW()),

  (gen_random_uuid()::text, 'CLOSED', 'CLIENT', 'START_NEW_PROJECT', 'Start new project', 'Launch a new renovation request.', true, false, NULL, 1, NOW(), NOW()),
  (gen_random_uuid()::text, 'CLOSED', 'PROFESSIONAL', 'VIEW_ARCHIVE', 'View archived project', 'Review closed project records.', true, false, NULL, 1, NOW(), NOW())
ON CONFLICT ("projectStage", "role", "actionKey")
DO UPDATE SET
  "actionLabel" = EXCLUDED."actionLabel",
  "description" = EXCLUDED."description",
  "isPrimary" = EXCLUDED."isPrimary",
  "isElective" = EXCLUDED."isElective",
  "estimatedDurationMinutes" = EXCLUDED."estimatedDurationMinutes",
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = NOW();

-- =========================================================
-- AdminNextStepTemplate
-- =========================================================

INSERT INTO "AdminNextStepTemplate" (
  "id", "projectStage", "actionType", "description", "triggerCondition", "isPriority", "displayOrder", "createdAt"
)
VALUES
  (gen_random_uuid()::text, 'BIDDING_CLOSED', 'APPROVE_LARGE_BUDGET', 'Review high budget approvals before award.', 'BUDGET_OVER_100000', true, 1, NOW()),
  (gen_random_uuid()::text, 'CONTRACT_PHASE', 'REVIEW_CONTRACT', 'Review contract terms for compliance.', 'ALWAYS', false, 1, NOW()),
  (gen_random_uuid()::text, 'PRE_WORK', 'VALIDATE_INSURANCE', 'Validate active insurance before work starts.', 'ALWAYS', false, 1, NOW()),
  (gen_random_uuid()::text, 'PRE_WORK', 'VALIDATE_LICENSE', 'Validate license before work starts.', 'ALWAYS', false, 2, NOW()),
  (gen_random_uuid()::text, 'MILESTONE_PENDING', 'VERIFY_ESCROW_RECEIPT', 'Verify escrow receipt before milestone payment approval.', 'ESCROW_REQUIRED', true, 1, NOW()),
  (gen_random_uuid()::text, 'PAYMENT_RELEASED', 'APPROVE_PAYMENT_RELEASE', 'Audit and approve payment release records.', 'ALWAYS', true, 1, NOW()),
  (gen_random_uuid()::text, 'WORK_IN_PROGRESS', 'APPROVE_CHANGE_ORDER', 'Approve material scope/cost change orders.', 'CHANGE_ORDER_REQUESTED', false, 1, NOW()),
  (gen_random_uuid()::text, 'WARRANTY_PERIOD', 'FLAG_QUALITY_ISSUE', 'Track warranty defect and quality issue remediation.', 'DEFECT_REPORTED', false, 1, NOW()),
  (gen_random_uuid()::text, 'DISPUTED', 'INVESTIGATE_COMPLAINT', 'Investigate complaint submissions.', 'ALWAYS', true, 1, NOW()),
  (gen_random_uuid()::text, 'DISPUTED', 'RESOLVE_DISPUTE', 'Resolve dispute and define outcome path.', 'ALWAYS', true, 2, NOW())
ON CONFLICT ("projectStage", "actionType")
DO UPDATE SET
  "description" = EXCLUDED."description",
  "triggerCondition" = EXCLUDED."triggerCondition",
  "isPriority" = EXCLUDED."isPriority",
  "displayOrder" = EXCLUDED."displayOrder";

-- Verification
SELECT COUNT(*) AS "nextStepConfigCount" FROM "NextStepConfig";
SELECT COUNT(*) AS "adminNextStepTemplateCount" FROM "AdminNextStepTemplate";
