export type ClientTimelineStep = {
  id: string;
  title: string;
  description: string;
  actionKeys: string[];
};

export const clientActionTabMap: Record<string, string> = {
  INVITE_PROFESSIONALS: 'professionals',
  REVIEW_INCOMING_QUOTES: 'professionals',
  COMPARE_QUOTES: 'professionals',
  SELECT_PROFESSIONAL: 'professionals',
  REQUEST_SITE_VISIT: 'site-access',
  CONFIRM_SITE_VISIT: 'site-access',
  REVIEW_CONTRACT: 'contract',
  SIGN_CONTRACT: 'contract',
  DEPOSIT_ESCROW_FUNDS: 'financials',
  REVIEW_PAYMENT_REQUEST: 'financials',
  AUTHORIZE_MATERIALS_WALLET: 'financials',
  REVIEW_MATERIALS_PURCHASE: 'financials',
  CONFIRM_START_DATE: 'schedule',
  CONFIRM_SCHEDULE: 'schedule',
  CONFIRM_START_DETAILS: 'schedule',
  REVIEW_PROGRESS: 'schedule',
  APPROVE_MILESTONE: 'schedule',
  CONFIRM_NEXT_PHASE: 'schedule',
  SCHEDULE_FINAL_INSPECTION: 'schedule',
  APPROVE_FINAL_WORK: 'schedule',
  REPORT_DEFECT: 'schedule',
};

export const clientTimelineSteps: ClientTimelineStep[] = [
  {
    id: 'created-invite',
    title: 'Project Created & Invite',
    description: 'Create the project and invite professionals to bid.',
    actionKeys: ['WAIT_FOR_QUOTES', 'INVITE_PROFESSIONALS'],
  },
  {
    id: 'bidding',
    title: 'Bidding & Quote Intake',
    description: 'Collect and review incoming quotations.',
    actionKeys: ['REVIEW_INCOMING_QUOTES', 'REQUEST_SITE_VISIT'],
  },
  {
    id: 'site-visit',
    title: 'Site Visit Coordination',
    description: 'Confirm access and schedule site visit where needed.',
    actionKeys: ['CONFIRM_SITE_VISIT'],
  },
  {
    id: 'compare',
    title: 'Compare Quotes',
    description: 'Review and compare final offers.',
    actionKeys: ['COMPARE_QUOTES'],
  },
  {
    id: 'select',
    title: 'Select Professional',
    description: 'Choose who will execute the project.',
    actionKeys: ['SELECT_PROFESSIONAL'],
  },
  {
    id: 'contract',
    title: 'Agreement & Sign-off',
    description: 'Review terms and complete agreement signatures.',
    actionKeys: ['REVIEW_CONTRACT', 'SIGN_CONTRACT'],
  },
  {
    id: 'escrow-funding',
    title: 'Escrow Funding',
    description: 'Deposit funds to escrow before work starts.',
    actionKeys: ['DEPOSIT_ESCROW_FUNDS'],
  },
  {
    id: 'pre-work',
    title: 'Pre-work Setup',
    description: 'Confirm start details before works begin.',
    actionKeys: ['CONFIRM_START_DETAILS'],
  },
  {
    id: 'work-progress',
    title: 'Work In Progress',
    description: 'Track updates and monitor delivery progress.',
    actionKeys: ['REVIEW_PROGRESS'],
  },
  {
    id: 'milestones',
    title: 'Milestone Review',
    description: 'Approve milestones and confirm next phase.',
    actionKeys: ['APPROVE_MILESTONE', 'CONFIRM_NEXT_PHASE'],
  },
  {
    id: 'final-inspection-plan',
    title: 'Final Inspection Planning',
    description: 'Arrange final walkthrough and close-out checks.',
    actionKeys: ['SCHEDULE_FINAL_INSPECTION'],
  },
  {
    id: 'handover',
    title: 'Final Approval & Handover',
    description: 'Approve final work and complete handover.',
    actionKeys: ['APPROVE_FINAL_WORK'],
  },
  {
    id: 'warranty',
    title: 'Warranty Period',
    description: 'Monitor defects and warranty support.',
    actionKeys: ['ENTER_WARRANTY_PERIOD', 'REPORT_DEFECT'],
  },
];

export const getClientTabForAction = (actionKey?: string): string | undefined => {
  if (!actionKey) return undefined;
  return clientActionTabMap[actionKey];
};
