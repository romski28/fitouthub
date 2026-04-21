import type { NextStepAction } from '@/lib/next-steps';

export type NextStepModalContent = NonNullable<NextStepAction['modalContent']>;

const FALLBACK_MODAL_CONTENT: Record<string, NextStepModalContent> = {
  AUTHORIZE_MATERIALS_WALLET: {
    title: 'Transfer materials funds',
    body: 'OK {clientName}, you need to move {amount} from your wallet to {professionalName}\'s holding wallet.',
    detailsBody:
      'This amount is moved from {clientName}\'s wallet to {professionalName}\'s materials holding wallet. It is not withdrawable until you review and approve submitted purchase invoices.',
    successTitle: 'Funds have been transferred!',
    successBody: '{amount} has been moved to {professionalName}\'s holding wallet.',
    successNextStepBody: "What\'s next? We are working on it!",
    imageUrl: '/assets/images/chatbot-avatar-icon.webp',
    primaryButtonLabel: 'OK',
    secondaryButtonLabel: 'Cancel',
    primaryActionType: 'confirm_transfer',
    secondaryActionType: 'close_modal',
  },
};

export function resolveNextStepModalContent(
  actionKey: string,
  serverContent?: NextStepAction['modalContent'],
): NextStepModalContent {
  const fallback = FALLBACK_MODAL_CONTENT[actionKey] || {};
  return {
    ...fallback,
    ...(serverContent || {}),
  };
}

export function applyNextStepModalTemplate(
  template: string | undefined,
  variables: Record<string, string>,
): string {
  if (!template) return '';
  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    output = output.replaceAll(`{${key}}`, value);
  }
  return output;
}
