'use client';

import React from 'react';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { AuthModal } from '@/components/auth-modal';

export const GlobalAuthModal: React.FC = () => {
  const { modalState, closeModal } = useAuthModalControl();

  return (
    <AuthModal
      isOpen={modalState.isOpen}
      onClose={closeModal}
      defaultTab={modalState.tab}
    />
  );
};
