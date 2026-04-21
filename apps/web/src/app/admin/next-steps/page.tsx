'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';

type NextStepConfigRow = {
  id: string;
  projectStage: string;
  role: string;
  actionKey: string;
  actionLabel: string;
  description?: string | null;
  modalTitle?: string | null;
  modalBody?: string | null;
  modalDetailsBody?: string | null;
  modalSuccessTitle?: string | null;
  modalSuccessBody?: string | null;
  modalSuccessNextStepBody?: string | null;
  modalImageUrl?: string | null;
  modalPrimaryButtonLabel?: string | null;
  modalSecondaryButtonLabel?: string | null;
  modalPrimaryActionType?: string | null;
  modalPrimaryActionTarget?: string | null;
  modalSecondaryActionType?: string | null;
  modalSecondaryActionTarget?: string | null;
  isPrimary: boolean;
  isElective: boolean;
};

type ModalContentDraft = {
  modalTitle: string;
  modalBody: string;
  modalDetailsBody: string;
  modalSuccessTitle: string;
  modalSuccessBody: string;
  modalSuccessNextStepBody: string;
  modalImageUrl: string;
  modalPrimaryButtonLabel: string;
  modalSecondaryButtonLabel: string;
  modalPrimaryActionType: string;
  modalPrimaryActionTarget: string;
  modalSecondaryActionType: string;
  modalSecondaryActionTarget: string;
};

const STAGES = [
  'CREATED',
  'BIDDING_ACTIVE',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_COMPLETE',
  'QUOTE_RECEIVED',
  'BIDDING_CLOSED',
  'CONTRACT_PHASE',
  'PRE_WORK',
  'WORK_IN_PROGRESS',
  'MILESTONE_PENDING',
  'PAYMENT_RELEASED',
  'NEAR_COMPLETION',
  'FINAL_INSPECTION',
  'COMPLETE',
  'WARRANTY_PERIOD',
  'PAUSED',
  'DISPUTED',
  'CLOSED',
] as const;

function toDraft(row: NextStepConfigRow | null): ModalContentDraft {
  return {
    modalTitle: row?.modalTitle || '',
    modalBody: row?.modalBody || '',
    modalDetailsBody: row?.modalDetailsBody || '',
    modalSuccessTitle: row?.modalSuccessTitle || '',
    modalSuccessBody: row?.modalSuccessBody || '',
    modalSuccessNextStepBody: row?.modalSuccessNextStepBody || '',
    modalImageUrl: row?.modalImageUrl || '',
    modalPrimaryButtonLabel: row?.modalPrimaryButtonLabel || '',
    modalSecondaryButtonLabel: row?.modalSecondaryButtonLabel || '',
    modalPrimaryActionType: row?.modalPrimaryActionType || '',
    modalPrimaryActionTarget: row?.modalPrimaryActionTarget || '',
    modalSecondaryActionType: row?.modalSecondaryActionType || '',
    modalSecondaryActionTarget: row?.modalSecondaryActionTarget || '',
  };
}

export default function AdminNextStepContentPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();

  const [rows, setRows] = useState<NextStepConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stageFilter, setStageFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [query, setQuery] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ModalContentDraft>(toDraft(null));

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/');
    }
  }, [user, router]);

  const loadRows = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (stageFilter) params.set('projectStage', stageFilter);
      if (roleFilter) params.set('role', roleFilter);
      if (query.trim()) params.set('actionKey', query.trim().toUpperCase());

      const res = await fetch(`${API_BASE_URL}/admin/next-step-configs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load next-step configs');
      const data = await res.json();
      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
      if (nextRows.length > 0) {
        const nextSelected = nextRows.find((row: NextStepConfigRow) => row.id === selectedId) || nextRows[0];
        setSelectedId(nextSelected.id);
        setDraft(toDraft(nextSelected));
      } else {
        setSelectedId('');
        setDraft(toDraft(null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load next-step configs');
    } finally {
      setLoading(false);
    }
  }, [accessToken, query, roleFilter, selectedId, stageFilter]);

  useEffect(() => {
    if (user?.role === 'admin' && accessToken) {
      void loadRows();
    }
  }, [user, accessToken, loadRows]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const save = async () => {
    if (!accessToken || !selectedRow) return;
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/admin/next-step-configs/${selectedRow.id}/modal-content`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to save modal content');
      }
      await loadRows();
      alert('Modal content saved.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save modal content');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-700">Loading next-step modal content...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Next-Step Modal Content</h1>
          <p className="mt-2 text-slate-600">
            Edit DB-backed modal copy and image URLs for next-step actions. Supports placeholders: {'{clientName}'}, {'{professionalName}'}, {'{amount}'}.
          </p>
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All stages</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All roles</option>
              <option value="CLIENT">CLIENT</option>
              <option value="PROFESSIONAL">PROFESSIONAL</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Action key (e.g. AUTHORIZE_MATERIALS_WALLET)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => void loadRows()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm max-h-[70vh] overflow-auto">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">No rows found for this filter.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id);
                      setDraft(toDraft(row));
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      row.id === selectedId
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">{row.projectStage} · {row.role}</p>
                    <p className="text-sm font-semibold text-slate-900">{row.actionKey}</p>
                    <p className="text-xs text-slate-600 mt-1">{row.actionLabel}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            {selectedRow ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedRow.actionKey}</h2>
                  <p className="text-sm text-slate-600">{selectedRow.projectStage} · {selectedRow.role}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Action types: <code>confirm_transfer</code>, <code>navigate_tab</code>, <code>show_details</code>, <code>close_modal</code>, <code>noop</code>.
                  </p>
                </div>

                {([
                  ['modalTitle', 'Modal title'],
                  ['modalBody', 'Modal body'],
                  ['modalDetailsBody', 'Details body'],
                  ['modalSuccessTitle', 'Success title'],
                  ['modalSuccessBody', 'Success body'],
                  ['modalSuccessNextStepBody', 'Success next-step body'],
                  ['modalImageUrl', 'Image URL'],
                  ['modalPrimaryButtonLabel', 'Primary button label'],
                  ['modalSecondaryButtonLabel', 'Secondary button label'],
                  ['modalPrimaryActionType', 'Primary action type'],
                  ['modalPrimaryActionTarget', 'Primary action target'],
                  ['modalSecondaryActionType', 'Secondary action type'],
                  ['modalSecondaryActionTarget', 'Secondary action target'],
                ] as Array<[keyof ModalContentDraft, string]>).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                    {key.includes('Body') ? (
                      <textarea
                        value={draft[key]}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    ) : (
                      <input
                        value={draft[key]}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                ))}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save modal content'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Select a row to edit.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
