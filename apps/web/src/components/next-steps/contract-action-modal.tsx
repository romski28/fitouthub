'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { completeNextStep, fetchPrimaryNextStep, invalidateNextStepCache } from '@/lib/next-steps';
import { WorkflowCompletionModal, type WaitingParty, type WorkflowNextStep } from '@/components/workflow-completion-modal';
import { getClientTabForAction } from '@/lib/client-workflow';
import { getProfessionalTabForAction } from '@/lib/professional-workflow';

interface ContractActionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

interface ContractData {
  projectName: string;
  contractGeneratedAt: string | null;
  clientSignedAt: string | null;
  professionalSignedAt: string | null;
  isFullySigned: boolean;
  canSign: boolean;
}

const inferWaitingParty = (actionKey?: string): WaitingParty | undefined => {
  if (!actionKey) return undefined;
  if (actionKey.includes('WAIT_FOR_PROFESSIONAL')) return 'professional';
  if (actionKey.includes('WAIT_FOR_CLIENT')) return 'client';
  if (actionKey.includes('WAIT_FOR_PLATFORM') || actionKey.includes('VERIFY')) return 'platform';
  return undefined;
};

const toAgreementText = (text: string | undefined, fallback: string): string => {
  const source = (text || '').trim();
  if (!source) return fallback;

  return source
    .replace(/\b[Cc]ontracts\b/g, (value) => (value[0] === 'C' ? 'Agreements' : 'agreements'))
    .replace(/\b[Cc]ontract\b/g, (value) => (value[0] === 'C' ? 'Agreement' : 'agreement'));
};

const formatDate = (date?: string | null) => {
  if (!date) return 'Pending';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return 'Pending';
  }
};

const upsertTab = (path: string, tabValue: string) => {
  const [pathname, existingQuery = ''] = path.split('?');
  const query = new URLSearchParams(existingQuery);
  query.set('tab', tabValue);
  return `${pathname}?${query.toString()}`;
};

