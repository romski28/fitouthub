'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AuthModalState {
  isOpen: boolean;
  tab: 'join' | 'login';
}

interface AuthModalControlContextType {
  modalState: AuthModalState;
  openJoinModal: () => void;
  openLoginModal: () => void;
  closeModal: () => void;
}

const AuthModalControlContext = createContext<AuthModalControlContextType | undefined>(
  undefined
);

export const AuthModalControlProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [modalState, setModalState] = useState<AuthModalState>({
    isOpen: false,
    tab: 'login',
  });

  const openJoinModal = () =>
    setModalState({ isOpen: true, tab: 'join' });
  const openLoginModal = () =>
    setModalState({ isOpen: true, tab: 'login' });
  const closeModal = () =>
    setModalState((prev) => ({ ...prev, isOpen: false }));

  return (
    <AuthModalControlContext.Provider
      value={{
        modalState,
        openJoinModal,
        openLoginModal,
        closeModal,
      }}
    >
      {children}
    </AuthModalControlContext.Provider>
  );
};

export const useAuthModalControl = () => {
  const context = useContext(AuthModalControlContext);
  if (!context) {
    throw new Error(
      'useAuthModalControl must be used within AuthModalControlProvider'
    );
  }
  return context;
};
