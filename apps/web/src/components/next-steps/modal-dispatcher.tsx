'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { getClientTabForAction } from '@/lib/client-workflow';
import { getProfessionalTabForAction } from '@/lib/professional-workflow';
import { GeneralActionModal } from './general-action-modal';
import { QuoteActionModal } from './quote-action-modal';
import { ReviewQuotesModal } from './review-quotes-modal';
import { ContractActionModal } from './contract-action-modal';
import { StartDateActionModal } from './start-date-action-modal';
import { AgreeMilestoneScheduleModal } from './agree-milestone-schedule-modal';
import { DepositEscrowModal } from './deposit-escrow-modal';
import { WalletTransferModal } from './wallet-transfer-modal';
import { parseDetailsTarget } from '@/hooks/use-next-step-modal-trigger';

interface ModalDispatcherProps {
  onDetailsNavigate?: (target: string) => void;
}

export function ModalDispatcher({
  onDetailsNavigate,
}: Omit<ModalDispatcherProps, 'projectId' | 'userId' | 'role'>) {
  const { state, closeModal } = useNextStepModal();
  const router = useRouter();
  const fallbackTab = (state.role || '').toUpperCase().includes('PROFESSIONAL')
    ? getProfessionalTabForAction(state.actionKey)
    : getClientTabForAction(state.actionKey);
  const fallbackDetailsTarget = fallbackTab ? JSON.stringify({ tab: fallbackTab }) : undefined;

  const handleOpenProject = useCallback(() => {
    if (state.projectDetailsPath) {
      router.push(state.projectDetailsPath);
      closeModal();
      return;
    }

    if (!state.projectId) return;

    router.push(`/projects/${state.projectId}?tab=overview`);
    closeModal();
  }, [closeModal, router, state.projectDetailsPath, state.projectId]);

  const handleDetailsNavigation = useCallback(
    (target: string) => {
      if (onDetailsNavigate) {
        onDetailsNavigate(target);
        return;
      }

      const parsedTarget = parseDetailsTarget(target);
      if (!parsedTarget?.tab) return;

      if ((state.role || '').toUpperCase().includes('PROFESSIONAL')) {
        if (!state.projectDetailsPath) return;

        const [pathname, existingQuery = ''] = state.projectDetailsPath.split('?');
        const query = new URLSearchParams(existingQuery);
        query.set('tab', parsedTarget.tab);
        router.push(`${pathname}?${query.toString()}`);
        closeModal();
        return;
      }

      if (!state.projectId) return;

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
    [closeModal, onDetailsNavigate, router, state.projectDetailsPath, state.projectId, state.role]
  );

  // Route to correct modal based on actionKey
  const modalType = getModalType(state.actionKey || '');

  // Defensive routing: log for debugging
  useEffect(() => {
    if (state.isOpen && state.actionKey) {
      console.warn(`[ModalDispatcher] 🚀 OPENING MODAL:
  - actionKey: "${state.actionKey}"
  - modalType: "${modalType}"
  - role: "${state.role}"
  - projectId: "${state.projectId}"`);
    }
  }, [state.isOpen, state.actionKey, modalType, state.role, state.projectId]);

  // Keep page scroll locked while any next-step modal is open.
  useEffect(() => {
    if (!state.isOpen) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarCompensation = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarCompensation > 0) {
      body.style.paddingRight = `${scrollbarCompensation}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [state.isOpen]);

  // For now, all actions render through GeneralActionModal
  // Future: add PaymentModal, QuoteModal, ContractModal
  if (modalType === 'general') {
    return (
      <GeneralActionModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
        detailsTargetFallback={fallbackDetailsTarget}
        onOpenProject={handleOpenProject}
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
        detailsTargetFallback={fallbackDetailsTarget}
        onOpenProject={handleOpenProject}
        onDetailsAction={handleDetailsNavigation}
      />
    );
  }

  if (modalType === 'wallet-transfer') {
    return (
      <WalletTransferModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
      />
    );
  }

  if (modalType === 'quote') {
    return (
      <QuoteActionModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
      />
    );
  }

  if (modalType === 'review-quotes') {
    return (
      <ReviewQuotesModal
        isOpen={state.isOpen}
        onClose={closeModal}
      />
    );
  }

  if (modalType === 'contract') {
    return (
      <ContractActionModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
      />
    );
  }

  if (modalType === 'start-date') {
    return (
      <StartDateActionModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
      />
    );
  }

  if (modalType === 'agree-milestone-schedule') {
    return (
      <AgreeMilestoneScheduleModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
      />
    );
  }

  if (modalType === 'deposit-escrow') {
    return (
      <DepositEscrowModal
        isOpen={state.isOpen}
        isLoading={state.isLoading}
        onClose={closeModal}
      />
    );
  }

  return null;
}

/**
 * Determines which modal template to use based on actionKey
 * Helps route to specialized modals (PaymentModal, QuoteModal, etc.) in future
 */
function getModalType(actionKey: string): 'general' | 'payment' | 'wallet-transfer' | 'deposit-escrow' | 'quote' | 'review-quotes' | 'contract' | 'start-date' | 'agree-milestone-schedule' {
  // Escrow deposit — has its own OTP flow
  if (actionKey === 'DEPOSIT_ESCROW_FUNDS') {
    return 'deposit-escrow';
  }

  if (actionKey === 'AUTHORIZE_MATERIALS_WALLET') {
    return 'wallet-transfer';
  }

  // Other payment-related actions
  if (['APPROVE_MILESTONE'].includes(actionKey)) {
    return 'payment';
  }

  // Professional: submit/revise quote
  if (['SUBMIT_QUOTE', 'PREPARE_REVISED_QUOTE'].includes(actionKey)) {
    return 'quote';
  }

  // Client: review received quotes
  if (['REVIEW_INCOMING_QUOTES', 'COMPARE_QUOTES'].includes(actionKey)) {
    return 'review-quotes';
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

  if (['CONFIRM_START_DATE', 'CONFIRM_START_DETAILS'].includes(actionKey)) {
    return 'start-date';
  }

  if (['CONFIRM_SCHEDULE'].includes(actionKey)) {
    return 'agree-milestone-schedule';
  }

  // Default to general modal
  return 'general';
}