export function ContractActionModal({
  isOpen,
  isLoading = false,
  onClose,
}: ContractActionModalProps) {
  const router = useRouter();
  const { state } = useNextStepModal();
  const { accessToken: clientAccessToken } = useAuth();
  const { accessToken: professionalAccessToken } = useProfessionalAuth();

  const [contract, setContract] = useState<ContractData | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowModalCompletedLabel, setWorkflowModalCompletedLabel] = useState('');
  const [workflowModalNextStep, setWorkflowModalNextStep] = useState<WorkflowNextStep | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const roleUpper = (state.role || '').toUpperCase();
  const token = useMemo(
    () => (roleUpper.includes('PROFESSIONAL') ? professionalAccessToken : clientAccessToken),
    [clientAccessToken, professionalAccessToken, roleUpper],
  );
  const nextStepCacheScope = useMemo(
    () => `${roleUpper.includes('PROFESSIONAL') ? 'professional' : 'client'}-contract-modal:${state.projectId || 'unknown'}`,
    [roleUpper, state.projectId],
  );

  const loadContract = useCallback(async () => {
    if (!state.projectId || !token) return;

    setContractLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${state.projectId}/contract`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load agreement details');
      }

      const data = (await response.json()) as ContractData;
      setContract(data);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : 'Failed to load agreement details';
      setError(message);
    } finally {
      setContractLoading(false);
    }
  }, [state.projectId, token]);

  useEffect(() => {
    if (!isOpen || !state.modalContent) return;
    void loadContract();
  }, [isOpen, loadContract, state.modalContent]);

  const getTabForAction = useCallback((actionKey?: string) => {
    if (!actionKey) return undefined;
    return roleUpper.includes('PROFESSIONAL')
      ? getProfessionalTabForAction(actionKey)
      : getClientTabForAction(actionKey);
  }, [roleUpper]);

  const openWorkflowModal = useCallback(async (completedLabel: string) => {
    if (!state.projectId || !token) return;

    try {
      const next = await fetchPrimaryNextStep(state.projectId, token, {
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
  }, [getTabForAction, nextStepCacheScope, state.projectId, token]);

  const navigateToContractTab = useCallback(() => {
    if (state.projectDetailsPath) {
      router.push(upsertTab(state.projectDetailsPath, 'contract'));
      onClose();
      return;
    }

    if (state.projectId) {
      router.push(`/projects/${state.projectId}?tab=contract`);
      onClose();
    }
  }, [onClose, router, state.projectDetailsPath, state.projectId]);

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

  const handleSignNow = useCallback(async () => {
    if (!state.projectId || !token || !contract?.canSign) return;

    try {
      setSigning(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/projects/${state.projectId}/contract/sign`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to sign agreement');
      }

      await response.json();
      await completeNextStep(state.projectId, 'SIGN_CONTRACT', token, nextStepCacheScope);
      invalidateNextStepCache(state.projectId);
      await loadContract();
      state.onCompleted?.({ projectId: state.projectId, actionKey: 'SIGN_CONTRACT' });
      await openWorkflowModal('Agreement signed successfully!');
    } catch (signError) {
      const message =
        signError instanceof Error ? signError.message : 'Failed to sign agreement';
      setError(message);
    } finally {
      setSigning(false);
    }
  }, [contract?.canSign, loadContract, nextStepCacheScope, onClose, openWorkflowModal, state, token]);

  const showMainModal = isOpen && Boolean(state.modalContent);

  useEffect(() => {
    if (!isOpen) {
      setShowDetails(false);
    }
  }, [isOpen]);

  if (!showMainModal && !workflowModalOpen) return null;

  const {
    title,
    body,
    detailsBody,
    imageUrl,
    primaryButtonLabel,
    secondaryButtonLabel,
  } = state.modalContent || {};

  const agreementTitle = toAgreementText(title, 'Agreement');
  const agreementBody = toAgreementText(body, '');
  const agreementPrimaryButtonLabel = toAgreementText(primaryButtonLabel, 'Review agreement');
  const agreementSecondaryButtonLabel = toAgreementText(secondaryButtonLabel, 'Later');
  const requestChangesAdminOnly = /request\s+changes/i.test(agreementSecondaryButtonLabel);

  const secondaryLabel = requestChangesAdminOnly ? 'Later' : agreementSecondaryButtonLabel;
  const showSignNow = Boolean(contract?.canSign) && !contractLoading;
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
        <div className="w-full max-w-2xl max-h-[80vh] [perspective:1600px]">
          {isLoading ? (
            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
              <div className="flex flex-col items-center justify-center px-6 py-14">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
                <p className="text-slate-300">Loading...</p>
              </div>
            </div>
          ) : (
            <div className="relative grid max-h-[80vh] [transform-style:preserve-3d] transition-transform duration-500 ease-out" style={{ transform: showDetails ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
              <div className="col-start-1 row-start-1 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]" aria-hidden={showDetails}>
                <div className="flex max-h-[80vh] flex-col">
                  <div className="relative shrink-0 border-b border-slate-700 px-6 py-5">
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
                    <div className="flex items-start gap-4">
                      <img
                        src={imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                        alt="Agreement"
                        className="h-14 w-14 rounded-full border border-white/20 object-cover"
                      />
                      <div>
                        <h2 className="text-2xl font-bold text-emerald-300">{agreementTitle}</h2>
                        {agreementBody ? <p className="mt-1 text-sm text-slate-200">{agreementBody}</p> : null}
                      </div>
                    </div>
                  </div>

                  <div className="next-step-scrollbar grid flex-1 gap-4 overflow-y-auto px-6 py-5">
                    {contractLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                        Loading agreement details...
                      </div>
                    ) : contract ? (
                      <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-200">
                        <p>
                          <span className="text-slate-400">Project:</span>{' '}
                          <span className="font-semibold text-white">{contract.projectName || 'Agreement'}</span>
                        </p>
                        <p>
                          <span className="text-slate-400">Generated:</span>{' '}
                          <span>{formatDate(contract.contractGeneratedAt)}</span>
                        </p>
                        <p>
                          <span className="text-slate-400">Client signature:</span>{' '}
                          <span>{formatDate(contract.clientSignedAt)}</span>
                        </p>
                        <p>
                          <span className="text-slate-400">Professional signature:</span>{' '}
                          <span>{formatDate(contract.professionalSignedAt)}</span>
                        </p>
                        <p>
                          <span className="text-slate-400">Status:</span>{' '}
                          <span className={contract.isFullySigned ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
                            {contract.isFullySigned ? 'Fully signed' : 'Pending signatures'}
                          </span>
                        </p>
                      </div>
                    ) : null}

                    {error ? (
                      <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                        {error}
                      </div>
                    ) : null}

                    {requestChangesAdminOnly ? (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        Fitout Hub admin handles formal agreement change requests. If amendments are needed, contact support and the admin team will coordinate updates.
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
                    <button
                      type="button"
                      onClick={navigateToContractTab}
                      disabled={contractLoading || signing}
                      className="min-w-[140px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Review first
                    </button>
                    <button
                      type="button"
                      onClick={handleSignNow}
                      disabled={!showSignNow || signing}
                      className="min-w-[150px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {signing ? 'Signing...' : 'Sign now'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="col-start-1 row-start-1 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]" style={{ transform: 'rotateY(180deg)' }} aria-hidden={!showDetails}>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-slate-500 bg-slate-800/80 text-lg font-semibold text-slate-100 transition hover:bg-slate-700"
                  aria-label="Hide details"
                >
                  x
                </button>

                <div className="next-step-scrollbar flex-1 overflow-y-auto px-6 pb-6 pt-12 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">More information</p>
                  <h3 className="mt-3 text-2xl font-bold text-emerald-300">{agreementTitle || 'Step details'}</h3>
                  <p className="mt-5 text-sm leading-relaxed text-white">{detailsBody}</p>
                </div>

                <div className="mt-auto border-t border-slate-700 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setShowDetails(false)}
                    className="w-full rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                  >
                    Back to agreement
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
        nextStep={workflowModalNextStep}
        showConfetti
        primaryActionLabel={workflowModalNextStep?.actionLabel ?? 'Open project'}
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
