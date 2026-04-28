'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import MaterialsClaimItemsTable from '@/components/materials-claim-items-table';
import { WorkflowCompletionModal, type WorkflowNextStep } from '@/components/workflow-completion-modal';

type UploadRow = {
  id: string;
  filename: string;
  url: string;
  note: string;
  value: string;
  uploading: boolean;
};

type FinancialSummaryTransaction = {
  id: string;
  type: string;
  status: string;
  amount?: number | string | null;
  notes?: string | null;
  createdAt: string;
};

type ProjectFinancialSummary = {
  escrowConfirmed?: number | string;
  transactions?: FinancialSummaryTransaction[];
};

type PaymentPlanMilestone = {
  id: string;
  sequence: number;
  title: string;
  status: string;
};

type PaymentPlan = {
  projectScale: string;
  milestones: PaymentPlanMilestone[];
};

type MilestoneProcurementEvidence = {
  id: string;
  status: string;
  createdAt: string;
};

interface MaterialsClaimModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function MaterialsClaimModal({ isOpen, isLoading = false, onClose }: MaterialsClaimModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useProfessionalAuth();
  const router = useRouter();

  const [pageLoading, setPageLoading] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [summary, setSummary] = React.useState<ProjectFinancialSummary | null>(null);
  const [materialsEvidence, setMaterialsEvidence] = React.useState<MilestoneProcurementEvidence[]>([]);

  const [uploadRows, setUploadRows] = React.useState<UploadRow[]>([]);
  const [uploadingFiles, setUploadingFiles] = React.useState(false);
  const [materialsOpeningMessage, setMaterialsOpeningMessage] = React.useState('Milestone 1 payment request');
  const [submitting, setSubmitting] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);
  const [workflowModalOpen, setWorkflowModalOpen] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const formatHKD = (value: number | string) =>
    new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value || '0') : value);

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

  const firstMilestone = React.useMemo(
    () => paymentPlan?.milestones?.find((m) => Number(m.sequence) === 1) || paymentPlan?.milestones?.[0] || null,
    [paymentPlan?.milestones],
  );

  const normalizedProjectScale = String(paymentPlan?.projectScale || '').toUpperCase();
  const isMaterialsWorkflowProject = Boolean(firstMilestone && ['SCALE_1', 'SCALE_2'].includes(normalizedProjectScale));

  const maxClaimableAmount = React.useMemo(() => {
    if (!firstMilestone) return 0;
    const firstMilestoneId = firstMilestone.id;
    const txs = Array.isArray(summary?.transactions) ? summary.transactions : [];

    let capAuthorized = 0;
    let alreadyApproved = 0;
    let alreadyReturned = 0;

    for (const tx of txs) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      if (!meta?.paymentMilestoneId || meta.paymentMilestoneId !== firstMilestoneId) continue;
      const amount = Number(tx.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const status = String(tx.status || '').toLowerCase();
      if (tx.type === 'milestone_foh_allocation_cap' && status === 'confirmed') capAuthorized += amount;
      if (tx.type === 'milestone_procurement_approved' && status === 'confirmed') alreadyApproved += amount;
      if (tx.type === 'milestone_cap_remainder_return' && status === 'confirmed') alreadyReturned += amount;
    }

    return Math.max(capAuthorized - alreadyApproved - alreadyReturned, 0);
  }, [firstMilestone, summary?.transactions]);

  const totalClaimed = React.useMemo(
    () => uploadRows.reduce((sum, row) => {
      const v = parseFloat(row.value);
      return sum + (Number.isFinite(v) && v > 0 ? v : 0);
    }, 0),
    [uploadRows],
  );
  const isClaimOverMaximum = totalClaimed > maxClaimableAmount;

  const readyRows = React.useMemo(
    () => uploadRows.filter((r) => !r.uploading && r.url && r.url !== 'error'),
    [uploadRows],
  );

  const fetchSummary = React.useCallback(async () => {
    if (!state.projectId || !accessToken) return;
    const res = await fetch(`${API_BASE_URL}/financial/project/${state.projectId}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to load financial summary');
    const data = (await res.json()) as ProjectFinancialSummary;
    setSummary(data || null);
  }, [accessToken, state.projectId]);

  const fetchPaymentPlan = React.useCallback(async () => {
    if (!state.projectId || !accessToken) return;
    const res = await fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to load payment plan');
    const data = (await res.json()) as PaymentPlan;
    setPaymentPlan(data || null);
  }, [accessToken, state.projectId]);

  const fetchMaterialsEvidence = React.useCallback(async () => {
    if (!state.projectId || !accessToken || !firstMilestone || !isMaterialsWorkflowProject) {
      setMaterialsEvidence([]);
      return;
    }
    const res = await fetch(
      `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${firstMilestone.id}/procurement-evidence`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new Error('Failed to load materials claims');
    const data = await res.json();
    setMaterialsEvidence(Array.isArray(data) ? data : []);
  }, [accessToken, state.projectId, firstMilestone, isMaterialsWorkflowProject]);

  React.useEffect(() => {
    if (!isOpen || !state.projectId || !accessToken) return;
    const load = async () => {
      setPageLoading(true);
      try {
        await Promise.all([fetchPaymentPlan(), fetchSummary()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load claim data');
      } finally {
        setPageLoading(false);
      }
    };
    void load();
  }, [isOpen, state.projectId, accessToken, fetchPaymentPlan, fetchSummary]);

  React.useEffect(() => {
    if (!isOpen) return;
    void fetchMaterialsEvidence();
  }, [isOpen, fetchMaterialsEvidence]);

  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || !accessToken) return;
    const files = Array.from(fileList);
    const oversized = files.filter((f) => f.size > 1 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`Files must be under 1 MB: ${oversized.map((f) => f.name).join(', ')}`);
      return;
    }
    const time = Date.now();
    const rows = files.map((f, i) => ({
      id: `${time}-${i}`,
      filename: f.name,
      url: '',
      note: '',
      value: '',
      uploading: true,
    }));
    setUploadRows((prev) => [...prev, ...rows]);
    setUploadingFiles(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const rowId = rows[i].id;
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
          setUploadRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, url: 'error', uploading: false } : r)));
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSubmit = async () => {
    if (!state.projectId || !accessToken || !firstMilestone) return;
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

    const itemNotes = readyRows.map((r) => `${r.filename}${r.note ? `: ${r.note}` : ''}`).join(' | ');

    try {
      setSubmitting(true);
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${firstMilestone.id}/procurement-evidence`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimedAmount,
            invoiceUrls: readyRows.map((r) => r.url),
            openingMessage: materialsOpeningMessage || undefined,
            notes: itemNotes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to submit materials claim');
      }

      toast.success('Materials claim submitted for client review');
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      setWorkflowModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit materials claim');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!state.projectId || !accessToken || !firstMilestone) return;
    if (!confirm('Skip until final payment? Wallet transfer will be reversed and funds returned to the client.')) return;
    try {
      setSkipping(true);
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${firstMilestone.id}/professional-skip-materials`,
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
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to skip materials claim');
    } finally {
      setSkipping(false);
    }
  };

  if (!isOpen) return null;

  const showSubmissionForm = materialsEvidence.filter((e) => e.status !== 'rejected').length === 0;
  const showMainModal = isOpen && !workflowModalOpen;
  const workflowNextStep: WorkflowNextStep = {
    actionLabel: 'Wait for client reply',
    description:
      'Your milestone 1 claim is now pending client review. You can continue with other project tasks while the client reviews receipts and confirms the amount.',
    requiresAction: false,
    waitingFor: 'client',
    tab: 'overview',
  };

  const handleCloseAll = () => {
    setWorkflowModalOpen(false);
    onClose();
  };

  return (
    <>
    {showMainModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {(isLoading || pageLoading) ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
            <p className="text-slate-300">Loading...</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Milestone 1 payment - Materials Purchase</h3>
                <p className="mt-1 text-xs text-slate-300">Upload receipts/photos, add values, and submit for client approval.</p>
              </div>
              <button type="button" onClick={onClose} className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">Close</button>
            </div>

            <div className="space-y-4 px-5 py-4 max-h-[75vh] overflow-y-auto">
              {!isMaterialsWorkflowProject && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  This project scale does not use the milestone 1 materials claim flow.
                </div>
              )}

              {isMaterialsWorkflowProject && showSubmissionForm && (
                <>
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
                        {uploadingFiles ? 'Uploading...' : '+ Add photos / receipts'}
                      </button>
                      <p className="text-[10px] text-slate-400 mt-0.5">Images only - max 1 MB each</p>
                    </div>
                  </div>

                  {uploadRows.length > 0 && (
                    <MaterialsClaimItemsTable
                      rows={uploadRows}
                      totalClaimed={totalClaimed}
                      maxClaimableAmount={maxClaimableAmount}
                      onNoteChange={(rowId, value) => setUploadRows((prev) => prev.map((r) => r.id === rowId ? { ...r, note: value } : r))}
                      onValueChange={(rowId, value) => setUploadRows((prev) => prev.map((r) => r.id === rowId ? { ...r, value } : r))}
                      onRemove={(rowId) => setUploadRows((prev) => prev.filter((r) => r.id !== rowId))}
                      formatHKD={formatHKD}
                    />
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-white">Opening message (optional)</label>
                      {materialsOpeningMessage && (
                        <button
                          type="button"
                          onClick={() => setMaterialsOpeningMessage('')}
                          className="text-[10px] text-slate-400 hover:text-slate-200 transition"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      value={materialsOpeningMessage}
                      onChange={(e) => setMaterialsOpeningMessage(e.target.value)}
                      rows={2}
                      placeholder="Opening message to send with this claim (e.g., 'Milestone 1 payment request')"
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500"
                    />
                  </div>

                  <div className="flex w-full justify-end pt-1">
                    <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || readyRows.length === 0 || isClaimOverMaximum}
                        className="w-full rounded-md bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 transition"
                      >
                        {submitting ? 'Submitting...' : 'Submit for payment'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSkip}
                        disabled={skipping}
                        className="w-full rounded-md border border-slate-500 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition"
                      >
                        {skipping ? 'Processing...' : 'Skip until final payment'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {isMaterialsWorkflowProject && !showSubmissionForm && (
                <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  A materials claim is already submitted for milestone 1. Open Financials to review status or respond in claim chat.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    )}

    <WorkflowCompletionModal
      isOpen={workflowModalOpen}
      completedLabel={state.modalContent?.successTitle || 'Materials claim submitted!'}
      completedDescription={
        state.modalContent?.successBody ||
        'Your claim is now in the project claim thread and has been sent to the client for review.'
      }
      nextStep={workflowNextStep}
      primaryActionLabel="Return to project list"
      secondaryActionLabel="Close"
      showConfetti
      highlightWaitingAsAmber
      onNavigate={() => {
        router.push('/professional-projects');
      }}
      onClose={handleCloseAll}
    />
    </>
  );
}
