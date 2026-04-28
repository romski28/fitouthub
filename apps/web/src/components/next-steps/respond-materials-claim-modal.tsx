'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import ProjectChat from '@/components/project-chat';
import MaterialsClaimItemsTable from '@/components/materials-claim-items-table';

// ─── Types ──────────────────────────────────────────────────────────────────

type ProcurementEvidence = {
  id: string;
  status: string;
  claimedAmount: number | string;
  invoiceUrls?: string[];
  photoUrls?: string[];
  openingMessage?: string | null;
  notes?: string | null;
  deadlineAt?: string | null;
  clientQuestionedAt?: string | null;
  professionalRespondedAt?: string | null;
  createdAt: string;
};

type PaymentMilestone = {
  id: string;
  sequence: number;
  title: string;
};

type PaymentPlan = {
  projectScale: string;
  milestones: PaymentMilestone[];
};

type UploadRow = {
  id: string;
  filename: string;
  url: string;
  note: string;
  value: string;
  uploading: boolean;
  kind: 'invoice' | 'photo';
};

type NoteMap = Record<string, { valueText?: string; noteText?: string }>;

function parseItemNotes(notes: string | null | undefined): NoteMap {
  if (!notes) return {};
  const result: NoteMap = {};
  const entries = notes
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^(.*?)(?:\s*\((?:HKD\s*)?([\d.,]+)\))?\s*:\s*(.*)$/i);
    if (match) {
      const filename = match[1].trim();
      const valueText = match[2]?.trim();
      const noteText = match[3]?.trim();
      if (filename) {
        result[filename] = {
          valueText: valueText ? `HKD ${valueText}` : undefined,
          noteText,
        };
      }
      continue;
    }

    const fallback = entry.split(':');
    const filename = fallback[0]?.trim();
    const noteText = fallback.slice(1).join(':').trim();
    if (filename) {
      result[filename] = { noteText: noteText || undefined };
    }
  }

  return result;
}

function filenameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0] || url;
    const segments = clean.split('/');
    return decodeURIComponent(segments[segments.length - 1] || url);
  } catch {
    return url;
  }
}

function normalizeValueText(valueText?: string): string {
  if (!valueText) return '';
  return valueText.replace(/[^\d.]/g, '');
}

// ─── Component ───────────────────────────────────────────────────────────────

