'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { completeNextStep, fetchPrimaryNextStep, invalidateNextStepCache } from '@/lib/next-steps';
import { WorkflowCompletionModal, WorkflowNextStep, WaitingParty } from '@/components/workflow-completion-modal';
import { getProfessionalTabForAction } from '@/lib/professional-workflow';

interface ContractData {
  projectId: string;
  projectName: string;
  contractType: string | null;
  contractContent: string | null;
  contractGeneratedAt: string | null;
  clientSignedAt: string | null;
  clientSignedBy: {
    id: string;
    firstName: string;
    surname: string;
    email: string;
  } | null;
  professionalSignedAt: string | null;
  professionalSignedBy: {
    id: string;
    firstName: string;
    surname: string;
    email: string;
  } | null;
  isFullySigned: boolean;
  canSign: boolean;
}

interface ContractTabProps {
  tab?: string;
  projectId: string;
  accessToken: string | null;
  onOpenScheduleTab?: () => void;
}

const inferWaitingParty = (actionKey?: string): WaitingParty | undefined => {
  if (!actionKey) return undefined;
  if (actionKey.includes('WAIT_FOR_PROFESSIONAL')) return 'professional';
  if (actionKey.includes('WAIT_FOR_CLIENT')) return 'client';
  if (actionKey.includes('WAIT_FOR_PLATFORM') || actionKey.includes('VERIFY')) return 'platform';
  return undefined;
};

const formatDate = (date?: string | null) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

