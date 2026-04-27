'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import {
  applyNextStepModalTemplate,
  resolveNextStepModalContent,
} from '@/lib/next-step-modal-content';

type TransferKind = 'authorize_milestone_cap' | 'api_transfer';

type WalletTransferTarget = {
  kind?: TransferKind;
  sourceWallet?: string;
  destinationWallet?: string;
  amountMode?: 'milestone_amount' | 'fixed';
  fixedAmount?: number;
  milestoneSequence?: number;
  endpoint?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  body?: Record<string, unknown>;
  successMessage?: string;
};

interface PaymentPlanMilestone {
  id: string;
  sequence: number;
  amount: number | string;
}

interface PaymentPlan {
  milestones?: PaymentPlanMilestone[];
}

interface WalletTransferModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

const defaultTarget: WalletTransferTarget = {
  kind: 'authorize_milestone_cap',
  sourceWallet: 'client_escrow',
  destinationWallet: 'professional_materials_holding',
  amountMode: 'milestone_amount',
  milestoneSequence: 1,
};

const formatHKD = (value: number | string) =>
  new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(typeof value === 'string' ? Number(value || 0) : value);

function parseTransferTarget(raw?: string | null): WalletTransferTarget {
  if (!raw) return defaultTarget;
  try {
    const parsed = JSON.parse(raw) as WalletTransferTarget;
    return {
      ...defaultTarget,
      ...parsed,
    };
  } catch {
    return defaultTarget;
  }
}

function applyTemplateValue(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return applyNextStepModalTemplate(value, vars);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => applyTemplateValue(entry, vars));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = applyTemplateValue(entry, vars);
    }
    return next;
  }
  return value;
}

