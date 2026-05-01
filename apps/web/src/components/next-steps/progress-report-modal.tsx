'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useAuth } from '@/context/auth-context';
import { WorkflowCompletionModal, type WorkflowNextStep } from '@/components/workflow-completion-modal';
import { resolveMediaAssetUrl } from '@/lib/media-assets';
import ProjectChat from '@/components/project-chat';

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
  status: string;
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

type PhotoEntry = { url: string; note?: string };

type ProgressReport = {
  id: string;
  submittedById: string;
  submittedByRole: string;
  submitterName?: string;
  milestoneId?: string | null;
  photoEntries: PhotoEntry[];
  narrativeSummary?: string | null;
  signOffRequested: boolean;
  signOffStatus?: string | null;
  signOffApprovedAt?: string | null;
  signOffRejectedAt?: string | null;
  createdAt: string;
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

const formatTime = (dateStr: string) => {
  try {
    return new Intl.DateTimeFormat('en-HK', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

// ---------------------------------------------------------------------------
// Inline photo grid — WhatsApp-style
// ---------------------------------------------------------------------------

function InlinePhotoGrid({ photos }: { photos: PhotoEntry[] }) {
  const [lightbox, setLightbox] = React.useState<string | null>(null);
  return (
    <>
      <div
        className={`grid gap-1.5 ${
          photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
        }`}
      >
        {photos.map((p, i) => {
          const resolved = resolveMediaAssetUrl(p.url);
          return (
            <div key={i} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolved}
                alt={p.note || `Photo ${i + 1}`}
                className="w-full rounded-lg object-cover cursor-pointer transition hover:opacity-90"
                style={{ maxHeight: photos.length === 1 ? '280px' : '140px', minHeight: '80px' }}
                onClick={() => setLightbox(resolved)}
              />
              {p.note && (
                <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/60 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition truncate">
                  {p.note}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="Full size" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" />
            <button
              className="absolute top-2 right-2 bg-white text-slate-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 shadow-lg transition"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sign-off card bubble
// ---------------------------------------------------------------------------

interface SignOffCardProps {
  report: ProgressReport;
  milestone?: WorkMilestone | null;
  isClient: boolean;
  onDecision: (reportId: string, decision: 'approved' | 'rejected', note?: string) => Promise<void>;
  decidingId: string | null;
}

function SignOffCard({ report, milestone, isClient, onDecision, decidingId }: SignOffCardProps) {
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState('');
  const isPending = report.signOffStatus === 'pending';
  const isDeciding = decidingId === report.id;

  const statusChip = () => {
    if (report.signOffStatus === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-xs font-semibold text-emerald-300">
          ✓ Approved{report.signOffApprovedAt ? ` · ${formatDate(report.signOffApprovedAt)}` : ''}
        </span>
      );
    }
    if (report.signOffStatus === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-xs font-semibold text-red-300">
          ✗ Rejected{report.signOffRejectedAt ? ` · ${formatDate(report.signOffRejectedAt)}` : ''}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-semibold text-amber-300">
        ⏳ Awaiting approval
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Milestone Sign-off Request</p>
          {milestone && (
            <p className="mt-0.5 text-sm font-semibold text-white">
              {milestone.sequence}. {milestone.title}
            </p>
          )}
        </div>
        {statusChip()}
      </div>

      {report.narrativeSummary && (
        <p className="text-sm text-slate-300 leading-relaxed">{report.narrativeSummary}</p>
      )}

      {Array.isArray(report.photoEntries) && report.photoEntries.length > 0 && (
        <InlinePhotoGrid photos={report.photoEntries} />
      )}

      {isClient && isPending && (
        <div className="space-y-2">
          {!showRejectInput ? (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                disabled={isDeciding}
                onClick={() => void onDecision(report.id, 'approved')}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isDeciding ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={isDeciding}
                onClick={() => setShowRejectInput(true)}
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition"
              >
                Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={2}
                placeholder="Briefly explain why (optional)…"
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isDeciding}
                  onClick={() => void onDecision(report.id, 'rejected', rejectNote)}
                  className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {isDeciding ? 'Rejecting…' : 'Confirm Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRejectInput(false); setRejectNote(''); }}
                  className="rounded-lg border border-slate-600 px-4 py-1.5 text-sm text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread bubble — regular progress update
// ---------------------------------------------------------------------------

function ReportBubble({
  report,
  isSelf,
  milestone,
  isClient,
  onDecision,
  decidingId,
}: {
  report: ProgressReport;
  isSelf: boolean;
  milestone?: WorkMilestone | null;
  isClient: boolean;
  onDecision: (id: string, decision: 'approved' | 'rejected', note?: string) => Promise<void>;
  decidingId: string | null;
}) {
  const hasPhotos = Array.isArray(report.photoEntries) && report.photoEntries.length > 0;

  if (report.signOffRequested) {
    return (
      <div className="space-y-1">
        {!isSelf && (
          <span className="px-1 text-xs font-semibold text-slate-400">
            {report.submitterName ?? 'Professional'}
          </span>
        )}
        <SignOffCard
          report={report}
          milestone={milestone}
          isClient={isClient}
          onDecision={onDecision}
          decidingId={decidingId}
        />
        <span className={`block px-1 text-[10px] text-slate-500 ${isSelf ? 'text-right' : ''}`}>
          {formatTime(report.createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-1 flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
        {!isSelf && (
          <span className="px-1 text-xs font-semibold text-slate-400">
            {report.submitterName ?? (report.submittedByRole === 'client' ? 'Client' : 'Professional')}
          </span>
        )}
        <div
          className={`rounded-2xl px-4 py-3 space-y-2 ${
            isSelf
              ? 'bg-cyan-600 text-white rounded-tr-sm'
              : 'bg-slate-800 text-white border border-slate-700 rounded-tl-sm'
          }`}
        >
          {report.narrativeSummary && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.narrativeSummary}</p>
          )}
          {hasPhotos && <InlinePhotoGrid photos={report.photoEntries} />}
        </div>
        <span className="px-1 text-[10px] text-slate-500">{formatTime(report.createdAt)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose form
// ---------------------------------------------------------------------------

interface ComposeFormProps {
  projectId: string;
  accessToken: string;
  milestones: WorkMilestone[];
  paymentPlan: PaymentPlan | null;
  onSubmitSuccess: (signOffRequested: boolean, milestoneTitle?: string) => void;
  onScopeChange: (scopeId: string) => void;
}

function ComposeForm({
  projectId,
  accessToken,
  milestones,
  paymentPlan,
  onSubmitSuccess,
  onScopeChange,
}: ComposeFormProps) {
  const [photoRows, setPhotoRows] = React.useState<PhotoRow[]>([]);
  const [uploadingFiles, setUploadingFiles] = React.useState(false);
  const [narrativeSummary, setNarrativeSummary] = React.useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<'share' | 'signoff' | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const linkedPaymentMilestone = React.useMemo<PaymentMilestone | null>(() => {
    if (!selectedMilestoneId || !paymentPlan?.milestones) return null;
    return paymentPlan.milestones.find((pm) => pm.projectMilestoneId === selectedMilestoneId) ?? null;
  }, [selectedMilestoneId, paymentPlan?.milestones]);

  React.useEffect(() => {
    onScopeChange(selectedMilestoneId || 'general');
  }, [selectedMilestoneId, onScopeChange]);

  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || !accessToken) return;
    const files = Array.from(fileList);
    const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`Files must be under 5 MB: ${oversized.map((f) => f.name).join(', ')}`);
      return;
    }
    const time = Date.now();
    const rows: PhotoRow[] = files.map((f, i) => ({ id: `${time}-${i}`, url: '', note: '', uploading: true }));
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
          setPhotoRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, url: 'error', uploading: false } : r)));
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSubmit = async (signOffRequested: boolean) => {
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
          projectId,
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
      const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId);
      onSubmitSuccess(signOffRequested, selectedMilestone?.title);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit progress report');
    } finally {
      setSubmitting(null);
    }
  };

  const readyRows = photoRows.filter((r) => !r.uploading && r.url && r.url !== 'error');
  const canSubmit = readyRows.length > 0 && !submitting;

  return (
    <div className="flex flex-col gap-5">
      {/* Photos */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
            Photos
            {readyRows.length > 0 && (
              <span className="ml-2 font-normal normal-case text-slate-400">({readyRows.length} uploaded)</span>
            )}
          </p>
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
              {uploadingFiles ? 'Uploading…' : '+ Add photos'}
            </button>
            <p className="mt-0.5 text-[10px] text-slate-400">Images only · max 5 MB each</p>
          </div>
        </div>

        {photoRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-600 bg-slate-800/40 py-8 text-center">
            <p className="text-sm text-slate-500">No photos added yet</p>
            <p className="mt-1 text-xs text-slate-600">Tap &quot;+ Add photos&quot; to attach progress images</p>
          </div>
        ) : (
          <div className="space-y-3">
            {photoRows.map((row) => (
              <div key={row.id} className="flex gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
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
                    <img src={row.url} alt="Progress photo" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <textarea
                    value={row.note}
                    onChange={(e) =>
                      setPhotoRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, note: e.target.value } : r)))
                    }
                    rows={3}
                    placeholder="Describe this photo (optional)…"
                    className="w-full flex-1 resize-none rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoRows((prev) => prev.filter((r) => r.id !== row.id))}
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

      {/* Milestone */}
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

      {linkedPaymentMilestone && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">Payment milestone linked</p>
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

      {selectedMilestoneId && !linkedPaymentMilestone && (
        <div className="rounded-md border border-slate-600/40 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
          No payment milestone linked to this work milestone.
        </div>
      )}

      {/* Summary */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-cyan-200">
          Progress summary <span className="font-normal normal-case text-slate-400">(optional)</span>
        </label>
        <textarea
          value={narrativeSummary}
          onChange={(e) => setNarrativeSummary(e.target.value)}
          rows={3}
          placeholder="Describe the work completed, any issues, or notes for the client…"
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="border-t border-slate-700 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void handleSubmit(false)}
            disabled={!canSubmit}
            className="rounded-md bg-cyan-600 px-5 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 transition sm:order-2"
          >
            {submitting === 'share' ? 'Sharing…' : 'Share Progress'}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit(true)}
            disabled={!canSubmit || !selectedMilestoneId}
            title={!selectedMilestoneId ? 'Select a milestone to request sign-off' : undefined}
            className="rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition sm:order-1"
          >
            {submitting === 'signoff' ? 'Requesting…' : 'Milestone Sign-off'}
          </button>
        </div>
        {!selectedMilestoneId && (
          <p className="mt-2 text-right text-[10px] text-slate-500">Select a milestone to enable sign-off request</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface ProgressReportModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function ProgressReportModal({ isOpen, isLoading: _isLoading = false, onClose }: ProgressReportModalProps) {
  void _isLoading;
  const { state } = useNextStepModal();
  const { accessToken: professionalToken } = useProfessionalAuth();
  const { accessToken: clientToken } = useAuth();

  const isProfessional = (state.role || '').toUpperCase().includes('PROFESSIONAL');
  const isClient = !isProfessional;
  const accessToken = isProfessional ? professionalToken : clientToken;
  const [stableAccessToken, setStableAccessToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (accessToken) {
      setStableAccessToken(accessToken);
    }
  }, [accessToken]);

  const effectiveAccessToken = accessToken || stableAccessToken;

  const isReviewMode = ['REVIEW_PROGRESS', 'REVIEW_PROGRESS_UPDATE', 'REVIEW_CLIENT_PROGRESS_UPDATE'].includes(
    state.actionKey || '',
  );

  const [mode, setMode] = React.useState<'thread' | 'compose'>(
    isClient || isReviewMode ? 'thread' : 'compose',
  );
  const [pageLoading, setPageLoading] = React.useState(false);
  const [reports, setReports] = React.useState<ProgressReport[]>([]);
  const [milestones, setMilestones] = React.useState<WorkMilestone[]>([]);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [decidingId, setDecidingId] = React.useState<string | null>(null);
  const [workflowModalOpen, setWorkflowModalOpen] = React.useState(false);
  const [workflowNextStep, setWorkflowNextStep] = React.useState<WorkflowNextStep | null>(null);
  const [showShareCelebration, setShowShareCelebration] = React.useState(false);
  const [composeScopeId, setComposeScopeId] = React.useState<string>('general');
  const [composeChatRefreshKey, setComposeChatRefreshKey] = React.useState(0);
  const celebrationTimerRef = React.useRef<number | null>(null);
  const threadBottomRef = React.useRef<HTMLDivElement>(null);

  // Fetch on open
  React.useEffect(() => {
    if (!isOpen || !state.projectId || !effectiveAccessToken) return;
    const load = async () => {
      setPageLoading(true);
      try {
        const [reportsRes, milestonesRes, paymentPlanRes] = await Promise.all([
          fetch(`${API_BASE_URL}/progress-reports/project/${state.projectId}`, {
            headers: { Authorization: `Bearer ${effectiveAccessToken}` },
          }),
          fetch(`${API_BASE_URL}/milestones/project/${state.projectId}`, {
            headers: { Authorization: `Bearer ${effectiveAccessToken}` },
          }),
          fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
            headers: { Authorization: `Bearer ${effectiveAccessToken}` },
          }),
        ]);
        if (reportsRes.ok) {
          const data = await reportsRes.json();
          setReports(Array.isArray(data) ? data : []);
        }
        if (milestonesRes.ok) {
          const data = await milestonesRes.json();
          setMilestones(Array.isArray(data) ? data : []);
        }
        if (paymentPlanRes.ok) setPaymentPlan(await paymentPlanRes.json());
      } catch {
        toast.error('Failed to load progress updates');
      } finally {
        setPageLoading(false);
      }
    };
    void load();
  }, [isOpen, state.projectId, effectiveAccessToken]);

  // Auto-mode after load
  React.useEffect(() => {
    if (!pageLoading) {
      setMode(isClient || isReviewMode ? 'thread' : 'compose');
    }
  }, [pageLoading, isClient, isReviewMode]);

  // Mark viewed
  React.useEffect(() => {
    if (!isOpen || !state.progressReportId || !effectiveAccessToken) return;
    fetch(`${API_BASE_URL}/progress-reports/${state.progressReportId}/viewed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${effectiveAccessToken}` },
    }).catch(() => {});
  }, [isOpen, state.progressReportId, effectiveAccessToken]);

  // Scroll to bottom when thread renders
  React.useEffect(() => {
    if (!pageLoading && mode === 'thread' && threadBottomRef.current) {
      threadBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [pageLoading, mode, reports.length]);

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      if (celebrationTimerRef.current) {
        window.clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
      setReports([]);
      setMilestones([]);
      setPaymentPlan(null);
      setWorkflowModalOpen(false);
      setWorkflowNextStep(null);
      setShowShareCelebration(false);
      setComposeScopeId('general');
      setComposeChatRefreshKey(0);
      setStableAccessToken(null);
      setDecidingId(null);
      setMode(isClient || isReviewMode ? 'thread' : 'compose');
    }
  }, [isOpen, isClient, isReviewMode]);

  const refreshReports = React.useCallback(() => {
    if (!state.projectId || !effectiveAccessToken) return;
    fetch(`${API_BASE_URL}/progress-reports/project/${state.projectId}`, {
      headers: { Authorization: `Bearer ${effectiveAccessToken}` },
    })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setReports(data); })
      .catch(() => {});
  }, [state.projectId, effectiveAccessToken]);

  const handleSubmitSuccess = React.useCallback(
    (signOffRequested: boolean, milestoneTitle?: string) => {
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      setComposeChatRefreshKey((k) => k + 1);
      setMode('thread');

      // Keep user in modal context to see the scoped thread update immediately.
      if (signOffRequested) {
        toast.success('Milestone sign-off requested — client has been notified');
      } else {
        toast.success('Progress update shared');
      }

      // Preserve next-step metadata for future usage, but do not auto-interrupt compose flow.
      setWorkflowNextStep(
        signOffRequested
          ? {
              actionLabel: 'Wait for client sign-off',
              description: `Your sign-off request for "${milestoneTitle ?? 'the milestone'}" has been sent to the client for approval.`,
              requiresAction: false,
              waitingFor: 'client',
              tab: 'schedule',
            }
          : {
              actionLabel: 'Continue working',
              description: 'Your progress update and photos have been shared.',
              requiresAction: false,
              tab: 'schedule',
            },
      );

      refreshReports();
    },
    [state, refreshReports],
  );

  const handleSignOffDecision = React.useCallback(
    async (reportId: string, decision: 'approved' | 'rejected', note?: string) => {
      if (!effectiveAccessToken) return;
      setDecidingId(reportId);
      try {
        const res = await fetch(`${API_BASE_URL}/progress-reports/${reportId}/sign-off`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${effectiveAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, rejectionNote: note }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { message?: string }).message || 'Request failed');
        }
        toast.success(decision === 'approved' ? 'Milestone approved ✓' : 'Sign-off rejected');
        state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
        refreshReports();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to submit decision');
      } finally {
        setDecidingId(null);
      }
    },
    [effectiveAccessToken, state, refreshReports],
  );

  if (!isOpen) return null;
  const showMainModal = isOpen && !workflowModalOpen;
  const milestoneMap = new Map(milestones.map((m) => [m.id, m]));
  const hasReports = reports.length > 0;

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
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div className="my-2 w-full max-w-3xl sm:my-0">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[92vh]">

              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {mode === 'thread' ? 'Progress Updates' : 'Share Progress'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">
                    {mode === 'thread'
                      ? 'Project updates, photos and milestone sign-offs'
                      : 'Upload photos and share updates with the client'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isProfessional && hasReports && (
                    <button
                      type="button"
                      onClick={() => setMode((m) => (m === 'thread' ? 'compose' : 'thread'))}
                      className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 transition"
                    >
                      {mode === 'thread' ? '+ New update' : 'View thread'}
                    </button>
                  )}
                  {isProfessional && !hasReports && mode === 'thread' && (
                    <button
                      type="button"
                      onClick={() => setMode('compose')}
                      className="rounded border border-cyan-600 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-600/20 transition"
                    >
                      + Post first update
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Body */}
              {pageLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
                  <p className="text-slate-300">Loading…</p>
                </div>
              ) : mode === 'compose' ? (
                <div className="next-step-scrollbar flex-1 overflow-y-auto px-5 py-5 space-y-4">
                  <ComposeForm
                    projectId={state.projectId!}
                    accessToken={effectiveAccessToken!}
                    milestones={milestones}
                    paymentPlan={paymentPlan}
                    onSubmitSuccess={handleSubmitSuccess}
                    onScopeChange={setComposeScopeId}
                  />

                  {state.projectId && effectiveAccessToken && (
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 overflow-hidden">
                      <div className="px-3 pt-2 pb-0.5 border-b border-slate-700">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Scoped Progress Chat
                        </p>
                      </div>
                      <ProjectChat
                        projectId={state.projectId}
                        accessToken={effectiveAccessToken}
                        currentUserRole={isProfessional ? 'professional' : 'client'}
                        threadScope="progress"
                        threadScopeId={composeScopeId}
                        refreshToken={composeChatRefreshKey}
                        sendButtonLabel="Send"
                        messagePlaceholder="Comment or ask a question about this update…"
                        fillHeight={false}
                        className="border-0 rounded-none bg-transparent shadow-none"
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Thread mode */
                <div className="flex flex-col flex-1 min-h-0" style={{ maxHeight: 'calc(92vh - 80px)' }}>
                  {/* Report bubbles */}
                  <div className="next-step-scrollbar flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {reports.length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-slate-400 text-sm">No progress updates yet.</p>
                        {isProfessional && (
                          <button
                            type="button"
                            onClick={() => setMode('compose')}
                            className="mt-3 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition"
                          >
                            Post first update
                          </button>
                        )}
                        {isClient && (
                          <p className="mt-1 text-xs text-slate-500">
                            The professional will share photos and updates here as work progresses.
                          </p>
                        )}
                      </div>
                    ) : (
                      reports.map((report) => {
                        const isSelf = isProfessional
                          ? report.submittedByRole === 'professional'
                          : report.submittedByRole === 'client';
                        return (
                          <ReportBubble
                            key={report.id}
                            report={report}
                            isSelf={isSelf}
                            milestone={report.milestoneId ? milestoneMap.get(report.milestoneId) : null}
                            isClient={isClient}
                            onDecision={handleSignOffDecision}
                            decidingId={decidingId}
                          />
                        );
                      })
                    )}
                    <div ref={threadBottomRef} />
                  </div>

                  {/* Scoped reply chat */}
                  {state.projectId && effectiveAccessToken && (
                    <div className="border-t border-slate-700 shrink-0">
                      <div className="px-3 pt-2 pb-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Reply to project team
                        </p>
                      </div>
                      <ProjectChat
                        projectId={state.projectId}
                        accessToken={effectiveAccessToken}
                        currentUserRole={isProfessional ? 'professional' : 'client'}
                        threadScope="progress"
                        threadScopeId="general"
                        sendButtonLabel="Send"
                        messagePlaceholder="Comment or ask a question about this update…"
                        fillHeight={false}
                        className="border-0 rounded-none bg-transparent shadow-none"
                      />
                    </div>
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
          completedLabel={workflowNextStep.waitingFor === 'client' ? 'Sign-off request sent!' : 'Progress shared!'}
          nextStep={workflowNextStep}
          onClose={() => { setWorkflowModalOpen(false); onClose(); }}
        />
      )}
    </>
  );
}
