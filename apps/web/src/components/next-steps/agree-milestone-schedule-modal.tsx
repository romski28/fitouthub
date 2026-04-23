'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { completeNextStep, fetchPrimaryNextStep, invalidateNextStepCache } from '@/lib/next-steps';
import { ScheduleTab } from '@/app/professional-projects/[id]/tabs/schedule-tab';
import { WorkflowCompletionModal, type WaitingParty, type WorkflowNextStep } from '@/components/workflow-completion-modal';
import { getClientTabForAction } from '@/lib/client-workflow';
import { getProfessionalTabForAction } from '@/lib/professional-workflow';

interface AgreeMilestoneScheduleModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

interface ProjectDetails {
  id?: string;
  status?: string;
  currentStage?: string;
  projectProfessionalId?: string;
  [key: string]: string | number | boolean | undefined | null | Record<string, unknown>;
}

const inferWaitingParty = (actionKey?: string): WaitingParty | undefined => {
  if (!actionKey) return undefined;
  if (actionKey.includes('WAIT_FOR_PROFESSIONAL')) return 'professional';
  if (actionKey.includes('WAIT_FOR_CLIENT')) return 'client';
  if (actionKey.includes('WAIT_FOR_PLATFORM') || actionKey.includes('VERIFY')) return 'platform';
  return undefined;
};

const upsertTab = (path: string, tabValue: string) => {
  const [pathname, existingQuery = ''] = path.split('?');
  const query = new URLSearchParams(existingQuery);
  query.set('tab', tabValue);
  return `${pathname}?${query.toString()}`;
};

const extractProjectProfessionalId = (projectDetailsPath?: string): string | undefined => {
  if (!projectDetailsPath) return undefined;

  const [pathname] = projectDetailsPath.split('?');
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('professional-projects');
  if (idx < 0) return undefined;
  return parts[idx + 1];
};

