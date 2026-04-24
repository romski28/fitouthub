'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { completeNextStep, fetchPrimaryNextStep, invalidateNextStepCache } from '@/lib/next-steps';
import { StartDateNegotiationPanel, type StartProposalRow } from '@/components/start-date-negotiation-panel';
import { WorkflowCompletionModal, type WaitingParty, type WorkflowNextStep } from '@/components/workflow-completion-modal';
import { getClientTabForAction } from '@/lib/client-workflow';
import { getProfessionalTabForAction } from '@/lib/professional-workflow';

interface StartDateActionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
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

export function StartDateActionModal({
  isOpen,
  isLoading = false,
  onClose,
}: StartDateActionModalProps) {
  const router = useRouter();
  const { state } = useNextStepModal();
  const { accessToken: clientAccessToken } = useAuth();
  const { accessToken: professionalAccessToken } = useProfessionalAuth();

  const [error, setError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<StartProposalRow[]>([]);
  const [proposalDate, setProposalDate] = useState('');
  const [proposalTime, setProposalTime] = useState('09:00');
  const [proposalDurationHours, setProposalDurationHours] = useState('4');
  const [proposalNotes, setProposalNotes] = useState('');
  const [proposalFormInitialized, setProposalFormInitialized] = useState(false);
  const [prefilledFromQuote, setPrefilledFromQuote] = useState(false);
  const [proposalResponseNotes, setProposalResponseNotes] = useState<Record<string, string>>({});
  const [updateDateByProposal, setUpdateDateByProposal] = useState<Record<string, string>>({});
  const [updateTimeByProposal, setUpdateTimeByProposal] = useState<Record<string, string>>({});
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowModalCompletedLabel, setWorkflowModalCompletedLabel] = useState('');
  const [workflowModalNextStep, setWorkflowModalNextStep] = useState<WorkflowNextStep | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Show loading immediately when modal opens
  const showLoadingInit = isOpen && (isLoading || (proposalLoading && proposals.length === 0) || !proposalFormInitialized);

  const roleUpper = (state.role || '').toUpperCase();
  const isProfessional = roleUpper.includes('PROFESSIONAL');
  const viewerRole = isProfessional ? 'professional' : 'client';
  const token = isProfessional ? professionalAccessToken : clientAccessToken;
  const projectId = state.projectId;
  const projectProfessionalId = extractProjectProfessionalId(state.projectDetailsPath);
  const nextStepCacheScope = `${isProfessional ? 'professional' : 'client'}-schedule-modal:${projectId || 'unknown'}`;

  const latestProposal = useMemo(() => proposals[0], [proposals]);

  // Debug logging
  useEffect(() => {
    if (isOpen) {
      console.debug('[StartDateActionModal] Opened', {
        actionKey: state.actionKey,
        isLoading,
        proposalLoading,
        proposalFormInitialized,
      });
    }
  }, [isOpen, state.actionKey, isLoading, proposalLoading, proposalFormInitialized]);

  const applyDefaultSchedule = useCallback((params: {
    scheduledAt?: string | null;
    durationMinutes?: number | null;
    notes?: string | null;
    prefilled: boolean;
  }) => {
    const { scheduledAt, durationMinutes, notes, prefilled } = params;
    if (!scheduledAt) return;

    const proposedAt = new Date(scheduledAt);
    if (Number.isNaN(proposedAt.getTime())) return;

    const pad = (value: number) => String(value).padStart(2, '0');
    setProposalDate(
      `${proposedAt.getFullYear()}-${pad(proposedAt.getMonth() + 1)}-${pad(proposedAt.getDate())}`,
    );
    setProposalTime(`${pad(proposedAt.getHours())}:${pad(proposedAt.getMinutes())}`);

    if (durationMinutes && durationMinutes > 0) {
      const hours = durationMinutes / 60;
      setProposalDurationHours(
        Number.isInteger(hours)
          ? String(hours)
          : hours.toFixed(1).replace(/\.0$/, ''),
      );
    }

    if (notes) {
      setProposalNotes(notes);
    }

    setPrefilledFromQuote(prefilled);
    setProposalFormInitialized(true);
  }, []);

  const hydrateFromQuoteDefaults = useCallback(async () => {
    if (!isProfessional || !projectProfessionalId || !token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/professional/projects/${projectProfessionalId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;

      const detail = await response.json();
      applyDefaultSchedule({
        scheduledAt: detail?.quoteEstimatedStartAt,
        durationMinutes: detail?.quoteEstimatedDurationMinutes,
        notes: detail?.quoteNotes,
        prefilled: true,
      });
    } catch {
      // Best-effort prefill only.
    }
  }, [applyDefaultSchedule, isProfessional, projectProfessionalId, token]);

  useEffect(() => {
    if (!isOpen) return;

    // Prevent stale values when modal is reopened for another project/state.
    setProposalDate('');
    setProposalTime('09:00');
    setProposalDurationHours('4');
    setProposalNotes('');
    setProposalFormInitialized(false);
    setPrefilledFromQuote(false);
    setProposalResponseNotes({});
    setUpdateDateByProposal({});
    setUpdateTimeByProposal({});
    setShowDetails(false);
  }, [isOpen, projectId]);

  useEffect(() => {
    if (proposalFormInitialized) return;

    if (latestProposal) {
      applyDefaultSchedule({
        scheduledAt: latestProposal.proposedStartAt,
        durationMinutes: latestProposal.durationMinutes,
        notes: latestProposal.notes,
        prefilled: false,
      });
      return;
    }

    if (!proposalLoading && proposals.length === 0) {
      void hydrateFromQuoteDefaults();
    }
  }, [
    applyDefaultSchedule,
    hydrateFromQuoteDefaults,
    latestProposal,
    proposalFormInitialized,
    proposalLoading,
    proposals.length,
  ]);

  const fetchStartProposals = useCallback(async () => {
    if (!projectId || !token) return;

    try {
      setProposalLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/start-proposals`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to load start proposal');
      }

      if (!response.ok) {
        setProposals([]);
        return;
      }

      const data = await response.json();
      const rows: StartProposalRow[] = Array.isArray(data) ? data : [];
      rows.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setProposals(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load start proposal');
    } finally {
      setProposalLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    if (!isOpen || !projectId || !token) return;
    void fetchStartProposals();
  }, [fetchStartProposals, isOpen, projectId, token]);

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

  const navigateToProjectDetails = useCallback(() => {
    if (state.projectDetailsPath) {
      router.push(upsertTab(state.projectDetailsPath, 'schedule'));
      onClose();
      return;
    }

    if (state.projectId) {
      router.push(`/projects/${state.projectId}?tab=schedule`);
      onClose();
    }
  }, [router, state.projectDetailsPath, state.projectId, onClose]);

  const handleSubmitNew = useCallback(async () => {
    if (!projectId || !token) {
      setError('Authentication required');
      return;
    }

    if (!proposalDate || !proposalTime) {
      setError('Please choose a proposed start date and time');
      return;
    }

    const durationHours = Number(proposalDurationHours);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      setError('Please enter a valid duration');
      return;
    }

    const proposedAt = new Date(`${proposalDate}T${proposalTime}`);
    if (Number.isNaN(proposedAt.getTime())) {
      setError('Please enter a valid start date and time');
      return;
    }

    try {
      setProposalSubmitting(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/start-proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduledAt: proposedAt.toISOString(),
          durationMinutes: Math.round(durationHours * 60),
          notes: proposalNotes || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send start proposal');
      }

      if (data?.proposal) {
        setProposals((prev) => [data.proposal, ...prev.filter((p) => p.id !== data.proposal.id)]);
      }
      await markStepCompleted();
      await openWorkflowModal(
        state.modalContent?.successTitle || 'Start details sent successfully!',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send start proposal');
    } finally {
      setProposalSubmitting(false);
    }
  }, [markStepCompleted, openWorkflowModal, projectId, proposalDate, proposalDurationHours, proposalNotes, proposalTime, state.modalContent?.successTitle, token]);

  const handleRespond = useCallback(async (proposalId: string, status: 'accepted' | 'updated') => {
    if (!projectId || !token) {
      setError('Authentication required');
      return;
    }

    if (status === 'updated') {
      const date = updateDateByProposal[proposalId];
      const time = updateTimeByProposal[proposalId] || '09:00';
      const updatedAt = date ? new Date(`${date}T${time}`) : null;
      if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
        setError('Please provide a valid updated start date and time.');
        return;
      }
    }

    try {
      setProposalBusyId(proposalId);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/projects/start-proposals/${proposalId}/respond`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          status === 'updated'
            ? {
                status: 'updated',
                updatedScheduledAt: (() => {
                  const date = updateDateByProposal[proposalId];
                  const time = updateTimeByProposal[proposalId] || '09:00';
                  if (!date) return undefined;
                  return new Date(`${date}T${time}`).toISOString();
                })(),
                responseNotes: proposalResponseNotes[proposalId] || undefined,
              }
            : {
                status,
                responseNotes: proposalResponseNotes[proposalId] || undefined,
              },
        ),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to respond to proposal');
      }

      await fetchStartProposals();
      await markStepCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to proposal');
    } finally {
      setProposalBusyId(null);
    }
  }, [fetchStartProposals, markStepCompleted, projectId, proposalResponseNotes, token, updateDateByProposal, updateTimeByProposal]);

  const showMainModal = isOpen && !workflowModalOpen;

  if (!isOpen && !workflowModalOpen) return null;

  const title = state.modalContent?.title || (isProfessional ? 'Confirm start date' : 'Review start date');
  const body = state.modalContent?.body ||
    (isProfessional
      ? 'Confirm a realistic start date and time for client agreement. Duration is fixed from the agreed quote/proposal.'
      : 'Review and respond to the professional start-date proposal.');
  const detailsBody = state.modalContent?.detailsBody;
  const imageUrl = state.modalContent?.imageUrl;
  const hasDetails = Boolean(detailsBody);

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
        <div className="w-full max-w-4xl [perspective:1600px]">
        {showLoadingInit ? (
          <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex flex-col items-center justify-center px-6 py-14 min-h-[400px]">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
              <p className="text-slate-300">Loading start date options...</p>
            </div>
          </div>
        ) : (
          <div className="relative min-h-[420px] [transform-style:preserve-3d] transition-transform duration-500 ease-out" style={{ transform: showDetails ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]" aria-hidden={showDetails}>
              <div className="max-h-[90vh] overflow-y-auto">
                <div className="relative border-b border-slate-700 px-6 py-5 space-y-3">
                  {hasDetails && (
                    <button
                      type="button"
                      onClick={() => setShowDetails(true)}
                      className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-blue-300/60 bg-blue-500/20 text-lg font-semibold text-blue-100 transition hover:bg-blue-500/35"
                      aria-label="Show details"
                    >
                      i
                    </button>
                  )}
                  {imageUrl && (
                    <div className="relative h-48 w-full overflow-hidden rounded-lg mb-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Start date negotiation"
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

                  {!projectProfessionalId && isProfessional ? (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                      Project context is missing. Open the project details page and try again.
                    </div>
                  ) : null}

                  <StartDateNegotiationPanel
                    proposals={proposals}
                    proposalLoading={proposalLoading}
                    proposalBusyId={proposalBusyId}
                    viewerRole={viewerRole}
                    updateDateByProposal={updateDateByProposal}
                    updateTimeByProposal={updateTimeByProposal}
                    proposalResponseNotes={proposalResponseNotes}
                    setUpdateDateByProposal={setUpdateDateByProposal}
                    setUpdateTimeByProposal={setUpdateTimeByProposal}
                    setProposalResponseNotes={setProposalResponseNotes}
                    onRespond={handleRespond}
                    onSubmitNew={isProfessional ? handleSubmitNew : undefined}
                    proposalSubmitting={proposalSubmitting}
                    proposalDate={proposalDate}
                    proposalTime={proposalTime}
                    proposalDurationHours={proposalDurationHours}
                    proposalNotes={proposalNotes}
                    prefilledFromQuote={prefilledFromQuote}
                    setProposalDate={setProposalDate}
                    setProposalTime={setProposalTime}
                    setProposalDurationHours={setProposalDurationHours}
                    setProposalNotes={setProposalNotes}
                    setPrefilledFromQuote={setPrefilledFromQuote}
                    setProposalFormInitialized={setProposalFormInitialized}
                    allowDurationEdit={false}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
                  <button
                    type="button"
                    onClick={navigateToProjectDetails}
                    className="min-w-[110px] rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-base font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    Open schedule tab
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }} aria-hidden={!showDetails}>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-slate-500 bg-slate-800/80 text-lg font-semibold text-slate-100 transition hover:bg-slate-700"
                aria-label="Hide details"
              >
                x
              </button>

              <div className="px-6 pb-6 pt-12 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">More information</p>
                <h3 className="mt-3 text-2xl font-bold text-emerald-300">{title || 'Step details'}</h3>
                <p className="mt-5 text-sm leading-relaxed text-white">{detailsBody}</p>
              </div>

              <div className="mt-auto border-t border-slate-700 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="w-full rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                >
                  Back to schedule action
                </button>
              </div>
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
