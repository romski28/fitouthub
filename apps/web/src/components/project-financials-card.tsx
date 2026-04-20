'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';
import StatusPill, { statusToneFromStatus } from './status-pill';
import { useAuth } from '@/context/auth-context';

export type ProjectFinancialRole = 'client' | 'professional' | 'admin';

interface Transaction {
  id: string;
  projectProfessionalId?: string | null;
  professionalId?: string | null;
  type: string;
  description: string;
  amount: number | string;
  status: string;
  requestedBy?: string | null;
  requestedByRole?: string | null;
  actionBy?: string | null;
  actionByRole?: string | null;
  actionAt?: string | null;
  actionComplete?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  auditSummary?: {
    totalEvents: number;
    latestEventAt: string | null;
    latestAction: string | null;
    latestStatus: string | null;
    latestActorName: string | null;
    latestActorType: string | null;
  };
}

interface Summary {
  totalEscrow: number | string;
  escrowConfirmed: number | string;
  advancePaymentRequested: number | string;
  advancePaymentApproved: number | string;
  paymentsReleased: number | string;
  transactions: Transaction[];
}

interface LedgerEntry {
  id: string;
  direction: string;
  amount: number | string;
  currency: string;
  description: string | null;
  createdAt: string;
  transaction: { type: string; description: string } | null;
}

interface Statement {
  ledger: LedgerEntry[];
  balance: number | string;
  required: number | string;
  approvedBudget: number | string;
}

interface PaymentPlanMilestone {
  id: string;
  sequence: number;
  title: string;
  type: string;
  status: string;
  percentOfTotal?: number | null;
  amount: number | string;
  plannedDueAt?: string | null;
  projectMilestoneId?: string | null;
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

interface PaymentPlan {
  id: string;
  projectScale: string;
  escrowFundingPolicy: string;
  status: string;
  currency: string;
  totalAmount: number | string;
  depositCapPercent?: number | null;
  retentionEnabled?: boolean;
  retentionPercent?: number | string | null;
  retentionAmount?: number | string | null;
  retentionReleaseAt?: string | null;
  milestones: PaymentPlanMilestone[];
}

interface MilestoneProcurementEvidence {
  id: string;
  projectId: string;
  paymentMilestoneId: string;
  projectProfessionalId?: string | null;
  submittedBy: string;
  submittedByRole: string;
  claimedAmount: number | string;
  approvedAmount?: number | string | null;
  invoiceUrls?: string[];
  photoUrls?: string[];
  notes?: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  reviewedBy?: string | null;
  reviewedByRole?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  titleTransferAcknowledged?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WalletMilestoneBreakdown {
  id: string;
  sequence: number;
  title: string;
  plannedAmount: number;
  fundedAmount: number;
  allocatedAmount: number;
  availableAmount: number;
  paidOutAmount: number;
  status: string;
}

interface WalletSummary {
  currency: string;
  contractValue: number;
  clientFundedTotal: number;
  clientEscrowHeld: number;
  clientEscrowUnallocated: number;
  professionalEscrowAllocated: number;
  professionalInPayoutProcessing: number;
  professionalAvailable: number;
  professionalPaidOut: number;
  remainingToFund: number;
  milestoneBreakdown: WalletMilestoneBreakdown[];
}

type SlaMode = 'hours' | 'working_days';
type SlaCategory =
  | 'escrow_deposit'
  | 'upfront_payment'
  | 'milestone_payment'
  | 'final_payment'
  | 'cancellation_payment'
  | 'retention_release';

interface SlaRule {
  mode: SlaMode;
  value: number;
}

type SlaCategoryPolicy = Record<SlaCategory, SlaRule>;

interface SlaPolicyResponse {
  projectId: string;
  projectScale: string;
  effectivePolicy: SlaCategoryPolicy;
  overrides: Partial<SlaCategoryPolicy>;
}

interface SlaStatusItem {
  transactionId: string;
  projectProfessionalId?: string | null;
  type: string;
  amount: number;
  actionByRole?: string | null;
  slaCategory: SlaCategory;
  slaRule: SlaRule;
  slaStartsAt: string;
  slaDueAt: string;
  slaStatus: 'on_track' | 'at_risk' | 'breached';
  hoursRemaining: number;
}

interface SlaStatusResponse {
  projectId: string;
  projectScale: string;
  effectivePolicy: SlaCategoryPolicy;
  items: SlaStatusItem[];
}

interface ProjectFinancialsCardProps {
  projectId: string;
  projectProfessionalId?: string;
  accessToken: string;
  projectCost: number | string; // The approved quote
  originalBudget?: number | string; // Original project budget (for client/admin)
  role: ProjectFinancialRole;
  onClarify?: (transactionId: string) => void; // Callback when client clicks Clarify
}

const formatHKD = (value: number | string) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(num);
};

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    escrow_deposit_request: 'Escrow Deposit Request',
    escrow_deposit_confirmation: 'Escrow Deposit Confirmation',
    escrow_deposit: 'Escrow Deposit',
    escrow_confirmation: 'Escrow Confirmed',
    payment_request: 'Payment Request',
    advance_payment_approval: 'Advance Approved',
    advance_payment_rejection: 'Advance Declined',
    release_payment: 'Funds Released To Wallet',
    professional_wallet_transfer: 'Wallet Transfer Completed',
  };
  return map[type] || type;
};

