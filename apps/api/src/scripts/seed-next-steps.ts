import { config } from 'dotenv';
import { resolve } from 'path';
import {
  PrismaClient,
  ProjectStage,
  AdminActionType,
} from '@prisma/client';

config({ path: resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

type NextStepSeed = {
  projectStage: ProjectStage;
  role: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
  actionKey: string;
  actionLabel: string;
  description?: string;
  isPrimary?: boolean;
  isElective?: boolean;
  requiresAction?: boolean;
  estimatedDurationMinutes?: number;
  displayOrder?: number;
};

type AdminTemplateSeed = {
  projectStage: ProjectStage;
  actionType: AdminActionType;
  description: string;
  triggerCondition?: string;
  isPriority?: boolean;
  displayOrder?: number;
};

const nextStepSeeds: NextStepSeed[] = [
  { projectStage: ProjectStage.CREATED, role: 'CLIENT', actionKey: 'WAIT_FOR_QUOTES', actionLabel: 'Wait for quotes', description: 'Monitor responses from invited professionals.', isPrimary: true, requiresAction: false, displayOrder: 1 },
  { projectStage: ProjectStage.CREATED, role: 'CLIENT', actionKey: 'INVITE_PROFESSIONALS', actionLabel: 'Invite professionals', description: 'Invite professionals so they can start quoting on your project.', isElective: true, requiresAction: true, displayOrder: 2 },
  { projectStage: ProjectStage.CREATED, role: 'PROFESSIONAL', actionKey: 'REPLY_TO_INVITATION', actionLabel: 'Reply to invitation', description: 'Accept and proceed to quote workflow.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.BIDDING_ACTIVE, role: 'CLIENT', actionKey: 'REVIEW_INCOMING_QUOTES', actionLabel: 'Review incoming quotes', description: 'Compare submitted pricing and notes.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.BIDDING_ACTIVE, role: 'CLIENT', actionKey: 'REQUEST_SITE_VISIT', actionLabel: 'Request site visit', description: 'Allow professionals to inspect site before final quote.', isElective: true, displayOrder: 2 },
  { projectStage: ProjectStage.BIDDING_ACTIVE, role: 'PROFESSIONAL', actionKey: 'SUBMIT_QUOTE', actionLabel: 'Submit quote', description: 'Provide quote and timeline.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.BIDDING_ACTIVE, role: 'PROFESSIONAL', actionKey: 'REQUEST_SITE_ACCESS', actionLabel: 'Request site access', description: 'Ask for visit access before finalizing quote.', isElective: true, displayOrder: 2 },

  { projectStage: ProjectStage.SITE_VISIT_SCHEDULED, role: 'CLIENT', actionKey: 'CONFIRM_SITE_VISIT', actionLabel: 'Confirm site visit', description: 'Confirm date/time and access instructions.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.SITE_VISIT_SCHEDULED, role: 'PROFESSIONAL', actionKey: 'ATTEND_SITE_VISIT', actionLabel: 'Attend site visit', description: 'Attend the scheduled visit and gather details.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.SITE_VISIT_COMPLETE, role: 'PROFESSIONAL', actionKey: 'PREPARE_REVISED_QUOTE', actionLabel: 'Prepare revised quote', description: 'Update quote based on site findings.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.SITE_VISIT_COMPLETE, role: 'CLIENT', actionKey: 'WAIT_FOR_UPDATED_QUOTES', actionLabel: 'Wait for updated quotes', description: 'Professionals will submit revised quotes after visit.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.QUOTE_RECEIVED, role: 'CLIENT', actionKey: 'COMPARE_QUOTES', actionLabel: 'Compare quotes', description: 'Review all received quotes side by side.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.QUOTE_RECEIVED, role: 'PROFESSIONAL', actionKey: 'WAIT_FOR_DECISION', actionLabel: 'Wait for client decision', description: 'Client is evaluating submitted quotes.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.BIDDING_CLOSED, role: 'CLIENT', actionKey: 'SELECT_PROFESSIONAL', actionLabel: 'Select professional', description: 'Choose a professional to proceed.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.BIDDING_CLOSED, role: 'PROFESSIONAL', actionKey: 'PREPARE_CONTRACT', actionLabel: 'Prepare contract', description: 'Prepare terms for contract stage if selected.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.CONTRACT_PHASE, role: 'CLIENT', actionKey: 'REVIEW_CONTRACT', actionLabel: 'Review agreement', description: 'Review terms and confirm the contract is ready for signature.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.CONTRACT_PHASE, role: 'CLIENT', actionKey: 'SIGN_CONTRACT', actionLabel: 'Sign agreement', description: 'Sign the agreement once terms are confirmed.', isPrimary: true, requiresAction: true, displayOrder: 2 },
  { projectStage: ProjectStage.CONTRACT_PHASE, role: 'CLIENT', actionKey: 'DEPOSIT_ESCROW_FUNDS', actionLabel: 'Deposit funds to escrow', description: 'After both signatures are complete, deposit funds to escrow before work starts.', isPrimary: true, requiresAction: true, displayOrder: 3 },
  { projectStage: ProjectStage.CONTRACT_PHASE, role: 'PROFESSIONAL', actionKey: 'SUBMIT_CONTRACT', actionLabel: 'Submit contract', description: 'Submit draft contract with milestones and schedule.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.CONTRACT_PHASE, role: 'PROFESSIONAL', actionKey: 'SIGN_CONTRACT', actionLabel: 'Sign agreement', description: 'Sign the agreement after client review to unlock escrow funding.', isPrimary: true, requiresAction: true, displayOrder: 2 },

  { projectStage: ProjectStage.PRE_WORK, role: 'CLIENT', actionKey: 'CONFIRM_START_DETAILS', actionLabel: 'Confirm start details', description: 'Accept or update the proposed start date before work begins.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.PRE_WORK, role: 'PROFESSIONAL', actionKey: 'CONFIRM_START_DATE', actionLabel: 'Confirm start date', description: 'Confirm kickoff date and resource plan.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.WORK_IN_PROGRESS, role: 'CLIENT', actionKey: 'REVIEW_PROGRESS', actionLabel: 'Review progress', description: 'Check updates and milestone readiness.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.WORK_IN_PROGRESS, role: 'PROFESSIONAL', actionKey: 'SUBMIT_PROGRESS_UPDATE', actionLabel: 'Submit progress update', description: 'Post work updates and evidence.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.MILESTONE_PENDING, role: 'CLIENT', actionKey: 'APPROVE_MILESTONE', actionLabel: 'Approve milestone', description: 'Approve or request correction for milestone.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.MILESTONE_PENDING, role: 'PROFESSIONAL', actionKey: 'AWAIT_MILESTONE_APPROVAL', actionLabel: 'Wait for milestone approval', description: 'Await client review.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.PAYMENT_RELEASED, role: 'CLIENT', actionKey: 'CONFIRM_NEXT_PHASE', actionLabel: 'Confirm next phase', description: 'Proceed with upcoming milestone or completion.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.PAYMENT_RELEASED, role: 'PROFESSIONAL', actionKey: 'PROCEED_TO_NEXT_PHASE', actionLabel: 'Proceed to next phase', description: 'Continue to next milestone or final phase.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.NEAR_COMPLETION, role: 'CLIENT', actionKey: 'SCHEDULE_FINAL_INSPECTION', actionLabel: 'Schedule final inspection', description: 'Arrange final walkthrough.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.NEAR_COMPLETION, role: 'PROFESSIONAL', actionKey: 'REQUEST_FINAL_WALKTHROUGH', actionLabel: 'Request final walkthrough', description: 'Request final inspection appointment.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.FINAL_INSPECTION, role: 'CLIENT', actionKey: 'APPROVE_FINAL_WORK', actionLabel: 'Approve final work', description: 'Confirm completion and close outstanding items.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.FINAL_INSPECTION, role: 'PROFESSIONAL', actionKey: 'ADDRESS_FINAL_ITEMS', actionLabel: 'Address final items', description: 'Resolve punch-list items if any.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.COMPLETE, role: 'CLIENT', actionKey: 'ENTER_WARRANTY_PERIOD', actionLabel: 'Enter warranty period', description: 'Project completed; monitor warranty period.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.COMPLETE, role: 'PROFESSIONAL', actionKey: 'PROVIDE_WARRANTY_DETAILS', actionLabel: 'Provide warranty details', description: 'Share warranty terms and support contacts.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.WARRANTY_PERIOD, role: 'CLIENT', actionKey: 'REPORT_DEFECT', actionLabel: 'Report a defect', description: 'Report any defect covered under warranty.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.WARRANTY_PERIOD, role: 'PROFESSIONAL', actionKey: 'VIEW_DEFECT', actionLabel: 'View defect', description: 'Review and respond to reported defects.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.PAUSED, role: 'CLIENT', actionKey: 'RESUME_PROJECT', actionLabel: 'Resume project', description: 'Resume project when ready.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.PAUSED, role: 'PROFESSIONAL', actionKey: 'CONFIRM_RESUME_PLAN', actionLabel: 'Confirm resume plan', description: 'Confirm timeline for project resumption.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.DISPUTED, role: 'CLIENT', actionKey: 'PROVIDE_DISPUTE_DETAILS', actionLabel: 'Provide dispute details', description: 'Submit details for resolution workflow.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.DISPUTED, role: 'PROFESSIONAL', actionKey: 'RESPOND_TO_DISPUTE', actionLabel: 'Respond to dispute', description: 'Provide response and supporting evidence.', isPrimary: true, displayOrder: 1 },

  { projectStage: ProjectStage.CLOSED, role: 'CLIENT', actionKey: 'START_NEW_PROJECT', actionLabel: 'Start new project', description: 'Launch a new renovation request.', isPrimary: true, displayOrder: 1 },
  { projectStage: ProjectStage.CLOSED, role: 'PROFESSIONAL', actionKey: 'VIEW_ARCHIVE', actionLabel: 'View archived project', description: 'Review closed project records.', isPrimary: true, displayOrder: 1 },
];

const adminTemplateSeeds: AdminTemplateSeed[] = [
  { projectStage: ProjectStage.BIDDING_CLOSED, actionType: AdminActionType.APPROVE_LARGE_BUDGET, description: 'Review high budget approvals before award.', triggerCondition: 'BUDGET_OVER_100000', isPriority: true, displayOrder: 1 },
  { projectStage: ProjectStage.CONTRACT_PHASE, actionType: AdminActionType.REVIEW_CONTRACT, description: 'Review contract terms for compliance.', triggerCondition: 'ALWAYS', displayOrder: 1 },
  { projectStage: ProjectStage.PRE_WORK, actionType: AdminActionType.VALIDATE_INSURANCE, description: 'Validate active insurance before work starts.', triggerCondition: 'ALWAYS', displayOrder: 1 },
  { projectStage: ProjectStage.PRE_WORK, actionType: AdminActionType.VALIDATE_LICENSE, description: 'Validate license before work starts.', triggerCondition: 'ALWAYS', displayOrder: 2 },
  { projectStage: ProjectStage.MILESTONE_PENDING, actionType: AdminActionType.VERIFY_ESCROW_RECEIPT, description: 'Verify escrow receipt before milestone payment approval.', triggerCondition: 'ESCROW_REQUIRED', isPriority: true, displayOrder: 1 },
  { projectStage: ProjectStage.PAYMENT_RELEASED, actionType: AdminActionType.APPROVE_PAYMENT_RELEASE, description: 'Audit and approve payment release records.', triggerCondition: 'ALWAYS', isPriority: true, displayOrder: 1 },
  { projectStage: ProjectStage.WORK_IN_PROGRESS, actionType: AdminActionType.APPROVE_CHANGE_ORDER, description: 'Approve material scope/cost change orders.', triggerCondition: 'CHANGE_ORDER_REQUESTED', displayOrder: 1 },
  { projectStage: ProjectStage.WARRANTY_PERIOD, actionType: AdminActionType.FLAG_QUALITY_ISSUE, description: 'Track warranty defect and quality issue remediation.', triggerCondition: 'DEFECT_REPORTED', displayOrder: 1 },
  { projectStage: ProjectStage.DISPUTED, actionType: AdminActionType.INVESTIGATE_COMPLAINT, description: 'Investigate complaint submissions.', triggerCondition: 'ALWAYS', isPriority: true, displayOrder: 1 },
  { projectStage: ProjectStage.DISPUTED, actionType: AdminActionType.RESOLVE_DISPUTE, description: 'Resolve dispute and define outcome path.', triggerCondition: 'ALWAYS', isPriority: true, displayOrder: 2 },
];

async function seedNextStepConfig() {
  let inserted = 0;

  for (const item of nextStepSeeds) {
    await prisma.nextStepConfig.upsert({
      where: {
        projectStage_role_actionKey: {
          projectStage: item.projectStage,
          role: item.role,
          actionKey: item.actionKey,
        },
      },
      update: {
        actionLabel: item.actionLabel,
        description: item.description,
        isPrimary: item.isPrimary ?? false,
        isElective: item.isElective ?? false,
        requiresAction: item.requiresAction ?? true,
        estimatedDurationMinutes: item.estimatedDurationMinutes,
        displayOrder: item.displayOrder ?? 0,
      },
      create: {
        projectStage: item.projectStage,
        role: item.role,
        actionKey: item.actionKey,
        actionLabel: item.actionLabel,
        description: item.description,
        isPrimary: item.isPrimary ?? false,
        isElective: item.isElective ?? false,
        requiresAction: item.requiresAction ?? true,
        estimatedDurationMinutes: item.estimatedDurationMinutes,
        displayOrder: item.displayOrder ?? 0,
      },
    });

    inserted++;
  }

  return inserted;
}

async function seedAdminTemplates() {
  let inserted = 0;

  for (const item of adminTemplateSeeds) {
    await prisma.adminNextStepTemplate.upsert({
      where: {
        projectStage_actionType: {
          projectStage: item.projectStage,
          actionType: item.actionType,
        },
      },
      update: {
        description: item.description,
        triggerCondition: item.triggerCondition,
        isPriority: item.isPriority ?? false,
        displayOrder: item.displayOrder ?? 0,
      },
      create: {
        projectStage: item.projectStage,
        actionType: item.actionType,
        description: item.description,
        triggerCondition: item.triggerCondition,
        isPriority: item.isPriority ?? false,
        displayOrder: item.displayOrder ?? 0,
      },
    });

    inserted++;
  }

  return inserted;
}

async function main() {
  console.log('Seeding NextStepConfig and AdminNextStepTemplate...');

  const [nextStepsCount, adminTemplatesCount] = await Promise.all([
    seedNextStepConfig(),
    seedAdminTemplates(),
  ]);

  const [nextStepsTotal, adminTemplatesTotal] = await Promise.all([
    prisma.nextStepConfig.count(),
    prisma.adminNextStepTemplate.count(),
  ]);

  console.log(`✓ Upserted ${nextStepsCount} next-step config rows.`);
  console.log(`✓ Upserted ${adminTemplatesCount} admin template rows.`);
  console.log(`Total NextStepConfig rows: ${nextStepsTotal}`);
  console.log(`Total AdminNextStepTemplate rows: ${adminTemplatesTotal}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
