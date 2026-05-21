'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

type ScopeStatus = 'draft' | 'pm_reviewed' | 'published' | 'superseded';

type ScopeEntry = {
  id: string;
  sequence: number;
  workPackage: string;
  deliverable: string;
  primaryTrade: string;
  durationMinDays: number;
  durationMaxDays: number;
  dependencies: string[];
  phase: string;
  milestoneCode: string | null;
  notes: string;
};

type ScopeAuditEntry = {
  fromStatus: string;
  toStatus: string;
  byActorId: string;
  byRole: string;
  at: string;
  note?: string;
};

type ScopeVersion = {
  id: string;
  version: number;
  createdAt: string;
  status: ScopeStatus;
  publishedAt?: string;
  scopeAuditLog: ScopeAuditEntry[];
  createdByRole: 'client' | 'professional' | 'admin';
  projectSummary: {
    projectType: string;
    location: string;
    assumptions: string[];
    constraints: string[];
  };
  entries: ScopeEntry[];
  milestones: Array<{
    code: string;
    name: string;
    targetDay: number;
    acceptanceCriteria: string;
  }>;
  programme: {
    startDay: number;
    finishDay: number;
    criticalPath: string[];
    timelineByPhase: Array<{
      phase: string;
      dayRange: string;
      includedEntryIds: string[];
    }>;
  };
  confidence: {
    level: 'low' | 'medium' | 'high';
    notes: string;
  };
};

interface ProjectAiScopePanelProps {
  projectId: string;
  accessToken?: string | null;
  mode: 'client' | 'professional' | 'admin';
}

const defaultGeneratorInputs = {
  additionalContext: '',
  siteConstraints: '',
  longLeadItems: '',
  workingCalendar: '',
  deadline: '',
};

const STATUS_LABELS: Record<ScopeStatus, string> = {
  draft: 'Draft',
  pm_reviewed: 'PM Reviewed',
  published: 'Published',
  superseded: 'Superseded',
};

const STATUS_COLOURS: Record<ScopeStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  pm_reviewed: 'bg-blue-100 text-blue-800',
  published: 'bg-emerald-100 text-emerald-800',
  superseded: 'bg-slate-100 text-slate-500',
};

