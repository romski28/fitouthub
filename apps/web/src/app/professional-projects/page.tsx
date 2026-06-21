'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { API_BASE_URL } from '@/config/api';
import { colors } from '@/styles/theme';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';
import { UpdatesButton } from '@/components/updates-button';
import { ProjectSentimentBadge } from '@/components/project-sentiment-badge';
import { PageLoadingState } from '@/components/page-loading-state';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { fetchWithRetry } from '@/lib/http';
import {
  completeNextStep,
  fetchPrimaryNextSteps,
  fetchPrimaryNextStep,
  type NextStepAction,
} from '@/lib/next-steps';
import { getProfessionalShowMeHref } from '@/lib/professional-workflow';
import { resolveNextStepModalContent } from '@/lib/next-step-modal-content';
import toast from 'react-hot-toast';
import type { UpdatesSummary } from '@/lib/updates-cache';

interface ProjectProfessional {
  id: string;
  projectId: string;
  quoteRequestedTrades?: string[];
  projectTradesSnapshot?: string[];
  createdAt?: string;
  quoteExtendedUntil?: string;
  quoteReminderSentAt?: string;
  respondedAt?: string;
  project: {
    id: string;
    projectName: string;
    clientName?: string;
    region?: string;
    budget?: string;
    notes?: string;
    isEmergency?: boolean;
  };
  status: string;
  accessRestricted?: boolean;
  quoteAmount?: string;
  quoteNotes?: string;
  quotedAt?: string;
}

type SummaryTone = 'slate' | 'amber' | 'emerald' | 'blue' | 'purple' | 'rose';

type QuoteDeadlineState = {
  isOverdue: boolean;
  remainingLabel: string | null;
  windowLongLabel: string;
};

const professionalCardBorderByStatus: Record<string, string> = {
  awarded: 'border-purple-300/70',
  quoted: 'border-blue-300/70',
  accepted: 'border-emerald-300/70',
  pending: 'border-amber-300/70',
  declined: 'border-rose-300/80',
  rejected: 'border-rose-300/80',
};

const getQuoteDeadlineState = (projectProfessional: ProjectProfessional): QuoteDeadlineState | null => {
  const status = String(projectProfessional.status || '').toLowerCase();
  if (['quoted', 'awarded', 'counter_requested', 'declined', 'rejected', 'withdrawn'].includes(status)) {
    return null;
  }
  if (projectProfessional.quotedAt || !projectProfessional.createdAt) {
    return null;
  }

  const invitedAtMs = new Date(projectProfessional.createdAt).getTime();
  if (!Number.isFinite(invitedAtMs)) {
    return null;
  }

  const quoteWindowMs = projectProfessional.project.isEmergency
    ? 1 * 60 * 60 * 1000
    : 3 * 24 * 60 * 60 * 1000;
  const effectiveDeadlineMs = projectProfessional.quoteExtendedUntil
    ? new Date(projectProfessional.quoteExtendedUntil).getTime()
    : invitedAtMs + quoteWindowMs;

  if (!Number.isFinite(effectiveDeadlineMs)) {
    return null;
  }

  const remainingMs = effectiveDeadlineMs - Date.now();
  const windowLongLabel = projectProfessional.project.isEmergency
    ? '1 hour from invitation'
    : '3 days from invitation';

  if (remainingMs <= 0) {
    return {
      isOverdue: true,
      remainingLabel: null,
      windowLongLabel,
    };
  }

  const daysLeft = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hoursLeft = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutesLeft = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));

  return {
    isOverdue: false,
    remainingLabel: daysLeft > 0
      ? `${daysLeft}d ${hoursLeft}h left`
      : hoursLeft > 0
        ? `${hoursLeft}h left`
        : `${minutesLeft}m left`,
    windowLongLabel,
  };
};