export function WalletTransferModal({ isOpen, isLoading = false, onClose }: WalletTransferModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();
  const [loadingProjectData, setLoadingProjectData] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [clientName, setClientName] = useState('client');
  const [professionalName, setProfessionalName] = useState('professional');

  const content = useMemo(
    () => resolveNextStepModalContent(state.actionKey || 'AUTHORIZE_MATERIALS_WALLET', state.modalContent),
    [state.actionKey, state.modalContent],
  );

  const transferTarget = useMemo(
    () => parseTransferTarget(content.primaryActionTarget),
    [content.primaryActionTarget],
  );

  const milestoneSequence = Number(transferTarget.milestoneSequence || 1);
  const selectedMilestone = useMemo(
    () => (paymentPlan?.milestones || []).find((milestone) => Number(milestone.sequence) === milestoneSequence),
    [paymentPlan?.milestones, milestoneSequence],
  );
  const transferAmount =
    transferTarget.amountMode === 'fixed'
      ? Number(transferTarget.fixedAmount || 0)
      : Number(selectedMilestone?.amount || 0);

  const templateVars = {
    clientName,
    professionalName,
    amount: formatHKD(transferAmount || 0),
    sourceWallet: transferTarget.sourceWallet || 'source wallet',
    destinationWallet: transferTarget.destinationWallet || 'destination wallet',
  };

  useEffect(() => {
    if (!isOpen) {
      setShowDetails(false);
      setShowSuccess(false);
      return;
    }
    if (!state.projectId || !accessToken) return;

    const load = async () => {
      try {
        setLoadingProjectData(true);
        const [planRes, projectRes] = await Promise.all([
          fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE_URL}/projects/${state.projectId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (planRes.ok) {
          const planData = (await planRes.json()) as PaymentPlan;
          setPaymentPlan(planData || null);
        } else {
          setPaymentPlan(null);
        }

        if (projectRes.ok) {
          const project = await projectRes.json();
          const derivedClientName = [project?.user?.firstName, project?.user?.surname]
            .map((value: string | undefined) => String(value || '').trim())
            .filter(Boolean)
            .join(' ');
          if (derivedClientName) setClientName(derivedClientName);

          const professionals = Array.isArray(project?.professionals) ? project.professionals : [];
          const awarded = professionals.find((entry: any) => String(entry?.status || '').toLowerCase() === 'awarded') || professionals[0];
          const derivedProfName = String(
            awarded?.professional?.fullName || awarded?.professional?.businessName || '',
          ).trim();
          if (derivedProfName) setProfessionalName(derivedProfName);
        }
      } catch {
        // Keep defaults if metadata fetch fails.
      } finally {
        setLoadingProjectData(false);
      }
    };

    void load();
  }, [isOpen, state.projectId, accessToken]);

  const closeModal = () => {
    setShowDetails(false);
    setShowSuccess(false);
    onClose();
  };

  const executeTransfer = async () => {
    if (!state.projectId || !accessToken) {
      toast.error('Missing project context');
      return;
    }

    try {
      setTransferBusy(true);

      if ((transferTarget.kind || 'authorize_milestone_cap') === 'authorize_milestone_cap') {
        if (!selectedMilestone) {
          throw new Error(`Milestone ${milestoneSequence} not found for transfer`);
        }

        const res = await fetch(
          `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${selectedMilestone.id}/authorize-foh-cap`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ amount: transferAmount }),
          },
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { message?: string }).message || 'Failed to authorize transfer');
        }
      } else {
        const endpoint = String(transferTarget.endpoint || '').trim();
        if (!endpoint) {
          throw new Error('Missing wallet transfer endpoint configuration');
        }

        const vars = {
          projectId: state.projectId,
          milestoneId: selectedMilestone?.id || '',
          amount: String(transferAmount),
        };

        const method = transferTarget.method || 'POST';
        const resolvedEndpoint = applyNextStepModalTemplate(endpoint, vars);
        const resolvedBody = applyTemplateValue(transferTarget.body || {}, vars);

        const res = await fetch(`${API_BASE_URL}${resolvedEndpoint}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resolvedBody),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { message?: string }).message || 'Failed to transfer funds');
        }
      }

      const fireConfetti = confetti as unknown as ((opts: Record<string, unknown>) => Promise<unknown>) | null;
      if (fireConfetti) {
        await fireConfetti({
          particleCount: 110,
          spread: 80,
          origin: { y: 0.65 },
        }).catch(() => undefined);
      }

      setShowSuccess(true);
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      toast.success(transferTarget.successMessage || 'Wallet transfer completed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer funds');
    } finally {
      setTransferBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {(isLoading || loadingProjectData) ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
            <p className="text-slate-300">Loading...</p>
          </div>
        ) : (
          <>
            {!showSuccess && (
              <button
                type="button"
                onClick={() => setShowDetails((prev) => !prev)}
                className="absolute right-4 top-4 h-8 w-8 rounded-full border border-white/30 bg-white/10 text-lg font-semibold text-white transition hover:bg-white/20"
                aria-label="Show details"
              >
                i
              </button>
            )}

            <div className="px-6 pt-10 pb-4 text-center">
              {showSuccess ? (
                <>
                  <p className="text-3xl font-bold text-emerald-300">
                    {content.successTitle || 'Funds have been transferred!'}
                  </p>
                  <p className="mt-4 text-base text-slate-100">
                    {applyNextStepModalTemplate(content.successBody, templateVars) ||
                      `${templateVars.amount} has been moved to ${professionalName}'s holding wallet.`}
                  </p>
                  <p className="mt-4 text-sm text-slate-300">
                    {content.successNextStepBody || 'Next wallet action will appear automatically when ready.'}
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-4 flex justify-center">
                    <img
                      src={content.imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                      alt="Action avatar"
                      className="h-20 w-20 rounded-full border border-white/20 object-cover"
                    />
                  </div>
                  <p className="text-lg text-slate-200">{content.title || 'Transfer funds'}</p>
                  <p className="mt-3 text-base leading-relaxed text-slate-100">
                    {applyNextStepModalTemplate(content.body, templateVars) ||
                      `Move ${templateVars.amount} from ${templateVars.sourceWallet} to ${templateVars.destinationWallet}.`}
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-4">
              {showSuccess ? (
                <button
                  type="button"
                  onClick={closeModal}
                  className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700"
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDetails((prev) => !prev)}
                    className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                  >
                    {showDetails ? 'Hide details' : 'Details'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={transferBusy}
                    className="min-w-[110px] rounded-lg bg-rose-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {content.secondaryButtonLabel || 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void executeTransfer()}
                    disabled={transferBusy}
                    className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:bg-slate-500"
                  >
                    {transferBusy ? 'Please wait...' : content.primaryButtonLabel || 'Transfer'}
                  </button>
                </>
              )}
            </div>

            {showDetails && !showSuccess && (
              <div className="mx-4 mb-4 rounded-xl border border-slate-600 bg-slate-900/95 p-4 shadow-xl">
                <p className="text-left text-sm leading-relaxed text-white">
                  {applyNextStepModalTemplate(content.detailsBody, templateVars) ||
                    'This transfer allocates funds between project wallets. Additional release rules may apply before withdrawal.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
