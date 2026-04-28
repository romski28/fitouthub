'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import MaterialsClaimThreadPanel from '@/components/materials-claim-thread-panel';
import MaterialsClaimItemsTable from '@/components/materials-claim-items-table';

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

interface FinancialSummaryTransaction {
  id: string;
  type: string;
  status: string;
  amount?: number | string | null;
  notes?: string | null;
  createdAt: string;
}

interface ProjectFinancialSummary {
  escrowConfirmed?: number | string;
  transactions?: FinancialSummaryTransaction[];
}

interface MilestoneProcurementEvidence {
  id: string;
  claimedAmount: number | string;
  approvedAmount?: number | string | null;
  openingMessage?: string | null;
  notes?: string | null;
  status: string;
  deadlineAt?: string | null;
  createdAt: string;
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
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  status?: string;
  isFinancial?: boolean;
}

type LinkedFinancialMilestoneRow = {
  scheduleMilestone: ProjectMilestoneOption;
  paymentMilestone: PaymentPlanMilestone;
};

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
  onOpenScheduleTab?: () => void;
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
  onOpenScheduleTab,
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
  const [projectFinancialSummary, setProjectFinancialSummary] = React.useState<ProjectFinancialSummary | null>(null);
  const [materialsEvidence, setMaterialsEvidence] = React.useState<MilestoneProcurementEvidence[]>([]);
  const [materialsLoading, setMaterialsLoading] = React.useState(false);
  const [materialsBusy, setMaterialsBusy] = React.useState<string | null>(null);
  const [materialsNotes, setMaterialsNotes] = React.useState('');
  const [materialsOpeningMessage, setMaterialsOpeningMessage] = React.useState('');
  const [uploadRows, setUploadRows] = React.useState<Array<{
    id: string; filename: string; url: string; note: string; value: string; uploading: boolean;
  }>>([]);
  const [uploadingFiles, setUploadingFiles] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [walletTransferLoading, setWalletTransferLoading] = React.useState(false);
  const [walletTransferAmount, setWalletTransferAmount] = React.useState('');
  const [activeClaimThreadId, setActiveClaimThreadId] = React.useState<string | null>(null);
  const claimModalTarget = typeof document !== 'undefined' ? document.body : null;
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

  const paymentMilestones = paymentPlan?.milestones || [];
  const firstPaymentMilestone = React.useMemo(
    () => paymentMilestones.find((milestone) => Number(milestone.sequence) === 1) || paymentMilestones[0] || null,
    [paymentMilestones],
  );

  const normalizedProjectScale = String(paymentPlan?.projectScale || '').toUpperCase();
  const isMaterialsWorkflowProject = Boolean(firstPaymentMilestone && ['SCALE_1', 'SCALE_2'].includes(normalizedProjectScale));

  const escrowConfirmedAmount = Number(projectFinancialSummary?.escrowConfirmed || 0);
  const hasEscrowFundedMilestone = paymentMilestones.some((milestone) =>
    ['escrow_funded', 'release_requested', 'released'].includes(String(milestone.status || '').toLowerCase()),
  );
  const isEscrowReady = escrowConfirmedAmount > 0 || hasEscrowFundedMilestone;

  const walletTransferStatus = React.useMemo<'pending' | 'completed'>(() => {
    if (!firstPaymentMilestone) return 'pending';

    const firstMilestoneId = firstPaymentMilestone.id;
    const txs = Array.isArray(projectFinancialSummary?.transactions)
      ? projectFinancialSummary?.transactions
      : [];

    let hasProcurementSignal = false;
    let transferCompleted = false;

    for (const tx of txs) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      if (!meta?.paymentMilestoneId || meta.paymentMilestoneId !== firstMilestoneId) continue;

      const type = String(tx.type || '');
      const status = String(tx.status || '').toLowerCase();

      if (type === 'milestone_procurement_approved' && status === 'confirmed') {
        hasProcurementSignal = true;
      }
      if (type === 'professional_wallet_transfer') {
        hasProcurementSignal = true;
        if (status === 'confirmed') {
          transferCompleted = true;
        }
      }
    }

    if (transferCompleted) return 'completed';
    if (hasProcurementSignal) return 'pending';
    return 'pending';
  }, [projectFinancialSummary?.transactions, firstPaymentMilestone]);

  const canSubmitMaterialsClaim = isMaterialsWorkflowProject && isEscrowReady;

  const totalApprovedAmount = React.useMemo(
    () => materialsEvidence.reduce((sum, e) => sum + (String(e.status) === 'approved' ? Number(e.approvedAmount ?? 0) : 0), 0),
    [materialsEvidence],
  );
  const canTransferWallet = isMaterialsWorkflowProject && isEscrowReady && totalApprovedAmount > 0 && walletTransferStatus !== 'completed';
  const materialsClaimTotal = uploadRows.reduce((sum, row) => {
    const v = parseFloat(row.value);
    return sum + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const maxClaimableAmount = React.useMemo(() => {
    if (!firstPaymentMilestone) return 0;
    const firstMilestoneId = firstPaymentMilestone.id;
    const txs = Array.isArray(projectFinancialSummary?.transactions)
      ? projectFinancialSummary.transactions
      : [];

    let capAuthorized = 0;
    let alreadyApproved = 0;
    let alreadyReturned = 0;

    for (const tx of txs) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      if (!meta?.paymentMilestoneId || meta.paymentMilestoneId !== firstMilestoneId) continue;
      const amount = Number((tx as any).amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      if (tx.type === 'milestone_foh_allocation_cap' && String(tx.status || '').toLowerCase() === 'confirmed') {
        capAuthorized += amount;
      }
      if (tx.type === 'milestone_procurement_approved' && String(tx.status || '').toLowerCase() === 'confirmed') {
        alreadyApproved += amount;
      }
      if (tx.type === 'milestone_cap_remainder_return' && String(tx.status || '').toLowerCase() === 'confirmed') {
        alreadyReturned += amount;
      }
    }

    return Math.max(capAuthorized - alreadyApproved - alreadyReturned, 0);
  }, [firstPaymentMilestone, projectFinancialSummary?.transactions]);
  const isClaimOverMaximum = materialsClaimTotal > maxClaimableAmount;
  const scheduleMilestoneOptions = [...projectMilestones].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const paymentMilestonesByProjectMilestoneId = new Map(
    paymentMilestones
      .filter((milestone) => !!milestone.projectMilestoneId)
      .map((milestone) => [milestone.projectMilestoneId as string, milestone]),
  );

  const linkedFinancialMilestoneRows: LinkedFinancialMilestoneRow[] = scheduleMilestoneOptions
    .filter((milestone) => paymentMilestonesByProjectMilestoneId.has(milestone.id))
    .map((scheduleMilestone) => ({
      scheduleMilestone,
      paymentMilestone: paymentMilestonesByProjectMilestoneId.get(scheduleMilestone.id)!,
    }))
    .sort((a, b) => {
      if ((a.paymentMilestone.sequence || 0) !== (b.paymentMilestone.sequence || 0)) {
        return (a.paymentMilestone.sequence || 0) - (b.paymentMilestone.sequence || 0);
      }
      return (a.scheduleMilestone.sequence || 0) - (b.scheduleMilestone.sequence || 0);
    });

  const orphanPaymentMilestones = paymentMilestones.filter(
    (milestone) =>
      !milestone.projectMilestoneId ||
      !scheduleMilestoneOptions.some((row) => row.id === milestone.projectMilestoneId),
  );

  const getDisplayMilestoneTitle = (row: LinkedFinancialMilestoneRow) =>
    row.scheduleMilestone.title || row.paymentMilestone.title;

  const getDisplayMilestoneDueAt = (row: LinkedFinancialMilestoneRow) =>
    row.scheduleMilestone.plannedEndDate ||
    row.scheduleMilestone.plannedStartDate ||
    row.paymentMilestone.plannedDueAt;

  const eligibleMilestones = linkedFinancialMilestoneRows.filter(({ paymentMilestone }) => {
    if (paymentPlan?.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES') {
      return paymentMilestone.status === 'escrow_funded';
    }

    return isEscrowReady && ['scheduled', 'escrow_funded'].includes(paymentMilestone.status);
  });

  const fundingEligibleMilestones = paymentPlan?.escrowFundingPolicy === 'ROLLING_TWO_MILESTONES'
    ? linkedFinancialMilestoneRows.filter(({ paymentMilestone }) => paymentMilestone.status === 'scheduled')
    : [];

  const activeFundingMilestoneId = fundingMilestoneId || fundingEligibleMilestones[0]?.paymentMilestone.id || '';

  const selectedMilestone = eligibleMilestones.find(
    ({ paymentMilestone }) => paymentMilestone.id === selectedPaymentMilestoneId,
  ) || eligibleMilestones[0] || null;

  const selectedMilestoneTiming = selectedMilestone ? getTiming(getDisplayMilestoneDueAt(selectedMilestone)) : null;

  const fetchProjectFinancialSummary = React.useCallback(async () => {
    if (!accessToken || !projectId) {
      setProjectFinancialSummary(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        setProjectFinancialSummary(null);
        return;
      }

      const data = (await response.json()) as ProjectFinancialSummary;
      setProjectFinancialSummary(data || null);
    } catch {
      setProjectFinancialSummary(null);
    }
  }, [accessToken, projectId]);

  const fetchMaterialsEvidence = React.useCallback(async () => {
    if (!accessToken || !projectId || !firstPaymentMilestone || !isMaterialsWorkflowProject) {
      setMaterialsEvidence([]);
      return;
    }

    try {
      setMaterialsLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstPaymentMilestone.id}/procurement-evidence`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to load materials claims');
      }

      const data = await response.json();
      setMaterialsEvidence(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load materials claims');
      setMaterialsEvidence([]);
    } finally {
      setMaterialsLoading(false);
    }
  }, [accessToken, projectId, firstPaymentMilestone, isMaterialsWorkflowProject]);

  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || !accessToken) return;
    const files = Array.from(fileList);
    const oversized = files.filter((f) => f.size > 1 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`Files must be under 1 MB: ${oversized.map((f) => f.name).join(', ')}`);
      return;
    }
    const time = Date.now();
    const newRows = files.map((f, i) => ({
      id: `${time}-${i}`,
      filename: f.name,
      url: '',
      note: '',
      value: '',
      uploading: true,
    }));
    setUploadRows((prev) => [...prev, ...newRows]);
    setUploadingFiles(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rowId = newRows[i].id;
        const formData = new FormData();
        formData.append('files', file);
        try {
          const res = await fetch(`${API_BASE_URL}/uploads`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          });
          if (!res.ok) throw new Error('Upload failed');
          const data = await res.json();
          const url: string = data.urls?.[0] || data.files?.[0]?.url || '';
          setUploadRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, url, uploading: false } : r)));
        } catch {
          setUploadRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, uploading: false, url: 'error' } : r)));
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSubmitMaterialsClaim = async () => {
    if (!accessToken || !projectId || !firstPaymentMilestone) return;
    const readyRows = uploadRows.filter((r) => !r.uploading && r.url && r.url !== 'error');
    if (readyRows.length === 0) {
      toast.error('Upload at least one receipt or invoice photo');
      return;
    }
    const invalidValues = readyRows.filter((r) => {
      const v = parseFloat(r.value);
      return !Number.isFinite(v) || v <= 0;
    });
    if (invalidValues.length > 0) {
      toast.error('All items must have a value greater than zero');
      return;
    }
    const claimedAmount = readyRows.reduce((sum, r) => sum + parseFloat(r.value), 0);
    if (claimedAmount > maxClaimableAmount) {
      toast.error(`Claim exceeds available maximum (${formatHKD(maxClaimableAmount)})`);
      return;
    }
    const itemNotes = readyRows.map((r) => `${r.filename}${r.note ? ': ' + r.note : ''}`).join(' | ');
    const fullNotes = [itemNotes, materialsNotes].filter(Boolean).join('\n\n');
    try {
      setMaterialsBusy('submit');
      const response = await fetch(
        `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstPaymentMilestone.id}/procurement-evidence`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimedAmount,
            invoiceUrls: readyRows.map((r) => r.url),
            openingMessage: materialsOpeningMessage || undefined,
            notes: fullNotes || undefined,
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to submit materials claim');
      }
      toast.success('Materials claim submitted for client review');
      setUploadRows([]);
      setMaterialsNotes('');
      setMaterialsOpeningMessage('');
      await fetchMaterialsEvidence();
      await fetchProjectFinancialSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit materials claim');
    } finally {
      setMaterialsBusy(null);
    }
  };

  const handleSkipMaterialsClaim = async () => {
    if (!accessToken || !projectId || !firstPaymentMilestone) return;
    if (!confirm('Skip until final payment? The wallet transfer will be reversed and all allocated funds returned to the client. This cannot be undone.')) return;
    try {
      setSkipping(true);
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstPaymentMilestone.id}/professional-skip-materials`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: 'Professional skipped milestone 1 materials claim' }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to skip materials claim');
      }
      toast.success('Materials claim skipped. Funds returned to client wallet.');
      setUploadRows([]);
      setMaterialsNotes('');
      await fetchMaterialsEvidence();
      await fetchProjectFinancialSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to skip materials claim');
    } finally {
      setSkipping(false);
    }
  };

  const handleWalletTransfer = async () => {
    if (!accessToken || !projectId || !projectProfessionalId) return;
    const amount = walletTransferAmount !== '' ? Number(walletTransferAmount) : totalApprovedAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid transfer amount');
      return;
    }
    try {
      setWalletTransferLoading(true);
      const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}/professional-wallet/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectProfessionalId, amount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to transfer funds');
      }
      toast.success('Funds transferred to drawable wallet');
      setWalletTransferAmount('');
      await fetchProjectFinancialSummary();
      await fetchMaterialsEvidence();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer funds');
    } finally {
      setWalletTransferLoading(false);
    }
  };

  React.useEffect(() => {
    if (!accessToken || !projectProfessionalId) return;

    const fetchMilestones = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/milestones/project-professional/${projectProfessionalId}`,
          {
            cache: 'no-store',
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

  React.useEffect(() => {
    void fetchProjectFinancialSummary();
  }, [fetchProjectFinancialSummary]);

  React.useEffect(() => {
    void fetchMaterialsEvidence();
  }, [fetchMaterialsEvidence]);

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
              <p className="text-[11px] text-slate-400 mt-1">
                Source of truth: the Schedule timeline. Use edit to jump there and update milestone timing.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan total</p>
              <p className="text-lg font-bold text-white">{formatHKD(paymentPlan.totalAmount)}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onOpenScheduleTab?.()}
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Open Schedule for Editing
            </button>
          </div>

          {isMaterialsWorkflowProject && (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Escrow Funding Sub-Status</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    Wallet Transfer: {walletTransferStatus === 'completed' ? 'Completed' : 'Pending'}
                  </p>
                  <p className="mt-1 text-xs text-cyan-100">
                    Escrow Funding remains the stage owner. Materials purchase and transfer updates appear here as a sub-status.
                  </p>
                </div>
                <div className="text-right text-xs text-cyan-100">
                  <p>Milestone: <span className="font-semibold text-white">{firstPaymentMilestone?.title || 'Milestone 1'}</span></p>
                  <p>Claims submitted: <span className="font-semibold text-white">{materialsEvidence.length}</span></p>
                  <p>Escrow ready: <span className="font-semibold text-white">{isEscrowReady ? 'Yes' : 'No'}</span></p>
                </div>
              </div>
            </div>
          )}

          {orphanPaymentMilestones.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {orphanPaymentMilestones.length} payment milestone{orphanPaymentMilestones.length === 1 ? ' is' : 's are'} not linked to a schedule milestone yet.
              Use the linkage controls below or reset/review the Schedule tab to bring them back into the single milestone timeline.
            </div>
          )}

          {(paymentPlan.projectScale === 'SCALE_2' || paymentPlan.projectScale === 'SCALE_3') && (
            <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-white">Link Financial Milestones to Project Schedule</h4>
                <p className="text-xs text-slate-300 mt-1">
                  The class defaults create financial schedule milestones automatically. You can keep those aligned here and still add extra non-financial tasks in the Schedule tab.
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
                      {scheduleMilestoneOptions.map((milestone) => (
                        <option key={milestone.id} value={milestone.id}>
                          {`${milestone.sequence}. ${milestone.title}${milestone.isFinancial ? ' • financial' : ''}`}
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
                          {scheduleMilestoneOptions.map((milestone) => (
                            <option key={milestone.id} value={milestone.id}>
                              {`${milestone.sequence}. ${milestone.title}${milestone.isFinancial ? ' • financial' : ''}`}
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
                {linkedFinancialMilestoneRows.map((row) => {
                  const { paymentMilestone, scheduleMilestone } = row;
                  const displayTitle = getDisplayMilestoneTitle(row);
                  const displayDueAt = getDisplayMilestoneDueAt(row);
                  const timing = getTiming(displayDueAt);
                  return (
                    <tr key={paymentMilestone.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-200">{paymentMilestone.sequence}</td>
                      <td className="px-3 py-2 text-slate-200">
                        <div className="font-medium">💰 {displayTitle}</div>
                        <div className="text-xs text-slate-400">
                          {typeof paymentMilestone.percentOfTotal === 'number' ? `${paymentMilestone.percentOfTotal}% of plan` : paymentMilestone.type}
                          {' · '}schedule #{scheduleMilestone.sequence}
                        </div>
                        {paymentMilestone.adminComment && (
                          <div className="mt-1 text-[11px] text-amber-300">{paymentMilestone.adminComment}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-300 text-xs">
                        {displayDueAt ? new Date(displayDueAt).toLocaleDateString('en-HK') : '—'}
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
                      <td className="px-3 py-2 font-semibold text-white">{formatHKD(paymentMilestone.amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusClasses(paymentMilestone.status)}`}>
                          {paymentMilestone.status.replace(/_/g, ' ')}
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
                      {fundingEligibleMilestones.map((row) => (
                        <option key={row.paymentMilestone.id} value={row.paymentMilestone.id}>
                          {`${row.paymentMilestone.sequence}. ${getDisplayMilestoneTitle(row)} — ${formatHKD(row.paymentMilestone.amount)}`}
                        </option>
                      ))}
                    </select>
                    {activeFundingMilestoneId && (() => {
                      const row = fundingEligibleMilestones.find((x) => x.paymentMilestone.id === activeFundingMilestoneId);
                      return row ? (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Planned due: {getDisplayMilestoneDueAt(row) ? new Date(getDisplayMilestoneDueAt(row) as string).toLocaleDateString('en-HK') : 'Not set'}
                          {' · '}Status: {row.paymentMilestone.status.replace(/_/g, ' ')}
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

          {/* Payment milestone request — hidden for Scale 1/2 which use the materials purchase workflow */}
          {!isMaterialsWorkflowProject && (
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

            {paymentPlan.escrowFundingPolicy !== 'ROLLING_TWO_MILESTONES' && !isEscrowReady && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Escrow funding is not confirmed yet. Payment requests unlock after escrow is funded.
              </div>
            )}

            {eligibleMilestones.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                <div>
                  <label className="block text-xs font-semibold text-white mb-1">Eligible milestone</label>
                  <select
                    value={selectedMilestone?.paymentMilestone.id || ''}
                    onChange={(e) => onSelectPaymentMilestone?.(e.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    {eligibleMilestones.map((row) => (
                      <option key={row.paymentMilestone.id} value={row.paymentMilestone.id}>
                        {`${row.paymentMilestone.sequence}. ${getDisplayMilestoneTitle(row)} — ${formatHKD(row.paymentMilestone.amount)}`}
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
                      onSubmitPaymentRequest(Number(selectedMilestone.paymentMilestone.amount), 'milestone', paymentRequestNotes);
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
                  <span className="font-semibold text-white">{getDisplayMilestoneTitle(selectedMilestone)}</span>
                  <span className="text-slate-400">•</span>
                  <span>{formatHKD(selectedMilestone.paymentMilestone.amount)}</span>
                  {typeof selectedMilestone.paymentMilestone.percentOfTotal === 'number' && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span>{selectedMilestone.paymentMilestone.percentOfTotal}%</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Planned due date: {getDisplayMilestoneDueAt(selectedMilestone) ? new Date(getDisplayMilestoneDueAt(selectedMilestone) as string).toLocaleDateString('en-HK') : 'Not scheduled'}
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
          )}

          {isMaterialsWorkflowProject && (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-4 space-y-4">
              <div>
                <h4 className="font-semibold text-white">Milestone 1 payment – Materials Purchase</h4>
                <p className="text-xs text-cyan-100 mt-1">
                  Upload receipts and photos for materials purchased. Set a value per item, then submit for client review.
                </p>
              </div>

              {!isEscrowReady && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Escrow funding is still pending. Materials claims unlock after the client funds escrow.
                </div>
              )}

              {isEscrowReady && materialsEvidence.filter((e) => e.status !== 'rejected').length === 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Items to claim</p>
                    <div className="text-right">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { void handleAddFiles(e.target.files); e.currentTarget.value = ''; }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFiles}
                        className="rounded-md border border-cyan-500/40 bg-cyan-600/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-50 transition"
                      >
                        {uploadingFiles ? 'Uploading…' : '+ Add photos / receipts'}
                      </button>
                      <p className="text-[10px] text-slate-400 mt-0.5">Images only · max 1 MB each</p>
                    </div>
                  </div>

                  {uploadRows.length > 0 && (
                    <MaterialsClaimItemsTable
                      rows={uploadRows}
                      totalClaimed={materialsClaimTotal}
                      maxClaimableAmount={maxClaimableAmount}
                      onNoteChange={(rowId, value) =>
                        setUploadRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, note: value } : r)))
                      }
                      onValueChange={(rowId, value) =>
                        setUploadRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, value } : r)))
                      }
                      onRemove={(rowId) => setUploadRows((prev) => prev.filter((r) => r.id !== rowId))}
                      formatHKD={formatHKD}
                    />
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-white mb-1">General notes (optional)</label>
                    <textarea
                      value={materialsNotes}
                      onChange={(e) => setMaterialsNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional context for the client about this materials claim"
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500"
                    />
                  </div>

                  <div className="flex w-full justify-end pt-1">
                    <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleSubmitMaterialsClaim}
                        disabled={
                          !canSubmitMaterialsClaim ||
                          materialsBusy === 'submit' ||
                          uploadRows.filter((r) => !r.uploading && r.url && r.url !== 'error').length === 0 ||
                          isClaimOverMaximum
                        }
                        className="w-full rounded-md bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 transition"
                      >
                        {materialsBusy === 'submit' ? 'Submitting…' : 'Submit for payment'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSkipMaterialsClaim}
                        disabled={!canSubmitMaterialsClaim || skipping}
                        className="w-full rounded-md border border-slate-500 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
                      >
                        {skipping ? 'Processing…' : 'Skip until final payment'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Claim History</p>
                  {materialsLoading && <p className="text-xs text-slate-400">Loading...</p>}
                </div>

                {materialsEvidence.length === 0 ? (
                  <p className="text-xs text-slate-400">No materials claims submitted yet.</p>
                ) : (
                  <div className="space-y-2">
                    {materialsEvidence.map((evidence) => (
                      <div key={evidence.id} className="rounded border border-slate-700 bg-slate-950/40 p-2 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-white">
                            Claimed: <span className="font-semibold">{formatHKD(evidence.claimedAmount)}</span>
                            {evidence.approvedAmount ? ` | Approved: ${formatHKD(evidence.approvedAmount)}` : ''}
                          </p>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClasses(String(evidence.status || ''))}`}>
                            {String(evidence.status || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Submitted {new Date(evidence.createdAt).toLocaleDateString('en-HK')}
                          {evidence.deadlineAt ? ` · Deadline ${new Date(evidence.deadlineAt).toLocaleDateString('en-HK')}` : ''}
                        </p>
                        {String(evidence.status || '').toLowerCase() === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setActiveClaimThreadId(evidence.id)}
                            className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
                          >
                            Respond to questions
                          </button>
                        )}
                        {evidence.notes && <p className="text-xs text-slate-300">{evidence.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {canTransferWallet && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Transfer Approved Materials Funds</h4>
                    <p className="text-xs text-emerald-100 mt-1">
                      The client has approved your materials claim. Transfer the approved amount to your drawable wallet.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs font-semibold text-white mb-1">Amount to transfer</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={walletTransferAmount !== '' ? walletTransferAmount : String(totalApprovedAmount)}
                        onChange={(e) => setWalletTransferAmount(e.target.value)}
                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
                        data-testid="wallet-transfer-amount"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleWalletTransfer}
                      disabled={walletTransferLoading}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {walletTransferLoading ? 'Transferring...' : 'Transfer to Drawable Wallet'}
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-200">
                    Approved total: {formatHKD(totalApprovedAmount)}. The server will validate your requested amount against the available balance.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {claimModalTarget && activeClaimThreadId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Respond to claim questions">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Respond to Questions</h3>
                <p className="text-xs text-slate-300">Claim thread: {activeClaimThreadId}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveClaimThreadId(null)}
                className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <MaterialsClaimThreadPanel
                projectId={projectId || ''}
                accessToken={accessToken || ''}
                claimId={activeClaimThreadId}
                role="professional"
                title="Claim Conversation"
                subtitle="Reply to client questions in this scoped claim thread."
                placeholder="Respond to client question..."
                sendLabel="Send Response"
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