export default function ProfessionalProjectsPage() {
  const router = useRouter();
  const { isLoggedIn, professional, accessToken } = useProfessionalAuth();
  const { openModal } = useNextStepModal();
  const nextStepCacheScope = `professional:${professional?.id || 'anonymous'}`;
  const [projects, setProjects] = useState<ProjectProfessional[]>([]);

  // Only professionals can access this page
  useRoleGuard(['professional'], { fallback: '/' });
  const [filterStatus, setFilterStatus] = useState<'all'|'pending'|'accepted'|'declined'|'quoted'|'awarded'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextStepMap, setNextStepMap] = useState<Record<string, NextStepAction[]>>({});
  const [nextStepLoadingMap, setNextStepLoadingMap] = useState<Record<string, boolean>>({});
  const [nextStepsLoading, setNextStepsLoading] = useState(false);
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [decliningIds, setDecliningIds] = useState<Set<string>>(new Set());
  const [declineProject, setDeclineProject] = useState<ProjectProfessional | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [updatesSummary, setUpdatesSummary] = useState<UpdatesSummary | null>(null);
  const projectIds = useMemo(
    () => projects.filter((p) => !p.accessRestricted).map((p) => p.project.id),
    [projects],
  );
  const projectIdsKey = useMemo(() => projectIds.join('|'), [projectIds]);
  const unreadByProjectId = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!updatesSummary) return counts;

    updatesSummary.unreadMessages.forEach((group) => {
      if (!group?.projectId) return;
      const key = String(group.projectId);
      const unread = Math.max(0, Number(group.unreadCount) || 0);
      counts[key] = (counts[key] || 0) + unread;
    });

    return counts;
  }, [updatesSummary]);
  const totals = {
    total: projects.length,
    pending: projects.filter(p => p.status === 'pending').length,
    accepted: projects.filter(p => p.status === 'accepted').length,
    quoted: projects.filter(p => p.status === 'quoted').length,
    awarded: projects.filter(p => p.status === 'awarded').length,
    declined: projects.filter(p => p.status === 'rejected' || p.status === 'declined').length,
  };
  const dashboardProjects = projects
    .filter((p) => filterStatus === 'all' ? true : (p.status === filterStatus || (filterStatus==='declined' && (p.status==='rejected' || p.status==='declined'))));

  const openProfessionalNextStepModal = useCallback(
    async (action: NextStepAction, projectId: string, projectProfessionalId: string) => {
      if (!professional?.id || !accessToken) return;
      const projectOverviewPath = `/professional-projects/${projectProfessionalId}?tab=overview`;
      const modalContent = action.modalContent;

      router.prefetch(getProfessionalShowMeHref(projectProfessionalId, action.actionKey));

      const resolvedModalContent = resolveNextStepModalContent(action.actionKey, modalContent);
      const hasModalContent = Object.keys(resolvedModalContent).length > 0;

      // Passive waiting steps should still do something useful if no modal payload is available.
      if (!hasModalContent && !action.requiresAction) {
        router.push(getProfessionalShowMeHref(projectProfessionalId, action.actionKey));
        return;
      }

      await openModal(
        action.actionKey,
        projectId,
        projectOverviewPath,
        professional.id,
        'PROFESSIONAL',
        resolvedModalContent,
        undefined,
        async () => {
          try {
            const refreshedActions = await fetchPrimaryNextSteps(projectId, accessToken, {
              cacheScope: nextStepCacheScope,
              forceRefresh: true,
            });
            setNextStepMap((prev) => ({ ...prev, [projectId]: refreshedActions }));
          } catch (refreshError) {
            console.warn('[professional-projects] Failed to refresh next-step actions after modal completion', refreshError);
          }
        },
        action.progressReportId,
      );
    },
    [accessToken, nextStepCacheScope, openModal, professional?.id, router],
  );

  const handleQuickAccept = async (projectProf: ProjectProfessional) => {
    const ppId = projectProf.id;
    setAcceptingIds(prev => new Set(prev).add(ppId));
    try {
      const res = await fetch(`${API_BASE_URL}/professional/projects/${ppId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to accept');
      toast.success('Project accepted! You can now submit your quote.');
      setProjects(prev => prev.map(p => p.id === ppId ? { ...p, status: 'accepted' } : p));
      const actions = await fetchPrimaryNextSteps(projectProf.project.id, accessToken!, { cacheScope: nextStepCacheScope, forceRefresh: true });
      if (actions) setNextStepMap(prev => ({ ...prev, [projectProf.project.id]: actions }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept project');
    } finally {
      setAcceptingIds(prev => { const next = new Set(prev); next.delete(ppId); return next; });
    }
  };

  const handleQuickDecline = async (projectProf: ProjectProfessional) => {
    setDeclineProject(projectProf);
    setDeclineReason('');
  };

  const handleConfirmDecline = async () => {
    if (!declineProject) return;
    const ppId = declineProject.id;
    setDecliningIds(prev => new Set(prev).add(ppId));
    setDeclineProject(null);
    try {
      const body: any = {};
      if (declineReason) body.quoteNotes = `Decline reason: ${declineReason}`;
      const res = await fetch(`${API_BASE_URL}/professional/projects/${ppId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to decline');
      toast.success('Project declined.');
      setProjects(prev => prev.filter(p => p.id !== ppId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline project');
    } finally {
      setDecliningIds(prev => { const next = new Set(prev); next.delete(ppId); return next; });
      setDeclineReason('');
    }
  };

  const declineReasons = ['Location', 'Availability', 'Not my trade', 'Other'];

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
      return;
    }

    if (!isLoggedIn || !accessToken) {
      return;
    }

    const fetchProjects = async () => {
      try {
        setLoading(true);
        const response = await fetchWithRetry(`${API_BASE_URL}/professional/projects`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/');
            return;
          }
          throw new Error('Failed to fetch projects');
        }

        const data = await response.json();
        // Filter out "selected" placeholder entries (client holding list) so they don't surface
        const list: ProjectProfessional[] = (Array.isArray(data) ? data : data.projects || []).filter(
          (p: ProjectProfessional) => p.status !== 'selected',
        );
        // sort by status: pending > accepted > quoted > awarded > rejected/declined
        const rank: Record<string, number> = { pending: 0, accepted: 1, quoted: 2, awarded: 3, rejected: 4, declined: 4 };
        list.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
        setProjects(list);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load projects';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [isLoggedIn, accessToken, router]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken || projectIds.length === 0) return;

    let cancelled = false;

    const loadNextSteps = async () => {
      setNextStepsLoading(true);

      // Optimistic: try localStorage cache first for instant display
      const cacheKey = `ns_list_${nextStepCacheScope}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, NextStepAction[]>;
          if (Object.keys(parsed).length > 0) {
            setNextStepMap(parsed);
            setNextStepsLoading(false);
          }
        }
      } catch { /* ignore corrupted cache */ }

      const fetches = projectIds.map((projectId) =>
        fetchPrimaryNextSteps(projectId, accessToken, { cacheScope: nextStepCacheScope })
          .then((actions) => ({ id: projectId, actions }))
          .catch(() => ({ id: projectId, actions: [] })),
      );

      const resolved = await Promise.allSettled(fetches);
      if (cancelled) return;

      const batch: Record<string, NextStepAction[]> = {};
      resolved.forEach((result) => {
        if (result.status === 'fulfilled') {
          batch[result.value.id] = result.value.actions;
        }
      });
      setNextStepMap((prev) => ({ ...prev, ...batch }));
      try {
        const merged = { ...nextStepMap, ...batch };
        localStorage.setItem(cacheKey, JSON.stringify(merged));
      } catch { /* ignore quota */ }
      setNextStepsLoading(false);
    };

    loadNextSteps();

    // Re-fetch when tab becomes visible (user navigates back from detail page)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        loadNextSteps();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isLoggedIn, accessToken, projectIdsKey, nextStepCacheScope]);

  const handleCompleteNextStep = async (
    event: MouseEvent<HTMLButtonElement>,
    projectId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!accessToken) return;
    const action = nextStepMap[projectId]?.[0];
    if (!action) return;

    setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: true }));
    try {
      const ok = await completeNextStep(projectId, action.actionKey, accessToken, nextStepCacheScope);
      if (!ok) return;

      const refreshed = await fetchPrimaryNextSteps(projectId, accessToken, {
        cacheScope: nextStepCacheScope,
        forceRefresh: true,
      });
      setNextStepMap((prev) => {
        const updated = { ...prev, [projectId]: refreshed };
        // Update localStorage cache immediately
        try {
          localStorage.setItem(`ns_list_${nextStepCacheScope}`, JSON.stringify(updated));
        } catch { /* ignore quota */ }
        return updated;
      });
    } finally {
      setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: false }));
    }
  };

  if (isLoggedIn === undefined || loading) {
    return <PageLoadingState message="Loading projects..." />;
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
      <div className="min-h-screen pb-16">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-5">
          {/* Updates badge — fixed right for thumb access */}
          <div className="fixed bottom-[260px] right-6 z-30">
            <UpdatesButton onSummaryChange={setUpdatesSummary} />
        </div>

        {/* Hero (match client styling) */}
        <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{professional?.fullName || professional?.businessName || 'Projects'}</p>
              <h1 className="text-2xl font-bold leading-tight text-slate-900">My Projects</h1>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                <SummaryCard label="Total" value={totals.total} tone="slate" filterStatus="all" currentFilter={filterStatus} onClick={() => setFilterStatus('all')} />
                <SummaryCard label="Pending" value={totals.pending} tone="amber" filterStatus="pending" currentFilter={filterStatus} onClick={() => setFilterStatus('pending')} />
                <SummaryCard label="Accepted" value={totals.accepted} tone="emerald" filterStatus="accepted" currentFilter={filterStatus} onClick={() => setFilterStatus('accepted')} />
                <SummaryCard label="Quoted" value={totals.quoted} tone="blue" filterStatus="quoted" currentFilter={filterStatus} onClick={() => setFilterStatus('quoted')} />
                <SummaryCard label="Awarded" value={totals.awarded} tone="purple" filterStatus="awarded" currentFilter={filterStatus} onClick={() => setFilterStatus('awarded')} />
                <SummaryCard label="Declined" value={totals.declined} tone="rose" filterStatus="declined" currentFilter={filterStatus} onClick={() => setFilterStatus('declined')} />
              </div>
              <p className="text-[10px] text-center text-slate-600 italic">Click on a status to filter</p>
            </div>
          </div>
        </div>

        {/* Action Dashboard */}
        {dashboardProjects.length > 0 && (
          <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Action Required</p>
                <h2 className="text-xl font-bold text-slate-900">
                  {dashboardProjects.length} Projects in this view
                  {nextStepsLoading && (
                    <span className="ml-3 inline-flex items-center gap-1.5 text-xs font-normal text-slate-600">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
                      Gathering action items&hellip;
                    </span>
                  )}
                </h2>
              </div>
            </div>
            <div className="space-y-2">
              {dashboardProjects.map((projectProf) => {
                const quoteDeadlineState = getQuoteDeadlineState(projectProf);
                const quoteOverdue = Boolean(quoteDeadlineState?.isOverdue);
                const actions = (nextStepMap[projectProf.project.id] || []).filter((action) => {
                  if (projectProf.project.isEmergency === true && action.actionKey === 'REQUEST_SITE_ACCESS') {
                    return false;
                  }
                  if (quoteOverdue && action.actionKey === 'SUBMIT_QUOTE') {
                    return false;
                  }
                  return true;
                });
                const primaryActions = actions.filter((action) => action.isPrimary);
                const electiveActions = actions.filter((action) => action.isElective);
                const primaryAction = primaryActions[0] || null;
                const isStopStatus = ['declined', 'rejected'].includes((projectProf.status || '').toLowerCase());
                const isRestricted = Boolean(projectProf.accessRestricted);
                const isEmergencyProject = projectProf.project.isEmergency === true;
                const baseBorder = professionalCardBorderByStatus[projectProf.status] || 'border-white/20';
                const unreadCount = unreadByProjectId[String(projectProf.project.id)] || 0;
                const primaryActionHref = primaryAction ? getProfessionalShowMeHref(projectProf.id, primaryAction.actionKey) : `/professional-projects/${projectProf.id}`;
                return (
                  <div key={`dash-${projectProf.id}`} className={`relative rounded-lg border-[3px] px-4 py-3 shadow-sm transition ${
                    quoteOverdue
                      ? 'border-[rgba(220,20,60,0.8)] bg-[rgba(121,24,38,0.84)] emergency-card-throb shadow-[0_0_16px_rgba(220,20,60,0.32)] hover:bg-[rgba(121,24,38,0.9)]'
                      : isStopStatus
                        ? 'border-[rgba(220,20,60,0.8)] bg-[rgba(121,24,38,0.84)] shadow-[0_0_16px_rgba(220,20,60,0.32)] hover:bg-[rgba(121,24,38,0.9)]'
                      : isEmergencyProject
                        ? 'border-[rgba(220,20,60,0.8)] bg-[var(--mimo-project-paper)] emergency-card-throb hover:bg-[var(--mimo-project-paper)]'
                        : `${baseBorder} bg-[var(--mimo-project-paper)] hover:bg-[var(--mimo-project-paper)]`
                  }`}>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(
                              new CustomEvent('fitouthub:open-updates', {
                                detail: { projectId: projectProf.project.id },
                              }),
                            );
                          }
                        }}
                        className="absolute -right-2 -top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-red-700 px-2 text-xs font-bold text-white shadow-md transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                        title={`Open recent activity - ${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
                        aria-label={`Open recent activity with ${unreadCount} unread messages`}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </button>
                    )}

                    <div className="grid gap-3">
                      {/* Title row with scope chips */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {isRestricted ? (
                            <span className="truncate text-[1.2rem] font-bold leading-tight text-slate-900">
                              {isEmergencyProject ? `🚨 ${projectProf.project.projectName}` : projectProf.project.projectName}
                            </span>
                          ) : (
                            <Link
                              href={`/professional-projects/${projectProf.id}?tab=overview`}
                              className={`truncate text-[1.2rem] font-bold leading-tight underline-offset-2 hover:underline ${
                                quoteOverdue || isStopStatus ? 'text-white' : 'text-slate-900'
                              }`}
                              title="Open project details"
                            >
                              {isEmergencyProject ? `🚨 ${projectProf.project.projectName}` : projectProf.project.projectName}
                            </Link>
                          )}
                          <div className="ml-auto shrink-0">
                            <ProjectSentimentBadge
                              projectId={projectProf.project.id}
                              storageScope="professional"
                              iconOnly
                              size="lg"
                            />
                          </div>
                        </div>
                        {/* Scope chips moved here — sized like buttons */}
                        {!isRestricted && (projectProf.quoteRequestedTrades?.length || projectProf.projectTradesSnapshot?.length) ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {projectProf.quoteRequestedTrades && projectProf.quoteRequestedTrades.length > 0 ? (
                              projectProf.quoteRequestedTrades.map((trade) => (
                                <span
                                  key={`requested-${projectProf.id}-${trade}`}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                    quoteOverdue || isStopStatus
                                      ? 'border border-amber-200/60 bg-amber-100/20 text-amber-100'
                                      : 'border border-amber-300 bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {trade}
                                </span>
                              ))
                            ) : (
                              <span className={`text-xs ${quoteOverdue || isStopStatus ? 'text-slate-200' : 'text-slate-500'}`}>
                                Scope: to be confirmed
                              </span>
                            )}
                          </div>
                        ) : null}
                        {/* Project scope/notes */}
                        {projectProf.project.notes && (
                          <p className={`text-xs leading-relaxed line-clamp-2 ${quoteOverdue || isStopStatus ? 'text-slate-200' : 'text-slate-500'}`}>
                            {projectProf.project.notes}
                          </p>
                        )}
                      </div>
                      
                      {/* Details Row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {projectProf.project.region ? (
                          <span className={quoteOverdue || isStopStatus ? 'text-slate-200' : 'text-slate-600'}>
                            {projectProf.project.region}
                          </span>
                        ) : null}
                        {!isRestricted && projectProf.quoteAmount && (
                          <span className={`font-medium ${quoteOverdue || isStopStatus ? 'text-white' : 'text-slate-900'}`}>
                            ${Number(projectProf.quoteAmount).toLocaleString()}
                          </span>
                        )}
                        {quoteOverdue && quoteDeadlineState ? (
                          <Link
                            href={`/professional-projects/${projectProf.id}?tab=chat`}
                            className="inline-flex items-center rounded-full border border-white/35 bg-white/10 px-2 py-1 text-xs font-semibold text-rose-50 hover:bg-white/15"
                          >
                            Quote overdue ({quoteDeadlineState.windowLongLabel})
                          </Link>
                        ) : null}
                        {isRestricted ? (
                          <p className={`text-xs ${quoteOverdue || isStopStatus ? 'text-slate-200' : 'text-slate-600'}`}>
                            {projectProf.project.notes || 'Bidding has concluded for this project.'}
                          </p>
                        ) : quoteOverdue ? (
                          <p className="text-xs text-rose-100">
                            No quote was submitted within the allowed window.
                          </p>
                        ) : null}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                          {isRestricted ? (
                            <span className="rounded-lg border border-rose-300/40 px-4 py-2 text-sm font-semibold text-rose-100">
                              Bidding closed
                            </span>
                          ) : nextStepsLoading && !nextStepMap[projectProf.project.id] ? (
                            <div className="animate-pulse rounded-lg bg-slate-300/50 h-9 w-28" />
                          ) : (
                            <>
                              {primaryActions.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {primaryActions.slice(0, 2).map((action) => (
                                    (() => {
                                      const label = action.actionKey === 'SUBMIT_QUOTE' && quoteDeadlineState?.remainingLabel
                                        ? `${action.actionLabel} · ${quoteDeadlineState.remainingLabel}`
                                        : action.actionLabel;

                                      return (
                                    <button
                                      key={`${projectProf.project.id}-${action.actionKey}`}
                                      type="button"
                                      onClick={() =>
                                        void openProfessionalNextStepModal(
                                          action,
                                          projectProf.project.id,
                                          projectProf.id,
                                        )
                                      }
                                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                                    >
                                      {label}
                                    </button>
                                      );
                                    })()
                                  ))}
                                  {electiveActions.map((action) => (
                                    <button
                                      key={`${projectProf.project.id}-${action.actionKey}-elective`}
                                      type="button"
                                      onClick={() =>
                                        void openProfessionalNextStepModal(
                                          action,
                                          projectProf.project.id,
                                          projectProf.id,
                                        )
                                      }
                                      className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                                    >
                                      {action.actionLabel}
                                    </button>
                                  ))}
                                  {projectProf.status === 'pending' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleQuickAccept(projectProf)}
                                        disabled={acceptingIds.has(projectProf.id) || decliningIds.has(projectProf.id)}
                                        className="rounded-lg bg-[rgba(126,58,33,0.92)] hover:bg-[rgba(100,45,26,0.96)] disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                                      >
                                        {acceptingIds.has(projectProf.id) ? 'Accepting...' : 'Tentatively accept'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleQuickDecline(projectProf)}
                                        disabled={acceptingIds.has(projectProf.id) || decliningIds.has(projectProf.id)}
                                        className="rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                                      >
                                        {decliningIds.has(projectProf.id) ? 'Declining...' : 'Decline'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <Link
                                  href={primaryActionHref}
                                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                                >
                                  Open project
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-8">
            <div className="text-sm font-medium text-red-800">{error}</div>
          </div>
        )}

        {dashboardProjects.length === 0 ? (
          <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 text-sm text-slate-600">
            No immediate actions. Check Recent Activity for updates.
          </div>
        ) : null}

        <BackToTop />

        {/* Decline confirmation modal */}
        {declineProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeclineProject(null)}>
            <div className="mx-4 w-full max-w-sm rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-900">Decline project?</h2>
              <p className="mt-1 text-sm text-slate-600">You are about to decline this project. This cannot be undone. Are you sure?</p>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Why are you declining?</p>
                {declineReasons.map(reason => (
                  <label key={reason} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="declineReason"
                      value={reason}
                      checked={declineReason === reason}
                      onChange={e => setDeclineReason(e.target.value)}
                      className="h-4 w-4 text-[#b94e2d]"
                    />
                    <span className="text-sm text-slate-700">{reason}</span>
                  </label>
                ))}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeclineProject(null)}
                  className="flex-1 rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDecline}
                  className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition"
                >
                  Decline project
                </button>
              </div>
            </div>
          </div>
        )}

        </div>
      </div>
  );
}

