'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useAuth } from '@/context/auth-context';
import { WorkflowCompletionModal, type WorkflowNextStep } from '@/components/workflow-completion-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PhotoRow = {
  id: string;
  url: string;
  note: string;
  uploading: boolean;
};

type WorkMilestone = {
  id: string;
  sequence: number;
  title: string;
  status: string; // not_started | in_progress | completed
  plannedEndDate?: string | null;
  signOffRequested?: boolean;
};

type PaymentMilestone = {
  id: string;
  sequence: number;
  title: string;
  status: string;
  amount: number | string;
  plannedDueAt?: string | null;
  projectMilestoneId?: string | null;
};

type PaymentPlan = {
  milestones?: PaymentMilestone[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatHKD = (value: number | string) =>
  new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(typeof value === 'string' ? parseFloat(value || '0') : value);

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return null;
  try {
    return new Intl.DateTimeFormat('en-HK', { year: 'numeric', month: 'short', day: 'numeric' }).format(
      new Date(dateStr),
    );
  } catch {
    return dateStr;
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProgressReportModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function ProgressReportModal({ isOpen, isLoading = false, onClose }: ProgressReportModalProps) {
  const { state } = useNextStepModal();
  const { accessToken: professionalToken } = useProfessionalAuth();
  const { accessToken: clientToken } = useAuth();

  const isProfessional = (state.role || '').toUpperCase().includes('PROFESSIONAL');
  const accessToken = isProfessional ? professionalToken : clientToken;

  // ── Data state ──────────────────────────────────────────────────────────
  const [pageLoading, setPageLoading] = React.useState(false);
  const [milestones, setMilestones] = React.useState<WorkMilestone[]>([]);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────
  const [photoRows, setPhotoRows] = React.useState<PhotoRow[]>([]);
  const [uploadingFiles, setUploadingFiles] = React.useState(false);
  const [narrativeSummary, setNarrativeSummary] = React.useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<'share' | 'signoff' | null>(null);
  const [workflowModalOpen, setWorkflowModalOpen] = React.useState(false);
  const [workflowNextStep, setWorkflowNextStep] = React.useState<WorkflowNextStep | null>(null);
  const [showShareCelebration, setShowShareCelebration] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const celebrationTimerRef = React.useRef<number | null>(null);

  // ── Derived: linked payment milestone ──────────────────────────────────
  const linkedPaymentMilestone = React.useMemo<PaymentMilestone | null>(() => {
    if (!selectedMilestoneId || !paymentPlan?.milestones) return null;
    return paymentPlan.milestones.find((pm) => pm.projectMilestoneId === selectedMilestoneId) ?? null;
  }, [selectedMilestoneId, paymentPlan?.milestones]);

  // ── Fetch on open ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!isOpen || !state.projectId || !accessToken) return;

    const load = async () => {
      setPageLoading(true);
      try {
        const [milestonesRes, paymentPlanRes] = await Promise.all([
          fetch(`${API_BASE_URL}/milestones/project/${state.projectId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (milestonesRes.ok) {
          const data = (await milestonesRes.json()) as WorkMilestone[];
          setMilestones(Array.isArray(data) ? data : []);
          // Default to no milestone selected on modal open
          setSelectedMilestoneId('');
        }
        if (paymentPlanRes.ok) {
          setPaymentPlan((await paymentPlanRes.json()) as PaymentPlan);
        }
      } catch {
        toast.error('Failed to load project milestones');
      } finally {
        setPageLoading(false);
      }
    };
    void load();
  }, [isOpen, state.projectId, accessToken]);

  // Reset form when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      if (celebrationTimerRef.current) {
        window.clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
      setPhotoRows([]);
      setNarrativeSummary('');
      setSelectedMilestoneId('');
      setUploadingFiles(false);
      setSubmitting(null);
      setWorkflowModalOpen(false);
      setWorkflowNextStep(null);
      setShowShareCelebration(false);
    }
  }, [isOpen]);

  // ── Photo upload ─────────────────────────────────────────────────────────
  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || !accessToken) return;
    const files = Array.from(fileList);
    const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`Files must be under 5 MB: ${oversized.map((f) => f.name).join(', ')}`);
      return;
    }
    const time = Date.now();
    const rows: PhotoRow[] = files.map((f, i) => ({
      id: `${time}-${i}`,
      url: '',
      note: '',
      uploading: true,
    }));
    setPhotoRows((prev) => [...prev, ...rows]);
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
          setPhotoRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, url, uploading: false } : r)));
        } catch {
          setPhotoRows((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, url: 'error', uploading: false } : r)),
          );
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (signOffRequested: boolean) => {
    if (!state.projectId || !accessToken) return;

    const readyRows = photoRows.filter((r) => !r.uploading && r.url && r.url !== 'error');
    if (readyRows.length === 0) {
      toast.error('Upload at least one photo before sharing');
      return;
    }

    setSubmitting(signOffRequested ? 'signoff' : 'share');
    try {
      const res = await fetch(`${API_BASE_URL}/progress-reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.projectId,
          milestoneId: selectedMilestoneId || undefined,
          photoEntries: readyRows.map((r) => ({ url: r.url, note: r.note.trim() })),
          narrativeSummary: narrativeSummary.trim() || undefined,
          signOffRequested,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to submit progress report');
      }

      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });

      if (signOffRequested) {
        toast.success('Milestone sign-off requested — client has been notified');
        const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId);
        setWorkflowNextStep({
          actionLabel: 'Wait for client sign-off',
          description: `Your sign-off request for "${selectedMilestone?.title ?? 'the milestone'}" has been sent to the client for approval.`,
          requiresAction: false,
          waitingFor: 'client',
          tab: 'schedule',
        });
      } else {
        toast.success('Progress update shared to project chat');
        setWorkflowNextStep({
          actionLabel: 'Continue working',
          description: 'Your progress update and photos have been shared to the project chat and image gallery.',
          requiresAction: false,
          tab: 'chat',
        });
      }

      if (signOffRequested) {
        setWorkflowModalOpen(true);
      } else {
        setShowShareCelebration(true);
        celebrationTimerRef.current = window.setTimeout(() => {
          setShowShareCelebration(false);
          setWorkflowModalOpen(true);
          celebrationTimerRef.current = null;
        }, 900);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit progress report');
    } finally {
      setSubmitting(null);
    }
  };

  // ── Guard ────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  const showMainModal = isOpen && !workflowModalOpen;
  const readyRows = photoRows.filter((r) => !r.uploading && r.url && r.url !== 'error');
  const canSubmit = readyRows.length > 0 && !submitting;

  return (
    <>
      {showShareCelebration && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
          <div className="relative h-48 w-48">
            <div className="absolute inset-0 rounded-full border-4 border-cyan-300/70 animate-ping" />
            <div className="absolute inset-6 rounded-full border-2 border-emerald-300/70 animate-pulse" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-yellow-200">✦</div>
            <div className="absolute left-1/2 top-1 -translate-x-1/2 text-sm text-cyan-200 animate-pulse">✧</div>
            <div className="absolute right-3 top-8 text-sm text-emerald-200 animate-pulse">✦</div>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 text-sm text-cyan-100 animate-pulse">✧</div>
            <div className="absolute bottom-3 right-8 text-sm text-emerald-200 animate-pulse">✦</div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-sm text-cyan-200 animate-pulse">✧</div>
            <div className="absolute bottom-3 left-8 text-sm text-emerald-200 animate-pulse">✦</div>
            <div className="absolute left-1 top-1/2 -translate-y-1/2 text-sm text-cyan-100 animate-pulse">✧</div>
            <div className="absolute left-3 top-8 text-sm text-emerald-200 animate-pulse">✦</div>
          </div>
        </div>
      )}

      {showMainModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="my-2 w-full max-w-3xl sm:my-0">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[88vh]">
              {/* ── Header ── */}
              <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Progress Report</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Share photos and updates, or request client sign-off on a milestone.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              {/* ── Body ── */}
              {isLoading || pageLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
                  <p className="text-slate-300">Loading...</p>
                </div>
              ) : (
                <div className="next-step-scrollbar flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  {/* Photo upload section */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                        Photos
                        {readyRows.length > 0 && (
                          <span className="ml-2 font-normal normal-case text-slate-400">
                            ({readyRows.length} uploaded)
                          </span>
                        )}
                      </p>
                      <div className="text-right">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void handleAddFiles(e.target.files);
                            e.currentTarget.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingFiles}
                          className="rounded-md border border-cyan-500/40 bg-cyan-600/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-50 transition"
                        >
                          {uploadingFiles ? 'Uploading...' : '+ Add photos'}
                        </button>
                        <p className="mt-0.5 text-[10px] text-slate-400">Images only · max 5 MB each</p>
                      </div>
                    </div>

                    {photoRows.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-600 bg-slate-800/40 py-8 text-center">
                        <p className="text-sm text-slate-500">No photos added yet</p>
                        <p className="mt-1 text-xs text-slate-600">
                          Tap &quot;+ Add photos&quot; to attach progress images
                        </p>
                      </div>
                    )}

                    {photoRows.length > 0 && (
                      <div className="space-y-3">
                        {photoRows.map((row) => (
                          <div
                            key={row.id}
                            className="flex gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3"
                          >
                            {/* Thumbnail */}
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-600 bg-slate-700">
                              {row.uploading ? (
                                <div className="flex h-full items-center justify-center">
                                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-400" />
                                </div>
                              ) : row.url === 'error' ? (
                                <div className="flex h-full items-center justify-center">
                                  <span className="text-[10px] text-red-400">Error</span>
                                </div>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={row.url}
                                  alt="Progress photo"
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>

                            {/* Note textarea */}
                            <div className="flex flex-1 flex-col gap-2">
                              <textarea
                                value={row.note}
                                onChange={(e) =>
                                  setPhotoRows((prev) =>
                                    prev.map((r) => (r.id === row.id ? { ...r, note: e.target.value } : r)),
                                  )
                                }
                                rows={3}
                                placeholder="Describe this photo (optional)..."
                                className="w-full flex-1 resize-none rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setPhotoRows((prev) => prev.filter((r) => r.id !== row.id))
                                }
                                className="self-end text-[10px] text-slate-500 hover:text-red-400 transition"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Milestone selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cyan-200">
                      Select Milestone
                    </label>
                    <select
                      value={selectedMilestoneId}
                      onChange={(e) => setSelectedMilestoneId(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="">— No milestone selected —</option>
                      {milestones.map((m) => {
                        const isCompleted = m.status === 'completed';
                        return (
                          <option key={m.id} value={m.id} disabled={isCompleted}>
                            {m.sequence}. {m.title}
                            {isCompleted ? ' ✓ completed' : m.signOffRequested ? ' · sign-off pending' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Linked payment milestone info */}
                  {linkedPaymentMilestone && (
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                        Payment milestone linked
                      </p>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <span className="text-white">
                          <span className="text-slate-400">Amount: </span>
                          <strong>{formatHKD(linkedPaymentMilestone.amount)}</strong>
                        </span>
                        {linkedPaymentMilestone.plannedDueAt && (
                          <span className="text-white">
                            <span className="text-slate-400">Due: </span>
                            <strong>{formatDate(linkedPaymentMilestone.plannedDueAt)}</strong>
                          </span>
                        )}
                        <span className="text-white capitalize">
                          <span className="text-slate-400">Status: </span>
                          <strong>{linkedPaymentMilestone.status.replace(/_/g, ' ')}</strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* No linked payment milestone info */}
                  {selectedMilestoneId && !linkedPaymentMilestone && (
                    <div className="rounded-md border border-slate-600/40 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
                      No payment milestone linked to this work milestone.
                    </div>
                  )}

                  {/* Narrative summary */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cyan-200">
                      Progress summary <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      value={narrativeSummary}
                      onChange={(e) => setNarrativeSummary(e.target.value)}
                      rows={3}
                      placeholder="Describe the work completed, any issues encountered, or notes for the client..."
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* ── Footer ── */}
              {!isLoading && !pageLoading && (
                <div className="border-t border-slate-700 px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {/* Share progress — always available */}
                    <button
                      type="button"
                      onClick={() => void handleSubmit(false)}
                      disabled={!canSubmit}
                      className="rounded-md bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 transition sm:order-2"
                    >
                      {submitting === 'share' ? 'Sharing...' : 'Share Progress'}
                    </button>

                    {/* Milestone sign-off — requires a milestone selected */}
                    <button
                      type="button"
                      onClick={() => void handleSubmit(true)}
                      disabled={!canSubmit || !selectedMilestoneId}
                      title={!selectedMilestoneId ? 'Select a milestone to request sign-off' : undefined}
                      className="rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition sm:order-1"
                    >
                      {submitting === 'signoff' ? 'Requesting...' : 'Milestone Sign-off'}
                    </button>
                  </div>
                  {!selectedMilestoneId && (
                    <p className="mt-2 text-right text-[10px] text-slate-500">
                      Select a milestone to enable sign-off request
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {workflowNextStep && (
        <WorkflowCompletionModal
          isOpen={workflowModalOpen}
          completedLabel={
            workflowNextStep.waitingFor === 'client'
              ? 'Sign-off request sent!'
              : 'Progress shared!'
          }
          nextStep={workflowNextStep}
          onClose={() => {
            setWorkflowModalOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

// Mark as viewed when opened for review (REVIEW_PROGRESS_UPDATE or REVIEW_CLIENT_PROGRESS_UPDATE)
  React.useEffect(() => {
    if (!isOpen || !state.actionKey || !state.projectId || !accessToken) return;
    if (!['REVIEW_PROGRESS_UPDATE', 'REVIEW_CLIENT_PROGRESS_UPDATE'].includes(state.actionKey)) return;
    // Assume state.progressReportId is set by modal trigger (or fetch the latest unviewed report)
    const reportId = state.progressReportId;
    if (!reportId) return;
    fetch(`${API_BASE_URL}/progress-reports/${reportId}/viewed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }, [isOpen, state.actionKey, state.projectId, accessToken, state.progressReportId]);
