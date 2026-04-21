export const professionalActionTabMap: Record<string, string> = {
  REQUEST_SITE_ACCESS: 'site-access',
  ATTEND_SITE_VISIT: 'site-access',
  PREPARE_REVISED_QUOTE: 'site-access',
  SUBMIT_QUOTE: 'overview',
  REPLY_TO_INVITATION: 'overview',
  REVIEW_CONTRACT: 'contract',
  SIGN_CONTRACT: 'contract',
  SUBMIT_PROGRESS_UPDATE: 'schedule',
  CONFIRM_START_DATE: 'schedule',
  CONFIRM_SCHEDULE: 'schedule',
  REQUEST_FINAL_WALKTHROUGH: 'schedule',
  ADDRESS_FINAL_ITEMS: 'schedule',
  PROVIDE_WARRANTY_DETAILS: 'schedule',
  RESPOND_TO_DISPUTE: 'chat',
};

export function getProfessionalTabForAction(actionKey?: string): string | undefined {
  if (!actionKey) return undefined;
  return professionalActionTabMap[actionKey];
}

export function getProfessionalShowMeHref(projectProfessionalId: string, actionKey: string) {
  const tab = getProfessionalTabForAction(actionKey) || 'overview';
  return `/professional-projects/${projectProfessionalId}?tab=${encodeURIComponent(tab)}`;
}