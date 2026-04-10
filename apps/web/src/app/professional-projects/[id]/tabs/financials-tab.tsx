'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';

interface PaymentRequest {
  id: string;
  amount: number;
  type: 'fixed' | 'percentage' | 'milestone' | string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid' | string;
  notes?: string;
  createdAt: string;
  dueDate?: string;
  paidAt?: string;
  rejectedAt?: string;
  rejectionNotes?: string;
}

interface ProjectFinancials {
  projectBudget?: number;
  totalQuotedAmount?: number;
  awardedAmount?: number;
  totalPaymentRequest?: number;
  totalPaid?: number;
  balance?: number;
}

interface PaymentPlanMilestone {
  id: string;
  projectMilestoneId?: string | null;
  sequence: number;
  title: string;
  type: 'deposit' | 'progress' | 'final' | string;
  status: string;
  percentOfTotal?: number | null;
  amount: number | string;
  plannedDueAt?: string | null;
  escrowRequestedAt?: string | null;
  escrowFundedAt?: string | null;
  releaseRequestedAt?: string | null;
  releasedAt?: string | null;
  clientComment?: string | null;
  adminComment?: string | null;
  projectMilestone?: {
    id: string;
    title: string;
    sequence: number;
    plannedStartDate?: string | null;
    plannedEndDate?: string | null;
    status: string;
    isFinancial: boolean;
  } | null;
}

interface TimelineRisk {
  overdueCount: number;
  risk: 'none' | 'moderate' | 'high';
}

interface PaymentPlan {
  id: string;
  projectScale: string;
  escrowFundingPolicy: 'FULL_UPFRONT' | 'ROLLING_TWO_MILESTONES' | string;
  status: string;
  currency: string;
  totalAmount: number | string;
  milestones: PaymentPlanMilestone[];
  timelineRisk?: TimelineRisk | null;
  retentionEnabled?: boolean;
  retentionPercent?: number | string | null;
  retentionAmount?: number | string | null;
  retentionReleaseAt?: string | null;
}

interface ProjectMilestoneOption {
  id: string;
  title: string;
  sequence: number;
  plannedEndDate?: string | null;
  isFinancial?: boolean;
}