interface RespondMaterialsClaimModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function RespondMaterialsClaimModal({
  isOpen,
  isLoading = false,
  onClose,
}: RespondMaterialsClaimModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useProfessionalAuth();

  const [pageLoading, setPageLoading] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [evidence, setEvidence] = React.useState<ProcurementEvidence | null>(null);
  const [uploadRows, setUploadRows] = React.useState<UploadRow[]>([]);
  const [savingClaim, setSavingClaim] = React.useState(false);

  const formatHKD = (value: number | string) =>
    new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value || '0') : value);

  const firstMilestone = React.useMemo(
    () => paymentPlan?.milestones?.find((m) => Number(m.sequence) === 1) || null,
    [paymentPlan],
  );

  const totalClaimed = React.useMemo(
    () =>
      uploadRows.reduce((sum, row) => {
        const value = parseFloat(row.value);
        return sum + (Number.isFinite(value) && value > 0 ? value : 0);
      }, 0),
    [uploadRows],
  );

  // ── Load data ─────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isOpen || !state.projectId || !accessToken) return;
    const load = async () => {
      setPageLoading(true);
      try {
        const planRes = await fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!planRes.ok) throw new Error('Failed to load payment plan');
        const plan: PaymentPlan = await planRes.json();
        setPaymentPlan(plan);

        const m1 = plan.milestones?.find((m) => Number(m.sequence) === 1);
        if (!m1) return;

        const evRes = await fetch(
          `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${m1.id}/procurement-evidence`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!evRes.ok) throw new Error('Failed to load claim');
        const evList: ProcurementEvidence[] = await evRes.json();
        const pending = evList.find((e) => e.status === 'pending') || evList[0] || null;
        setEvidence(pending);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load claim data');
      } finally {
        setPageLoading(false);
      }
    };
    void load();
  }, [isOpen, state.projectId, accessToken]);

  React.useEffect(() => {
    if (!evidence) {
      setUploadRows([]);
      return;
    }

    const noteMap = parseItemNotes(evidence.notes);
    const invoiceRows = (evidence.invoiceUrls || []).map((url, index) => {
      const filename = filenameFromUrl(url);
      const meta = noteMap[filename] || {};
      return {
        id: `invoice-${index}-${filename}`,
        filename,
        url,
        note: meta.noteText || '',
        value: normalizeValueText(meta.valueText),
        uploading: false,
        kind: 'invoice' as const,
      };
    });

    const photoRows = (evidence.photoUrls || []).map((url, index) => {
      const filename = filenameFromUrl(url);
      const meta = noteMap[filename] || {};
      return {
        id: `photo-${index}-${filename}`,
        filename,
        url,
        note: meta.noteText || '',
        value: normalizeValueText(meta.valueText),
        uploading: false,
        kind: 'photo' as const,
      };
    });

    setUploadRows([...invoiceRows, ...photoRows]);
  }, [evidence]);

  const handleSaveClaimUpdates = async () => {
    if (!evidence || !firstMilestone || !state.projectId || !accessToken) return;
    if (uploadRows.length === 0) {
      toast.error('At least one receipt/photo is required');
      return;
    }

    const invalidRows = uploadRows.filter((row) => {
      const value = parseFloat(row.value);
      return !Number.isFinite(value) || value <= 0;
    });
    if (invalidRows.length > 0) {
      toast.error('All item values must be greater than zero');
      return;
    }

    const claimedAmount = uploadRows.reduce((sum, row) => sum + parseFloat(row.value), 0);
    const itemNotes = uploadRows
      .map((row) => {
        const value = parseFloat(row.value);
        const normalizedValue = Number.isFinite(value) && value > 0 ? value.toFixed(2) : row.value;
        const note = row.note.trim();
        return `${row.filename} (HKD ${normalizedValue})${note ? `: ${note}` : ':'}`;
      })
      .join(' | ');

    const invoiceUrls = uploadRows.filter((row) => row.kind === 'invoice').map((row) => row.url);
    const photoUrls = uploadRows.filter((row) => row.kind === 'photo').map((row) => row.url);

    setSavingClaim(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${firstMilestone.id}/procurement-evidence/${evidence.id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            claimedAmount,
            invoiceUrls,
            photoUrls,
            openingMessage: evidence.openingMessage || undefined,
            notes: itemNotes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to save claim updates');
      }

      const payload = await res.json().catch(() => ({} as any));
      if (payload?.evidence) {
        setEvidence(payload.evidence as ProcurementEvidence);
      }
      toast.success('Claim details updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save claim updates');
    } finally {
      setSavingClaim(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="my-2 w-full max-w-6xl sm:my-0">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Materials claim — client response required</h3>
            <p className="mt-0.5 text-xs text-slate-300">
              Edit receipt notes/values and clarify details in claim chat to continue authorisation.
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

        <div className="flex-1 overflow-y-visible px-5 py-4 sm:overflow-y-auto">
          {isLoading || pageLoading ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
              <p className="text-slate-300 text-sm">Loading claim...</p>
            </div>
          ) : !evidence ? (
            <div className="rounded-md border border-slate-600 bg-slate-800 px-4 py-6 text-center text-sm text-slate-300">
              No pending materials claim found for this project.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-h-0 min-w-0 space-y-3">
              {/* Claim summary */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Your claim</span>
                  <span className="text-lg font-bold text-white">{formatHKD(totalClaimed || evidence.claimedAmount)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>Submitted {new Date(evidence.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  {evidence.deadlineAt && (
                    <>
                      <span>·</span>
                      <span className="text-amber-300">Deadline {new Date(evidence.deadlineAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </>
                  )}
                </div>
                {evidence.clientQuestionedAt && (
                  <div className="pt-1 text-xs text-amber-200 border-t border-slate-700">
                    Client last asked a question on {new Date(evidence.clientQuestionedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>

              {uploadRows.length > 0 ? (
                <MaterialsClaimItemsTable
                  rows={uploadRows}
                  totalClaimed={totalClaimed}
                  maxClaimableAmount={Number.MAX_SAFE_INTEGER}
                  onNoteChange={(rowId, value) =>
                    setUploadRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, note: value } : row)))
                  }
                  onValueChange={(rowId, value) =>
                    setUploadRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, value } : row)))
                  }
                  onRemove={(rowId) => setUploadRows((prev) => prev.filter((row) => row.id !== rowId))}
                  formatHKD={formatHKD}
                />
              ) : (
                <div className="rounded-md border border-slate-700 bg-slate-800/30 px-3 py-2 text-xs text-slate-300">
                  No receipt rows found on this claim.
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveClaimUpdates}
                  disabled={savingClaim || uploadRows.length === 0}
                  className="h-9 rounded-md bg-cyan-600 px-4 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {savingClaim ? 'Saving...' : 'Save claim updates'}
                </button>
              </div>
              </div>

              {/* Scoped claim chat thread */}
              {state.projectId && evidence && (
                <div className="min-h-0 min-w-0">
                  <ProjectChat
                    projectId={state.projectId}
                    accessToken={accessToken ?? ''}
                    currentUserRole="professional"
                    threadScope="claim"
                    threadScopeId={evidence.id}
                    sendButtonLabel="Share clarification"
                    messagePlaceholder="Share clarification on receipts, values, or notes..."
                    className="min-h-0 min-w-0"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