function SummaryCard({ 
  label, 
  value, 
  tone, 
  filterStatus, 
  currentFilter, 
  onClick 
}: { 
  label: string; 
  value: number; 
  tone: SummaryTone; 
  filterStatus: string;
  currentFilter: string;
  onClick: () => void;
}) {
  const toneMap: Record<SummaryTone, { valueColor: string; activeRing: string }> = {
    slate: { valueColor: 'text-slate-900', activeRing: 'ring-slate-700' },
    amber: { valueColor: 'text-amber-700', activeRing: 'ring-amber-300' },
    emerald: { valueColor: 'text-emerald-700', activeRing: 'ring-emerald-300' },
    blue: { valueColor: 'text-blue-700', activeRing: 'ring-blue-300' },
    purple: { valueColor: 'text-purple-700', activeRing: 'ring-purple-300' },
    rose: { valueColor: 'text-rose-700', activeRing: 'ring-rose-300' },
  };

  const { valueColor, activeRing } = toneMap[tone];
  const isActive = currentFilter === filterStatus;

  return (
    <button
      onClick={onClick}
      className={`rounded-lg bg-white/40 px-3 py-2 text-left transition-all hover:bg-white/60 ${
        isActive ? `ring-2 ${activeRing} bg-white/60` : ''
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-700">{label}</p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
    </button>
  );
}

function statusBadgeClass(status: string) {
  if (status === 'pending') return 'rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800';
  if (status === 'accepted') return 'rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800';
  if (status === 'quoted') return 'rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800';
  if (status === 'awarded') return 'rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-800';
  if (status === 'rejected' || status === 'declined') return 'rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800';
  return 'rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800';
}
