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
import { ProjectAccessModal } from '@/components/project-access-modal';
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
    endDate?: string;
  };
  status: string;
  source?: string;
  accessRestricted?: boolean;
  quoteAmount?: string;
  quoteBaseAmount?: string;
  quoteNotes?: string;
  quotedAt?: string;
}

interface DiscoverProject {
  id: string;
  projectName: string;
  region?: string;
  budget?: string;
  notes?: string;
  tradesRequired: string[];
  isEmergency?: boolean;
  endDate?: string;
  tenderOpenedAt?: string;
  matchingTrades: string[];
}

type QuoteDeadlineState = {
  isOverdue: boolean;
  remainingLabel: string | null;
  windowLongLabel: string;
  overdueHours: number;
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
      overdueHours: Math.abs(remainingMs) / (60 * 60 * 1000),
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
    overdueHours: 0,
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

  // Workers have no bid/quote project list — send them to their granted projects.
  useEffect(() => {
    if (professional?.professionType === 'worker') {
      router.replace('/worker-projects');
    }
  }, [professional?.professionType, router]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextStepMap, setNextStepMap] = useState<Record<string, NextStepAction[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`ns_list_v2_professional:${professional?.id || 'anonymous'}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, NextStepAction[]>;
        if (Object.keys(parsed).length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return {};
  });
  const [nextStepLoadingMap, setNextStepLoadingMap] = useState<Record<string, boolean>>({});
  const [nextStepsLoading, setNextStepsLoading] = useState(false);
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [decliningIds, setDecliningIds] = useState<Set<string>>(new Set());
  const [skipConfirmProjectId, setSkipConfirmProjectId] = useState<string | null>(null);
  const [skipLoading, setSkipLoading] = useState(false);
  const [declineProject, setDeclineProject] = useState<ProjectProfessional | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [workerAccessProjectId, setWorkerAccessProjectId] = useState<string | null>(null);
  const [hidingIds, setHidingIds] = useState<Set<string>>(new Set());
  const [updatesSummary, setUpdatesSummary] = useState<UpdatesSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'my-projects' | 'find-work'>('find-work');
  const [findWorkView, setFindWorkView] = useState<'open' | 'invitations' | 'bids' | 'past'>('open');
  const [discoverProjects, setDiscoverProjects] = useState<DiscoverProject[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const projectIds = useMemo(
    () => projects
      .filter((p) => !p.accessRestricted)
      .filter((p) => !getQuoteDeadlineState(p)?.isOverdue)
      .map((p) => p.project.id),
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
  const invitedProjects = projects.filter((p) => p.status === 'pending' && p.source !== 'discovered');
  const bidProjects = projects.filter(
    (p) =>
      ['accepted', 'quoted', 'counter_requested'].includes(p.status) ||
      (p.status === 'pending' && p.source === 'discovered'),
  );
  const awardedProjects = projects.filter((p) => p.status === 'awarded');
  const pastProjects = projects.filter((p) =>
    ['declined', 'rejected', 'withdrawn'].includes(p.status),
  );

  const currentProjectList: ProjectProfessional[] =
    activeTab === 'my-projects'
      ? awardedProjects
      : findWorkView === 'invitations'
        ? invitedProjects
        : findWorkView === 'bids'
          ? bidProjects
          : pastProjects;

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
    if (!isLoggedIn || !accessToken) return;

    const fetchDiscover = async () => {
      setDiscoverLoading(true);
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/professional/discover/projects`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('Failed to load open tenders');
        const data = await res.json();
        setDiscoverProjects(Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn('[professional-projects] discover failed', err);
      } finally {
        setDiscoverLoading(false);
      }
    };

    fetchDiscover();
  }, [isLoggedIn, accessToken]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/professional/notifications`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
        setUnreadNotifCount(Number(data?.unreadCount) || 0);
      } catch {
        /* ignore */
      }
    };

    fetchNotifications();
  }, [isLoggedIn, accessToken]);

  useEffect(() => {
    if (!isLoggedIn || !accessToken || projectIds.length === 0) return;

    let cancelled = false;

    const loadNextSteps = async () => {
      setNextStepsLoading(true);

      // Optimistic: try localStorage cache first for instant display
      const cacheKey = `ns_list_v2_${nextStepCacheScope}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, NextStepAction[]>;
          if (Object.keys(parsed).length > 0) {
            setNextStepMap(parsed);
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
      setNextStepMap((prev) => {
        const merged = { ...prev, ...batch };
        try {
          localStorage.setItem(cacheKey, JSON.stringify(merged));
        } catch { /* ignore quota */ }
        return merged;
      });
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
          localStorage.setItem(`ns_list_v2_${nextStepCacheScope}`, JSON.stringify(updated));
        } catch { /* ignore quota */ }
        return updated;
      });
    } finally {
      setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: false }));
    }
  };

  const refreshSingleProject = async (projectId: string) => {
    if (!accessToken) return;
    setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: true }));
    try {
      const refreshed = await fetchPrimaryNextSteps(projectId, accessToken, {
        cacheScope: nextStepCacheScope,
        forceRefresh: true,
      });
      setNextStepMap((prev) => {
        const updated = { ...prev, [projectId]: refreshed };
        try {
          localStorage.setItem(`ns_list_v2_${nextStepCacheScope}`, JSON.stringify(updated));
        } catch { /* ignore */ }
        return updated;
      });
    } catch { /* silently fail */ }
    finally {
      setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: false }));
    }
  };

  const refreshAll = async () => {
    if (!accessToken || projectIds.length === 0) return;
    setNextStepsLoading(true);
    const fetches = projectIds.map((projectId) =>
      fetchPrimaryNextSteps(projectId, accessToken, { cacheScope: nextStepCacheScope, forceRefresh: true })
        .then((actions) => ({ id: projectId, actions }))
        .catch(() => ({ id: projectId, actions: [] })),
    );
    const resolved = await Promise.allSettled(fetches);
    const batch: Record<string, NextStepAction[]> = {};
    resolved.forEach((result) => {
      if (result.status === 'fulfilled') batch[result.value.id] = result.value.actions;
    });
    setNextStepMap((prev) => {
      const merged = { ...prev, ...batch };
      try {
        localStorage.setItem(`ns_list_v2_${nextStepCacheScope}`, JSON.stringify(merged));
      } catch { /* ignore */ }
      return merged;
    });
    setNextStepsLoading(false);
  };

  const hideProject = async (projectProfessionalId: string) => {
    if (!accessToken) return;
    setHidingIds((prev) => new Set(prev).add(projectProfessionalId));
    try {
      const res = await fetch(`${API_BASE_URL}/professional/projects/${projectProfessionalId}/hide`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        // Remove from local state so it disappears immediately
        setProjects((prev) => prev.filter((p) => p.id !== projectProfessionalId));
        toast.success('Project hidden');
      }
    } catch {
      toast.error('Failed to hide project');
    } finally {
      setHidingIds((prev) => {
        const next = new Set(prev);
        next.delete(projectProfessionalId);
        return next;
      });
    }
  };

  const handleApply = async (project: DiscoverProject) => {
    if (!accessToken) return;
    setApplyingIds((prev) => new Set(prev).add(project.id));
    try {
      const res = await fetch(`${API_BASE_URL}/professional/discover/projects/${project.id}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Failed to apply');
      }
      toast.success('Application sent! It now appears under "Your bids".');
      setDiscoverProjects((prev) => prev.filter((p) => p.id !== project.id));
      // Refresh the project list so the new bid appears under "Your bids".
      try {
        const response = await fetchWithRetry(`${API_BASE_URL}/professional/projects`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          const list: ProjectProfessional[] = (Array.isArray(data) ? data : data.projects || []).filter(
            (p: ProjectProfessional) => p.status !== 'selected',
          );
          setProjects(list);
        }
      } catch {
        /* ignore */
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply');
    } finally {
      setApplyingIds((prev) => {
        const next = new Set(prev);
        next.delete(project.id);
        return next;
      });
    }
  };

  const markAllNotificationsRead = async () => {
    if (!accessToken) return;
    setUnreadNotifCount(0);
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    try {
      await fetch(`${API_BASE_URL}/professional/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
    } catch {
      /* ignore */
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!accessToken) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    try {
      await fetch(`${API_BASE_URL}/professional/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
    } catch {
      /* ignore */
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
              <h1 className="text-2xl font-bold leading-tight text-slate-900">
                {activeTab === 'my-projects' ? 'My Projects' : 'Find Work'}
              </h1>
              <div className="flex items-center gap-3">
                {nextStepsLoading && (
                  <p className="text-xs text-slate-400 animate-pulse">
                    Syncing next steps...
                  </p>
                )}
                <button
                  type="button"
                  onClick={refreshAll}
                  disabled={nextStepsLoading}
                  className="rounded-lg border border-[rgba(120,53,15,0.2)] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  title="Refresh all projects"
                >
                  ↻ Refresh all
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    className="relative rounded-lg border border-[rgba(120,53,15,0.2)] bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
                    aria-label="Notifications"
                  >
                    🔔
                    {unreadNotifCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                        {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-30 cursor-default"
                        onClick={() => setNotifOpen(false)}
                        aria-label="Close notifications"
                      />
                      <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[rgba(120,53,15,0.12)] px-4 py-2">
                          <p className="text-sm font-bold text-slate-900">Notifications</p>
                          {unreadNotifCount > 0 && (
                            <button
                              type="button"
                              onClick={markAllNotificationsRead}
                              className="text-xs font-semibold text-emerald-700 hover:underline"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <p className="px-4 py-6 text-center text-xs text-slate-500">No notifications yet.</p>
                          ) : (
                            notifications.map((n: any) => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => {
                                  markNotificationRead(n.id);
                                  if (n.url && typeof window !== 'undefined') {
                                    window.location.href = n.url;
                                  }
                                }}
                                className={`block w-full border-b border-[rgba(120,53,15,0.08)] px-4 py-3 text-left transition hover:bg-white/60 ${n.readAt ? 'opacity-60' : ''}`}
                              >
                                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                                <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="inline-flex w-fit rounded-xl border border-[rgba(120,53,15,0.15)] bg-white/60 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('my-projects')}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${activeTab === 'my-projects' ? 'bg-[#b94e2d] text-[#F5EEDE]' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  My Projects
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('find-work')}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${activeTab === 'find-work' ? 'bg-[#b94e2d] text-[#F5EEDE]' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Find Work
                </button>
              </div>
              {activeTab === 'find-work' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SubViewChip label="Open tenders" value={discoverProjects.length} active={findWorkView === 'open'} onClick={() => setFindWorkView('open')} />
                  <SubViewChip label="Invitations" value={invitedProjects.length} active={findWorkView === 'invitations'} onClick={() => setFindWorkView('invitations')} />
                  <SubViewChip label="Your bids" value={bidProjects.length} active={findWorkView === 'bids'} onClick={() => setFindWorkView('bids')} />
                  <SubViewChip label="Past" value={pastProjects.length} active={findWorkView === 'past'} onClick={() => setFindWorkView('past')} />
                </div>
              )}
            </div>
          </div>

          {/* Cards */}
          {activeTab === 'find-work' && findWorkView === 'open' ? (
            <div className="mt-5 pt-4 border-t border-[rgba(120,53,15,0.12)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Open tenders</p>
                  <h2 className="text-xl font-bold text-slate-900">{discoverProjects.length} matching tenders</h2>
                </div>
              </div>
              {discoverLoading ? (
                <div className="space-y-2">
                  <div className="h-20 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-lg bg-slate-200" />
                </div>
              ) : discoverProjects.length === 0 ? (
                <p className="py-6 text-sm text-slate-600">No open tenders match your trades right now. Check back soon.</p>
              ) : (
                <div className="space-y-2">
                  {discoverProjects.map((d) => (
                    <div
                      key={`discover-${d.id}`}
                      className="rounded-lg border-[3px] border-emerald-600/40 bg-[var(--mimo-project-paper)] px-4 py-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[1.2rem] font-bold leading-tight text-slate-900">
                          {d.isEmergency ? `🚨 ${d.projectName}` : d.projectName}
                        </span>
                        {d.matchingTrades.map((t) => (
                          <span
                            key={`${d.id}-${t}`}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {d.notes}
                        {d.region ? ` · ${d.region}` : ''}
                        {d.endDate
                          ? ` · Proposed completion ${new Date(d.endDate).toLocaleDateString('en-HK', { day: '2-digit', month: 'short' })}`
                          : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {d.tradesRequired.length} trade{d.tradesRequired.length === 1 ? '' : 's'} required
                        </span>
                        <div className="ml-auto">
                          <button
                            type="button"
                            onClick={() => handleApply(d)}
                            disabled={applyingIds.has(d.id)}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {applyingIds.has(d.id) ? 'Applying…' : 'Request to quote'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : currentProjectList.length > 0 ? (
            <div className="mt-5 pt-4 border-t border-[rgba(120,53,15,0.12)]">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                      {activeTab === 'my-projects'
                        ? 'Awarded'
                        : findWorkView === 'invitations'
                          ? 'Action required'
                          : findWorkView === 'bids'
                            ? 'In play'
                            : 'Past'}
                    </p>
                    <h2 className="text-xl font-bold text-slate-900">
                  {currentProjectList.length} Projects in this view
                </h2>
              </div>
            </div>
            <div className="space-y-2">
              {currentProjectList.map((projectProf) => {
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

                    <div className="grid gap-3 overflow-hidden">
                      {/* Title row with scope chips */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {isRestricted ? (
                            <span className="flex-1 min-w-0 truncate text-[1.2rem] font-bold leading-tight text-slate-900">
                              {isEmergencyProject ? `🚨 ${projectProf.project.projectName}` : projectProf.project.projectName}
                            </span>
                          ) : (
                            <Link
                              href={`/professional-projects/${projectProf.id}?tab=overview`}
                              className={`flex-1 min-w-0 truncate text-[1.2rem] font-bold leading-tight underline-offset-2 hover:underline ${
                                quoteOverdue || isStopStatus ? 'text-white' : 'text-slate-900'
                              }`}
                              title="Open project details"
                            >
                              {isEmergencyProject ? `🚨 ${projectProf.project.projectName}` : projectProf.project.projectName}
                            </Link>
                          )}
                          <div className="sm:ml-auto shrink-0 flex items-center gap-2">
                            {/* Trade/scope chips */}
                            {!isRestricted && (projectProf.quoteRequestedTrades?.length || projectProf.projectTradesSnapshot?.length) ? (
                              projectProf.quoteRequestedTrades && projectProf.quoteRequestedTrades.length > 0 ? (
                                projectProf.quoteRequestedTrades.map((trade) => (
                                  <span
                                    key={`requested-${projectProf.id}-${trade}`}
                                    className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                                      quoteOverdue || isStopStatus
                                        ? 'border border-amber-200/60 bg-amber-100/20 text-amber-100'
                                        : 'border border-amber-300 bg-amber-50 text-amber-800'
                                    }`}
                                  >
                                    {trade}
                                  </span>
                                ))
                              ) : null
                            ) : null}
                            <ProjectSentimentBadge
                              projectId={projectProf.project.id}
                              storageScope="professional"
                              iconOnly
                              size="lg"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                refreshSingleProject(projectProf.project.id);
                              }}
                              disabled={nextStepLoadingMap[projectProf.project.id]}
                              className="ml-auto shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                              title="Refresh this project"
                            >
                              <span className={`text-sm ${nextStepLoadingMap[projectProf.project.id] ? 'animate-spin inline-block' : ''}`}>↻</span>
                            </button>
                          </div>
                        </div>
                        {/* Project scope/notes */}
                        {(projectProf.project.notes || projectProf.project.endDate || projectProf.project.region) && (
                          <p className={`text-xs leading-relaxed line-clamp-2 ${quoteOverdue || isStopStatus ? 'text-slate-200' : 'text-slate-500'}`}>
                            {projectProf.project.notes}
                            {projectProf.project.region && (
                              <> {projectProf.project.notes ? '· ' : ''}({projectProf.project.region})</>
                            )}
                            {projectProf.project.endDate && (
                              <> {projectProf.project.notes || projectProf.project.region ? ' · ' : ''}Proposed completion {new Date(projectProf.project.endDate).toLocaleDateString('en-HK', { weekday: 'short', day: '2-digit', month: 'short' })}</>
                            )}
                          </p>
                        )}
                      </div>
                      
                      {/* Details Row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                        {!isRestricted && (projectProf.quoteBaseAmount || projectProf.quoteAmount) && (
                          <span className={`font-medium ${quoteOverdue || isStopStatus ? 'text-white' : 'text-slate-900'}`}>
                            ${Number(projectProf.quoteBaseAmount || projectProf.quoteAmount).toLocaleString()}
                          </span>
                        )}
                        {isRestricted && (
                          <p className={`text-xs ${quoteOverdue || isStopStatus ? 'text-slate-200' : 'text-slate-600'}`}>
                            {projectProf.project.notes || 'Bidding has concluded for this project.'}
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                          {isRestricted ? (
                            <span className="rounded-lg border border-rose-300/40 px-4 py-2 text-sm font-semibold text-rose-100">
                              Bidding closed
                            </span>
                          ) : quoteOverdue ? (
                            <div className="flex flex-wrap gap-2">
                              {quoteDeadlineState && quoteDeadlineState.overdueHours > 48 ? (
                                <span className="rounded-lg border border-rose-400/50 bg-rose-900/60 px-4 py-2 text-sm font-semibold text-rose-200">
                                  Deadline missed · {Math.round(quoteDeadlineState.overdueHours / 24)}d ago
                                </span>
                              ) : (
                                <Link
                                  href={`/professional-projects/${projectProf.id}?tab=chat`}
                                  className="rounded-lg bg-[#DC143C] px-4 py-2 text-sm font-bold text-yellow-300 transition hover:bg-[#B01030]"
                                >
                                  MISSED DEADLINE
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  hideProject(projectProf.id);
                                }}
                                disabled={hidingIds.has(projectProf.id)}
                                className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-60"
                                title="Hide this project from your list"
                              >
                                {hidingIds.has(projectProf.id) ? 'Hiding…' : 'Hide Project'}
                              </button>
                            </div>
                          ) : nextStepsLoading ? (
                            <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-200" />
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
                                      className={action.requiresAction
                                        ? 'rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight'
                                        : 'rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight'
                                      }
                                    >
                                      {label}
                                    </button>
                                      );
                                    })()
                                  ))}
                                  {/* Skip site visit button — shown when REQUEST_SITE_ACCESS is primary */}
                                  {primaryActions.some(a => a.actionKey === 'REQUEST_SITE_ACCESS') && (
                                    <button
                                      type="button"
                                      onClick={() => setSkipConfirmProjectId(projectProf.project.id)}
                                      className="rounded-lg bg-[#FF7F50] hover:bg-[#E67245] text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                                    >
                                      No need for site visit
                                    </button>
                                  )}
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
                          {projectProf.status === 'pending' && !electiveActions.some(a => a.actionKey === 'DECLINE_PROJECT') && (
                            <button
                              type="button"
                              onClick={() =>
                                void openProfessionalNextStepModal(
                                  { actionKey: 'DECLINE_PROJECT', actionLabel: 'Decline project', description: 'Decline this project invitation.', isPrimary: false, isElective: true, requiresAction: true },
                                  projectProf.project.id,
                                  projectProf.id,
                                )
                              }
                              className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight"
                            >
                              Decline project
                            </button>
                          )}
                          {!isRestricted && !isStopStatus && !quoteOverdue && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setWorkerAccessProjectId(projectProf.project.id);
                              }}
                              className="rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[#F5EEDE]"
                              title="Grant a worker access to this project"
                            >
                              👷 Worker access
                            </button>
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          ) : null}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-8">
            <div className="text-sm font-medium text-red-800">{error}</div>
          </div>
        )}

        {(activeTab === 'find-work' && findWorkView === 'open'
          ? discoverProjects.length === 0 && !discoverLoading
          : currentProjectList.length === 0) && !loading ? (
          <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 text-sm text-slate-600">
            {activeTab === 'my-projects'
              ? 'No awarded projects yet. Winning a tender moves it here.'
              : findWorkView === 'open'
                ? 'No open tenders match your trades right now. Check back soon.'
                : findWorkView === 'invitations'
                  ? 'No invitations right now. New matches will appear here.'
                  : findWorkView === 'bids'
                    ? 'No bids yet. Find an open tender and request to quote.'
                    : 'No past bids.'}
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

        {/* Skip site visit confirmation dialog */}
        {skipConfirmProjectId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSkipConfirmProjectId(null); }}>
            <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] p-6 shadow-2xl backdrop-blur">
              <p className="text-sm font-semibold text-stone-800 mb-2">Skip site visit?</p>
              <p className="text-sm text-stone-600 mb-5">
                Are you sure you do not need to visit the site? Your quote is final, regardless of your inspection or not.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSkipConfirmProjectId(null)}
                  disabled={skipLoading}
                  className="rounded-lg border border-[rgba(120,53,15,0.2)] px-4 py-2 text-sm font-medium text-stone-600 hover:bg-[rgba(245,238,219,0.9)] transition"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!accessToken || !skipConfirmProjectId) return;
                    setSkipLoading(true);
                    try {
                      const res = await fetch(`${API_BASE_URL}/projects/${skipConfirmProjectId}/site-access/skip`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                      });
                      if (!res.ok) throw new Error('Failed to skip site visit');
                      toast.success('Site visit skipped. You can now submit your quote.');
                      await completeNextStep(skipConfirmProjectId, 'REQUEST_SITE_ACCESS', accessToken, nextStepCacheScope);
                      const refreshed = await fetchPrimaryNextSteps(skipConfirmProjectId, accessToken, { cacheScope: nextStepCacheScope, forceRefresh: true });
                      setNextStepMap((prev) => ({ ...prev, [skipConfirmProjectId]: refreshed }));
                      setSkipConfirmProjectId(null);
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to skip site visit');
                    } finally {
                      setSkipLoading(false);
                    }
                  }}
                  disabled={skipLoading}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                >
                  {skipLoading ? 'Skipping...' : 'Yes, skip visit'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ProjectAccessModal
          isOpen={workerAccessProjectId !== null}
          onClose={() => setWorkerAccessProjectId(null)}
          accessToken={accessToken || ''}
          projectId={workerAccessProjectId || ''}
        />

        </div>
      </div>
  );
}

function SubViewChip({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition ${
        active
          ? 'bg-[#b94e2d] text-[#F5EEDE]'
          : 'bg-white/40 text-slate-700 hover:bg-white/60'
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-bold ${active ? 'text-[#F5EEDE]' : 'text-slate-900'}`}>{value}</span>
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
