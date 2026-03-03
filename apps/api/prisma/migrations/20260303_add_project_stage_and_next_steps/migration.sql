-- CreateEnum: ProjectStage
-- Order: Normal flow (1-16), then exceptional states (17-18)
CREATE TYPE "ProjectStage" AS ENUM (
  'CREATED',
  'BIDDING_ACTIVE',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETE',
  'QUOTE_RECEIVED',
  'BIDDING_CLOSED',
  'CONTRACT_PHASE',
  'PRE_WORK',
  'WORK_IN_PROGRESS',
  'MILESTONE_PENDING',
  'PAYMENT_RELEASED',
  'NEAR_COMPLETION',
  'FINAL_INSPECTION',
  'COMPLETE',
  'WARRANTY_PERIOD',
  'CLOSED',
  'PAUSED',
  'DISPUTED'
);

-- CreateEnum: AdminActionType
CREATE TYPE "AdminActionType" AS ENUM (
  'VERIFY_ESCROW_RECEIPT',
  'APPROVE_PAYMENT_RELEASE',
  'REVIEW_CONTRACT',
  'VALIDATE_INSURANCE',
  'VALIDATE_LICENSE',
  'RESOLVE_DISPUTE',
  'APPROVE_LARGE_BUDGET',
  'FLAG_QUALITY_ISSUE',
  'INVESTIGATE_COMPLAINT',
  'APPROVE_CHANGE_ORDER'
);

-- ============================================================================
-- PROJECT STAGE FLOW DOCUMENTATION
-- ============================================================================
-- NORMAL LINEAR FLOW (stages 1-16):
--   1. CREATED - Project submitted by client
--   2. BIDDING_ACTIVE - Professionals invited to bid
--   3. SITE_VISIT_SCHEDULED - Professional requests/schedules site visit
--   4. SITE_VISIT_COMPLETE - Professional visited and inspected property
--   5. QUOTE_RECEIVED - Professional submitted quote (based on visit)
--   6. BIDDING_CLOSED - Bidding window closed, ready to select professional
--   7. CONTRACT_PHASE - Contract being negotiated/reviewed
--   8. PRE_WORK - Contract signed, preparation phase before work starts
--   9. WORK_IN_PROGRESS - Active work phase
--   10. MILESTONE_PENDING - Milestone work complete, awaiting client approval
--   11. PAYMENT_RELEASED - Client approved & paid for milestone
--       (Stages 10-11 REPEAT for each milestone in project)
--   12. NEAR_COMPLETION - Final phase of work nearing completion
--   13. FINAL_INSPECTION - Final walkthrough and inspection
--   14. COMPLETE - All work completed, paid, and signed off
--   15. WARRANTY_PERIOD - Work in warranty period; client can report defects
--   16. CLOSED - Warranty expired or all items resolved, project fully closed
--
-- EXCEPTIONAL STATES (can occur at any point during flow):
--   17. PAUSED - Project suspended (can resume to any earlier stage)
--   18. DISPUTED - Project in dispute resolution (can escalate to admin)
-- ============================================================================

-- Modify Project table: Add stage tracking fields
ALTER TABLE "Project" ADD COLUMN "currentStage" "ProjectStage" NOT NULL DEFAULT 'CREATED';
ALTER TABLE "Project" ADD COLUMN "stageStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ADD COLUMN "lastStageTransitionAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Create NextStepConfig table
-- Defines what actions are available for each role at each project stage
CREATE TABLE "NextStepConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectStage" "ProjectStage" NOT NULL,
  "role" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "actionLabel" TEXT NOT NULL,
  "description" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isElective" BOOLEAN NOT NULL DEFAULT false,
  "estimatedDurationMinutes" INTEGER,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  UNIQUE("projectStage", "role", "actionKey")
);

-- Create NextStepAction table
-- Tracks user interactions with next step suggestions
CREATE TABLE "NextStepAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "projectStage" "ProjectStage" NOT NULL,
  "userAction" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NextStepAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "NextStepAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create AdminAction table