const formatAuditActionLabel = (value?: string | null) => {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const parseMilestoneMetadataFromNotes = (notes?: string | null): { paymentMilestoneId?: string } | null => {
  if (!notes || typeof notes !== 'string') return null;
  const marker = '__FOH_MILESTONE__';
  const index = notes.indexOf(marker);
  if (index < 0) return null;
  const payload = notes.slice(index + marker.length).trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const deriveRoleFromToken = (token?: string | null): ProjectFinancialRole | null => {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as {
      role?: string;
      isProfessional?: boolean;
    };
    if (payload.role === 'admin' || payload.role === 'client' || payload.role === 'professional') {
      return payload.role as ProjectFinancialRole;
    }
    if (payload.isProfessional) return 'professional';
  } catch {
    // ignore decode failures; fall back to props
  }
  return null;
};

const SLA_CATEGORIES: SlaCategory[] = [
  'escrow_deposit',
  'upfront_payment',
  'milestone_payment',
  'final_payment',
  'cancellation_payment',
  'retention_release',
];

const SLA_LABEL_BY_CATEGORY: Record<SlaCategory, string> = {
  escrow_deposit: 'Escrow Deposit',
  upfront_payment: 'Upfront Payment',
  milestone_payment: 'Milestone Payment',
  final_payment: 'Final Payment',
  cancellation_payment: 'Cancellation Payment',
  retention_release: 'Retention Release',
};

const HOURS_OPTIONS = [12, 24, 36, 48, 72, 96];
const WORKING_DAY_OPTIONS = [1, 2, 3, 4, 5];

const formatSlaRule = (rule?: SlaRule | null) => {
  if (!rule) return '—';
  return rule.mode === 'hours' ? `${rule.value}h` : `${rule.value} working day${rule.value > 1 ? 's' : ''}`;
};

export default function ProjectFinancialsCard({
  projectId,
  projectProfessionalId,
  accessToken,
  projectCost,
  originalBudget,
  role,
  onClarify,
}: ProjectFinancialsCardProps) {
  const { role: authRole, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [projectEscrowHeld, setProjectEscrowHeld] = useState<number | string>(0);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [paymentPlanLoading, setPaymentPlanLoading] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionPercent, setRetentionPercent] = useState('5');
  const [retentionReleaseAt, setRetentionReleaseAt] = useState('');
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpTransactionId, setOtpTransactionId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [slaPolicy, setSlaPolicy] = useState<SlaPolicyResponse | null>(null);
  const [slaStatusByTxId, setSlaStatusByTxId] = useState<Record<string, SlaStatusItem>>({});
  const [slaDraft, setSlaDraft] = useState<Partial<SlaCategoryPolicy> | null>(null);
  const [slaSaving, setSlaSaving] = useState(false);
  const [procurementEvidence, setProcurementEvidence] = useState<MilestoneProcurementEvidence[]>([]);
  const [procurementLoading, setProcurementLoading] = useState(false);
  const [procurementBusy, setProcurementBusy] = useState<string | null>(null);
  const [claimedProcurementAmount, setClaimedProcurementAmount] = useState('');
  const [invoiceUrlsInput, setInvoiceUrlsInput] = useState('');
  const [photoUrlsInput, setPhotoUrlsInput] = useState('');
  const [procurementNotes, setProcurementNotes] = useState('');
  const [selectedProcurementEvidenceId, setSelectedProcurementEvidenceId] = useState<string | null>(null);
  const [authorizedProcurementAmount, setAuthorizedProcurementAmount] = useState('');
  const [titleTransferAcknowledged, setTitleTransferAcknowledged] = useState(false);

  const isSlaItemRelevantToRole = (item?: SlaStatusItem | null) => {
    if (!item) return false;
    if (resolvedRole === 'admin') return true;
    const actionRole = String(item.actionByRole || '').toLowerCase();
    if (resolvedRole === 'client') {
      return actionRole === 'client';
    }
    if (resolvedRole === 'professional') {
      return actionRole === 'professional';
    }
    return false;
  };

  // Prevent duplicate in-flight requests
  const requestInFlightRef = useRef<Promise<readonly [Summary, Transaction[], WalletSummary | null, SlaPolicyResponse | null, SlaStatusResponse | null]> | null>(null);

  // Tracks whether financials have been loaded at least once.
  // Prevents the loading spinner from re-appearing on background token-refresh re-fetches,
  // which would hide card content momentarily (and in the page.tsx case, unmount the modal).
  const hasLoadedRef = useRef(false);
  const materialsPurchasePanelRef = useRef<HTMLDivElement | null>(null);

  const resolvedRole = useMemo<ProjectFinancialRole>(() => {
    if (authRole === 'admin' || authRole === 'client' || authRole === 'professional') {
      return authRole as ProjectFinancialRole;
    }
    if (role === 'admin' || role === 'client' || role === 'professional') {
      return role;
    }
    const tokenRole = deriveRoleFromToken(accessToken);
    if (tokenRole) return tokenRole;
    return 'client';
  }, [authRole, role, accessToken]);

  const filteredTransactions = useMemo(() => {
    if (resolvedRole === 'professional' && projectProfessionalId) {
      return transactions.filter((tx) => tx.projectProfessionalId === projectProfessionalId);
    }
    return transactions;
  }, [transactions, resolvedRole, projectProfessionalId]);

  const approvedBudget = useMemo(() => {
    const approvedTx = transactions.find((tx) => tx.type === 'approved_budget');
    if (approvedTx) return approvedTx.amount;
    if (originalBudget !== undefined) return originalBudget;
    return projectCost;
  }, [transactions, originalBudget, projectCost]);

  const paymentsReleasedTotal = useMemo(() => {
    // Only count release_payment transactions with confirmed status
    // payment_request with approved status is pending admin release, not yet paid
    return filteredTransactions
      .filter((tx) => tx.type === 'release_payment' && tx.status?.toLowerCase() === 'confirmed')
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
  }, [filteredTransactions]);

  const escrowConfirmed = useMemo(() => {
    const escrow = filteredTransactions
      .filter(
        (tx) =>
          (tx.type === 'escrow_deposit' && tx.status?.toLowerCase() === 'confirmed') ||
          (tx.type === 'escrow_deposit_confirmation' && tx.status?.toLowerCase() === 'confirmed')
      )
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
    
    if (filteredTransactions.length > 0) {
      console.log('[ProjectFinancials] Filtered Transactions:', filteredTransactions);
      console.log('[ProjectFinancials] Escrow amount:', escrow);
      filteredTransactions.forEach(tx => {
        console.log(`[ProjectFinancials] Tx - Type: ${tx.type}, Status: ${tx.status}, Amount: ${tx.amount}`);
      });
    }
    
    return escrow;
  }, [filteredTransactions]);

  useEffect(() => {
    const load = async () => {
      try {
        if (requestInFlightRef.current) {
          const [, txData, walletData, policyData, statusData] = await requestInFlightRef.current;
          setTransactions(txData);
          setWalletSummary(walletData);
          setSlaPolicy(policyData);
          setSlaStatusByTxId(
            Object.fromEntries((statusData?.items || []).map((item) => [item.transactionId, item]))
          );
          return;
        }

        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        setError(null);

        const combinedPromise = (async () => {
          const walletUrl = new URL(`${API_BASE_URL}/financial/project/${projectId}/wallet-summary`);
          if (projectProfessionalId) {
            walletUrl.searchParams.set('projectProfessionalId', projectProfessionalId);
          }

          const slaPolicyUrl = `${API_BASE_URL}/financial/project/${projectId}/sla-policy`;
          const slaStatusUrl = projectProfessionalId
            ? `${API_BASE_URL}/financial/project/${projectId}/sla-status?projectProfessionalId=${encodeURIComponent(projectProfessionalId)}`
            : `${API_BASE_URL}/financial/project/${projectId}/sla-status`;

          const [summaryRes, txRes, projectRes, paymentPlanRes, walletRes, slaPolicyRes, slaStatusRes] = await Promise.all([
            fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/projects/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(walletUrl.toString(), {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(slaPolicyUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(slaStatusUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          ]);

          if (!summaryRes.ok || !txRes.ok) {
            throw new Error('Failed to load financial data');
          }

          const summaryData: Summary = await summaryRes.json();
          const txData: Transaction[] = await txRes.json();
          const projectData = projectRes.ok ? await projectRes.json() : null;
          const paymentPlanData = paymentPlanRes.ok ? await paymentPlanRes.json() : null;
          const walletData: WalletSummary | null = walletRes.ok ? await walletRes.json() : null;
          const policyData: SlaPolicyResponse | null = slaPolicyRes.ok ? await slaPolicyRes.json() : null;
          const statusData: SlaStatusResponse | null = slaStatusRes.ok ? await slaStatusRes.json() : null;
          
          if (projectData?.escrowHeld !== undefined) {
            setProjectEscrowHeld(projectData.escrowHeld);
          }

          setPaymentPlan(paymentPlanData);
          setWalletSummary(walletData);
          setSlaPolicy(policyData);
          setSlaStatusByTxId(
            Object.fromEntries((statusData?.items || []).map((item) => [item.transactionId, item]))
          );
          
          return [summaryData, txData, walletData, policyData, statusData] as const;
        })();

        setPaymentPlanLoading(true);
        requestInFlightRef.current = combinedPromise;
        const [, txData, walletData, policyData, statusData] = await combinedPromise;
        console.log('[ProjectFinancials] Loaded transactions:', txData);
        hasLoadedRef.current = true;
        setTransactions(txData);
        setWalletSummary(walletData);
        setSlaPolicy(policyData);
        setSlaStatusByTxId(
          Object.fromEntries((statusData?.items || []).map((item) => [item.transactionId, item]))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load financials');
      } finally {
        setPaymentPlanLoading(false);
        requestInFlightRef.current = null;
        setLoading(false);
      }
    };

    if (projectId && accessToken) {
      load();
    }
  }, [projectId, accessToken, projectProfessionalId, resolvedRole]);

  useEffect(() => {
    if (!paymentPlan) return;
    setRetentionEnabled(!!paymentPlan.retentionEnabled);
    setRetentionPercent(
      paymentPlan.retentionPercent !== undefined && paymentPlan.retentionPercent !== null
        ? String(paymentPlan.retentionPercent)
        : '5',
    );
    setRetentionReleaseAt(
      paymentPlan.retentionReleaseAt
        ? new Date(paymentPlan.retentionReleaseAt).toISOString().slice(0, 10)
        : '',
    );
  }, [paymentPlan]);

  useEffect(() => {
    if (!showOtpModal || otpResendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setOtpResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showOtpModal, otpResendCooldown]);

  useEffect(() => {
    if (!slaPolicy?.effectivePolicy) return;
    setSlaDraft(slaPolicy.effectivePolicy);
  }, [slaPolicy?.projectId]);

  const reloadPaymentPlan = async () => {
    try {
      const paymentPlanRes = await fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const paymentPlanData = paymentPlanRes.ok ? await paymentPlanRes.json() : null;
      setPaymentPlan(paymentPlanData);
    } catch {
      // keep previous state
    }
  };

  const handleSaveSlaPolicy = async () => {
    if (resolvedRole !== 'admin') return;
    if (!slaDraft) return;

    setSlaSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/financial/project/${projectId}/sla-policy`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories: slaDraft,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save SLA policy');
      }

      const updated: SlaPolicyResponse = await response.json();
      setSlaPolicy(updated);
      setSlaDraft(updated.effectivePolicy);
      toast.success('SLA policy updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save SLA policy');
    } finally {
      setSlaSaving(false);
    }
  };

  const handleSaveRetention = async () => {
    if (resolvedRole !== 'admin') return;
    if (!paymentPlan || paymentPlan.projectScale !== 'SCALE_3') {
      toast.error('Retention is only available for Scale 3 plans');
      return;
    }

    setRetentionSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan/retention`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retentionEnabled,
          retentionPercent: Number(retentionPercent || 0),
          retentionReleaseAt: retentionReleaseAt ? `${retentionReleaseAt}T00:00:00.000Z` : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save retention settings');
      }

      toast.success('Retention settings updated');
      await reloadPaymentPlan();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save retention settings');
    } finally {
      setRetentionSaving(false);
    }
  };

  const txByMilestone = useMemo(() => {
    const map = new Map<string, { escrowTx?: Transaction; releaseTx?: Transaction }>();
    for (const tx of transactions) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      const milestoneId = meta?.paymentMilestoneId;
      if (!milestoneId) continue;
      const bucket = map.get(milestoneId) || {};
      const status = (tx.status || '').toLowerCase();
      if (tx.type === 'escrow_deposit_request' && status === 'pending') {
        bucket.escrowTx = tx;
      }
      if (tx.type === 'payment_request' && status === 'pending') {
        bucket.releaseTx = tx;
      }
      map.set(milestoneId, bucket);
    }
    return map;
  }, [transactions]);

  const walletMilestoneById = useMemo(() => {
    const map = new Map<string, WalletMilestoneBreakdown>();
    for (const row of walletSummary?.milestoneBreakdown || []) {
      map.set(row.id, row);
    }
    return map;
  }, [walletSummary]);

  const firstMilestone = useMemo(() => {
    const milestones = paymentPlan?.milestones || [];
    return milestones.find((m) => Number(m.sequence) === 1) || milestones[0] || null;
  }, [paymentPlan]);

  const firstMilestoneMeta = useMemo(() => {
    if (!firstMilestone) {
      return {
        capTotal: 0,
        approvedTotal: 0,
        returnedTotal: 0,
        remainingCap: 0,
      };
    }
    let capTotal = 0;
    let approvedTotal = 0;
    let returnedTotal = 0;

    for (const tx of transactions) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      if (!meta?.paymentMilestoneId || meta.paymentMilestoneId !== firstMilestone.id) {
        continue;
      }
      const amount = typeof tx.amount === 'string' ? Number(tx.amount) : Number(tx.amount || 0);
      const status = String(tx.status || '').toLowerCase();
      if (!Number.isFinite(amount) || status !== 'confirmed') continue;

      if (tx.type === 'milestone_foh_allocation_cap') capTotal += amount;
      if (tx.type === 'milestone_procurement_approved') approvedTotal += amount;
      if (tx.type === 'milestone_cap_remainder_return') returnedTotal += amount;
    }

    return {
      capTotal,
      approvedTotal,
      returnedTotal,
      remainingCap: Math.max(capTotal - approvedTotal - returnedTotal, 0),
    };
  }, [transactions, firstMilestone]);

  const firstWalletMilestone = useMemo(() => {
    if (!firstMilestone) return null;
    return walletMilestoneById.get(firstMilestone.id) || null;
  }, [walletMilestoneById, firstMilestone]);

  const isProcurementWorkflowProject = useMemo(
    () => Boolean(paymentPlan && ['SCALE_1', 'SCALE_2'].includes(paymentPlan.projectScale) && firstMilestone),
    [paymentPlan, firstMilestone],
  );

  const pendingProcurementEvidence = useMemo(
    () => procurementEvidence.filter((evidence) => String(evidence.status || '').toLowerCase() === 'pending'),
    [procurementEvidence],
  );

  const selectedProcurementEvidence = useMemo(() => {
    if (!selectedProcurementEvidenceId) return pendingProcurementEvidence[0] || null;
    return pendingProcurementEvidence.find((evidence) => evidence.id === selectedProcurementEvidenceId) || pendingProcurementEvidence[0] || null;
  }, [pendingProcurementEvidence, selectedProcurementEvidenceId]);

  const hasMilestoneEscrowFunded = useMemo(
    () => Number(firstWalletMilestone?.fundedAmount || 0) > 0,
    [firstWalletMilestone],
  );

  const hasProcurementClaim = procurementEvidence.length > 0;
  const canReviewMaterialsPurchase =
    isProcurementWorkflowProject &&
    hasMilestoneEscrowFunded &&
    hasProcurementClaim &&
    (resolvedRole === 'client' || resolvedRole === 'admin');
  const canSubmitMaterialsPurchaseClaim =
    isProcurementWorkflowProject &&
    hasMilestoneEscrowFunded &&
    resolvedRole === 'professional';
  const showMaterialsPurchasePanel = canReviewMaterialsPurchase || canSubmitMaterialsPurchaseClaim;

  useEffect(() => {
    if (pendingProcurementEvidence.length === 0) {
      setSelectedProcurementEvidenceId(null);
      return;
    }

    if (!selectedProcurementEvidenceId || !pendingProcurementEvidence.some((evidence) => evidence.id === selectedProcurementEvidenceId)) {
      setSelectedProcurementEvidenceId(pendingProcurementEvidence[0].id);
    }
  }, [pendingProcurementEvidence, selectedProcurementEvidenceId]);

  useEffect(() => {
    if (!selectedProcurementEvidence) {
      setAuthorizedProcurementAmount('');
      setTitleTransferAcknowledged(false);
      return;
    }

    setAuthorizedProcurementAmount(String(selectedProcurementEvidence.claimedAmount ?? ''));
    setTitleTransferAcknowledged(Boolean(selectedProcurementEvidence.titleTransferAcknowledged));
  }, [selectedProcurementEvidence?.id]);

  const scrollToMaterialsPurchasePanel = () => {
    materialsPurchasePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function fetchProcurementEvidence() {
    if (!firstMilestone || !paymentPlan || !['SCALE_1', 'SCALE_2'].includes(paymentPlan.projectScale)) {
      setProcurementEvidence([]);
      return;
    }
    try {
      setProcurementLoading(true);
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstMilestone.id}/procurement-evidence`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!res.ok) {
        throw new Error('Failed to load procurement evidence');
      }
      const data = await res.json();
      setProcurementEvidence(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load procurement evidence');
    } finally {
      setProcurementLoading(false);
    }
  }

  const authorizeMilestoneCap = async (amount: number) => {
    if (!firstMilestone) {
      throw new Error('Missing milestone context');
    }

    const res = await fetch(
      `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstMilestone.id}/authorize-foh-cap`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Failed to authorize cap');
    }

    if (data.transaction) {
      setTransactions((prev) => [data.transaction as Transaction, ...prev]);
    }
    if (data.walletSummary) {
      setWalletSummary(data.walletSummary as WalletSummary);
    }

    return data;
  };

  const handleSubmitProcurementEvidence = async () => {
    if (!firstMilestone) return;
    const claimedAmount = Number(claimedProcurementAmount || 0);
    if (!Number.isFinite(claimedAmount) || claimedAmount <= 0) {
      toast.error('Enter a valid claimed amount');
      return;
    }
    try {
      setProcurementBusy('submit-evidence');
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstMilestone.id}/procurement-evidence`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            claimedAmount,
            invoiceUrls: invoiceUrlsInput.split(',').map((entry) => entry.trim()).filter(Boolean),
            photoUrls: photoUrlsInput.split(',').map((entry) => entry.trim()).filter(Boolean),
            notes: procurementNotes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to submit procurement evidence');
      }
      toast.success('Procurement evidence submitted');
      setClaimedProcurementAmount('');
      setInvoiceUrlsInput('');
      setPhotoUrlsInput('');
      setProcurementNotes('');
      await fetchProcurementEvidence();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit evidence');
    } finally {
      setProcurementBusy(null);
    }
  };

  const reviewProcurementEvidence = async (
    evidence: MilestoneProcurementEvidence,
    decision: 'approved' | 'rejected',
    options?: { approvedAmount?: number; titleTransferAcknowledged?: boolean },
  ) => {
    if (!firstMilestone) {
      throw new Error('Missing milestone context');
    }

    const res = await fetch(
      `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstMilestone.id}/procurement-evidence/${evidence.id}/review`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          approvedAmount: options?.approvedAmount,
          titleTransferAcknowledged: options?.titleTransferAcknowledged,
        }),
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Failed to review evidence');
    }

    if (data.transaction) {
      setTransactions((prev) => [data.transaction as Transaction, ...prev]);
    }
    if (data.walletSummary) {
      setWalletSummary(data.walletSummary as WalletSummary);
    }

    return data;
  };

  const returnCapRemainder = async () => {
    if (!firstMilestone) {
      throw new Error('Missing milestone context');
    }

    const res = await fetch(
      `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstMilestone.id}/return-foh-cap-remainder`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Failed to return cap remainder');
    }

    if (data.transaction) {
      setTransactions((prev) => [data.transaction as Transaction, ...prev]);
    }
    if (data.walletSummary) {
      setWalletSummary(data.walletSummary as WalletSummary);
    }

    return data;
  };

  const handleRejectProcurementEvidence = async (evidence: MilestoneProcurementEvidence) => {
    try {
      setProcurementBusy(`reject-${evidence.id}`);
      await reviewProcurementEvidence(evidence, 'rejected');
      toast.success('Claim rejected');
      await Promise.all([fetchProcurementEvidence(), reloadPaymentPlan()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject claim');
    } finally {
      setProcurementBusy(null);
    }
  };

  const handleApproveAndSettleProcurement = async () => {
    if (!firstMilestone || !selectedProcurementEvidence) return;

    const approvedAmount = Number(authorizedProcurementAmount || 0);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      toast.error('Enter a valid value to authorise');
      return;
    }

    const defaultCapAmount = Number(firstMilestone.amount || 0);
    const availableCap = firstMilestoneMeta.remainingCap > 0 ? firstMilestoneMeta.remainingCap : defaultCapAmount;
    if (!Number.isFinite(availableCap) || availableCap <= 0) {
      toast.error('No milestone amount is available to authorise');
      return;
    }
    if (approvedAmount > availableCap) {
      toast.error('Authorised amount exceeds the available milestone amount');
      return;
    }

    try {
      setProcurementBusy(`settle-${selectedProcurementEvidence.id}`);

      if (firstMilestoneMeta.capTotal <= 0) {
        await authorizeMilestoneCap(defaultCapAmount);
      }

      await reviewProcurementEvidence(selectedProcurementEvidence, 'approved', {
        approvedAmount,
        titleTransferAcknowledged,
      });

      const remainderAfterApproval = Math.max(availableCap - approvedAmount, 0);
      if (remainderAfterApproval > 0) {
        await returnCapRemainder();
      }

      toast.success(
        remainderAfterApproval > 0
          ? 'Authorised amount moved to the professional wallet and the balance returned to client escrow'
          : 'Authorised amount moved to the professional wallet',
      );
      await Promise.all([fetchProcurementEvidence(), reloadPaymentPlan()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to settle project materials purchase');
    } finally {
      setProcurementBusy(null);
    }
  };

  useEffect(() => {
    if (!paymentPlan || !firstMilestone) {
      setProcurementEvidence([]);
      return;
    }
    if (!['SCALE_1', 'SCALE_2'].includes(paymentPlan.projectScale)) {
      setProcurementEvidence([]);
      return;
    }
    void fetchProcurementEvidence();
  }, [paymentPlan?.id, paymentPlan?.projectScale, firstMilestone?.id]);

  const handleConfirmDeposit = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/confirm-deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to confirm deposit');
      toast.success('Deposit confirmed');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReleasePayment = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/release`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to release payment');
      toast.success('Payment released');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to release payment');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprovePayment = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to approve payment');
      toast.success('Payment approved');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed', type: 'advance_payment_approval' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve payment');
    } finally {
      setProcessingId(null);
    }
  };

  const handleClarifyPayment = async (transactionId: string) => {
    try {
      setProcessingId(null);
      // If callback provided (client view), use it to coordinate with chat
      if (onClarify) {
        onClarify(transactionId);
        toast.success('Scroll to chat to clarify with professional');
      } else {
        // Professional view: scroll to chat on page
        const chatElement = document.getElementById('project-chat');
        if (chatElement) {
          chatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => {
            const inputElement = chatElement.querySelector('input[type="text"]');
            if (inputElement instanceof HTMLInputElement) {
              inputElement.focus();
            }
          }, 500);
        }
        toast.success('Scroll to chat to clarify payment request with professional');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to navigate to chat');
    }
  };

  const closeOtpModal = () => {
    setShowOtpModal(false);
    setOtpTransactionId(null);
    setOtpCode('');
    setOtpSending(false);
    setOtpVerifying(false);
    setOtpResendCooldown(0);
    setProcessingId(null);
  };

  const requestEscrowOtp = async (transactionId: string) => {
    setOtpSending(true);
    try {
      const otpRequestRes = await fetch(`${API_BASE_URL}/financial/${transactionId}/checkout-otp/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!otpRequestRes.ok) {
        const data = await otpRequestRes.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send OTP');
      }

      setOtpResendCooldown(60);
      toast.success('OTP sent to your email and preferred contact channel');
    } finally {
      setOtpSending(false);
    }
  };

  const handlePayEscrow = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      await requestEscrowOtp(transactionId);
      setOtpTransactionId(transactionId);
      setOtpCode('');
      setShowOtpModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start escrow checkout');
      setProcessingId(null);
    }
  };

  const handleAuthorizeMaterialsWalletTransfer = async () => {
    if (!firstMilestone) return;
    if (!window.confirm(`Transfer ${formatHKD(Number(firstMilestone.amount))} to the professional's materials holding wallet?\n\nThis amount will only become withdrawable by the professional once you approve their purchase invoices.`)) {
      return;
    }
    try {
      setProcessingId('cap-authorize');
      await authorizeMilestoneCap(Number(firstMilestone.amount));
      toast.success('Materials wallet transfer authorized');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to authorize transfer');
    } finally {
      setProcessingId(null);
    }
  };

  const handleTransferAvailableFunds = async () => {
    if (resolvedRole !== 'professional') {
      return;
    }
    if (!projectProfessionalId) {
      toast.error('Missing project professional context');
      return;
    }

    const amount = Number(transferAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid transfer amount');
      return;
    }
    if (amount > cashflow.professionalAvailable) {
      toast.error('Transfer amount exceeds available balance');
      return;
    }

    try {
      setTransferLoading(true);
      const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}/professional-wallet/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectProfessionalId,
          amount,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to transfer wallet funds');
      }

      const data = await res.json() as {
        transaction?: Transaction;
        walletSummary?: WalletSummary;
      };

      if (data.transaction) {
        setTransactions((prev) => [data.transaction as Transaction, ...prev]);
      }
      if (data.walletSummary) {
        setWalletSummary(data.walletSummary);
      }
      setTransferAmount('');
      toast.success('Transfer completed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer wallet funds');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleConfirmWalletTransfer = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/confirm-wallet-transfer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to confirm wallet transfer');
      }
      toast.success('Wallet transfer marked as paid out');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed', actionComplete: true } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm wallet transfer');
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyOtpAndCheckout = async () => {
    if (!otpTransactionId) {
      return;
    }

    const trimmedCode = otpCode.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      setOtpVerifying(true);
      const otpVerifyRes = await fetch(`${API_BASE_URL}/financial/${otpTransactionId}/checkout-otp/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: trimmedCode }),
      });

      if (!otpVerifyRes.ok) {
        const data = await otpVerifyRes.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid OTP code');
      }

      const res = await fetch(`${API_BASE_URL}/financial/${otpTransactionId}/checkout-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to start escrow checkout');
      }

      const data = await res.json() as { checkoutUrl?: string };
      if (!data.checkoutUrl) {
        throw new Error('Checkout URL missing from API response');
      }

      closeOtpModal();
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start escrow checkout');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleViewStatement = async () => {
    try {
      setShowStatement(true);
      const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}/statement`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load statement');
      const data: Statement = await res.json();
      setStatement(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load statement');
      setShowStatement(false);
    }
  };

  const cashflow = useMemo(() => {
    const fallbackContractValue =
      typeof approvedBudget === 'string' ? parseFloat(approvedBudget) : Number(approvedBudget || projectCost || 0);
    const fallbackEscrowHeld =
      typeof projectEscrowHeld === 'string' ? parseFloat(projectEscrowHeld) : Number(projectEscrowHeld || escrowConfirmed || 0);
    const fallbackPaidOut = Number(paymentsReleasedTotal || 0);

    if (walletSummary) {
      return {
        contractValue: Number(walletSummary.contractValue || 0),
        clientEscrowHeld: Number(walletSummary.clientEscrowHeld || 0),
        clientEscrowUnallocated: Number(walletSummary.clientEscrowUnallocated || 0),
        professionalEscrowAllocated: Number(walletSummary.professionalEscrowAllocated || 0),
        professionalInPayoutProcessing: Number(walletSummary.professionalInPayoutProcessing || 0),
        professionalAvailable: Number(walletSummary.professionalAvailable || 0),
        professionalPaidOut: Number(walletSummary.professionalPaidOut || 0),
        remainingToFund: Number(walletSummary.remainingToFund || 0),
      };
    }

    return {
      contractValue: fallbackContractValue,
      clientEscrowHeld: fallbackEscrowHeld,
      clientEscrowUnallocated: Math.max(fallbackEscrowHeld, 0),
      professionalEscrowAllocated: 0,
      professionalInPayoutProcessing: 0,
      professionalAvailable: 0,
      professionalPaidOut: fallbackPaidOut,
      remainingToFund: Math.max(fallbackContractValue - fallbackEscrowHeld - fallbackPaidOut, 0),
    };
  }, [walletSummary, approvedBudget, projectCost, projectEscrowHeld, escrowConfirmed, paymentsReleasedTotal]);

  const cashflowSegments = useMemo(() => {
    const contract = Math.max(cashflow.contractValue, 0);
    if (contract <= 0) return [] as Array<{ key: string; label: string; amount: number; className: string; widthPercent: number }>;

    const segments = [
      {
        key: 'client-wallet',
        label: 'Client Wallet',
        amount: cashflow.clientEscrowUnallocated,
        className: 'bg-blue-400',
      },
      {
        key: 'available',
        label: 'Transfer-Ready (Professional)',
        amount: cashflow.professionalAvailable,
        className: 'bg-emerald-400',
      },
      {
        key: 'professional-wallet',
        label: 'Professional Wallet',
        amount: cashflow.professionalEscrowAllocated + cashflow.professionalInPayoutProcessing,
        className: 'bg-amber-400',
      },
      {
        key: 'paid-out',
        label: 'Paid Out',
        amount: cashflow.professionalPaidOut,
        className: 'bg-emerald-600',
      },
      {
        key: 'remaining',
        label: 'Remainder to Fund',
        amount: cashflow.remainingToFund,
        className: 'bg-slate-600',
      },
    ];

    return segments.map((segment) => ({
      ...segment,
      widthPercent: Math.max(0, Math.min(100, (segment.amount / contract) * 100)),
    }));
  }, [cashflow]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-5 border-b border-slate-700 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Project Financials</h2>
          <button
            onClick={handleViewStatement}
            className="mt-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
          >
            View Statement
          </button>
        </div>
        {(resolvedRole === 'client' || resolvedRole === 'admin') && originalBudget && (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Confirmed Quotation</p>
            <p className="text-lg font-bold text-white">{formatHKD(originalBudget)}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-5 text-sm text-slate-400">Loading financials...</div>
      ) : error ? (
        <div className="p-5 text-sm text-rose-400">{error}</div>
      ) : (
        <div className="p-5 flex flex-col gap-6">
          <div className="order-1 rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Cashflow Overview</h3>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Contract Value: {formatHKD(cashflow.contractValue)}
              </p>
            </div>

            <div className="h-4 w-full overflow-hidden rounded-full bg-slate-700/80">
              <div className="flex h-full w-full">
                {cashflowSegments.map((segment) => (
                  <div
                    key={segment.key}
                    className={segment.className}
                    style={{ width: `${segment.widthPercent}%` }}
                    title={`${segment.label}: ${formatHKD(segment.amount)}`}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {cashflowSegments.map((segment) => (
                <div key={`legend-${segment.key}`} className="rounded-md border border-slate-700 bg-slate-900/60 p-2">
                  <p className="text-sm font-semibold text-white">{formatHKD(segment.amount)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${segment.className}`} />
                    <p className="text-[10px] font-normal text-slate-300">{segment.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {resolvedRole === 'professional' && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Professional Wallet</p>
                    <p className="mt-1 text-sm text-emerald-100">
                      Available to transfer: <span className="font-semibold">{formatHKD(cashflow.professionalAvailable)}</span>
                    </p>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={transferAmount}
                      onChange={(event) => setTransferAmount(event.target.value)}
                      placeholder="Amount"
                      className="w-full rounded-md border border-emerald-300/40 bg-slate-900 px-3 py-1.5 text-sm text-white sm:w-40"
                    />
                    <button
                      type="button"
                      onClick={handleTransferAvailableFunds}
                      disabled={transferLoading || cashflow.professionalAvailable <= 0}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {transferLoading ? 'Transferring...' : 'Transfer'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Plan (Phase A visibility) */}
          {!paymentPlanLoading && paymentPlan && (
            <div className="order-3 rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Payment Plan</h3>
                <StatusPill
                  status={paymentPlan.status}
                  label={paymentPlan.status.replace(/_/g, ' ')}
                  tone={statusToneFromStatus(paymentPlan.status)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Scale</p>
                  <p className="text-sm font-semibold text-white mt-1">{paymentPlan.projectScale.replace('_', ' ')}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Escrow Policy</p>
                  <p className="text-sm font-semibold text-white mt-1">{paymentPlan.escrowFundingPolicy.replace(/_/g, ' ')}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Project Total</p>
                  <p className="text-sm font-semibold text-white mt-1">{formatHKD(paymentPlan.totalAmount)}</p>
                </div>
              </div>

              {canReviewMaterialsPurchase && (
                <div className="rounded-md border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Financial Actions</p>
                      <p className="mt-1 text-xs text-cyan-100">A materials claim is ready for client review.</p>
                    </div>
                    <button
                      type="button"
                      onClick={scrollToMaterialsPurchasePanel}
                      className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
                    >
                      Review materials purchase
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left">
                      <th className="px-3 py-2 text-white font-semibold">#</th>
                      <th className="px-3 py-2 text-white font-semibold">Milestone</th>
                      <th className="px-3 py-2 text-white font-semibold">Due</th>
                      <th className="px-3 py-2 text-white font-semibold">Split</th>
                      <th className="px-3 py-2 text-white font-semibold">Amount</th>
                      <th className="px-3 py-2 text-white font-semibold">Funded</th>
                      <th className="px-3 py-2 text-white font-semibold">Allocated</th>
                      <th className="px-3 py-2 text-white font-semibold">Available</th>
                      <th className="px-3 py-2 text-white font-semibold">Status</th>
                      {(resolvedRole === 'client') && <th className="px-3 py-2 text-white font-semibold text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPlan.milestones.map((milestone) => {
                      const linkedTx = txByMilestone.get(milestone.id);
                      const walletMilestone = walletMilestoneById.get(milestone.id);
                      const canPayMilestoneEscrow =
                        resolvedRole === 'client' &&
                        milestone.status === 'escrow_requested' &&
                        !!linkedTx?.escrowTx;
                      const canApproveMilestoneRelease =
                        resolvedRole === 'client' &&
                        milestone.status === 'release_requested' &&
                        !!linkedTx?.releaseTx;

                      return (
                        <tr key={milestone.id} className="border-b border-slate-800">
                          <td className="px-3 py-2 text-slate-200">{milestone.sequence}</td>
                          <td className="px-3 py-2 text-slate-200">
                            <div>{milestone.title}</div>
                            {milestone.projectMilestone && (
                              <div className="text-[11px] text-slate-400 mt-1">
                                Linked schedule: {milestone.projectMilestone.sequence}. {milestone.projectMilestone.title}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {milestone.plannedDueAt ? new Date(milestone.plannedDueAt).toLocaleDateString('en-HK') : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {typeof milestone.percentOfTotal === 'number'
                              ? `${milestone.percentOfTotal}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-white font-semibold">{formatHKD(milestone.amount)}</td>
                          <td className="px-3 py-2 text-slate-200">{formatHKD(walletMilestone?.fundedAmount || 0)}</td>
                          <td className="px-3 py-2 text-slate-200">{formatHKD(walletMilestone?.allocatedAmount || 0)}</td>
                          <td className="px-3 py-2 text-slate-200">{formatHKD(walletMilestone?.availableAmount || 0)}</td>
                          <td className="px-3 py-2">
                            <StatusPill
                              status={milestone.status}
                              label={milestone.status.replace(/_/g, ' ')}
                              tone={statusToneFromStatus(milestone.status)}
                            />
                          </td>
                          {resolvedRole === 'client' && (
                            <td className="px-3 py-2 text-right">
                              {canPayMilestoneEscrow ? (
                                <button
                                  type="button"
                                  onClick={() => handlePayEscrow(linkedTx!.escrowTx!.id)}
                                  disabled={processingId === linkedTx!.escrowTx!.id}
                                  className="w-[120px] px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                                >
                                  {processingId === linkedTx!.escrowTx!.id ? 'Processing...' : 'Fund Escrow'}
                                </button>
                              ) : canApproveMilestoneRelease ? (
                                <button
                                  type="button"
                                  onClick={() => handleApprovePayment(linkedTx!.releaseTx!.id)}
                                  disabled={processingId === linkedTx!.releaseTx!.id}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-slate-400 transition"
                                >
                                  {processingId === linkedTx!.releaseTx!.id ? 'Approving...' : 'Approve Release'}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {showMaterialsPurchasePanel && (
                <div ref={materialsPurchasePanelRef} className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Project materials purchase</h4>
                      <p className="mt-1 text-xs text-cyan-100">
                        Review materials evidence and move the approved amount to the professional wallet.
                      </p>
                    </div>
                    <div className="grid gap-1 text-xs text-cyan-100">
                      <p>Milestone: <span className="font-semibold text-white">{firstMilestone?.title || 'Milestone 1'}</span></p>
                      <p>Funded: <span className="font-semibold text-white">{formatHKD(firstWalletMilestone?.fundedAmount || 0)}</span></p>
                      <p>Approved: <span className="font-semibold text-white">{formatHKD(firstMilestoneMeta.approvedTotal)}</span></p>
                      <p>Unallocated balance: <span className="font-semibold text-white">{formatHKD(firstMilestoneMeta.remainingCap > 0 ? firstMilestoneMeta.remainingCap : Math.max(Number(firstMilestone?.amount || 0) - firstMilestoneMeta.approvedTotal - firstMilestoneMeta.returnedTotal, 0))}</span></p>
                    </div>
                  </div>

                  {canSubmitMaterialsPurchaseClaim && (
                    <div className="rounded-md border border-cyan-400/30 bg-slate-900/50 p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Submit materials claim</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={claimedProcurementAmount}
                          onChange={(event) => setClaimedProcurementAmount(event.target.value)}
                          placeholder="Claimed amount"
                          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={invoiceUrlsInput}
                          onChange={(event) => setInvoiceUrlsInput(event.target.value)}
                          placeholder="Invoice URLs (comma separated)"
                          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={photoUrlsInput}
                          onChange={(event) => setPhotoUrlsInput(event.target.value)}
                          placeholder="Photo URLs (comma separated)"
                          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={procurementNotes}
                          onChange={(event) => setProcurementNotes(event.target.value)}
                          placeholder="Notes"
                          className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSubmitProcurementEvidence}
                        disabled={procurementBusy === 'submit-evidence'}
                        className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {procurementBusy === 'submit-evidence' ? 'Submitting...' : 'Submit claim'}
                      </button>
                    </div>
                  )}

                  <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Evidence Queue</p>
                      {procurementLoading && <p className="text-xs text-slate-400">Loading...</p>}
                    </div>
                    {procurementEvidence.length === 0 ? (
                      <p className="text-xs text-slate-400">No materials claims submitted yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {procurementEvidence.map((evidence) => {
                          const isPending = String(evidence.status || '').toLowerCase() === 'pending';
                          const isSelected = evidence.id === selectedProcurementEvidence?.id;
                          return (
                            <div
                              key={evidence.id}
                              className={`rounded border p-2 space-y-2 ${isSelected ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/40'}`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="space-y-1">
                                  <p className="text-xs text-white">
                                    Claimed: <span className="font-semibold">{formatHKD(evidence.claimedAmount)}</span>
                                    {evidence.approvedAmount ? ` | Approved: ${formatHKD(evidence.approvedAmount)}` : ''}
                                  </p>
                                  <p className="text-[11px] text-slate-400">
                                    Submitted {new Date(evidence.createdAt).toLocaleDateString('en-HK')}
                                  </p>
                                </div>
                                <StatusPill
                                  status={evidence.status}
                                  label={String(evidence.status || '').replace(/_/g, ' ')}
                                  tone={statusToneFromStatus(evidence.status)}
                                />
                              </div>
                              {evidence.notes && <p className="text-xs text-slate-300">{evidence.notes}</p>}
                              {canReviewMaterialsPurchase && isPending && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedProcurementEvidenceId(evidence.id)}
                                    className={`rounded px-2 py-1 text-[11px] font-semibold text-white ${isSelected ? 'bg-cyan-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}
                                  >
                                    {isSelected ? 'Selected' : 'Review this claim'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectProcurementEvidence(evidence)}
                                    disabled={procurementBusy === `reject-${evidence.id}`}
                                    className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    {procurementBusy === `reject-${evidence.id}` ? 'Rejecting...' : 'Reject'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {canReviewMaterialsPurchase && (
                    <div className="rounded-md border border-cyan-400/30 bg-slate-900/50 p-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Settlement</p>
                        <p className="mt-1 text-xs text-cyan-100">
                          Enter the amount to authorise for the selected claim. Any remaining milestone 1 balance is returned to the client escrow pool in the same action.
                        </p>
                      </div>

                      {selectedProcurementEvidence ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={authorizedProcurementAmount}
                            onChange={(event) => setAuthorizedProcurementAmount(event.target.value)}
                            placeholder="Value to authorise"
                            className="w-full rounded-md border border-cyan-300/30 bg-slate-900 px-3 py-2 text-sm text-white"
                          />
                          <label className="flex items-center gap-2 text-xs text-cyan-100">
                            <input
                              type="checkbox"
                              checked={titleTransferAcknowledged}
                              onChange={(event) => setTitleTransferAcknowledged(event.target.checked)}
                            />
                            Confirm title transfer acknowledgement for the purchased items
                          </label>
                          <button
                            type="button"
                            onClick={handleApproveAndSettleProcurement}
                            disabled={procurementBusy === `settle-${selectedProcurementEvidence.id}`}
                            className="rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                          >
                            {procurementBusy === `settle-${selectedProcurementEvidence.id}`
                              ? 'Processing...'
                              : 'Authorise purchase and return balance'}
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">No pending materials claims need review.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {paymentPlan.projectScale === 'SCALE_3' && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Retention</p>
                      <p className="text-xs text-amber-100 mt-1">
                        Optional holdback released one month after completion (admin editable).
                      </p>
                    </div>
                    {(resolvedRole !== 'admin') && (
                      <p className="text-xs text-amber-100">
                        {paymentPlan.retentionEnabled
                          ? `${paymentPlan.retentionPercent}% (${formatHKD(paymentPlan.retentionAmount || 0)})`
                          : 'Not enabled'}
                      </p>
                    )}
                  </div>

                  {resolvedRole === 'admin' && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex items-center gap-2 text-sm text-amber-100">
                          <input
                            type="checkbox"
                            checked={retentionEnabled}
                            onChange={(e) => setRetentionEnabled(e.target.checked)}
                          />
                          Enable retention
                        </label>
                        <label className="text-sm text-amber-100">
                          <span className="block text-xs mb-1">Retention %</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={retentionPercent}
                            onChange={(e) => setRetentionPercent(e.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-white"
                          />
                        </label>
                        <label className="text-sm text-amber-100">
                          <span className="block text-xs mb-1">Retention release date</span>
                          <input
                            type="date"
                            value={retentionReleaseAt}
                            onChange={(e) => setRetentionReleaseAt(e.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-white"
                          />
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveRetention}
                          disabled={retentionSaving}
                          className="rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {retentionSaving ? 'Saving...' : 'Save retention settings'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {resolvedRole === 'admin' && slaDraft && (
                <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">SLA Policy</h4>
                      <p className="text-xs text-indigo-100 mt-1">Configure response windows per payment category for this project.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSlaPolicy}
                      disabled={slaSaving}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {slaSaving ? 'Saving...' : 'Save SLA'}
                    </button>
                  </div>
                  <div className="grid gap-2">
                    {SLA_CATEGORIES.map((category) => {
                      const rule = slaDraft[category] || { mode: 'hours' as SlaMode, value: 24 };
                      const valueOptions = rule.mode === 'hours' ? HOURS_OPTIONS : WORKING_DAY_OPTIONS;
                      return (
                        <div key={category} className="grid gap-2 rounded-md border border-indigo-400/20 bg-slate-900/40 p-2 sm:grid-cols-[minmax(0,1fr),120px,120px] sm:items-center">
                          <p className="text-xs text-white">{SLA_LABEL_BY_CATEGORY[category]}</p>
                          <select
                            value={rule.mode}
                            onChange={(event) => {
                              const mode = event.target.value as SlaMode;
                              setSlaDraft((prev) => {
                                const base = prev || {};
                                const nextValue = mode === 'hours' ? 24 : 3;
                                return {
                                  ...base,
                                  [category]: {
                                    mode,
                                    value: nextValue,
                                  },
                                };
                              });
                            }}
                            className="rounded-md border border-indigo-300/40 bg-slate-900 px-2 py-1 text-xs text-white"
                          >
                            <option value="hours">Hours</option>
                            <option value="working_days">Working days</option>
                          </select>
                          <select
                            value={rule.value}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              setSlaDraft((prev) => ({
                                ...(prev || {}),
                                [category]: {
                                  mode: rule.mode,
                                  value,
                                },
                              }));
                            }}
                            className="rounded-md border border-indigo-300/40 bg-slate-900 px-2 py-1 text-xs text-white"
                          >
                            {valueOptions.map((value) => (
                              <option key={`${category}-${rule.mode}-${value}`} value={value}>
                                {rule.mode === 'hours' ? `${value}h` : `${value}d`}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {resolvedRole !== 'admin' && slaPolicy?.effectivePolicy && (
                <div className="rounded-md border border-indigo-500/20 bg-indigo-500/10 p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">SLA Policy</h4>
                    <p className="text-xs text-indigo-100 mt-1">Read-only SLA response windows for this project.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {SLA_CATEGORIES.map((category) => {
                      const rule = slaPolicy.effectivePolicy[category];
                      return (
                        <div key={`sla-readonly-${category}`} className="rounded-md border border-indigo-400/20 bg-slate-900/40 p-2">
                          <p className="text-[11px] font-medium text-slate-200">{SLA_LABEL_BY_CATEGORY[category]}</p>
                          <p className="mt-1 text-xs text-indigo-100">{formatSlaRule(rule)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Transactions table */}
          <div className="order-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white border-b border-slate-600">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Action On</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-300">No financial transactions yet</td>
                  </tr>
                )}
                {/* Pending materials wallet transfer — shown before cap is authorized for SCALE_1/2 projects */}
                {isProcurementWorkflowProject && hasMilestoneEscrowFunded && firstMilestoneMeta.capTotal === 0 && (resolvedRole === 'client' || resolvedRole === 'admin') && (
                  <tr className="border-b border-slate-700 bg-indigo-900/10">
                    <td className="py-2 pr-4 text-slate-400 text-sm">—</td>
                    <td className="py-2 pr-4 text-white">
                      <div className="flex items-center gap-2">
                        <span className="capitalize">Client</span>
                        {resolvedRole === 'client' && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-white">Materials Wallet Transfer</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Milestone 1 procurement cap — held in professional wallet until invoices approved
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-white font-semibold">{formatHKD(Number(firstMilestone!.amount))}</td>
                    <td className="py-2 pr-4">
                      <StatusPill status="pending" label="pending" tone="warning" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {resolvedRole === 'client' && (
                          <button
                            type="button"
                            onClick={handleAuthorizeMaterialsWalletTransfer}
                            disabled={processingId === 'cap-authorize'}
                            className="w-[140px] px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:bg-slate-400 transition"
                          >
                            {processingId === 'cap-authorize' ? 'Processing...' : 'Transfer to Wallet'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {filteredTransactions.map((tx) => {
                  const createdDate = new Date(tx.createdAt).toLocaleDateString('en-HK');
                  const status = (tx.status || '').toLowerCase();
                  const statusKey = status.replace(/\s+/g, '_');
                  const type = tx.type;
                  const canConfirmDeposit =
                    resolvedRole === 'admin' &&
                    ((type === 'escrow_deposit' && statusKey === 'pending') ||
                      (type === 'escrow_deposit_confirmation' && statusKey === 'pending'));
                  console.log('[ProjectFinancials] Action checks:', {
                    id: tx.id,
                    type,
                    statusKey,
                    role: resolvedRole,
                    canConfirmDeposit,
                    actionByRole: tx.actionByRole,
                  });
                  const canApprove =
                    resolvedRole === 'client' && type === 'payment_request' && statusKey === 'pending';
                  const canRelease =
                    resolvedRole === 'admin' && type === 'release_payment' && statusKey === 'pending';
                  const canConfirmWalletTransfer =
                    resolvedRole === 'admin' && type === 'professional_wallet_transfer' && statusKey === 'pending';
                  const canReject =
                    resolvedRole === 'client' && type === 'payment_request' && statusKey === 'pending';
                  const canPayEscrow =
                    resolvedRole === 'client' && type === 'escrow_deposit_request' && statusKey === 'pending';
                  const actionRole = (tx.actionByRole || '').toLowerCase();
                  const actionOn = tx.actionByRole || tx.requestedByRole || '—';
                  const roleMatches =
                    (actionRole === 'admin' && resolvedRole === 'admin') ||
                    (actionRole === 'client' && resolvedRole === 'client') ||
                    (actionRole === 'professional' && resolvedRole === 'professional') ||
                    (actionRole === 'platform' && resolvedRole === 'admin');
                  const userMatches = tx.actionBy && user?.id === tx.actionBy;
                  const highlightActor = !tx.actionComplete && (roleMatches || userMatches);
                  const isInfo = statusKey === 'info';
                  const slaItem = slaStatusByTxId[tx.id];
                  const showSlaForRole = isSlaItemRelevantToRole(slaItem);

                  const actionButton = () => {
                    if (isInfo) {
                      return <span className="text-slate-400 text-xs">—</span>;
                    }
                    if (canPayEscrow) {
                      return (
                        <button
                          type="button"
                          onClick={() => handlePayEscrow(tx.id)}
                          disabled={processingId === tx.id}
                          className="w-[120px] px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Processing...' : 'Fund Escrow'}
                        </button>
                      );
                    }
                    if (canConfirmDeposit) {
                      return (
                        <button
                          type="button"
                          onClick={() => handleConfirmDeposit(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Confirming...' : 'Confirm'}
                        </button>
                      );
                    }
                    if (canRelease) {
                      return (
                        <button
                          type="button"
                          onClick={() => handleReleasePayment(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Releasing...' : 'Release'}
                        </button>
                      );
                    }
                    if (canConfirmWalletTransfer) {
                      return (
                        <button
                          type="button"
                          onClick={() => handleConfirmWalletTransfer(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-violet-600 text-white rounded text-xs font-medium hover:bg-violet-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Confirming...' : 'Mark Paid Out'}
                        </button>
                      );
                    }
                    if (canApprove) {
                      return (
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => handleApprovePayment(tx.id)}
                            disabled={processingId === tx.id}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                          >
                            {processingId === tx.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClarifyPayment(tx.id)}
                            disabled={processingId === tx.id}
                            className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 disabled:bg-slate-400 transition"
                          >
                            {processingId === tx.id ? 'Processing...' : 'Clarify'}
                          </button>
                        </div>
                      );
                    }
                    if (canReject) {
                      return (
                        <button
                          type="button"
                          onClick={() => handleClarifyPayment(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Processing...' : 'Clarify'}
                        </button>
                      );
                    }
                    return <span className="text-slate-400 text-xs">—</span>;
                  };

                  return (
                    <tr key={tx.id} className="border-b border-slate-700">
                      <td className="py-2 pr-4 text-white">{createdDate}</td>
                      <td className="py-2 pr-4 text-white">
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{actionOn.replace('_', ' ')}</span>
                          {highlightActor && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{getTypeLabel(tx.type)}</span>
                            {showSlaForRole && (
                              <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                slaItem!.slaStatus === 'breached'
                                  ? 'bg-rose-500/20 text-rose-200'
                                  : slaItem!.slaStatus === 'at_risk'
                                    ? 'bg-amber-500/20 text-amber-200'
                                    : 'bg-emerald-500/20 text-emerald-200'
                              }`}>
                                SLA: {slaItem!.slaStatus.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          {tx.auditSummary?.latestAction && (
                            <span className="inline-flex w-fit items-center rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-200">
                              Last audited: {formatAuditActionLabel(tx.auditSummary.latestAction)}
                            </span>
                          )}
                          {showSlaForRole && (
                            <span className="inline-flex w-fit items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-100">
                              Due: {new Date(slaItem!.slaDueAt).toLocaleString('en-HK')} ({formatSlaRule(slaItem!.slaRule)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-white font-semibold">{formatHKD(tx.amount)}</td>
                      <td className="py-2 pr-4">
                        <StatusPill status={tx.status} label={statusKey.replace('_', ' ')} tone={statusToneFromStatus(tx.status)} />
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {actionButton()}
                          {!isInfo && (
                            <button
                              type="button"
                              onClick={() => setSelectedTx(tx)}
                              className="text-xs text-blue-400 hover:underline"
                            >
                              Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={closeOtpModal}>
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Verify escrow payment</h3>
              <button
                onClick={closeOtpModal}
                disabled={otpVerifying}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Enter the 6-digit OTP sent to your email and preferred contact channel.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit OTP"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none"
              disabled={otpVerifying}
            />

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => otpTransactionId && requestEscrowOtp(otpTransactionId)}
                disabled={otpSending || otpVerifying || otpResendCooldown > 0}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-slate-400"
              >
                {otpResendCooldown > 0 ? `Resend OTP in ${otpResendCooldown}s` : otpSending ? 'Sending OTP...' : 'Resend OTP'}
              </button>
              <span className="text-xs text-slate-500">Code expires in 10 minutes</span>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeOtpModal}
                disabled={otpVerifying}
                className="px-4 py-2 bg-slate-200 text-slate-800 rounded text-sm font-medium hover:bg-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyOtpAndCheckout}
                disabled={otpVerifying || otpSending || otpCode.trim().length !== 6}
                className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-400"
              >
                {otpVerifying ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSelectedTx(null)}>
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Transaction Details</h3>
              <button onClick={() => setSelectedTx(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Type</p>
                <p className="text-slate-900">{getTypeLabel(selectedTx.type)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Description</p>
                <p className="text-slate-900">{selectedTx.description}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Amount</p>
                <p className="text-slate-900 font-semibold">{formatHKD(selectedTx.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Status</p>
                <StatusPill status={selectedTx.status} label={selectedTx.status} tone={statusToneFromStatus(selectedTx.status)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Requested By</p>
                  <p className="text-slate-900 capitalize">{selectedTx.requestedByRole || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Action By</p>
                  <p className="text-slate-900 capitalize">{selectedTx.actionByRole || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Created</p>
                  <p className="text-slate-700">{new Date(selectedTx.createdAt).toLocaleString('en-HK')}</p>
                </div>
                {selectedTx.actionAt && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase">Action Taken</p>
                    <p className="text-slate-700">{new Date(selectedTx.actionAt).toLocaleString('en-HK')}</p>
                  </div>
                )}
              </div>
              {selectedTx.notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Notes</p>
                  <p className="text-slate-700">{selectedTx.notes}</p>
                </div>
              )}
              {selectedTx.auditSummary?.latestAction && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase mb-1">Audit Snapshot</p>
                  <p className="text-slate-800 text-sm">
                    {formatAuditActionLabel(selectedTx.auditSummary.latestAction)}
                    {selectedTx.auditSummary.latestActorName
                      ? ` by ${selectedTx.auditSummary.latestActorName}`
                      : ''}
                  </p>
                  {selectedTx.auditSummary.latestEventAt && (
                    <p className="text-xs text-slate-600 mt-1">
                      {new Date(selectedTx.auditSummary.latestEventAt).toLocaleString('en-HK')}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 bg-slate-600 text-white rounded text-sm font-medium hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escrow Statement Modal */}
      {showStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setShowStatement(false)}>
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Escrow Statement</h3>
                {statement && (
                  <p className="text-sm text-slate-600 mt-1">
                    Current Balance: <span className="font-semibold text-emerald-600">{formatHKD(statement.balance)}</span>
                    {' • '}
                    Required: <span className="font-semibold">{formatHKD(statement.required)}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setShowStatement(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!statement ? (
                <p className="text-sm text-slate-500">Loading statement...</p>
              ) : statement.ledger.length === 0 ? (
                <p className="text-sm text-slate-500">No ledger entries yet</p>
              ) : (
                <div className="space-y-3">
                  {statement.ledger.map((entry, idx) => {
                    const isCredit = entry.direction === 'credit';
                    const runningBalance = statement.ledger
                      .slice(0, idx + 1)
                      .reduce((acc, e) => {
                        const amt = typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount;
                        return acc + (e.direction === 'credit' ? amt : -amt);
                      }, 0);
                    return (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isCredit ? '+' : '−'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{entry.description || entry.transaction?.description || '—'}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{new Date(entry.createdAt).toLocaleString('en-HK')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-semibold ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isCredit ? '+' : '−'}{formatHKD(entry.amount)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">Balance: {formatHKD(runningBalance)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowStatement(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded text-sm font-medium hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
