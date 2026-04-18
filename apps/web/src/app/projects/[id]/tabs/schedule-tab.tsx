'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { StartDateNegotiationPanel, StartProposalRow } from '@/components/start-date-negotiation-panel';
import { ProjectProgressBar } from '@/components/project-progress-bar';
import { fetchPrimaryNextStep } from '@/lib/next-steps';
import { WorkflowCompletionModal, WorkflowNextStep, WaitingParty } from '@/components/workflow-completion-modal';

// ---------------------------------------------------------------------------

interface Milestone {
  id: string;
  projectId: string;
  projectProfessionalId?: string;
  isFinancial?: boolean;
  title: string;
  description?: string;
  sequence: number;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  siteAccessRequired?: boolean;
  siteAccessNotes?: string;
  accessDeclined?: boolean;
  accessDeclinedReason?: string;
  accessDeclinedAt?: string;
  photoUrls?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ClientScheduleTabProps {
  tab?: string;
  projectId: string;
  projectStatus: string;
  accessToken: string | null;
  awardedProjectProfessionalId?: string;
  fundsSecured: boolean;
  projectProgressData: {
    id: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    professionals?: Array<{
      status?: string;
      quoteAmount?: string | number;
      invoice?: { id: string; amount: string; paymentStatus: string; paidAt?: string } | null;
    }>;
  };
  onOpenChatTab?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const actionToTab: Record<string, string> = {
  CONFIRM_START_DETAILS: 'schedule',
  CONFIRM_SCHEDULE: 'schedule',
  DEPOSIT_ESCROW_FUNDS: 'financials',
  REVIEW_PAYMENT_REQUEST: 'financials',
  REVIEW_PROGRESS: 'schedule',
  APPROVE_MILESTONE: 'schedule',
  CONFIRM_NEXT_PHASE: 'schedule',
};

const inferWaitingParty = (actionKey?: string): WaitingParty | undefined => {
  if (!actionKey) return undefined;
  if (actionKey.includes('WAIT_FOR_PROFESSIONAL')) return 'professional';
  if (actionKey.includes('WAIT_FOR_CLIENT')) return 'client';
  if (actionKey.includes('WAIT_FOR_PLATFORM') || actionKey.includes('VERIFY')) return 'platform';
  return undefined;
};

export const ClientScheduleTab: React.FC<ClientScheduleTabProps> = ({
  projectId,
  projectStatus,
  accessToken,
  awardedProjectProfessionalId,
  fundsSecured,
  projectProgressData,
  onOpenChatTab,
  onNavigateTab,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [startProposals, setStartProposals] = useState<StartProposalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [proposalResponseNotes, setProposalResponseNotes] = useState<Record<string, string>>({});
  const [updateDateByProposal, setUpdateDateByProposal] = useState<Record<string, string>>({});
  const [updateTimeByProposal, setUpdateTimeByProposal] = useState<Record<string, string>>({});
  const [queryReasonByMilestone, setQueryReasonByMilestone] = useState<Record<string, string>>({});
  const [feedbackBusyMilestoneId, setFeedbackBusyMilestoneId] = useState<string | null>(null);
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowModalCompletedLabel, setWorkflowModalCompletedLabel] = useState('');
  const [workflowModalNextStep, setWorkflowModalNextStep] = useState<WorkflowNextStep | null>(null);

  const isAwarded = projectStatus === 'awarded';

  const openWorkflowModal = async (completedLabel: string) => {
    if (!accessToken) return;

    try {
      const next = await fetchPrimaryNextStep(projectId, accessToken, {
        cacheScope: `client-schedule-modal:${projectId}`,
        forceRefresh: true,
      });

      const tab = next?.actionKey ? actionToTab[next.actionKey] : undefined;
      setWorkflowModalCompletedLabel(completedLabel);
      setWorkflowModalNextStep(
        next
          ? {
              actionLabel: next.actionLabel,
              description: next.description,
              requiresAction: Boolean(next.requiresAction),
              tab,
              waitingFor: !next.requiresAction ? inferWaitingParty(next.actionKey) : undefined,
            }
          : null,
      );
      setWorkflowModalOpen(true);
    } catch {
      // Keep silent fallback to avoid interrupting core action flow.
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No date set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateRange = (start?: string, end?: string) => {
    if (!start && !end) return 'No dates set';
    if (start && end) {
      const startOnly = start.split('T')[0];
      const endOnly = end.split('T')[0];
      if (startOnly === endOnly) return formatDate(start);
      return `${formatDate(start)} → ${formatDate(end)}`;
    }
    return formatDate(start || end);
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleString('en-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDuration = (durationMinutes?: number) => {
    if (!durationMinutes) return 'Not set';
    if (durationMinutes < 60) return `${durationMinutes} min`;
    const hours = durationMinutes / 60;
    return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)} hour${hours === 1 ? '' : 's'}`;
  };

  const fetchStartProposals = async () => {
    if (!projectId || !accessToken || !isAwarded) return;

    try {
      setProposalLoading(true);
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/start-proposals`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to fetch start proposal');
      }

      if (!response.ok) {
        setStartProposals([]);
        return;
      }

      const data = await response.json();
      setStartProposals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching start proposals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load proposed start details');
    } finally {
      setProposalLoading(false);
    }
  };

  const handleRespondStartProposal = async (proposalId: string, status: 'accepted' | 'updated') => {
    if (!accessToken) {
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
      setError(null);
      setProposalBusyId(proposalId);
      const response = await fetch(`${API_BASE_URL}/projects/start-proposals/${proposalId}/respond`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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
        throw new Error(data.message || 'Failed to respond to start proposal');
      }

      await fetchStartProposals();
      await openWorkflowModal(
        status === 'accepted'
          ? 'Start date confirmed.'
          : 'Updated start date sent to professional.',
      );

      if (status === 'updated') {
        setProposalResponseNotes((prev) => ({ ...prev, [proposalId]: '' }));
      }
    } catch (err) {
      console.error('Failed to respond to start proposal:', err);
      setError(err instanceof Error ? err.message : 'Failed to respond to start proposal');
    } finally {
      setProposalBusyId(null);
    }
  };

  const handleMilestoneCompletionFeedback = async (
    milestoneId: string,
    action: 'agreed' | 'questioned',
  ) => {
    if (!accessToken) {
      setError('Authentication required');
      return;
    }

    if (!awardedProjectProfessionalId) {
      setError('No awarded professional thread is available for this project yet.');
      return;
    }

    const reason = (queryReasonByMilestone[milestoneId] || '').trim();
    if (action === 'questioned' && reason.length < 3) {
      setError('Please provide a short reason before raising a query.');
      return;
    }

    try {
      setError(null);
      setFeedbackBusyMilestoneId(milestoneId);

      const response = await fetch(`${API_BASE_URL}/milestones/${milestoneId}/completion-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action, reason: action === 'questioned' ? reason : undefined }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit milestone feedback');
      }

      if (action === 'agreed') {
        setQueryReasonByMilestone((prev) => ({ ...prev, [milestoneId]: '' }));
        await openWorkflowModal('Milestone completion confirmed.');
      } else {
        onOpenChatTab?.();
      }
    } catch (err) {
      console.error('Failed to submit milestone completion feedback:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit milestone feedback');
    } finally {
      setFeedbackBusyMilestoneId(null);
    }
  };

  // Fetch milestones via the awarded professional thread (same dataset as professional view)
  useEffect(() => {
    if (!isAwarded || !awardedProjectProfessionalId) return;

    const fetchMilestones = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/milestones/project-professional/${awardedProjectProfessionalId}?_ts=${Date.now()}`,
          {
            cache: 'no-store',
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          }
        );

        if (!response.ok && response.status !== 404) {
          throw new Error('Failed to fetch milestones');
        }

        if (response.ok) {
          const data = await response.json();
          setMilestones(Array.isArray(data) ? data : data.milestones || []);
        } else {
          setMilestones([]);
        }
      } catch (err) {
        console.error('Error fetching milestones:', err);
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      } finally {
        setLoading(false);
      }
    };

    fetchMilestones();
  }, [isAwarded, awardedProjectProfessionalId, accessToken]);

  useEffect(() => {
    fetchStartProposals();
  }, [projectId, isAwarded, accessToken]);

  const latestStartProposal = startProposals[0];
  const openProposal = startProposals.find((p) => p.status === 'proposed') ?? null;

  useEffect(() => {
    if (!openProposal?.id) return;
    const d = new Date(openProposal.proposedStartAt);
    if (Number.isNaN(d.getTime())) return;
    const pad = (v: number) => String(v).padStart(2, '0');
    const dateVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeVal = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setUpdateDateByProposal((prev) => ({ ...prev, [openProposal.id]: prev[openProposal.id] ?? dateVal }));
    setUpdateTimeByProposal((prev) => ({ ...prev, [openProposal.id]: prev[openProposal.id] ?? timeVal }));
  }, [openProposal?.id, openProposal?.proposedStartAt]);

  // All milestones sorted by sequence — same view as professional
  const combinedMilestones = [...milestones].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  // Keep scheduleMilestones alias for the weighted progress calculation
  const scheduleMilestones = combinedMilestones;

  const getMilestoneDurationMs = (milestone: Milestone) => {
    const start = milestone.plannedStartDate ? new Date(milestone.plannedStartDate) : null;
    const end = milestone.plannedEndDate ? new Date(milestone.plannedEndDate) : null;
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return Math.max(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
    }
    return 24 * 60 * 60 * 1000;
  };

  const weightedProgressPercent = (() => {
    if (!scheduleMilestones.length) return 0;
    const totals = scheduleMilestones.reduce(
      (acc, milestone) => {
        const durationMs = getMilestoneDurationMs(milestone);
        const pct = Math.max(0, Math.min(100, milestone.percentComplete || 0));
        return {
          weightedDone: acc.weightedDone + durationMs * (pct / 100),
          weightedTotal: acc.weightedTotal + durationMs,
        };
      },
      { weightedDone: 0, weightedTotal: 0 },
    );

    if (totals.weightedTotal <= 0) return 0;
    return Math.round((totals.weightedDone / totals.weightedTotal) * 100);
  })();

  return (
    <div className="space-y-6">
      {!isAwarded ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 p-4">
          <p className="text-sm text-amber-200">
            📅 Contractor's schedule will appear here once you award the project.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-md bg-rose-500/15 border border-rose-500/40 p-4">
              <p className="text-sm font-medium text-rose-200">{error}</p>
            </div>
          )}

          <StartDateNegotiationPanel
            proposals={startProposals}
            proposalLoading={proposalLoading}
            proposalBusyId={proposalBusyId}
            updateDateByProposal={updateDateByProposal}
            updateTimeByProposal={updateTimeByProposal}
            proposalResponseNotes={proposalResponseNotes}
            setUpdateDateByProposal={setUpdateDateByProposal}
            setUpdateTimeByProposal={setUpdateTimeByProposal}
            setProposalResponseNotes={setProposalResponseNotes}
            onRespond={handleRespondStartProposal}
            viewerRole="client"
          />

          {loading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300">Loading schedule...</p>
            </div>
          ) : !awardedProjectProfessionalId ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300">
                📋 Schedule will appear here once you award the project.
              </p>
            </div>
          ) : combinedMilestones.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300">
                📋 No tasks in the schedule yet. The contractor will set these up.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Schedule</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {combinedMilestones.filter((m) => !!m.isFinancial).length} financial · {combinedMilestones.filter((m) => !m.isFinancial).length} work tasks
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-300">{weightedProgressPercent}%</p>
                  <p className="text-xs text-slate-400">overall progress</p>
                </div>
              </div>

              <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${weightedProgressPercent}%` }} />
              </div>

              <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-950/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Milestone</th>
                      <th className="px-3 py-2 text-left font-semibold">Start</th>
                      <th className="px-3 py-2 text-left font-semibold">Finish</th>
                      <th className="px-3 py-2 text-left font-semibold">% Complete</th>
                      <th className="px-3 py-2 text-left font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedMilestones.map((milestone) => {
                      const isFinancial = !!milestone.isFinancial;
                      const canReview = !isFinancial && milestone.percentComplete >= 100;
                      const isBusy = feedbackBusyMilestoneId === milestone.id;
                      return (
                        <tr key={milestone.id} className="border-b border-slate-800 align-top">
                          <td className="px-3 py-3 text-white">
                            <p className="font-semibold">
                              {isFinancial ? '💰 ' : ''}{milestone.title}
                            </p>
                            {isFinancial && (
                              <span className="mt-1 inline-block rounded-full border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                                Financial
                              </span>
                            )}
                            {milestone.description ? (
                              <p className="mt-1 text-xs text-slate-400">{milestone.description}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-slate-300">{formatDate(milestone.plannedStartDate)}</td>
                          <td className="px-3 py-3 text-slate-300">{formatDate(milestone.plannedEndDate)}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200">
                              {Math.max(0, Math.min(100, milestone.percentComplete || 0))}%
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {isFinancial ? (
                              <span className="text-xs text-slate-500">—</span>
                            ) : !canReview ? (
                              <span className="text-xs text-slate-500">Available at 100%</span>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleMilestoneCompletionFeedback(milestone.id, 'agreed')}
                                    disabled={isBusy}
                                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    Agree
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMilestoneCompletionFeedback(milestone.id, 'questioned')}
                                    disabled={isBusy}
                                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                                  >
                                    Raise Query
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenChatTab?.()}
                                    className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
                                    title="Escalate to Fitout Hub"
                                  >
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-400 text-[9px] font-bold text-slate-950">
                                      FoH
                                    </span>
                                    Escalate
                                  </button>
                                </div>
                                <textarea
                                  value={queryReasonByMilestone[milestone.id] || ''}
                                  onChange={(e) =>
                                    setQueryReasonByMilestone((prev) => ({
                                      ...prev,
                                      [milestone.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={`Question on completion of ${milestone.title}`}
                                  rows={2}
                                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white"
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <p className="mb-3 text-sm font-semibold text-white">Project Progress</p>
            <ProjectProgressBar
              project={{
                id: projectProgressData.id,
                status: projectProgressData.status,
                startDate: projectProgressData.startDate,
                endDate: projectProgressData.endDate,
                professionals:
                  projectProgressData.professionals?.map((p) => ({
                    status: p.status,
                    quoteAmount: p.quoteAmount,
                    invoice: p.invoice || null,
                  })) || [],
              }}
              hasAssist={false}
              variant="compact"
              fundsSecured={fundsSecured}
            />
          </div>
        </>
      )}

      <WorkflowCompletionModal
        isOpen={workflowModalOpen}
        completedLabel={workflowModalCompletedLabel}
        nextStep={workflowModalNextStep}
        onNavigate={
          workflowModalNextStep?.tab
            ? () => onNavigateTab?.(workflowModalNextStep.tab as string)
            : undefined
        }
        onClose={() => setWorkflowModalOpen(false)}
      />
    </div>
  );
};
