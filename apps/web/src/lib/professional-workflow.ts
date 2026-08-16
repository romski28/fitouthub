export const professionalActionTabMap: Record<string, string> = {
  REQUEST_SITE_ACCESS: 'overview',
  INSPECT_SITE: 'overview',
  REQUEST_SITE_RESCHEDULE: 'overview',
  DECLINE_PROJECT: 'overview',
  SUBMIT_QUOTE: 'overview',
  ATTEND_SITE_VISIT: 'overview',
  PREPARE_REVISED_QUOTE: 'overview',
  REPLY_TO_INVITATION: 'overview',
  SUBMIT_PROGRESS_UPDATE: 'schedule',
  CONFIRM_START_DATE: 'schedule',
  CONFIRM_SCHEDULE: 'schedule',
  START_PROJECT: 'schedule',
  MAKE_MILESTONE_1_CLAIM: 'financials',
  WAIT_FOR_CLIENT_FUNDS: 'schedule',
  WAIT_FOR_MATERIALS_PROCESS: 'schedule',
  RESPOND_TO_MATERIALS_QUESTIONS: 'financials',
  REQUEST_FINAL_WALKTHROUGH: 'schedule',
  ADDRESS_FINAL_ITEMS: 'schedule',
  PROVIDE_WARRANTY_DETAILS: 'schedule',
  RESPOND_TO_DISPUTE: 'chat',
  AWAIT_MILESTONE_APPROVAL: 'financials',
  PROCEED_TO_NEXT_PHASE: 'financials',
  SUBMIT_PAYMENT_REQUEST: 'financials',
};

export function getProfessionalTabForAction(actionKey?: string): string | undefined {
  if (!actionKey) return undefined;
  return professionalActionTabMap[actionKey];
}

export function getProfessionalShowMeHref(projectProfessionalId: string, actionKey: string) {
  const tab = getProfessionalTabForAction(actionKey) || 'overview';
  return `/professional-projects/${projectProfessionalId}?tab=${encodeURIComponent(tab)}`;
}