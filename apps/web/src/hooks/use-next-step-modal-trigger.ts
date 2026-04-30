'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useAuth } from '@/context/auth-context';
import type { NextStepModalContent } from '@/context/next-step-modal-context';

interface UseNextStepModalTriggerOptions {
  actionKey: string;
  projectId: string;
  progressReportId?: string;
  projectDetailsPath?: string;
  prefetchPath?: string;
  modalContent?: NextStepModalContent;
  projectStage?: string;
  onCompleted?: (payload?: { projectId?: string; actionKey?: string }) => void;
}

/**
 * Hook to create a click handler that opens the next-step modal
 * Usage: const handleClick = useNextStepModalTrigger({ actionKey, projectId });
 */
export function useNextStepModalTrigger(options: UseNextStepModalTriggerOptions) {
  const { openModal } = useNextStepModal();
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id;
  const userRole = user?.role || 'CLIENT';

  return useCallback(async () => {
    if (!userId) {
      console.warn('User not authenticated, cannot open modal');
      return;
    }

    const projectDetailsPath =
      options.projectDetailsPath || `/projects/${options.projectId}?tab=overview`;

    router.prefetch(options.prefetchPath || projectDetailsPath);

    await openModal(
      options.actionKey,
      options.projectId,
      projectDetailsPath,
      userId,
      userRole,
      options.modalContent,
      options.projectStage,
      options.onCompleted,
      options.progressReportId,
    );
  }, [openModal, router, userId, userRole, options.actionKey, options.prefetchPath, options.projectDetailsPath, options.projectId, options.progressReportId, options.modalContent, options.projectStage, options.onCompleted]);
}

/**
 * Parse detailsTarget JSON and navigate to the specified tab/section
 */
export function parseDetailsTarget(
  target: string | undefined
): { tab?: string; scrollToId?: string } | null {
  if (!target) return null;

  try {
    return JSON.parse(target);
  } catch {
    console.warn('Invalid detailsTarget format:', target);
    return null;
  }
}

/**
 * Navigate to a project detail tab and optionally scroll to an element
 * Usage: navigateToDetailsTab(router, projectId, { tab: 'quotes', scrollToId: 'quote-123' })
 */
export async function navigateToDetailsTab(
  router: { push: (href: string) => void },
  projectId: string,
  target: { tab?: string; scrollToId?: string }
) {
  if (!target.tab) return;

  // Navigate to project detail page with tab query param
  const url = `/projects/${projectId}?tab=${target.tab}`;
  router.push(url);

  // If a scroll target is specified, scroll to it after a small delay
  if (target.scrollToId) {
    setTimeout(() => {
      const element = document.getElementById(target.scrollToId!);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
}
