'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { completeNextStep, invalidateNextStepCache } from '@/lib/next-steps';
import { StartDateNegotiationPanel, type StartProposalRow } from '@/components/start-date-negotiation-panel';

interface StartDateActionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

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

  const roleUpper = (state.role || '').toUpperCase();
  const isProfessional = roleUpper.includes('PROFESSIONAL');
  const viewerRole = isProfessional ? 'professional' : 'client';
  const token = isProfessional ? professionalAccessToken : clientAccessToken;
  const projectId = state.projectId;
  const projectProfessionalId = extractProjectProfessionalId(state.projectDetailsPath);
  const nextStepCacheScope = `${isProfessional ? 'professional' : 'client'}-schedule-modal:${projectId || 'unknown'}`;

  const latestProposal = useMemo(() => proposals[0], [proposals]);

  useEffect(() => {
    if (!latestProposal || proposalFormInitialized) return;

    const proposedAt = new Date(latestProposal.proposedStartAt);
    if (!Number.isNaN(proposedAt.getTime())) {
      const pad = (value: number) => String(value).padStart(2, '0');
      setProposalDate(
        `${proposedAt.getFullYear()}-${pad(proposedAt.getMonth() + 1)}-${pad(proposedAt.getDate())}`,
      );
      setProposalTime(`${pad(proposedAt.getHours())}:${pad(proposedAt.getMinutes())}`);
    }

    if (latestProposal.durationMinutes) {
      const hours = latestProposal.durationMinutes / 60;
      setProposalDurationHours(
        Number.isInteger(hours)
          ? String(hours)
          : hours.toFixed(1).replace(/\.0$/, ''),
      );
    }

    setProposalNotes(latestProposal.notes || '');
    setProposalFormInitialized(true);
  }, [latestProposal, proposalFormInitialized]);

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
      setProposals(Array.isArray(data) ? data : []);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send start proposal');
    } finally {
      setProposalSubmitting(false);
    }
  }, [markStepCompleted, projectId, proposalDate, proposalDurationHours, proposalNotes, proposalTime, token]);

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

  if (!isOpen) return null;

  const title = state.modalContent?.title || (isProfessional ? 'Confirm start date' : 'Review start date');
  const body = state.modalContent?.body ||
    (isProfessional
      ? 'Propose a realistic start date and duration for client agreement.'
      : 'Review and respond to the professional start-date proposal.');

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all ${
        isOpen ? 'visible bg-black/60 backdrop-blur-sm' : 'invisible bg-black/0'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center px-6 py-14">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
            <p className="text-slate-300">Loading...</p>
          </div>
        ) : (
          <div className="max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-700 px-6 py-5">
              <h2 className="text-2xl font-bold text-emerald-300">{title}</h2>
              <p className="mt-1 text-sm text-slate-200">{body}</p>
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
              />
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
  );
}