export const ContractTab: React.FC<ContractTabProps> = ({
  projectId,
  accessToken,
  onOpenScheduleTab,
}) => {
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowModalCompletedLabel, setWorkflowModalCompletedLabel] = useState('');
  const [workflowModalNextStep, setWorkflowModalNextStep] = useState<WorkflowNextStep | null>(null);

  const openWorkflowModal = useCallback(async (completedLabel: string) => {
    if (!accessToken) return;

    try {
      const next = await fetchPrimaryNextStep(projectId, accessToken, {
        cacheScope: `professional-contract-modal:${projectId}`,
        forceRefresh: true,
      });

      const tab = next?.actionKey ? getProfessionalTabForAction(next.actionKey) : undefined;
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
      toast.success(completedLabel);
    }
  }, [accessToken, projectId]);

  const fetchContract = useCallback(async () => {
    if (!accessToken) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/contract`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch agreement');
      }

      const data = await response.json();
      setContract(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load agreement';
      console.error('Error fetching agreement:', err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  const handleSignContract = async () => {
    if (!contract?.canSign || !accessToken) return;

    try {
      setSigning(true);

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/contract/sign`, { // API path unchanged
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sign agreement');
      }

      await response.json();
      await completeNextStep(projectId, 'SIGN_CONTRACT', accessToken, `professional-contract-modal:${projectId}`);
      invalidateNextStepCache(projectId);
      await openWorkflowModal('Agreement signed successfully!');

      // Refresh contract data
      await fetchContract();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to sign agreement';
      console.error('Error signing agreement:', err);
      toast.error(message);
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 p-6 text-center">
        <svg
          className="mx-auto h-12 w-12 text-rose-300 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-rose-200 font-medium">{error}</p>
      </div>
    );
  }

  if (!contract) return null;

  const signedCount = Number(Boolean(contract.clientSignedAt)) + Number(Boolean(contract.professionalSignedAt));
  const hasAnySignature = signedCount > 0;

  return (
    <div className="space-y-6">
      {/* Agreement Header */}
      <div className="rounded-lg border border-[#d8c3a0]/80 bg-[rgba(247,238,221,0.74)] p-6 shadow-[0_18px_40px_rgba(87,63,31,0.08)] backdrop-blur-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="mb-2 text-xl font-semibold text-[#31271d]">
              Renovation Services Agreement
            </h2>
            <p className="text-sm text-[#5a4b39]">
              {contract.projectName}
            </p>
            {contract.contractGeneratedAt && (
              <p className="mt-1 text-xs text-[#75624a]">
                Generated: {formatDate(contract.contractGeneratedAt)}
              </p>
            )}
          </div>
          <div>
            {contract.isFullySigned ? (
              <span className="inline-flex items-center rounded-full border border-emerald-600/30 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Fully Signed
              </span>
            ) : hasAnySignature ? (
              <span className="inline-flex items-center rounded-full border border-emerald-600/30 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <svg className="mr-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Partially Signed
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <svg className="w-4 h-4 mr-1 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Pending Signatures
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Signature Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client Signature */}
        <div className="rounded-lg border border-[#d8c3a0]/80 bg-[rgba(247,238,221,0.74)] p-4 shadow-[0_14px_30px_rgba(87,63,31,0.06)] backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-medium text-[#31271d]">Client Signature</h3>
          {contract.clientSignedAt ? (
            <div className="space-y-2">
              <div className="flex items-center text-emerald-700">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Signed</span>
              </div>
              {contract.clientSignedBy && (
                <p className="text-sm text-[#4e4133]">
                  {contract.clientSignedBy.firstName} {contract.clientSignedBy.surname}
                </p>
              )}
              <p className="text-xs text-[#75624a]">
                {formatDate(contract.clientSignedAt)}
              </p>
            </div>
          ) : (
            <div className="flex items-center text-[#75624a]">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Awaiting Signature</span>
            </div>
          )}
        </div>

        {/* Professional Signature */}
        <div className="rounded-lg border border-[#d8c3a0]/80 bg-[rgba(247,238,221,0.74)] p-4 shadow-[0_14px_30px_rgba(87,63,31,0.06)] backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-medium text-[#31271d]">Professional Signature</h3>
          {contract.professionalSignedAt ? (
            <div className="space-y-2">
              <div className="flex items-center text-emerald-700">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Signed</span>
              </div>
              {contract.professionalSignedBy && (
                <p className="text-sm text-[#4e4133]">
                  {contract.professionalSignedBy.firstName} {contract.professionalSignedBy.surname}
                </p>
              )}
              <p className="text-xs text-[#75624a]">
                {formatDate(contract.professionalSignedAt)}
              </p>
            </div>
          ) : (
            <div className="flex items-center text-[#75624a]">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Awaiting Signature</span>
            </div>
          )}
        </div>
      </div>

      {/* Agreement Content */}
      <div className="rounded-lg border border-[#d8c3a0]/80 bg-[rgba(247,238,221,0.74)] shadow-[0_18px_40px_rgba(87,63,31,0.08)] backdrop-blur-sm">
        <div className="border-b border-[#d8c3a0]/80 p-4">
          <h3 className="text-sm font-medium text-[#31271d]">Agreement</h3>
        </div>
        <div className="p-6">
          <div className="max-h-[600px] overflow-y-auto rounded-lg border border-amber-200/60 bg-gradient-to-br from-[#f5ecd7] via-[#ead9b1] to-[#dcc28f] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
            <div className="rounded-md border border-amber-900/20 bg-[rgba(255,248,230,0.55)] p-5 shadow-[0_10px_30px_rgba(72,44,8,0.12)]">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-[#342a1f]">
                {contract.contractContent || 'Agreement content is unavailable.'}
              </pre>
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.2em] text-[#7a6444]">
              Digital agreement copy
            </p>
          </div>
        </div>
      </div>

      {!contract.canSign && !contract.isFullySigned && (
        <div className="rounded-lg border border-[#d8c3a0]/80 bg-[rgba(247,238,221,0.74)] px-4 py-3 text-sm text-[#5a4b39] shadow-[0_14px_30px_rgba(87,63,31,0.06)] backdrop-blur-sm">
          This agreement is waiting on the prior workflow step before you can sign.
        </div>
      )}

      {/* Sign Button */}
      {contract.canSign && !contract.isFullySigned && (
        <div className="rounded-lg border border-[#d8c3a0]/80 bg-[rgba(247,238,221,0.74)] p-4 shadow-[0_14px_30px_rgba(87,63,31,0.06)] backdrop-blur-sm">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-[#31271d]">Ready to sign</p>
              <p className="text-xs text-[#5a4b39]">
                Confirm your agreement once you have reviewed the document above.
              </p>
            </div>
            <button
              onClick={handleSignContract}
              disabled={signing}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#f5ecd7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Sign Agreement as Professional
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Fully Signed Notice */}
      {contract.isFullySigned && (
        <div className="rounded-lg border border-emerald-600/25 bg-[rgba(247,238,221,0.8)] p-4 text-center shadow-[0_14px_30px_rgba(87,63,31,0.06)] backdrop-blur-sm">
          <svg
            className="mx-auto mb-2 h-10 w-10 text-emerald-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="font-medium text-emerald-700">
            Agreement fully signed by both parties
          </p>
          <p className="mt-1 text-sm text-emerald-700/80">
            Work can now proceed according to the agreed terms
          </p>
        </div>
      )}

      <WorkflowCompletionModal
        isOpen={workflowModalOpen}
        completedLabel={workflowModalCompletedLabel}
        nextStep={workflowModalNextStep}
        showConfetti
        additionalActionLabel={workflowModalNextStep?.tab === 'schedule' ? 'Open schedule tab' : undefined}
        onAdditionalAction={workflowModalNextStep?.tab === 'schedule' ? onOpenScheduleTab : undefined}
        onNavigate={
          workflowModalNextStep?.tab === 'schedule'
            ? onOpenScheduleTab
            : undefined
        }
        showPrimaryActionOverride={workflowModalNextStep?.tab === 'schedule'}
        primaryActionLabel="Open next step"
        onClose={() => setWorkflowModalOpen(false)}
      />
    </div>
  );
};