-- Tracks admin-level touchpoints and required approvals
CREATE TABLE "AdminAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "actionType" "AdminActionType" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "reason" TEXT,
  "triggerCondition" TEXT,
  "requiredByDate" TIMESTAMP(3),
  "assignedToAdminId" TEXT,
  "completedAt" TIMESTAMP(3),
  "completedByAdminId" TEXT,
  "approvalDetails" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "AdminAction_assignedToAdminId_fkey" FOREIGN KEY ("assignedToAdminId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "AdminAction_completedByAdminId_fkey" FOREIGN KEY ("completedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL
);

-- Create AdminNextStepTemplate table
-- Configures which admin actions are needed at each project stage
CREATE TABLE "AdminNextStepTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectStage" "ProjectStage" NOT NULL,
  "actionType" "AdminActionType" NOT NULL,
  "description" TEXT NOT NULL,
  "triggerCondition" TEXT,
  "isPriority" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE("projectStage", "actionType")
);

-- Create indexes for performance
CREATE INDEX "NextStepAction_projectId_idx" ON "NextStepAction"("projectId");
CREATE INDEX "NextStepAction_userId_idx" ON "NextStepAction"("userId");
CREATE INDEX "NextStepAction_actionKey_idx" ON "NextStepAction"("actionKey");
CREATE INDEX "AdminAction_projectId_idx" ON "AdminAction"("projectId");
CREATE INDEX "AdminAction_status_idx" ON "AdminAction"("status");
CREATE INDEX "AdminAction_priority_idx" ON "AdminAction"("priority");
CREATE INDEX "AdminAction_actionType_idx" ON "AdminAction"("actionType");
CREATE INDEX "AdminAction_assignedToAdminId_idx" ON "AdminAction"("assignedToAdminId");
CREATE INDEX "Project_currentStage_idx" ON "Project"("currentStage");
CREATE INDEX "Project_stageStartedAt_idx" ON "Project"("stageStartedAt");
CREATE INDEX "AdminNextStepTemplate_projectStage_idx" ON "AdminNextStepTemplate"("projectStage");

-- Comments for documentation
COMMENT ON TABLE "NextStepConfig" IS 'Configures what next step actions are available for each role at each project stage';
COMMENT ON TABLE "NextStepAction" IS 'Tracks user interactions with next step suggestions (completed, skipped, deferred)';
COMMENT ON TABLE "AdminAction" IS 'Tracks admin-level touchpoints requiring review/approval at critical project stages';
COMMENT ON TABLE "AdminNextStepTemplate" IS 'Defines which admin actions should be created at each project stage';

COMMENT ON COLUMN "Project"."currentStage" IS 'Current stage in project lifecycle (CREATED, BIDDING_ACTIVE, etc.)';
COMMENT ON COLUMN "Project"."stageStartedAt" IS 'Timestamp when project entered current stage';
COMMENT ON COLUMN "Project"."lastStageTransitionAt" IS 'Most recent stage transition time';

COMMENT ON COLUMN "NextStepAction"."userAction" IS 'User action taken: COMPLETED, SKIPPED, DEFERRED, ALTERNATIVE';
COMMENT ON COLUMN "AdminAction"."status" IS 'Action status: PENDING, IN_REVIEW, APPROVED, REJECTED, ESCALATED';
COMMENT ON COLUMN "AdminAction"."priority" IS 'Priority level: LOW, NORMAL, HIGH, URGENT';
COMMENT ON COLUMN "AdminAction"."triggerCondition" IS 'Condition that triggered this action (e.g., PAYMENT_OVER_10000, ON_DISPUTE)';

-- ============================================================================
-- WARRANTY_PERIOD & MULTIPLE MILESTONE HANDLING
-- ============================================================================
-- 
-- WARRANTY_PERIOD Stage:
--   - Entered after project is COMPLETE
--   - Client next step: "Report a defect" (if issues encountered)
--   - Professional next step: "View defect" (if client reported one)
--   - Admin may flag: FLAG_QUALITY_ISSUE for warranty claims
--   - Transitions to CLOSED when warranty period expires or all defects resolved
--
-- Multiple Milestones:
--   - Projects can have multiple milestones (stored in ProjectMilestone table)
--   - When each milestone is completed, project enters MILESTONE_PENDING
--   - After approval and payment, project re-enters WORK_IN_PROGRESS for next milestone
--   - This allows stages 10 (MILESTONE_PENDING) and 11 (PAYMENT_RELEASED) to repeat
--   - Transitions documented in ProjectMilestone model with sequence tracking
--
-- ============================================================================
