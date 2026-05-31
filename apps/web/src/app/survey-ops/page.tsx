'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useRoleGuard } from '@/hooks/use-role-guard';

type SurveyQueueItem = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  region: string | null;
  projectStatus: string;
  survey: {
    id: string;
    status: string;
    assignmentStatus?: string | null;
    calendarEventId?: string | null;
    calendarEventStatus?: string | null;
    assignedSurveyor?: {
      id: string;
      firstName?: string | null;
      surname?: string | null;
      email?: string | null;
    } | null;
    requestedAt: string;
    scheduledAt: string | null;
    metadata?: Record<string, unknown>;
    updatedAt: string;
  };
};

type SurveyorOption = {
  id: string;
  label: string;
  email: string;
  role: string;
};

type SurveyProjectContext = {
  id: string;
  projectName: string;
  clientName: string | null;
  region: string | null;
  projectScale: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  siteInspectionAvailableOn: string | null;
  notes: string | null;
  updatedAt: string;
};

const ALLOWED_ROLES = ['admin', 'surveyor', 'mimo_boh'] as const;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-HK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getStatusPill = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (['scheduled', 'assigned'].includes(normalized)) {
    return 'bg-blue-100 text-blue-700 border-blue-200';
  }
  if (['requested', 'pending', 'unassigned'].includes(normalized)) {
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (['in_progress'].includes(normalized)) {
    return 'bg-indigo-100 text-indigo-700 border-indigo-200';
  }
  if (['completed'].includes(normalized)) {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (['cancelled', 'declined'].includes(normalized)) {
    return 'bg-rose-100 text-rose-700 border-rose-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export default function SurveyOpsPage() {
  useRoleGuard([...ALLOWED_ROLES], { fallback: '/' });
  const router = useRouter();

  const { accessToken, user, isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<SurveyQueueItem[]>([]);
  const [surveyors, setSurveyors] = useState<SurveyorOption[]>([]);
  const [search, setSearch] = useState('');
  const [surveyorFilter, setSurveyorFilter] = useState('all');
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const [statusActionProjectId, setStatusActionProjectId] = useState<string | null>(null);
  const [selectedSurveyorByProject, setSelectedSurveyorByProject] = useState<Record<string, string>>({});
  const [contextByProject, setContextByProject] = useState<Record<string, SurveyProjectContext | undefined>>({});
  const [contextLoadingId, setContextLoadingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects/survey-ops/queue`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || `Failed to load survey queue (${response.status})`);
      }

      const payload = (await response.json()) as SurveyQueueItem[];
      const normalizedQueue = Array.isArray(payload) ? payload : [];
      setQueue(normalizedQueue);
      setSelectedSurveyorByProject((prev) => {
        const next = { ...prev };
        for (const item of normalizedQueue) {
          if (item.survey.assignedSurveyor?.id) {
            next[item.projectId] = item.survey.assignedSurveyor.id;
          }
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load survey queue';
      setError(message);
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadSurveyors = useCallback(async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(`${API_BASE_URL}/projects/survey-ops/surveyors`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Failed to load surveyors');
      }

      const payload = (await response.json()) as SurveyorOption[];
      setSurveyors(Array.isArray(payload) ? payload : []);
    } catch {
      setSurveyors([]);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isLoggedIn && accessToken) {
      void loadQueue();
      void loadSurveyors();
    }
  }, [accessToken, isLoggedIn, loadQueue, loadSurveyors]);

  const assignSurveyor = useCallback(
    async (projectId: string, surveyExtraId: string) => {
      if (!accessToken || !surveyExtraId) return;
      const selectedSurveyorUserId = selectedSurveyorByProject[projectId];
      if (!selectedSurveyorUserId) {
        setError('Please choose a surveyor before assigning.');
        return;
      }

      setAssigningProjectId(projectId);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/assign`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            surveyExtraId,
            surveyorUserId: selectedSurveyorUserId,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || 'Failed to assign surveyor');
        }

        await loadQueue();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign surveyor');
      } finally {
        setAssigningProjectId(null);
      }
    },
    [accessToken, loadQueue, selectedSurveyorByProject],
  );

  const updateSurveyStatus = useCallback(
    async (projectId: string, surveyExtraId: string, action: 'start' | 'cancel', roomCount?: number) => {
      if (!accessToken) return;
      setStatusActionProjectId(projectId);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/status`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            surveyExtraId,
            action,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || 'Failed to update survey status');
        }

        await loadQueue();
        if (action === 'start') {
          const safeRoomCount = Number.isFinite(roomCount || 0) && (roomCount || 0) > 0 ? Math.floor(roomCount || 0) : 1;
          router.push(
            `/survey-ops/${encodeURIComponent(projectId)}/workspace?surveyExtraId=${encodeURIComponent(surveyExtraId)}&rooms=${encodeURIComponent(String(safeRoomCount))}`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update survey status');
      } finally {
        setStatusActionProjectId(null);
      }
    },
    [accessToken, loadQueue, router],
  );

  const openProjectContext = useCallback(
    async (projectId: string) => {
      if (!accessToken || contextLoadingId) return;
      setContextLoadingId(projectId);
      try {
        const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/survey-ops/context`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || 'Failed to load project context');
        }

        const payload = (await response.json()) as SurveyProjectContext;
        setContextByProject((prev) => ({ ...prev, [projectId]: payload }));
      } catch {
        setContextByProject((prev) => ({ ...prev, [projectId]: undefined }));
      } finally {
        setContextLoadingId(null);
      }
    },
    [accessToken, contextLoadingId],
  );

  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filteredBySearch = !term
      ? queue
      : queue.filter((item) => {
          return (
            item.projectName.toLowerCase().includes(term) ||
            String(item.clientName || '').toLowerCase().includes(term) ||
            String(item.region || '').toLowerCase().includes(term) ||
            String(item.survey.status || '').toLowerCase().includes(term)
          );
        });

    if (surveyorFilter === 'all') return filteredBySearch;
    if (surveyorFilter === 'unassigned') {
      return filteredBySearch.filter((item) => !item.survey.assignedSurveyor?.id);
    }
    return filteredBySearch.filter((item) => item.survey.assignedSurveyor?.id === surveyorFilter);
  }, [queue, search, surveyorFilter]);

  const queueSurveyorOptions = useMemo(() => {
    const seen = new Map<string, SurveyorOption>();
    for (const surveyor of surveyors) {
      seen.set(surveyor.id, surveyor);
    }
    for (const item of queue) {
      const assigned = item.survey.assignedSurveyor;
      if (!assigned?.id) continue;
      if (seen.has(assigned.id)) continue;
      const label = `${String(assigned.firstName || '').trim()} ${String(assigned.surname || '').trim()}`.trim() || String(assigned.email || assigned.id);
      seen.set(assigned.id, {
        id: assigned.id,
        label,
        email: String(assigned.email || ''),
        role: 'surveyor',
      });
    }
    return Array.from(seen.values());
  }, [queue, surveyors]);

  const formatSurveyorLabel = (item: SurveyQueueItem) => {
    const assigned = item.survey.assignedSurveyor;
    if (!assigned?.id) return 'Unassigned';
    const fullName = `${String(assigned.firstName || '').trim()} ${String(assigned.surname || '').trim()}`.trim();
    if (fullName) return fullName;
    return assigned.email || assigned.id;
  };

  const role = String(user?.role || '').toLowerCase();

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">Survey Ops</p>
            <h1 className="mt-1 text-2xl font-bold">Surveyor Queue</h1>
            <p className="mt-2 text-sm text-slate-200">
              Shared queue for Admin, Mimo BoH, and Surveyor teams. Review scheduled surveys and pull project context.
            </p>
          </div>
          <div className="rounded-xl border border-slate-600 bg-slate-900/50 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-300">Signed in as</p>
            <p className="text-sm font-semibold text-white">{user?.firstName || user?.email || 'User'}</p>
            <p className="text-xs text-cyan-300">Role: {role || 'unknown'}</p>
          </div>
        </div>
      </div>

      {!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number]) && isLoggedIn ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          You do not have permission to access Survey Ops.
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by project, client, region, or status"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
          />
          <select
            value={surveyorFilter}
            onChange={(event) => setSurveyorFilter(event.target.value)}
            className="min-w-[210px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500"
          >
            <option value="all">All surveyors</option>
            <option value="unassigned">Unassigned only</option>
            {queueSurveyorOptions.map((surveyor) => (
              <option key={surveyor.id} value={surveyor.id}>
                {surveyor.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading || !accessToken}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
          >
            {loading ? 'Refreshing...' : 'Refresh queue'}
          </button>
          {role === 'admin' && (
            <Link
              href="/admin"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Back to admin
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Loading queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No survey tasks match the current filters.
          </div>
        ) : (
          filteredQueue.map((item) => {
            const context = contextByProject[item.projectId];
            const rooms = Number(item.survey.metadata?.rooms || 0);
            const calculatedFee = Number(item.survey.metadata?.calculatedFee || 0);
            const normalizedStatus = String(item.survey.status || '').toLowerCase();
            const canAssign = ['requested', 'unassigned', 'pending', 'scheduled', 'assigned', 'in_progress'].includes(normalizedStatus);
            const canStart = ['assigned', 'scheduled'].includes(normalizedStatus) && Boolean(item.survey.assignedSurveyor?.id);
            const canCancel = ['assigned', 'scheduled', 'in_progress'].includes(normalizedStatus);
            const canOpenWorkspace = ['in_progress', 'assigned', 'scheduled'].includes(normalizedStatus);

            return (
              <div key={item.projectId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{item.projectName}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Client: {item.clientName || '-'} � Region: {item.region || '-'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested: {formatDate(item.survey.requestedAt)} � Scheduled: {formatDate(item.survey.scheduledAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${getStatusPill(item.survey.status)}`}>
                      {item.survey.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openProjectContext(item.projectId)}
                      disabled={contextLoadingId === item.projectId}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    >
                      {contextLoadingId === item.projectId ? 'Loading...' : 'Load context'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Assigned To</p>
                    <p className="font-semibold text-slate-900">{formatSurveyorLabel(item)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Rooms</p>
                    <p className="font-semibold text-slate-900">{rooms > 0 ? rooms : '-'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Survey Fee</p>
                    <p className="font-semibold text-slate-900">{calculatedFee > 0 ? `HKD ${calculatedFee.toLocaleString('en-HK')}` : '-'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Calendar Event</p>
                    <p className="font-semibold text-slate-900">{item.survey.calendarEventStatus || '-'}</p>
                  </div>
                </div>

                {canAssign ? (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Assign or Reassign surveyor</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={selectedSurveyorByProject[item.projectId] || ''}
                        onChange={(event) =>
                          setSelectedSurveyorByProject((prev) => ({
                            ...prev,
                            [item.projectId]: event.target.value,
                          }))
                        }
                        className="min-w-[240px] rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900"
                        disabled={assigningProjectId === item.projectId || statusActionProjectId === item.projectId}
                      >
                        <option value="">Select surveyor...</option>
                        {surveyors.map((surveyor) => (
                          <option key={surveyor.id} value={surveyor.id}>
                            {surveyor.label} ({surveyor.email})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void assignSurveyor(item.projectId, item.survey.id)}
                        disabled={
                          assigningProjectId === item.projectId ||
                          statusActionProjectId === item.projectId ||
                          !selectedSurveyorByProject[item.projectId]
                        }
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        {assigningProjectId === item.projectId ? 'Assigning...' : 'Assign'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void updateSurveyStatus(item.projectId, item.survey.id, 'start', Number(item.survey.metadata?.rooms || 1))}
                        disabled={!canStart || statusActionProjectId === item.projectId || assigningProjectId === item.projectId}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {statusActionProjectId === item.projectId ? 'Working...' : 'Start Survey'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void updateSurveyStatus(item.projectId, item.survey.id, 'cancel')}
                        disabled={!canCancel || statusActionProjectId === item.projectId || assigningProjectId === item.projectId}
                        className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                      >
                        {statusActionProjectId === item.projectId ? 'Working...' : 'Cancel Survey'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const roomCount = Number(item.survey.metadata?.rooms || 1);
                          router.push(
                            `/survey-ops/${encodeURIComponent(item.projectId)}/workspace?surveyExtraId=${encodeURIComponent(item.survey.id)}&rooms=${encodeURIComponent(String(Number.isFinite(roomCount) && roomCount > 0 ? Math.floor(roomCount) : 1))}`,
                          );
                        }}
                        disabled={!canOpenWorkspace || statusActionProjectId === item.projectId || assigningProjectId === item.projectId}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        Open Workspace
                      </button>
                    </div>
                  </div>
                ) : null}

                {context ? (
                  <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/60 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Project context</p>
                    <p className="mt-1">
                      Scale: {context.projectScale || '-'} � Site inspection: {formatDate(context.siteInspectionAvailableOn)}
                    </p>
                    <p className="mt-1">
                      Start: {formatDate(context.startDate)} � End: {formatDate(context.endDate)}
                    </p>
                    {context.notes ? <p className="mt-1">Notes: {context.notes}</p> : null}
                  </div>
                ) : null}

                <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-slate-400">Queue updated {formatDate(item.survey.updatedAt)}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
