'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { GeneralActionModal } from './general-action-modal';
import { parseDetailsTarget } from '@/hooks/use-next-step-modal-trigger';

interface ModalDispatcherProps {
  projectId?: string;
  userId?: string;
  role?: string;
  onDetailsNavigate?: (target: string) => void;
}

export function ModalDispatcher({
  projectId,
  userId,
  role,
  onDetailsNavigate,
}: ModalDispatcherProps) {
  const { state, closeModal } = useNextStepModal();
  const router = useRouter();

  const handleDetailsNavigation = useCallback(
    (target: string) => {
      if (onDetailsNavigate) {
        onDetailsNavigate(target);
        return;
      }

      const parsedTarget = parseDetailsTarget(target);
      if (!parsedTarget?.tab || !state.projectId) return;

      // Client details routes are keyed by projectId; professional routes use project-professional id.
      // Until we persist that id in modal state, only auto-route for client flows.
      if ((state.role || '').toUpperCase().includes('PROFESSIONAL')) return;

      const query = new URLSearchParams({ tab: parsedTarget.tab });
      router.push(`/projects/${state.projectId}?${query.toString()}`);

      if (parsedTarget.scrollToId) {
        setTimeout(() => {
          const el = document.getElementById(parsedTarget.scrollToId!);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }

      closeModal();
    },
    [closeModal, onDetailsNavigate, router, state.projectId, state.role]
  );

  // Route to correct modal based on actionKey
  const modalType = getModalType(state.actionKey || '');

  // For now, all actions render through GeneralActionModal
  // Future: add PaymentModal, QuoteModal, ContractModal
  if (modalType === 'general') {
    return (
      <GeneralActionModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
        onDetailsAction={handleDetailsNavigation}
      />
    );
  }

  // Payment/transfer actions
  if (modalType === 'payment') {
    return (
      <GeneralActionModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
        onDetailsAction={handleDetailsNavigation}
      />
    );
  }

  return null;
}

/**
 * Determines which modal template to use based on actionKey
 * Helps route to specialized modals (PaymentModal, QuoteModal, etc.) in future
 */
function getModalType(actionKey: string): 'general' | 'payment' | 'quote' | 'contract' {
  // Payment-related actions
  if (
    [
      'DEPOSIT_ESCROW_FUNDS',
      'APPROVE_MILESTONE',
      'AUTHORIZE_MATERIALS_WALLET',
    ].includes(actionKey)
  ) {
    return 'payment';
  }

  // Quote-related actions
  if (
    [
      'SUBMIT_QUOTE',
      'PREPARE_REVISED_QUOTE',
      'REVIEW_INCOMING_QUOTES',
      'COMPARE_QUOTES',
    ].includes(actionKey)
  ) {
    return 'quote';
  }

  // Contract-related actions
  if (
    [
      'REVIEW_CONTRACT',
      'SIGN_CONTRACT',
      'SUBMIT_CONTRACT',
    ].includes(actionKey)
  ) {
    return 'contract';
  }

  // Default to general modal
  return 'general';
}
