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
  // Runtime-generated step (no DB row at a fixed stage). Fallback ensures the modal
  // shows content regardless of which project stage triggers the payment request.
  REVIEW_PAYMENT_REQUEST: {
    title: 'Review payment request',
    body: 'The professional has submitted a payment request. Review the details and approve or reject.',
    detailsBody:
      'Check the request against the agreed payment schedule and milestone evidence before approving. Rejecting will notify the professional to resubmit.',
    successTitle: 'Payment request reviewed',
    successBody: 'Your decision has been submitted.',
    successNextStepBody: 'The professional will be notified of your decision.',
    primaryButtonLabel: 'Go to financials',
    secondaryButtonLabel: 'Later',
    primaryActionType: 'navigate_tab',
    primaryActionTarget: '{"tab":"financials"}',
    secondaryActionType: 'close_modal',
    detailsTarget: '{"tab":"financials"}',
  },
  // Runtime-generated step (fires during CONTRACT_PHASE after professional submits receipts).
  // A DB row is also inserted by MANUAL_UPDATE_NEXT_STEP_WALLET_TRANSFER_MODAL.sql but this
  // client-side fallback guards against any stage mismatch in the server lookup.
  REVIEW_MATERIALS_PURCHASE: {
    title: 'Review materials purchase receipts',
    body: 'The professional has submitted purchase evidence. Review and approve the confirmed amount — any unspent balance will be returned to your escrow.',
    detailsBody:
      'Carefully review each receipt. Only approve amounts that match actual project materials. Unspent funds are automatically returned to your escrow wallet.',
    successTitle: 'Purchase receipts approved!',
    successBody: 'The confirmed amount has been released to the professional\'s withdrawable wallet.',
    successNextStepBody: 'Any unspent balance has been returned to your escrow.',
    primaryButtonLabel: 'Review now',
    secondaryButtonLabel: 'Later',
    primaryActionType: 'navigate_tab',
    primaryActionTarget: '{"tab":"financials"}',
    secondaryActionType: 'close_modal',
    detailsTarget: '{"tab":"financials"}',
  },
  RESPOND_TO_MATERIALS_QUESTIONS: {
    title: 'Respond to materials claim questions',
    body: 'The client has questions about your materials claim. Reply in the claim thread so they can authorize the transfer.',
    detailsBody:
      'Open Financials, then open the pending claim and use the scoped claim conversation to answer questions. Keep all clarifications in that thread for audit history.',
    successTitle: 'Great, keep the conversation going',
    successBody: 'Your response has been sent in the claim thread.',
    successNextStepBody: 'The client can authorize transfer once questions are resolved.',
    primaryButtonLabel: 'Open financials',
    secondaryButtonLabel: 'Later',
    primaryActionType: 'navigate_tab',
    primaryActionTarget: '{"tab":"financials"}',
    secondaryActionType: 'close_modal',
    detailsTarget: '{"tab":"financials"}',
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
