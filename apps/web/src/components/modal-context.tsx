'use client';

import React, { ReactNode, useState } from 'react';

export type ModalContextType = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export const ModalContext = React.createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ModalContext.Provider value={{ isOpen, onOpen: () => setIsOpen(true), onClose: () => setIsOpen(false) }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = React.useContext(ModalContext);
  if (!context) throw new Error('useModal must be used within ModalProvider');
  return context;
}
