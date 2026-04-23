'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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
  projectDetailsPath?: string;
  userId?: string;
  role?: string;
  projectStage?: string;
  modalContent?: NextStepModalContent;
  error?: string;
  onCompleted?: (payload?: { projectId?: string; actionKey?: string }) => void;
}

interface NextStepModalContextType {
  state: NextStepModalState;
  openModal: (
    actionKey: string,
    projectId: string,
    projectDetailsPath: string | undefined,
    userId: string,
    role: string,
    modalContent?: NextStepModalContent,
    projectStage?: string,
    onCompleted?: (payload?: { projectId?: string; actionKey?: string }) => void,
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
      projectDetailsPath: string | undefined,
      userId: string,
      role: string,
      modalContent?: NextStepModalContent,
      projectStage?: string,
      onCompleted?: (payload?: { projectId?: string; actionKey?: string }) => void,
    ) => {
      console.debug(`[NextStepModalContext] openModal called for action: ${actionKey}`);
      
      // Open modal immediately with loading state
      setState({
        isOpen: true,
        isLoading: true,
        actionKey,
        projectId,
        projectDetailsPath,
        userId,
        role,
        projectStage,
        modalContent,
        error: undefined,
        onCompleted,
      });

      // Modal content is already provided; keep loading state visible for 200ms for smooth UX
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      console.debug(`[NextStepModalContext] Transitioning isLoading from true to false for action: ${actionKey}`);
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    },
    []
  );

  const closeModal = useCallback(() => {
    setState({
      isOpen: false,
      isLoading: false,
      actionKey: undefined,
      projectId: undefined,
      projectDetailsPath: undefined,
      userId: undefined,
      role: undefined,
      projectStage: undefined,
      modalContent: undefined,
      error: undefined,
      onCompleted: undefined,
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
