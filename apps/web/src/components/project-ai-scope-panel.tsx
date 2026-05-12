'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';

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

type ScopeVersion = {
  id: string;
  version: number;
  createdAt: string;
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

export function ProjectAiScopePanel({ projectId, accessToken, mode }: ProjectAiScopePanelProps) {
  const [scope, setScope] = useState<ScopeVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionCount, setVersionCount] = useState(0);
  const [inputs, setInputs] = useState(defaultGeneratorInputs);

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
      setVersionCount(typeof data.versionCount === 'number' ? data.versionCount : 0);
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
    } catch (e) {
      setError((e as Error).message || 'Failed to generate AI scope');
    } finally {
      setSaving(false);
    }
  };

  const updateEntry = async (entryId: string, patch: Partial<ScopeEntry>) => {
    if (!scope || !isAdmin || !accessToken) return;
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
    if (!scope || !isAdmin || !accessToken) return;
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
    if (!isAdmin || !accessToken) return;
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Programme of Works</h3>
          <p className="text-xs text-slate-500">
            {isAdmin
              ? `AI-generated draft scope and programme. Version count: ${versionCount}`
              : 'AI-generated programme of works prepared by Mimo.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={generateScope}
            disabled={saving || loading || !accessToken}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {scope ? 'Regenerate Scope' : 'Generate Scope'}
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={inputs.siteConstraints}
            onChange={(e) => setInputs((prev) => ({ ...prev, siteConstraints: e.target.value }))}
            placeholder="Site constraints"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={inputs.longLeadItems}
            onChange={(e) => setInputs((prev) => ({ ...prev, longLeadItems: e.target.value }))}
            placeholder="Long lead items"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={inputs.workingCalendar}
            onChange={(e) => setInputs((prev) => ({ ...prev, workingCalendar: e.target.value }))}
            placeholder="Working calendar"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={inputs.deadline}
            onChange={(e) => setInputs((prev) => ({ ...prev, deadline: e.target.value }))}
            placeholder="Deadline"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={inputs.additionalContext}
            onChange={(e) => setInputs((prev) => ({ ...prev, additionalContext: e.target.value }))}
            placeholder="Additional context to refine the programme"
            className="md:col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading AI scope...</p>}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!loading && !scope && (
        <p className="text-sm text-slate-600">
          {isAdmin
            ? 'No scope generated yet. Add context and generate the first draft.'
            : 'The programme of works is being prepared by Mimo and will appear here shortly.'}
        </p>
      )}

      {scope && (
        <>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Project Type</p>
              <p className="font-semibold text-slate-800">{scope.projectSummary.projectType || 'Renovation'}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
              <p className="font-semibold text-slate-800">{scope.projectSummary.location || 'Hong Kong'}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Programme</p>
              <p className="font-semibold text-slate-800">Day {scope.programme.startDay} to Day {scope.programme.finishDay}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Work Package</th>
                  <th className="px-3 py-2 text-left">Trade</th>
                  <th className="px-3 py-2 text-left">Duration (days)</th>
                  <th className="px-3 py-2 text-left">Dependencies</th>
                  {isAdmin && <th className="px-3 py-2 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {scope.entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 align-top">{entry.sequence}</td>
                    <td className="px-3 py-2 align-top">
                      {isAdmin ? (
                        <input
                          value={entry.workPackage}
                          onChange={(e) => updateEntry(entry.id, { workPackage: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1"
                        />
                      ) : entry.workPackage}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isAdmin ? (
                        <input
                          value={entry.primaryTrade}
                          onChange={(e) => updateEntry(entry.id, { primaryTrade: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1"
                        />
                      ) : entry.primaryTrade}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isAdmin ? (
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.5"
                            value={entry.durationMinDays}
                            onChange={(e) => updateEntry(entry.id, { durationMinDays: Number(e.target.value) || 1 })}
                            className="w-16 rounded border border-slate-300 px-2 py-1"
                          />
                          <span className="self-center text-slate-500">to</span>
                          <input
                            type="number"
                            step="0.5"
                            value={entry.durationMaxDays}
                            onChange={(e) => updateEntry(entry.id, { durationMaxDays: Number(e.target.value) || entry.durationMinDays })}
                            className="w-16 rounded border border-slate-300 px-2 py-1"
                          />
                        </div>
                      ) : (
                        `${entry.durationMinDays} - ${entry.durationMaxDays}`
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">{entry.dependencies.join(', ') || '—'}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
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

          {isAdmin && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addEntry}
                disabled={saving}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Add Entry
              </button>
            </div>
          )}

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">Confidence: {scope.confidence.level}</p>
            {scope.confidence.notes && <p className="mt-1 text-slate-600">{scope.confidence.notes}</p>}
          </div>
        </>
      )}
    </div>
  );
}
