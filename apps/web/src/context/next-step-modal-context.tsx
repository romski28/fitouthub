'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { API_BASE_URL } from '@/config/api';

export interface NextStepModalContent {
  title?: string;
  body?: string;
  detailsBody?: string;
  successTitle?: string;
  successBody?: string;
  successNextStepBody?: string;
  imageUrl?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  primaryActionType?: string;
  primaryActionTarget?: string;
  secondaryActionType?: string;
  secondaryActionTarget?: string;
  detailsTarget?: string;
}

export interface NextStepModalState {
  isOpen: boolean;
  isLoading: boolean;
  actionKey?: string;
  projectId?: string;
  userId?: string;
  role?: string;
  projectStage?: string;
  modalContent?: NextStepModalContent;
  error?: string;
}

interface NextStepModalContextType {
  state: NextStepModalState;
  openModal: (
    actionKey: string,
    projectId: string,
    userId: string,
    role: string,
    modalContent?: NextStepModalContent,
    projectStage?: string,
  ) => Promise<void>;
  closeModal: () => void;
  updateModalContent: (content: NextStepModalContent) => void;
  setLoading: (loading: boolean) => void;
}

const NextStepModalContext = createContext<NextStepModalContextType | undefined>(undefined);

export function NextStepModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NextStepModalState>({
    isOpen: false,
    isLoading: false,
  });

  const openModal = useCallback(
    async (
      actionKey: string,
      projectId: string,
      userId: string,
      role: string,
      modalContent?: NextStepModalContent,
      projectStage?: string,
    ) => {
      // Open modal immediately with loading state
      setState({
        isOpen: true,
        isLoading: true,
        actionKey,
        projectId,
        userId,
        role,
        projectStage,
        modalContent,
        error: undefined,
      });

      // Fetch modal content in background
      try {
        // This will be called from project details, where project data is already loaded
        // For now, we'll just mark it as ready. The modal content is already available
        // from the NextStepAction passed to the modal trigger
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to open modal',
        }));
      }
    },
    []
  );

  const closeModal = useCallback(() => {
    setState({
      isOpen: false,
      isLoading: false,
      actionKey: undefined,
      projectId: undefined,
      userId: undefined,
      role: undefined,
      projectStage: undefined,
      modalContent: undefined,
      error: undefined,
    });
  }, []);

  const updateModalContent = useCallback((content: NextStepModalContent) => {
    setState((prev) => ({
      ...prev,
      modalContent: content,
    }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading: loading,
    }));
  }, []);

  return (
    <NextStepModalContext.Provider
      value={{
        state,
        openModal,
        closeModal,
        updateModalContent,
        setLoading,
      }}
    >
      {children}
    </NextStepModalContext.Provider>
  );
}

export function useNextStepModal() {
  const context = useContext(NextStepModalContext);
  if (!context) {
    throw new Error('useNextStepModal must be used within NextStepModalProvider');
  }
  return context;
}