interface FinancialsTabProps {
  tab?: string;
  projectStatus: string;
  projectBudget?: number;
  awardedAmount?: number;
  paymentPlan?: PaymentPlan | null;
  paymentPlanLoading?: boolean;
  selectedPaymentMilestoneId?: string;
  onSelectPaymentMilestone?: (milestoneId: string) => void;
  paymentRequests: PaymentRequest[];
  projectFinancials: ProjectFinancials | null;
  paymentRequestLoading: boolean;
  paymentRequestError: string | null;
  onSubmitPaymentRequest: (amount: number, type: string, notes: string) => Promise<void>;
  paymentRequestActionLoading: boolean;
  accessToken?: string | null;
  projectId?: string;
  projectProfessionalId?: string;
  onRefreshPaymentPlan?: () => Promise<void> | void;
  onRequestMilestoneFunding?: (milestoneId: string) => Promise<void>;
  fundingRequestLoading?: boolean;
  paymentRequestAmount: string;
  onUpdatePaymentRequestAmount: (amount: string) => void;
  paymentRequestType: string;
  onUpdatePaymentRequestType: (type: string) => void;
  paymentRequestNotes: string;
  onUpdatePaymentRequestNotes: (notes: string) => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({
  projectStatus,
  projectBudget,
  awardedAmount,
  paymentPlan,
  paymentPlanLoading,
  selectedPaymentMilestoneId,
  onSelectPaymentMilestone,
  paymentRequests,
  projectFinancials,
  paymentRequestLoading,
  paymentRequestError,
  onSubmitPaymentRequest,
  paymentRequestActionLoading,
  accessToken,
  projectId,
  projectProfessionalId,
  onRefreshPaymentPlan,
  onRequestMilestoneFunding,
  fundingRequestLoading,
  paymentRequestAmount,
  onUpdatePaymentRequestAmount,
  paymentRequestType,
  onUpdatePaymentRequestType,
  paymentRequestNotes,
  onUpdatePaymentRequestNotes,
}) => {
  const [fundingMilestoneId, setFundingMilestoneId] = React.useState<string>('');
  const [projectMilestones, setProjectMilestones] = React.useState<ProjectMilestoneOption[]>([]);
  const [scaleEditLoading, setScaleEditLoading] = React.useState(false);
  const [scale2MilestoneId, setScale2MilestoneId] = React.useState('');
  const [scale2PlannedDueAt, setScale2PlannedDueAt] = React.useState('');
  const [scale3Rows, setScale3Rows] = React.useState<Array<{
    title: string;
    amount: string;
    plannedDueAt: string;
    projectMilestoneId: string;
  }>>([]);
  const isAwarded = projectStatus === 'awarded';
  const totalPending = paymentRequests
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paymentRequests.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const hasPaymentPlan = !!paymentPlan;

  const formatHKD = (value: number | string) =>
    new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value) : value);

  const getTiming = (plannedDueAt?: string | null) => {
    if (!plannedDueAt) return { label: 'No date', tone: 'slate', isLate: false };
    const due = new Date(plannedDueAt);
    if (Number.isNaN(due.getTime())) return { label: 'No date', tone: 'slate', isLate: false };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();

    if (today < dueDay) return { label: 'Early', tone: 'emerald', isLate: false };
    if (today > dueDay) return { label: 'Late', tone: 'rose', isLate: true };
    return { label: 'On time', tone: 'amber', isLate: false };
  };

  const getStatusClasses = (status: string) => {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'released') return 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40';
    if (normalized === 'release_requested') return 'bg-amber-500/20 text-amber-200 border border-amber-500/40';
    if (normalized === 'escrow_funded') return 'bg-blue-500/20 text-blue-200 border border-blue-500/40';
    if (normalized === 'disputed') return 'bg-rose-500/20 text-rose-200 border border-rose-500/40';
    return 'bg-slate-700 text-slate-200 border border-slate-600';
  };

  const eligibleMilestones = paymentPlan?.milestones?.filter((milestone) => {
    if (paymentPlan.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES') {
      return milestone.status === 'escrow_funded';
    }

    return ['scheduled', 'escrow_funded'].includes(milestone.status);
  }) || [];

  // B.2: Milestones that can be funding-requested (rolling policy only, status=scheduled)
  const fundingEligibleMilestones = paymentPlan?.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES'
    ? (paymentPlan?.milestones?.filter((m) => m.status === 'scheduled') || [])
    : [];

  // Default-select first funding-eligible milestone
  const activeFundingMilestoneId = fundingMilestoneId || fundingEligibleMilestones[0]?.id || '';

  const selectedMilestone = eligibleMilestones.find((milestone) => milestone.id === selectedPaymentMilestoneId)
    || eligibleMilestones[0]
    || null;

  const selectedMilestoneTiming = selectedMilestone ? getTiming(selectedMilestone.plannedDueAt) : null;

  React.useEffect(() => {
    if (!accessToken || !projectProfessionalId) return;

    const fetchMilestones = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/milestones/project-professional/${projectProfessionalId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        if (!response.ok) return;
        const data = await response.json();
        const rows = (Array.isArray(data) ? data : data?.milestones || []) as ProjectMilestoneOption[];
        setProjectMilestones(rows);
      } catch {
        setProjectMilestones([]);
      }
    };

    fetchMilestones();
  }, [accessToken, projectProfessionalId]);

  React.useEffect(() => {
    if (!paymentPlan) return;

    if (paymentPlan.projectScale === 'SCALE_2') {
      const second = paymentPlan.milestones.find((row) => row.sequence === 2);
      setScale2MilestoneId(second?.projectMilestone?.id || second?.projectMilestoneId || '');
      setScale2PlannedDueAt(
        second?.plannedDueAt ? new Date(second.plannedDueAt).toISOString().slice(0, 10) : '',
      );
    }

    if (paymentPlan.projectScale === 'SCALE_3') {
      const rows = paymentPlan.milestones
        .filter((row) => row.type === 'progress')
        .map((row) => ({
          title: row.title,
          amount: String(row.amount ?? ''),
          plannedDueAt: row.plannedDueAt ? new Date(row.plannedDueAt).toISOString().slice(0, 10) : '',
          projectMilestoneId: row.projectMilestone?.id || row.projectMilestoneId || '',
        }));
      setScale3Rows(rows);
    }
  }, [paymentPlan]);

  const saveScaleMilestoneSettings = async () => {
    if (!accessToken || !projectId || !paymentPlan) {
      toast.error('Project context missing for milestone update');
      return;
    }

    setScaleEditLoading(true);
    try {
      let body: any = {};

      if (paymentPlan.projectScale === 'SCALE_2') {
        body = {
          scale2Milestone2: {
            plannedDueAt: scale2PlannedDueAt ? `${scale2PlannedDueAt}T00:00:00.000Z` : null,
            projectMilestoneId: scale2MilestoneId || null,
          },
        };
      } else if (paymentPlan.projectScale === 'SCALE_3') {
        body = {
          scale3IntermediateMilestones: scale3Rows.map((row) => ({
            title: row.title,
            amount: Number(row.amount),
            plannedDueAt: row.plannedDueAt ? `${row.plannedDueAt}T00:00:00.000Z` : null,
            projectMilestoneId: row.projectMilestoneId,
          })),
        };
      }

      const response = await fetch(
        `${API_BASE_URL}/projects/${projectId}/payment-plan/milestones`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update scale financial milestones');
      }

      toast.success('Financial milestone settings updated');
      await onRefreshPaymentPlan?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update scale financial milestones';
      toast.error(message);
    } finally {
      setScaleEditLoading(false);
    }
  };

  const nonFinancialProjectMilestones = projectMilestones.filter((row) => !row.isFinancial);

  if (!isAwarded) {
    return (
      <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-sm text-white">
        Financials will be available once your quote is awarded.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 shadow-sm space-y-6">
      {/* Financial Summary */}
      {projectFinancials && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Awarded Amount</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${awardedAmount ? parseFloat(awardedAmount.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Total Requested</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${projectFinancials.totalPaymentRequest ? parseFloat(projectFinancials.totalPaymentRequest.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Paid</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${projectFinancials.totalPaid ? parseFloat(projectFinancials.totalPaid.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${projectFinancials.balance ? parseFloat(projectFinancials.balance.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
        </div>
      )}

      {paymentPlanLoading && (
        <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
          Loading payment plan...
        </div>
      )}

      {/* B.2: Timeline risk banner */}
      {hasPaymentPlan && paymentPlan?.timelineRisk && paymentPlan.timelineRisk.risk !== 'none' && (
        <div className={`rounded-md border px-4 py-3 text-sm ${
          paymentPlan.timelineRisk.risk === 'high'
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        }`}>
          <span className="font-semibold">
            {paymentPlan.timelineRisk.risk === 'high' ? '🔴 High timeline risk' : '🟡 Moderate timeline risk'}
          </span>
          {' — '}
          {paymentPlan.timelineRisk.overdueCount} milestone{paymentPlan.timelineRisk.overdueCount > 1 ? 's are' : ' is'} past the planned due date.
          Please review the schedule and contact your project coordinator if a timeline extension is needed.
        </div>
      )}

      {hasPaymentPlan && paymentPlan && (
        <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Plan-aligned Payment Milestones</h3>
              <p className="text-xs text-slate-300 mt-1">
                {paymentPlan.projectScale.replace('_', ' ')} · {paymentPlan.escrowFundingPolicy.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan total</p>
              <p className="text-lg font-bold text-white">{formatHKD(paymentPlan.totalAmount)}</p>
            </div>
          </div>

          {(paymentPlan.projectScale === 'SCALE_2' || paymentPlan.projectScale === 'SCALE_3') && (
            <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-white">Link Financial Milestones to Project Schedule</h4>
                <p className="text-xs text-slate-300 mt-1">
                  Keep payment due dates aligned with the project schedule. You can still add non-financial schedule tasks in the Schedule tab.
                </p>
              </div>

              {paymentPlan.projectScale === 'SCALE_2' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1">Linked project milestone (payment #2)</label>
                    <select
                      value={scale2MilestoneId}
                      onChange={(e) => setScale2MilestoneId(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    >
                      <option value="">Unlinked</option>
                      {nonFinancialProjectMilestones.map((milestone) => (
                        <option key={milestone.id} value={milestone.id}>
                          {`${milestone.sequence}. ${milestone.title}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1">Payment #2 due date</label>
                    <input
                      type="date"
                      value={scale2PlannedDueAt}
                      onChange={(e) => setScale2PlannedDueAt(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              )}

              {paymentPlan.projectScale === 'SCALE_3' && (
                <div className="space-y-3">
                  {scale3Rows.map((row, index) => (
                    <div key={`${index}-${row.title}`} className="grid gap-2 rounded-md border border-slate-700 bg-slate-900/60 p-3 md:grid-cols-4">
                      <input
                        value={row.title}
                        onChange={(e) => {
                          const next = [...scale3Rows];
                          next[index] = { ...next[index], title: e.target.value };
                          setScale3Rows(next);
                        }}
                        className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white"
                        placeholder="Milestone title"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => {
                          const next = [...scale3Rows];
                          next[index] = { ...next[index], amount: e.target.value };
                          setScale3Rows(next);
                        }}
                        className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white"
                        placeholder="Amount"
                      />
                      <input
                        type="date"
                        value={row.plannedDueAt}
                        onChange={(e) => {
                          const next = [...scale3Rows];
                          next[index] = { ...next[index], plannedDueAt: e.target.value };
                          setScale3Rows(next);
                        }}
                        className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white"
                      />
                      <div className="flex gap-2">
                        <select
                          value={row.projectMilestoneId}
                          onChange={(e) => {
                            const next = [...scale3Rows];
                            next[index] = { ...next[index], projectMilestoneId: e.target.value };
                            setScale3Rows(next);
                          }}
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white"
                        >
                          <option value="">Link schedule milestone</option>
                          {nonFinancialProjectMilestones.map((milestone) => (
                            <option key={milestone.id} value={milestone.id}>
                              {`${milestone.sequence}. ${milestone.title}`}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setScale3Rows(scale3Rows.filter((_, i) => i !== index))}
                          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 text-xs text-rose-200"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setScale3Rows([
                        ...scale3Rows,
                        { title: '', amount: '', plannedDueAt: '', projectMilestoneId: '' },
                      ])
                    }
                    className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  >
                    + Add intermediate financial milestone
                  </button>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveScaleMilestoneSettings}
                  disabled={scaleEditLoading}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {scaleEditLoading ? 'Saving...' : 'Save milestone linkage'}
                </button>
              </div>
            </div>
          )}

          {paymentPlan.projectScale === 'SCALE_3' && paymentPlan.retentionEnabled && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              Retention configured: {paymentPlan.retentionPercent}% ({formatHKD(paymentPlan.retentionAmount || 0)})
              {paymentPlan.retentionReleaseAt ? ` · Release date: ${new Date(paymentPlan.retentionReleaseAt).toLocaleDateString('en-HK')}` : ''}.
              {' '}Retention settings are admin-controlled.
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left font-semibold text-white">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Milestone</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Due</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Timing</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentPlan.milestones.map((milestone) => {
                  const timing = getTiming(milestone.plannedDueAt);
                  return (
                    <tr key={milestone.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-200">{milestone.sequence}</td>
                      <td className="px-3 py-2 text-slate-200">
                        <div className="font-medium">{milestone.title}</div>
                        <div className="text-xs text-slate-400">
                          {typeof milestone.percentOfTotal === 'number' ? `${milestone.percentOfTotal}% of plan` : milestone.type}
                        </div>
                        {milestone.adminComment && (
                          <div className="mt-1 text-[11px] text-amber-300">{milestone.adminComment}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-300 text-xs">
                        {milestone.plannedDueAt ? new Date(milestone.plannedDueAt).toLocaleDateString('en-HK') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold border ${
                          timing.tone === 'emerald'
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                            : timing.tone === 'rose'
                              ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                              : timing.tone === 'amber'
                                ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                : 'bg-slate-700 text-slate-200 border-slate-600'
                        }`}>
                          {timing.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-white">{formatHKD(milestone.amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(milestone.status)}`}>
                          {milestone.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* B.2: Rolling policy — request escrow funding for next milestone window */}
          {paymentPlan.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES' && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-white">Request Milestone Escrow Funding</h4>
                <p className="text-xs text-slate-300 mt-1">
                  This project uses rolling escrow. Before you can request payment release on a milestone, the client must first fund it into escrow. Use this panel to trigger a funding request.
                </p>
              </div>

              {fundingEligibleMilestones.length === 0 ? (
                <div className="rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                  All scheduled milestones have already been funded or are awaiting confirmation. No funding requests needed right now.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1">Milestone to fund</label>
                    <select
                      value={activeFundingMilestoneId}
                      onChange={(e) => setFundingMilestoneId(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    >
                      {fundingEligibleMilestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {`${m.sequence}. ${m.title} — ${formatHKD(m.amount)}`}
                        </option>
                      ))}
                    </select>
                    {activeFundingMilestoneId && (() => {
                      const m = fundingEligibleMilestones.find((x) => x.id === activeFundingMilestoneId);
                      return m ? (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Planned due: {m.plannedDueAt ? new Date(m.plannedDueAt).toLocaleDateString('en-HK') : 'Not set'}
                          {' · '}Status: {m.status.replace(/_/g, ' ')}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeFundingMilestoneId) {
                          toast.error('Please select a milestone to fund');
                          return;
                        }
                        await onRequestMilestoneFunding?.(activeFundingMilestoneId);
                      }}
                      disabled={fundingRequestLoading || !activeFundingMilestoneId}
                      className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {fundingRequestLoading ? 'Requesting...' : 'Request funding'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-white">Request Payment Against a Milestone</h4>
              <p className="text-xs text-slate-300 mt-1">
                Once the plan is active, payment requests should follow the milestone schedule rather than arbitrary fixed or percentage amounts.
              </p>
            </div>

            {paymentPlan.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES' && eligibleMilestones.length === 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                No milestone is currently escrow-funded for release. Payment requests become available once the next funded milestone window is opened.
              </div>
            )}

            {eligibleMilestones.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                <div>
                  <label className="block text-xs font-semibold text-white mb-1">Eligible milestone</label>
                  <select
                    value={selectedMilestone?.id || ''}
                    onChange={(e) => onSelectPaymentMilestone?.(e.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    {eligibleMilestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        {`${milestone.sequence}. ${milestone.title} — ${formatHKD(milestone.amount)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedMilestone) {
                        toast.error('Please select an eligible milestone');
                        return;
                      }
                      onSubmitPaymentRequest(Number(selectedMilestone.amount), 'milestone', paymentRequestNotes);
                    }}
                    disabled={paymentRequestActionLoading || !selectedMilestone}
                    className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {paymentRequestActionLoading ? 'Submitting...' : 'Request milestone payment'}
                  </button>
                </div>
              </div>
            )}

            {selectedMilestone && (
              <div className="rounded-md border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-200">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-semibold text-white">{selectedMilestone.title}</span>
                  <span className="text-slate-400">•</span>
                  <span>{formatHKD(selectedMilestone.amount)}</span>
                  {typeof selectedMilestone.percentOfTotal === 'number' && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span>{selectedMilestone.percentOfTotal}%</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Planned due date: {selectedMilestone.plannedDueAt ? new Date(selectedMilestone.plannedDueAt).toLocaleDateString('en-HK') : 'Not scheduled'}
                </p>
                {selectedMilestoneTiming?.isLate && (
                  <p className="mt-2 text-xs text-rose-300">
                    This request is late against the planned milestone date and should flag a schedule review or possible project timeline extension.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-white mb-1">Notes (optional)</label>
              <textarea
                value={paymentRequestNotes}
                onChange={(e) => onUpdatePaymentRequestNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500"
                placeholder="Add context for this milestone request (progress evidence, completion notes, delay explanation, etc.)"
              />
            </div>
          </div>
        </div>
      )}

      {/* Submit Payment Request */}
      {!hasPaymentPlan && (
      <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 space-y-3">
        <h3 className="font-semibold text-white">Submit Payment Request</h3>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-white mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">$</span>
              <input
                type="number"
                step="0.01"
                value={paymentRequestAmount}
                onChange={(e) => onUpdatePaymentRequestAmount(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 pl-6 text-sm text-white placeholder-slate-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white mb-1">Type</label>
            <select
              value={paymentRequestType}
              onChange={(e) => onUpdatePaymentRequestType(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="fixed">Fixed Amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                if (!paymentRequestAmount || parseFloat(paymentRequestAmount) <= 0) {
                  toast.error('Please enter a valid amount');
                  return;
                }
                onSubmitPaymentRequest(parseFloat(paymentRequestAmount), paymentRequestType, paymentRequestNotes);
              }}
              disabled={paymentRequestActionLoading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {paymentRequestActionLoading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white mb-1">Notes (optional)</label>
          <textarea
            value={paymentRequestNotes}
            onChange={(e) => onUpdatePaymentRequestNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500"
            placeholder="Describe what this payment is for (e.g., deposit, materials, labor, completion)"
          />
        </div>
      </div>
      )}

      {/* Payment Request History */}
      <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 space-y-3">
        <h3 className="font-semibold text-white">Payment Request History</h3>

        {paymentRequestError && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {paymentRequestError}
          </div>
        )}

        {paymentRequestLoading ? (
          <p className="text-sm text-slate-300">Loading payment requests...</p>
        ) : paymentRequests.length === 0 ? (
          <p className="text-sm text-slate-300">No payment requests yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left font-semibold text-white">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Submitted</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Notes</th>
                </tr>
              </thead>
              <tbody>
                {paymentRequests.map((request) => (
                  <tr key={request.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-semibold text-white">
                      ${parseFloat(request.amount.toString()).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{request.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          request.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                            : request.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                            : request.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                            : 'bg-slate-700 text-slate-200 border border-slate-600'
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs max-w-xs truncate" title={request.notes}>
                      {request.notes?.replace(/\|\s*__FOH_MILESTONE__.*$/, '').trim() || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Status */}
      {paymentRequests.length > 0 && (
        <div className="rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-300">Pending ({paymentRequests.filter((p) => p.status === 'pending').length})</span>
            <span className="font-semibold text-white">
              ${totalPending.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">Paid ({paymentRequests.filter((p) => p.status === 'paid').length})</span>
            <span className="font-semibold text-white">
              ${totalPaid.toFixed(2)}
            </span>
          </div>
          <div className="border-t border-slate-700 pt-2 flex justify-between font-semibold text-white">
            <span>Total Requested</span>
            <span className="text-white">
              ${(totalPending + totalPaid).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
