'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import StatusPill, { statusToneFromStatus } from './status-pill';
import MaterialsClaimReviewModal from './materials-claim-review-modal';
import { useAuth } from '@/context/auth-context';
import { fetchPrimaryNextStep } from '@/lib/next-steps';
import {
  applyNextStepModalTemplate,
  resolveNextStepModalContent,
  type NextStepModalContent,
} from '@/lib/next-step-modal-content';

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
  openingMessage?: string | null;
  notes?: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  deadlineAt?: string | null;
  finalizedAt?: string | null;
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
  onNavigateTab?: (tab: string) => void;
  openMaterialsWalletOnLoad?: boolean;
  onMaterialsWalletAutoOpenHandled?: () => void;
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
    milestone_foh_allocation_cap: 'Materials Wallet Transfer',
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
  onNavigateTab,
  openMaterialsWalletOnLoad,
  onMaterialsWalletAutoOpenHandled,
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
  const [showMaterialsWalletModal, setShowMaterialsWalletModal] = useState(false);
  const [showMaterialsWalletSuccess, setShowMaterialsWalletSuccess] = useState(false);
  const [showMaterialsWalletInfo, setShowMaterialsWalletInfo] = useState(false);
  const [showClaimReviewModal, setShowClaimReviewModal] = useState(false);
  const [materialsWalletModalContent, setMaterialsWalletModalContent] = useState<NextStepModalContent>(() =>
    resolveNextStepModalContent('AUTHORIZE_MATERIALS_WALLET'),
  );
  const [clientDisplayName, setClientDisplayName] = useState('client');
  const [professionalDisplayName, setProfessionalDisplayName] = useState('professional');
  const modalPortalTarget = typeof document !== 'undefined' ? document.body : null;
  const hasAutoOpenedMaterialsWalletRef = useRef(false);

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

  // Merge payment plan milestones (future payments) on top of actual transactions
  const displayTransactions = useMemo(() => {
    const milestoneIdsWithTx = new Set(
      filteredTransactions
        .filter((tx) => tx.type === 'milestone_payment' || tx.type === 'release_payment')
        .map((tx) => {
          const meta = parseMilestoneMetadataFromNotes(tx.notes);
          return meta?.paymentMilestoneId || '';
        })
        .filter(Boolean),
    );

    const upcomingMilestones = (paymentPlan?.milestones || [])
      .filter((m) => !milestoneIdsWithTx.has(m.id) && m.status !== 'cancelled')
      .map((m) => ({
        id: `upcoming-${m.id}`,
        type: 'milestone_payment' as const,
        status: 'pending',
        amount: typeof m.amount === 'string' ? parseFloat(m.amount) : m.amount,
        createdAt: m.plannedDueAt || '',
        description: `Milestone ${m.sequence}: ${m.title}`,
        projectProfessionalId: null,
        actionByRole: null,
        actionBy: null,
        actionComplete: false,
        notes: null,
        auditSummary: null,
        _isUpcoming: true as const,
      }));

    return [...upcomingMilestones, ...filteredTransactions];
  }, [filteredTransactions, paymentPlan]);

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

          const clientName = [projectData?.user?.firstName, projectData?.user?.surname]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .join(' ');
          if (clientName) {
            setClientDisplayName(clientName);
          }

          const professionals = Array.isArray(projectData?.professionals) ? projectData.professionals : [];
          const awarded = professionals.find((entry: any) => String(entry?.status || '').toLowerCase() === 'awarded') || professionals[0];
          const profName = String(
            awarded?.professional?.fullName ||
            awarded?.professional?.businessName ||
            '',
          ).trim();
          if (profName) {
            setProfessionalDisplayName(profName);
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
    const selfName = [user?.firstName, user?.surname]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
    if (resolvedRole === 'client' && selfName) {
      setClientDisplayName(selfName);
    }
  }, [resolvedRole, user?.firstName, user?.surname]);

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

  const refreshWalletSummary = async () => {
    try {
      const walletUrl = new URL(`${API_BASE_URL}/financial/project/${projectId}/wallet-summary`);
      if (projectProfessionalId) {
        walletUrl.searchParams.set('projectProfessionalId', projectProfessionalId);
      }

      const walletRes = await fetch(walletUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!walletRes.ok) return;

      const walletData: WalletSummary | null = await walletRes.json();
      setWalletSummary(walletData);
    } catch {
      // Non-blocking refresh for cashflow overview.
    }
  };

  const refreshCashflowOverview = async (includePaymentPlan = false) => {
    if (includePaymentPlan) {
      await Promise.all([refreshWalletSummary(), reloadPaymentPlan()]);
      return;
    }
    await refreshWalletSummary();
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

  const isSingleMilestoneProject = useMemo(
    () => (paymentPlan?.milestones?.length ?? 0) <= 1,
    [paymentPlan],
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
    () => {
      const fundedAmount = Number(firstWalletMilestone?.fundedAmount || 0);
      const milestoneStatus = String(firstMilestone?.status || '').toLowerCase();
      return (
        fundedAmount > 0 ||
        milestoneStatus === 'escrow_funded' ||
        milestoneStatus === 'release_requested' ||
        escrowConfirmed > 0
      );
    },
    [firstWalletMilestone, firstMilestone, escrowConfirmed],
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

  const openClaimReviewModal = (evidence: MilestoneProcurementEvidence) => {
    setSelectedProcurementEvidenceId(evidence.id);
    setShowClaimReviewModal(true);
  };

  const closeClaimReviewModal = () => {
    setShowClaimReviewModal(false);
  };

  const reviewMaterialsModalContent = resolveNextStepModalContent('REVIEW_MATERIALS_PURCHASE');

  const handleApproveAndSettleProcurement = async () => {
    if (!firstMilestone || !selectedProcurementEvidence) return;

    if (!titleTransferAcknowledged) {
      toast.error('Confirm title transfer acknowledgement before authorising');
      return;
    }

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
      await refreshCashflowOverview(true);
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
      await refreshCashflowOverview(true);
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
      await refreshCashflowOverview(true);
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
      await refreshCashflowOverview(true);
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

  const closeMaterialsWalletModal = () => {
    setShowMaterialsWalletInfo(false);
    setShowMaterialsWalletSuccess(false);
    setShowMaterialsWalletModal(false);
  };

  const executeMaterialsWalletModalAction = async (
    actionType: string | undefined,
    actionTarget: string | undefined,
    fallbackActionType: 'confirm_transfer' | 'close_modal',
  ) => {
    const effectiveActionType = String(actionType || fallbackActionType).toLowerCase();
    const effectiveTarget = String(actionTarget || 'financials').trim();

    if (effectiveActionType === 'confirm_transfer') {
      await handleConfirmMaterialsWalletTransfer();
      return;
    }

    if (effectiveActionType === 'navigate_tab') {
      onNavigateTab?.(effectiveTarget || 'financials');
      closeMaterialsWalletModal();
      return;
    }

    if (effectiveActionType === 'show_details') {
      setShowMaterialsWalletInfo(true);
      return;
    }

    if (effectiveActionType === 'noop') {
      return;
    }

    closeMaterialsWalletModal();
  };

  const hydrateMaterialsWalletModalContent = async () => {
    const fallback = resolveNextStepModalContent('AUTHORIZE_MATERIALS_WALLET');
    setMaterialsWalletModalContent(fallback);

    try {
      const next = await fetchPrimaryNextStep(projectId, accessToken, {
        cacheScope: `client-financials-wallet-modal:${projectId}`,
      });
      if (next?.actionKey === 'AUTHORIZE_MATERIALS_WALLET') {
        setMaterialsWalletModalContent(
          resolveNextStepModalContent('AUTHORIZE_MATERIALS_WALLET', next.modalContent),
        );
      }
    } catch {
      // Keep fallback content silently when next-step endpoint is unavailable.
    }
  };

  const handleConfirmMaterialsWalletTransfer = async () => {
    if (!firstMilestone) return;
    try {
      setProcessingId('cap-authorize');
      await authorizeMilestoneCap(Number(firstMilestone.amount));
      setShowMaterialsWalletInfo(false);
      setShowMaterialsWalletSuccess(true);
      try {
        await confetti({
          particleCount: 110,
          spread: 80,
          origin: { y: 0.65 },
        });
      } catch {
        // Non-blocking visual enhancement
      }
      await refreshCashflowOverview(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to authorize transfer');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAuthorizeMaterialsWalletTransfer = async () => {
    setShowMaterialsWalletInfo(false);
    setShowMaterialsWalletSuccess(false);
    setShowMaterialsWalletModal(true);
    void hydrateMaterialsWalletModalContent();
  };

  useEffect(() => {
    if (hasAutoOpenedMaterialsWalletRef.current) return;
    if (!openMaterialsWalletOnLoad) return;
    if (resolvedRole !== 'client') return;
    if (!isProcurementWorkflowProject || isSingleMilestoneProject || !hasMilestoneEscrowFunded || firstMilestoneMeta.capTotal > 0) return;

    hasAutoOpenedMaterialsWalletRef.current = true;
    setShowMaterialsWalletInfo(false);
    setShowMaterialsWalletSuccess(false);
    setShowMaterialsWalletModal(true);
    void hydrateMaterialsWalletModalContent();
    onMaterialsWalletAutoOpenHandled?.();
  }, [
    openMaterialsWalletOnLoad,
    resolvedRole,
    isProcurementWorkflowProject,
    isSingleMilestoneProject,
    hasMilestoneEscrowFunded,
    firstMilestoneMeta.capTotal,
    onMaterialsWalletAutoOpenHandled,
    projectId,
    accessToken,
  ]);

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
      await refreshCashflowOverview();
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
      await refreshCashflowOverview();
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

          {(slaPolicy || slaDraft) && (
            <div className="rounded-md border border-indigo-500/20 bg-indigo-500/10 p-4">
              <h4 className="text-sm font-semibold text-white">Payment Policy</h4>
              <p className="text-xs text-indigo-100 mt-1">All payments must be queried or approved within 24 hours of request.</p>
            </div>
          )}

          {/* Transactions — card layout */}
          <div className="order-2 space-y-3">
            {displayTransactions.length === 0 && (
              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-300">
                No financial transactions yet
              </div>
            )}
            {displayTransactions.map((tx: any) => {
              const status = (tx.status || '').toLowerCase();
              const isComplete = status === 'confirmed' || status === 'paid' || status === 'info';
              const dateObj = tx.createdAt ? new Date(tx.createdAt) : null;
              const dateLabel = dateObj && !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                : '';

              return (
                <div
                  key={tx.id}
                  className={`rounded-lg border-2 p-3 ${
                    isComplete
                      ? 'border-emerald-400 bg-[#F5F0E0]'
                      : 'border-[#FF7F50] bg-[#F5F0E0]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      isComplete ? 'bg-emerald-500 text-white' : 'border-2 border-[#FF7F50] bg-transparent'
                    }`}>
                      {isComplete ? (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                    </div>
                    <p className="flex-1 text-sm font-semibold text-slate-800 min-w-0">
                      {dateLabel && <span className="text-slate-500 font-normal">{dateLabel}{' — '}</span>}
                      {tx._isUpcoming ? tx.description : (tx.type === 'milestone_foh_allocation_cap' ? 'Materials Wallet Transfer' : getTypeLabel(tx.type))}
                      {' · '}
                      <span>{formatHKD(tx.amount)}</span>
                      {tx._isUpcoming && <span className="ml-1.5 text-xs font-medium text-[#FF7F50]">Upcoming</span>}
                    </p>
                    {!tx._isUpcoming && (
                      <button
                        type="button"
                        onClick={() => setSelectedTx(tx)}
                        className="shrink-0 text-xs text-slate-500 hover:text-slate-800 hover:underline"
                      >
                        Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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

      {modalPortalTarget && showMaterialsWalletModal && firstMilestone &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Authorize materials wallet transfer">
            <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowMaterialsWalletInfo(true)}
                disabled={showMaterialsWalletSuccess}
                className="absolute right-4 top-4 h-8 w-8 rounded-full border border-white/30 bg-white/10 text-white text-lg font-semibold hover:bg-white/20 transition"
                aria-label="Show details"
              >
                i
              </button>

              <div className="px-6 pt-10 pb-4 text-center">
                {showMaterialsWalletSuccess ? (
                  <>
                    <p className="text-3xl font-bold text-emerald-300">
                      {materialsWalletModalContent.successTitle || 'Funds have been transferred!'}
                    </p>
                    <p className="mt-4 text-base text-slate-100">
                      {applyNextStepModalTemplate(materialsWalletModalContent.successBody, {
                        clientName: clientDisplayName,
                        professionalName: professionalDisplayName,
                        amount: formatHKD(Number(firstMilestone.amount || 0)),
                      }) || `${formatHKD(Number(firstMilestone.amount || 0))} has been moved to ${professionalDisplayName}'s holding wallet.`}
                    </p>
                    <p className="mt-4 text-sm text-slate-300">
                      {materialsWalletModalContent.successNextStepBody || "What's next? We are working on it!"}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex justify-center">
                      <img
                        src={materialsWalletModalContent.imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                        alt="Action avatar"
                        className="h-20 w-20 rounded-full border border-white/20 object-cover"
                      />
                    </div>
                    <p className="text-slate-200 text-lg">
                      {materialsWalletModalContent.title || 'Transfer materials funds'}
                    </p>
                    <p className="mt-3 text-slate-100 text-base leading-relaxed">
                      {applyNextStepModalTemplate(materialsWalletModalContent.body, {
                        clientName: clientDisplayName,
                        professionalName: professionalDisplayName,
                        amount: formatHKD(Number(firstMilestone.amount || 0)),
                      }) || `OK ${clientDisplayName}, you need to move ${formatHKD(Number(firstMilestone.amount || 0))} from your wallet to ${professionalDisplayName}'s holding wallet.`}
                    </p>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700">
                {showMaterialsWalletSuccess ? (
                  <button
                    type="button"
                    onClick={closeMaterialsWalletModal}
                    className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Close
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab?.('financials');
                        closeMaterialsWalletModal();
                      }}
                      disabled={processingId === 'cap-authorize'}
                      className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void executeMaterialsWalletModalAction(
                          materialsWalletModalContent.secondaryActionType,
                          materialsWalletModalContent.secondaryActionTarget,
                          'close_modal',
                        )
                      }
                      disabled={processingId === 'cap-authorize'}
                      className="min-w-[110px] rounded-lg bg-rose-600 px-4 py-2 text-base font-semibold text-white hover:bg-rose-700 transition disabled:opacity-50"
                    >
                      {materialsWalletModalContent.secondaryButtonLabel || 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void executeMaterialsWalletModalAction(
                          materialsWalletModalContent.primaryActionType,
                          materialsWalletModalContent.primaryActionTarget,
                          'confirm_transfer',
                        )
                      }
                      disabled={processingId === 'cap-authorize'}
                      className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white hover:bg-emerald-700 transition disabled:bg-slate-500"
                    >
                      {processingId === 'cap-authorize'
                        ? 'Please wait...'
                        : materialsWalletModalContent.primaryButtonLabel || 'OK'}
                    </button>
                  </>
                )}
              </div>

              {showMaterialsWalletInfo && (
                <div className="absolute inset-3 z-10 rounded-xl border border-slate-600 bg-slate-900/95 p-4 shadow-xl">
                  <div className="space-y-3 text-left">
                    <p className="text-sm text-white leading-relaxed">
                      {applyNextStepModalTemplate(materialsWalletModalContent.detailsBody, {
                        clientName: clientDisplayName,
                        professionalName: professionalDisplayName,
                        amount: formatHKD(Number(firstMilestone.amount || 0)),
                      }) ||
                        `This amount is moved from ${clientDisplayName}'s wallet to ${professionalDisplayName}'s materials holding wallet. It is not withdrawable until you review and approve submitted purchase invoices.`}
                    </p>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowMaterialsWalletInfo(false)}
                      className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white hover:bg-emerald-700 transition"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          modalPortalTarget,
        )}

      <MaterialsClaimReviewModal
        isOpen={showClaimReviewModal && Boolean(selectedProcurementEvidence)}
        onClose={closeClaimReviewModal}
        projectId={projectId}
        accessToken={accessToken}
        currentUserRole={resolvedRole === 'admin' ? 'admin' : 'client'}
        selectedEvidenceId={selectedProcurementEvidence?.id || null}
        modalContent={reviewMaterialsModalContent}
        onCompleted={() => {
          void Promise.all([fetchProcurementEvidence(), reloadPaymentPlan()]);
        }}
      />


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
