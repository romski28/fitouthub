'use client';

import React from 'react';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useAuth } from '@/context/auth-context';
import MaterialsClaimReviewModal from '@/components/materials-claim-review-modal';

interface ReviewMaterialsClaimModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function ReviewMaterialsClaimModal({
  isOpen,
  onClose,
}: ReviewMaterialsClaimModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();

  if (!isOpen || !state.projectId || !accessToken) return null;

  return (
    <MaterialsClaimReviewModal
      isOpen={isOpen}
      onClose={onClose}
      projectId={state.projectId}
      accessToken={accessToken}
      currentUserRole="client"
      modalContent={state.modalContent}
      onCompleted={() => {
        state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      }}
    />
  );
}
