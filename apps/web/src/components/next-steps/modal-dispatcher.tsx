'use client';

import { useCallback } from 'react';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { GeneralActionModal } from './general-action-modal';

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

  const handleDetailsNavigation = useCallback(
    (target: string) => {
      if (onDetailsNavigate) {
        onDetailsNavigate(target);
      }
      // Don't close the modal yet - let the parent decide
    },
    [onDetailsNavigate]
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