function StatusBadge({ status }: { status: ScopeStatus | null }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOURS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

type EntryDiffRow = {
  entry: ScopeEntry;
  kind: 'same' | 'added' | 'removed' | 'changed';
};

function buildComparisonRows(baseline: ScopeVersion | null, current: ScopeVersion | null): EntryDiffRow[] {
  if (!baseline || !current) return [];
  const baseMap = new Map(baseline.entries.map((e) => [e.id, e]));
  const currMap = new Map(current.entries.map((e) => [e.id, e]));
  const rows: EntryDiffRow[] = [];

  for (const entry of current.entries) {
    const base = baseMap.get(entry.id);
    if (!base) {
      rows.push({ entry, kind: 'added' });
    } else if (base.durationMinDays !== entry.durationMinDays || base.durationMaxDays !== entry.durationMaxDays || base.workPackage !== entry.workPackage) {
      rows.push({ entry, kind: 'changed' });
    } else {
      rows.push({ entry, kind: 'same' });
    }
  }
  for (const entry of baseline.entries) {
    if (!currMap.has(entry.id)) {
      rows.push({ entry, kind: 'removed' });
    }
  }
  rows.sort((a, b) => a.entry.sequence - b.entry.sequence);
  return rows;
}

export function ProjectAiScopePanel({ projectId, accessToken, mode }: ProjectAiScopePanelProps) {
  const [scope, setScope] = useState<ScopeVersion | null>(null);
  const [publishedScope, setPublishedScope] = useState<ScopeVersion | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<ScopeStatus | null>(null);
  const [canAdminCrud, setCanAdminCrud] = useState(false);
  const [canRegenerate, setCanRegenerate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionCount, setVersionCount] = useState(0);
  const [inputs, setInputs] = useState(defaultGeneratorInputs);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const dragOverId = useRef<string | null>(null);

  const isAdmin = mode === 'admin';

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    }),
    [accessToken]
  );

  const fetchScope = useCallback(async () => {
    if (!accessToken || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope`, {
        method: 'GET',
        headers,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Failed to load AI scope');
        throw new Error(msg || 'Failed to load AI scope');
      }
      const data = await res.json();
      setScope(data.scope || null);
      setPublishedScope(data.publishedScope || null);
      setVersionCount(typeof data.versionCount === 'number' ? data.versionCount : 0);
      setWorkflowStatus(data.workflowStatus || null);
      setCanAdminCrud(!!data.canAdminCrud);
      setCanRegenerate(!!data.canRegenerate);
    } catch (e) {
      setError((e as Error).message || 'Failed to load AI scope');
    } finally {
      setLoading(false);
    }
  }, [accessToken, headers, projectId]);

  useEffect(() => {
    fetchScope();
  }, [fetchScope]);

  const generateScope = async () => {
    if (!accessToken || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(inputs),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Failed to generate AI scope');
        throw new Error(msg || 'Failed to generate AI scope');
      }
      const data = await res.json();
      setScope(data.scope || null);
      setVersionCount(typeof data.versionCount === 'number' ? data.versionCount : versionCount);
      setWorkflowStatus(data.workflowStatus || 'draft');
    } catch (e) {
      setError((e as Error).message || 'Failed to generate AI scope');
    } finally {
      setSaving(false);
    }
  };

  const workflowAction = async (action: 'review' | 'publish' | 'revise', note?: string) => {
    if (!accessToken || !projectId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope/${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => `Failed to ${action} scope`);
        throw new Error(msg || `Failed to ${action} scope`);
      }
      await fetchScope();
    } catch (e) {
      setError((e as Error).message || `Failed to ${action} scope`);
    } finally {
      setSaving(false);
    }
  };

  const updateEntry = async (entryId: string, patch: Partial<ScopeEntry>) => {
    if (!scope || !canAdminCrud || !accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope/entries/${entryId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Failed to update scope entry');
        throw new Error(msg || 'Failed to update scope entry');
      }
      const data = await res.json();
      setScope(data.scope || scope);
    } catch (e) {
      setError((e as Error).message || 'Failed to update scope entry');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!scope || !canAdminCrud || !accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope/entries/${entryId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Failed to delete scope entry');
        throw new Error(msg || 'Failed to delete scope entry');
      }
      const data = await res.json();
      setScope(data.scope || scope);
    } catch (e) {
      setError((e as Error).message || 'Failed to delete scope entry');
    } finally {
      setSaving(false);
    }
  };

  const addEntry = async () => {
    if (!canAdminCrud || !accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope/entries`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workPackage: 'New work package',
          deliverable: '',
          primaryTrade: 'General',
          durationMinDays: 1,
          durationMaxDays: 1,
          dependencies: [],
          phase: 'Execution',
          milestoneCode: null,
          notes: '',
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Failed to add scope entry');
        throw new Error(msg || 'Failed to add scope entry');
      }
      const data = await res.json();
      setScope(data.scope || scope);
    } catch (e) {
      setError((e as Error).message || 'Failed to add scope entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId || !scope) return;
    const entries = [...scope.entries].sort((a, b) => a.sequence - b.sequence);
    const from = entries.findIndex((e) => e.id === draggedId);
    const to = entries.findIndex((e) => e.id === targetId);
    if (from === -1 || to === -1) return;
    const reordered = [...entries];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const optimistic: ScopeVersion = {
      ...scope,
      entries: reordered.map((e, i) => ({ ...e, sequence: i + 1 })),
    };
    setScope(optimistic);
    setDraggedId(null);
    dragOverId.current = null;

    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/ai/projects/${projectId}/scope/reorder`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ entryIds: reordered.map((e) => e.id) }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Reorder failed');
        throw new Error(msg);
      }
      const data = await res.json();
      setScope(data.scope || optimistic);
    } catch (e) {
      setError((e as Error).message || 'Reorder failed');
      await fetchScope();
    }
  };

  const sortedEntries = scope ? [...scope.entries].sort((a, b) => a.sequence - b.sequence) : [];
  const comparisonRows = showComparison ? buildComparisonRows(publishedScope, scope) : [];
  const auditLog = scope?.scopeAuditLog ?? [];

  return (
    <div className="space-y-4 rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-5 shadow-[0_18px_40px_rgba(81,55,32,0.06)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Programme of Works</h3>
            <StatusBadge status={workflowStatus} />
          </div>
          <p className="text-xs text-slate-600">
            {isAdmin
              ? `AI-generated draft scope and programme. Version count: ${versionCount}`
              : 'AI-generated programme of works prepared by Mimo.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRegenerate && (
            <button
              type="button"
              onClick={generateScope}
              disabled={saving || loading || !accessToken}
              className="rounded-xl bg-[rgba(126,58,33,0.92)] px-3 py-2 text-sm font-semibold text-white hover:bg-[rgba(100,45,26,0.96)] disabled:opacity-60 transition"
            >
              {scope ? 'Regenerate Scope' : 'Generate Scope'}
            </button>
          )}
          {isAdmin && workflowStatus === 'draft' && scope && (
            <button
              type="button"
              onClick={() => workflowAction('review')}
              disabled={saving}
              className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 transition"
            >
              Mark as Reviewed
            </button>
          )}
          {isAdmin && workflowStatus === 'pm_reviewed' && (
            <button
              type="button"
              onClick={() => workflowAction('publish')}
              disabled={saving}
              className="rounded-xl bg-[rgba(126,58,33,0.92)] px-3 py-2 text-sm font-semibold text-white hover:bg-[rgba(100,45,26,0.96)] disabled:opacity-60 transition"
            >
              Publish
            </button>
          )}
          {isAdmin && workflowStatus === 'published' && (
            <button
              type="button"
              onClick={() => workflowAction('revise')}
              disabled={saving}
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              Revise
            </button>
          )}
          {isAdmin && publishedScope && scope && scope.id !== publishedScope.id && (
            <button
              type="button"
              onClick={() => setShowComparison((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${showComparison ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-[rgba(120,53,15,0.2)] bg-[rgba(245,238,219,0.9)] text-slate-700 hover:bg-[rgba(245,238,219,1)]'}`}
            >
              {showComparison ? 'Hide Comparison' : 'Compare Versions'}
            </button>
          )}
        </div>
      </div>

      {/* Generator inputs (admin only) */}
      {isAdmin && (
        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={inputs.siteConstraints}
            onChange={(e) => setInputs((prev) => ({ ...prev, siteConstraints: e.target.value }))}
            placeholder="Site constraints"
            className="rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
          />
          <input
            value={inputs.longLeadItems}
            onChange={(e) => setInputs((prev) => ({ ...prev, longLeadItems: e.target.value }))}
            placeholder="Long lead items"
            className="rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
          />
          <input
            value={inputs.workingCalendar}
            onChange={(e) => setInputs((prev) => ({ ...prev, workingCalendar: e.target.value }))}
            placeholder="Working calendar"
            className="rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
          />
          <input
            value={inputs.deadline}
            onChange={(e) => setInputs((prev) => ({ ...prev, deadline: e.target.value }))}
            placeholder="Deadline"
            className="rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
          />
          <textarea
            value={inputs.additionalContext}
            onChange={(e) => setInputs((prev) => ({ ...prev, additionalContext: e.target.value }))}
            placeholder="Additional context to refine the programme"
            className="md:col-span-2 rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
            rows={2}
          />
        </div>
      )}

      {loading && <p className="text-sm text-slate-600">Loading AI scope...</p>}
      {error && <p className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!loading && !scope && (
        <p className="text-sm text-slate-600">
          {isAdmin
            ? 'No scope generated yet. Add context and generate the first draft.'
            : 'The programme of works is being prepared by Mimo and will appear here shortly.'}
        </p>
      )}

      {scope && (
        <>
          {/* Summary cards */}
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Project Type</p>
              <p className="font-semibold text-slate-800">{scope.projectSummary.projectType || 'Renovation'}</p>
            </div>
            <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
              <p className="font-semibold text-slate-800">{scope.projectSummary.location || 'Hong Kong'}</p>
            </div>
            <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Programme</p>
              <p className="font-semibold text-slate-800">Day {scope.programme.startDay} to Day {scope.programme.finishDay}</p>
            </div>
          </div>

          {/* Comparison view */}
          {showComparison && publishedScope ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Baseline (Published v{publishedScope.version}) vs Current Draft (v{scope.version})
              </p>
              <div className="overflow-x-auto rounded-2xl border border-[rgba(120,53,15,0.14)]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[rgba(245,238,219,0.85)] text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Work Package</th>
                      <th className="px-3 py-2 text-left">Trade</th>
                      <th className="px-3 py-2 text-left">Duration</th>
                      <th className="px-3 py-2 text-left">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => {
                      const baseEntry = publishedScope.entries.find((e) => e.id === row.entry.id);
                      const rowClass =
                        row.kind === 'added'
                          ? 'bg-emerald-50'
                          : row.kind === 'removed'
                            ? 'bg-rose-50 opacity-70'
                            : row.kind === 'changed'
                              ? 'bg-amber-50'
                              : '';
                      return (
                        <tr key={row.entry.id} className={`border-t border-[rgba(120,53,15,0.12)] ${rowClass}`}>
                          <td className="px-3 py-2">{row.entry.sequence}</td>
                          <td className={`px-3 py-2 ${row.kind === 'removed' ? 'line-through text-slate-400' : ''}`}>
                            {row.entry.workPackage}
                          </td>
                          <td className="px-3 py-2">{row.entry.primaryTrade}</td>
                          <td className="px-3 py-2">
                            {row.kind === 'changed' && baseEntry ? (
                              <span>
                                <span className="line-through text-slate-400 mr-1">{baseEntry.durationMinDays}–{baseEntry.durationMaxDays}d</span>
                                <span className="text-amber-700 font-semibold">{row.entry.durationMinDays}–{row.entry.durationMaxDays}d</span>
                              </span>
                            ) : (
                              `${row.entry.durationMinDays}–${row.entry.durationMaxDays}d`
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.kind === 'added' && <span className="text-xs font-semibold text-emerald-700">+ Added</span>}
                            {row.kind === 'removed' && <span className="text-xs font-semibold text-rose-600">− Removed</span>}
                            {row.kind === 'changed' && <span className="text-xs font-semibold text-amber-700">~ Changed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Normal entry table */
            <div className="overflow-x-auto rounded-2xl border border-[rgba(120,53,15,0.14)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[rgba(245,238,219,0.85)] text-slate-700">
                  <tr>
                    {canAdminCrud && <th className="w-6 px-2 py-2" />}
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Work Package</th>
                    <th className="px-3 py-2 text-left">Trade</th>
                    <th className="px-3 py-2 text-left">Duration (days)</th>
                    <th className="px-3 py-2 text-left">Dependencies</th>
                    {canAdminCrud && <th className="px-3 py-2 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      draggable={canAdminCrud}
                      onDragStart={() => setDraggedId(entry.id)}
                      onDragOver={(e) => { e.preventDefault(); dragOverId.current = entry.id; }}
                      onDrop={() => handleDrop(entry.id)}
                      onDragEnd={() => { setDraggedId(null); dragOverId.current = null; }}
                      className={`border-t border-[rgba(120,53,15,0.12)] ${draggedId === entry.id ? 'opacity-40' : ''}`}
                    >
                      {canAdminCrud && (
                        <td className="px-2 py-2 text-slate-400 cursor-grab select-none text-center">⠿</td>
                      )}
                      <td className="px-3 py-2 align-top">{entry.sequence}</td>
                      <td className="px-3 py-2 align-top">
                        {canAdminCrud ? (
                          <input
                            value={entry.workPackage}
                            onChange={(e) => updateEntry(entry.id, { workPackage: e.target.value })}
                            className="w-full rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-2 py-1 text-slate-900 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
                          />
                        ) : entry.workPackage}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {canAdminCrud ? (
                          <input
                            value={entry.primaryTrade}
                            onChange={(e) => updateEntry(entry.id, { primaryTrade: e.target.value })}
                            className="w-full rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-2 py-1 text-slate-900 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
                          />
                        ) : entry.primaryTrade}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {canAdminCrud ? (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="0.5"
                              value={entry.durationMinDays}
                              onChange={(e) => updateEntry(entry.id, { durationMinDays: Number(e.target.value) || 1 })}
                              className="w-16 rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-2 py-1 text-slate-900 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
                            />
                            <span className="self-center text-slate-500">to</span>
                            <input
                              type="number"
                              step="0.5"
                              value={entry.durationMaxDays}
                              onChange={(e) => updateEntry(entry.id, { durationMaxDays: Number(e.target.value) || entry.durationMinDays })}
                              className="w-16 rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-2 py-1 text-slate-900 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
                            />
                          </div>
                        ) : (
                          `${entry.durationMinDays} - ${entry.durationMaxDays}`
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">{entry.dependencies.join(', ') || '—'}</td>
                      {canAdminCrud && (
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
                            className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 transition"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canAdminCrud && !showComparison && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addEntry}
                disabled={saving}
                className="rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(245,238,219,0.9)] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[rgba(245,238,219,1)] disabled:opacity-60 transition"
              >
                Add Entry
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3 text-sm">
            <p className="font-semibold text-slate-800">Confidence: {scope.confidence.level}</p>
            {scope.confidence.notes && <p className="mt-1 text-slate-600">{scope.confidence.notes}</p>}
          </div>

          {/* Audit log (admin-only, collapsible) */}
          {isAdmin && auditLog.length > 0 && (
            <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3 text-sm">
              <button
                type="button"
                onClick={() => setShowAuditLog((v) => !v)}
                className="flex w-full items-center justify-between text-slate-800 font-semibold hover:text-slate-900 transition"
              >
                <span>Approval Audit Log ({auditLog.length})</span>
                <span className="text-slate-500">{showAuditLog ? '▲' : '▼'}</span>
              </button>
              {showAuditLog && (
                <ul className="mt-2 space-y-1">
                  {auditLog.map((entry, i) => (
                    <li key={i} className="text-xs text-slate-700 flex gap-2">
                      <span className="font-medium">{new Date(entry.at).toLocaleString()}</span>
                      <span>{STATUS_LABELS[entry.fromStatus as ScopeStatus] ?? entry.fromStatus} → {STATUS_LABELS[entry.toStatus as ScopeStatus] ?? entry.toStatus}</span>
                      {entry.note && <span className="text-slate-600 italic">({entry.note})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