export function AgreeMilestoneScheduleModal({
  isOpen,
  isLoading = false,
  onClose,
}: AgreeMilestoneScheduleModalProps) {
  const router = useRouter();
  const { state } = useNextStepModal();
  const { accessToken: clientAccessToken } = useAuth();
  const { accessToken: professionalAccessToken } = useProfessionalAuth();

  const [error, setError] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowModalCompletedLabel, setWorkflowModalCompletedLabel] = useState('');
  const [workflowModalNextStep, setWorkflowModalNextStep] = useState<WorkflowNextStep | null>(null);
  
  // Show loading immediately when modal opens
  const showLoadingInit = isOpen && (isLoading || scheduleLoading || !projectDetails);

  const roleUpper = (state.role || '').toUpperCase();
  const isProfessional = roleUpper.includes('PROFESSIONAL');
  const token = isProfessional ? professionalAccessToken : clientAccessToken;
  const projectId = state.projectId;
  const projectProfessionalId = extractProjectProfessionalId(state.projectDetailsPath);
  const nextStepCacheScope = `${isProfessional ? 'professional' : 'client'}-schedule-modal:${projectId || 'unknown'}`;

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      console.debug('[AgreeMilestoneScheduleModal] Opened', {
        actionKey: state.actionKey,
        isLoading,
        scheduleLoading,
        hasProjectDetails: !!projectDetails,
      });
    }
  }, [isOpen, state.actionKey, isLoading, scheduleLoading, projectDetails]);

  // Fetch project details to pass to ScheduleTab
  useEffect(() => {
    if (!isOpen || !projectId || !token) return;

    const fetchDetails = async () => {
      try {
        setScheduleLoading(true);
        setError(null);

        let url: string;
        if (isProfessional && projectProfessionalId) {
          url = `${API_BASE_URL}/professional/projects/${projectProfessionalId}`;
        } else {
          url = `${API_BASE_URL}/projects/${projectId}`;
        }

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to load project details');
        }

        const data = await response.json();
        setProjectDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project details');
      } finally {
        setScheduleLoading(false);
      }
    };

    void fetchDetails();
  }, [isOpen, projectId, projectProfessionalId, token, isProfessional]);

  const markStepCompleted = useCallback(async () => {
    if (!projectId || !token || !state.actionKey) return;

    await completeNextStep(projectId, state.actionKey, token, nextStepCacheScope);
    invalidateNextStepCache(projectId);
    state.onCompleted?.({ projectId, actionKey: state.actionKey });
  }, [nextStepCacheScope, projectId, state, token]);

  const getTabForAction = useCallback((actionKey?: string) => {
    if (!actionKey) return undefined;
    return isProfessional
      ? getProfessionalTabForAction(actionKey)
      : getClientTabForAction(actionKey);
  }, [isProfessional]);

  const openWorkflowModal = useCallback(async (completedLabel: string) => {
    if (!projectId || !token) return;

    try {
      const next = await fetchPrimaryNextStep(projectId, token, {
        cacheScope: nextStepCacheScope,
        forceRefresh: true,
      });

      setWorkflowModalCompletedLabel(completedLabel);
      setWorkflowModalNextStep(
        next
          ? {
              actionLabel: next.actionLabel,
              description: next.description,
              requiresAction: Boolean(next.requiresAction),
              tab: getTabForAction(next.actionKey),
              waitingFor: !next.requiresAction ? inferWaitingParty(next.actionKey) : undefined,
            }
          : null,
      );
      setWorkflowModalOpen(true);
    } catch {
      setWorkflowModalCompletedLabel(completedLabel);
      setWorkflowModalNextStep(null);
      setWorkflowModalOpen(true);
    }
  }, [getTabForAction, nextStepCacheScope, projectId, token]);

  const navigateToNextStepTab = useCallback(() => {
    const nextTab = workflowModalNextStep?.tab;
    if (!nextTab) return;

    if (state.projectDetailsPath) {
      router.push(upsertTab(state.projectDetailsPath, nextTab));
      return;
    }

    if (state.projectId) {
      router.push(`/projects/${state.projectId}?tab=${encodeURIComponent(nextTab)}`);
    }
  }, [router, state.projectDetailsPath, state.projectId, workflowModalNextStep?.tab]);

  const handleScheduleConfirmed = useCallback(async () => {
    try {
      await markStepCompleted();
      await openWorkflowModal(
        state.modalContent?.successTitle || 'Milestone schedule confirmed!',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm schedule');
    }
  }, [markStepCompleted, openWorkflowModal, state.modalContent?.successTitle]);

  const showMainModal = isOpen && !workflowModalOpen;

  if (!isOpen && !workflowModalOpen) return null;

  const title = state.modalContent?.title || 'Agree milestone schedule';
  const body = state.modalContent?.body ||
    (isProfessional
      ? 'Review and finalize the milestone schedule before client funding.'
      : 'Review and confirm the milestone schedule before funding escrow.');
  const imageUrl = state.modalContent?.imageUrl;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-all ${
          showMainModal ? 'visible bg-black/60 backdrop-blur-sm' : 'invisible bg-black/0'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
          {/* Loading state - shown immediately */}
          {showLoadingInit && (
            <div className="flex flex-col items-center justify-center px-6 py-14 min-h-[400px]">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
              <p className="text-slate-300">Loading milestone schedule...</p>
            </div>
          )}
          
          {/* Content state - shown when ready */}
          {!showLoadingInit && (
            <div className="max-h-[90vh] overflow-y-auto">
              {/* Header with optional image */}
              <div className="border-b border-slate-700 px-6 py-5 space-y-3">
                {imageUrl && (
                  <div className="relative h-48 w-full overflow-hidden rounded-lg mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt="Schedule agreement"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <h2 className="text-2xl font-bold text-emerald-300">{title}</h2>
                <p className="text-sm text-slate-200">{body}</p>
              </div>

              <div className="space-y-4 px-6 py-5">
                {error ? (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                    {error}
                  </div>
                ) : null}

                {!projectDetails ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    Project details unavailable. Please try again.
                  </div>
                ) : (
                  <ScheduleTab
                    projectId={projectId || ''}
                    projectProfessionalId={projectProfessionalId || ''}
                    projectStatus={projectDetails?.status || ''}
                    projectCurrentStage={projectDetails?.currentStage || ''}
                    accessToken={token}
                    hideStartNegotiationPanel={true}
                    onScheduleConfirmed={handleScheduleConfirmed}
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <WorkflowCompletionModal
        isOpen={workflowModalOpen}
        completedLabel={workflowModalCompletedLabel}
        completedDescription={state.modalContent?.successBody || undefined}
        nextStep={workflowModalNextStep}
        showConfetti
        primaryActionLabel="Open next step"
        onNavigate={workflowModalNextStep?.tab ? () => {
          navigateToNextStepTab();
          onClose();
        } : undefined}
        onClose={() => {
          setWorkflowModalOpen(false);
          onClose();
        }}
      />
    </>
  );
}
