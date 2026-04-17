'use client';

import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

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

interface StartProposal {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'superseded' | string;
  proposedStartAt: string;
  durationMinutes: number;
  notes?: string | null;
  responseNotes?: string | null;
  respondedAt?: string | null;
  projectedEndAt?: string;
  createdAt: string;
  professional?: {
    businessName?: string | null;
    fullName?: string | null;
  };
}

interface ClientScheduleTabProps {
  tab?: string;
  projectId: string;
  projectStatus: string;
  accessToken: string | null;
  awardedProjectProfessionalId?: string;
  onOpenChatTab?: () => void;
}

export const ClientScheduleTab: React.FC<ClientScheduleTabProps> = ({
  projectId,
  projectStatus,
  accessToken,
  awardedProjectProfessionalId,
  onOpenChatTab,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [startProposals, setStartProposals] = useState<StartProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [proposalResponseNotes, setProposalResponseNotes] = useState<Record<string, string>>({});
  const [updateDateByProposal, setUpdateDateByProposal] = useState<Record<string, string>>({});
  const [updateTimeByProposal, setUpdateTimeByProposal] = useState<Record<string, string>>({});
  const [queryReasonByMilestone, setQueryReasonByMilestone] = useState<Record<string, string>>({});
  const [feedbackBusyMilestoneId, setFeedbackBusyMilestoneId] = useState<string | null>(null);

  const isAwarded = projectStatus === 'awarded';

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

      if (data?.proposal) {
        setStartProposals((prev) => prev.map((proposal) => proposal.id === proposalId ? { ...proposal, ...data.proposal } : proposal));
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

  // Fetch milestones for the awarded professional
  useEffect(() => {
    if (!projectId || !isAwarded) return;

    const fetchMilestones = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch milestones by project ID
        const response = await fetch(
          `${API_BASE_URL}/milestones/project/${projectId}`,
          {
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
          // No milestones yet
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
  }, [projectId, isAwarded, accessToken]);

  useEffect(() => {
    fetchStartProposals();
  }, [projectId, isAwarded, accessToken]);

  const latestStartProposal = startProposals[0];
  const proposerName = latestStartProposal?.professional?.businessName || latestStartProposal?.professional?.fullName || 'Professional';
  const hasEarlierDeclinedProposal = startProposals.slice(1).some((proposal) => proposal.status === 'declined');
  const isResharedForApproval =
    latestStartProposal?.status === 'proposed' && hasEarlierDeclinedProposal;

  useEffect(() => {
    if (!latestStartProposal?.id || latestStartProposal.status !== 'proposed') return;
    const proposalDate = new Date(latestStartProposal.proposedStartAt);
    if (Number.isNaN(proposalDate.getTime())) return;
    const pad = (value: number) => String(value).padStart(2, '0');
    const dateValue = `${proposalDate.getFullYear()}-${pad(proposalDate.getMonth() + 1)}-${pad(proposalDate.getDate())}`;
    const timeValue = `${pad(proposalDate.getHours())}:${pad(proposalDate.getMinutes())}`;
    setUpdateDateByProposal((prev) => (prev[latestStartProposal.id] ? prev : { ...prev, [latestStartProposal.id]: dateValue }));
    setUpdateTimeByProposal((prev) => (prev[latestStartProposal.id] ? prev : { ...prev, [latestStartProposal.id]: timeValue }));
  }, [latestStartProposal]);

  const scheduleMilestones = milestones
    .filter((milestone) => !milestone.isFinancial)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

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

          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Simple lane</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Agree simple start details</h3>
            <p className="mt-2 text-sm text-slate-200">
              For simple jobs, just agree a start date, time and expected duration. For larger projects, use the detailed schedule further down.
            </p>

            {proposalLoading ? (
              <p className="mt-4 text-sm text-slate-300">Loading proposed start details…</p>
            ) : !latestStartProposal ? (
              <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
                No start proposal yet. The awarded professional can send one from their Schedule tab.
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{proposerName}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${
                    latestStartProposal.status === 'accepted'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : latestStartProposal.status === 'proposed'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : latestStartProposal.status === 'declined'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                  }`}>
                    {latestStartProposal.status}
                  </span>
                  {isResharedForApproval && (
                    <span className="rounded-full px-2 py-1 text-[11px] font-semibold uppercase bg-amber-500/20 text-amber-200 border border-amber-500/40">
                      Reshared for approval
                    </span>
                  )}
                </div>
                {isResharedForApproval && (
                  <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    The professional updated the timing after earlier feedback and has resent it for your approval.
                  </p>
                )}
                <div className="mt-3 space-y-1 text-sm text-slate-200">
                  <p>Proposed start: <span className="font-medium text-white">{formatDateTime(latestStartProposal.proposedStartAt)}</span></p>
                  <p>Estimated duration: <span className="font-medium text-white">{formatDuration(latestStartProposal.durationMinutes)}</span></p>
                  {latestStartProposal.projectedEndAt && (
                    <p>Estimated finish: <span className="font-medium text-white">{formatDateTime(latestStartProposal.projectedEndAt)}</span></p>
                  )}
                </div>
                {latestStartProposal.notes && (
                  <p className="mt-3 text-sm text-slate-300">Notes: {latestStartProposal.notes}</p>
                )}
                {latestStartProposal.responseNotes && latestStartProposal.status !== 'proposed' && (
                  <p className="mt-2 text-sm text-slate-300">Response: {latestStartProposal.responseNotes}</p>
                )}

                {latestStartProposal.status === 'proposed' && (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-slate-200">
                        <span className="mb-1 block">Updated start date</span>
                        <input
                          type="date"
                          value={updateDateByProposal[latestStartProposal.id] || ''}
                          onChange={(e) =>
                            setUpdateDateByProposal((prev) => ({
                              ...prev,
                              [latestStartProposal.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-slate-200">
                        <span className="mb-1 block">Updated start time</span>
                        <input
                          type="time"
                          value={updateTimeByProposal[latestStartProposal.id] || ''}
                          onChange={(e) =>
                            setUpdateTimeByProposal((prev) => ({
                              ...prev,
                              [latestStartProposal.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                    </div>
                    <textarea
                      value={proposalResponseNotes[latestStartProposal.id] || ''}
                      onChange={(e) => setProposalResponseNotes((prev) => ({ ...prev, [latestStartProposal.id]: e.target.value }))}
                      placeholder="Optional note for the professional"
                      className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
                      rows={3}
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleRespondStartProposal(latestStartProposal.id, 'accepted')}
                        disabled={proposalBusyId === latestStartProposal.id}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {proposalBusyId === latestStartProposal.id ? 'Saving…' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleRespondStartProposal(latestStartProposal.id, 'updated')}
                        disabled={proposalBusyId === latestStartProposal.id}
                        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {proposalBusyId === latestStartProposal.id ? 'Saving…' : 'Update'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300">Loading schedule...</p>
            </div>
          ) : scheduleMilestones.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300">
                📋 No detailed task schedule yet. For simple jobs, the agreed start details above may be enough; for more complex work, milestones will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Contractor Schedule</h3>

              <div className="mb-5 rounded-md border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Overall Progress (duration-weighted)</p>
                  <p className="text-sm font-semibold text-emerald-300">{weightedProgressPercent}%</p>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full bg-emerald-500" style={{ width: `${weightedProgressPercent}%` }} />
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-950/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Milestone</th>
                      <th className="px-3 py-2 text-left font-semibold">Start</th>
                      <th className="px-3 py-2 text-left font-semibold">Finish</th>
                      <th className="px-3 py-2 text-left font-semibold">% Complete</th>
                      <th className="px-3 py-2 text-left font-semibold">Client Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleMilestones.map((milestone) => {
                      const canReview = milestone.percentComplete >= 100;
                      const isBusy = feedbackBusyMilestoneId === milestone.id;
                      return (
                        <tr key={milestone.id} className="border-b border-slate-800 align-top">
                          <td className="px-3 py-3 text-white">
                            <p className="font-semibold">{milestone.title}</p>
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
                            {!canReview ? (
                              <span className="text-xs text-slate-500">Available at 100% complete</span>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleMilestoneCompletionFeedback(
                                        milestone.id,
                                        'agreed',
                                      )
                                    }
                                    disabled={isBusy}
                                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    Agree
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleMilestoneCompletionFeedback(
                                        milestone.id,
                                        'questioned',
                                      )
                                    }
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
        </>
      )}
    </div>
  );
};
