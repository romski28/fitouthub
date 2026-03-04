'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { colors } from '@/styles/theme';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';
import { UpdatesButton } from '@/components/updates-button';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { completeNextStep, fetchPrimaryNextStep, type NextStepAction } from '@/lib/next-steps';

interface ProjectProfessional {
  id: string;
  projectId: string;
  project: {
    id: string;
    projectName: string;
    clientName: string;
    region: string;
    budget?: string;
    notes?: string;
  };
  status: string;
  quoteAmount?: string;
  quoteNotes?: string;
  quotedAt?: string;
  unreadCount?: number;
}

type SummaryTone = 'slate' | 'amber' | 'emerald' | 'blue' | 'purple' | 'rose';

const professionalActionTabMap: Record<string, string> = {
  REQUEST_SITE_ACCESS: 'site-access',
  ATTEND_SITE_VISIT: 'site-access',
  PREPARE_REVISED_QUOTE: 'site-access',
  SUBMIT_QUOTE: 'overview',
  REPLY_TO_INVITATION: 'overview',
  SUBMIT_PROGRESS_UPDATE: 'schedule',
  REQUEST_FINAL_WALKTHROUGH: 'schedule',
  ADDRESS_FINAL_ITEMS: 'schedule',
  PROVIDE_WARRANTY_DETAILS: 'schedule',
  RESPOND_TO_DISPUTE: 'chat',
};

function getProfessionalShowMeHref(projectProfessionalId: string, actionKey: string) {
  const tab = professionalActionTabMap[actionKey] || 'overview';
  return `/professional-projects/${projectProfessionalId}?tab=${encodeURIComponent(tab)}`;
}

export default function ProfessionalProjectsPage() {
  const router = useRouter();
  const { isLoggedIn, professional, accessToken } = useProfessionalAuth();
  const [projects, setProjects] = useState<ProjectProfessional[]>([]);

  // Only professionals can access this page
  useRoleGuard(['professional'], { fallback: '/' });
  const [visibleCount, setVisibleCount] = useState(30);
  const [filterStatus, setFilterStatus] = useState<'all'|'pending'|'accepted'|'declined'|'quoted'|'awarded'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextStepMap, setNextStepMap] = useState<Record<string, NextStepAction | null>>({});
  const [nextStepLoadingMap, setNextStepLoadingMap] = useState<Record<string, boolean>>({});
  const totals = {
    total: projects.length,
    pending: projects.filter(p => p.status === 'pending').length,
    accepted: projects.filter(p => p.status === 'accepted').length,
    quoted: projects.filter(p => p.status === 'quoted').length,
    awarded: projects.filter(p => p.status === 'awarded').length,
    declined: projects.filter(p => p.status === 'rejected' || p.status === 'declined').length,
  };
  const actionableProjects = projects
    .filter((projectProf) => Boolean(nextStepMap[projectProf.project.id]))
    .slice(0, 6);

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
        const response = await fetch(`${API_BASE_URL}/professional/projects`, {
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
    if (!isLoggedIn || !accessToken || projects.length === 0) return;

    let cancelled = false;

    const loadNextSteps = async () => {
      const entries = await Promise.all(
        projects.map(async (projectProf) => {
          try {
            const action = await fetchPrimaryNextStep(projectProf.project.id, accessToken);
            return [projectProf.project.id, action] as const;
          } catch {
            return [projectProf.project.id, null] as const;
          }
        }),
      );

      if (cancelled) return;

      const next: Record<string, NextStepAction | null> = {};
      entries.forEach(([id, action]) => {
        next[id] = action;
      });
      setNextStepMap(next);
    };

    loadNextSteps();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, accessToken, projects]);

  const handleCompleteNextStep = async (
    event: MouseEvent<HTMLButtonElement>,
    projectId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!accessToken) return;
    const action = nextStepMap[projectId];
    if (!action) return;

    setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: true }));
    try {
      const ok = await completeNextStep(projectId, action.actionKey, accessToken);
      if (!ok) return;

      const refreshed = await fetchPrimaryNextStep(projectId, accessToken);
      setNextStepMap((prev) => ({ ...prev, [projectId]: refreshed }));
    } finally {
      setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: false }));
    }
  };

  if (isLoggedIn === undefined || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Updates Button */}
        <div className="flex justify-center">
          <UpdatesButton />
        </div>

        {/* Hero (match client styling) */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">{professional?.fullName || professional?.businessName || 'Projects'}</p>
              <h1 className="text-2xl font-bold leading-tight">My Projects</h1>
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
              <p className="text-[10px] text-center text-slate-300 italic">Click on a status to filter</p>
            </div>
          </div>
        </div>

        {/* Action Dashboard */}
        {actionableProjects.length > 0 && (
          <div className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Dashboard</p>
                <h2 className="text-xl font-bold text-white">{actionableProjects.length} Projects needing action</h2>
              </div>
            </div>

            <div className="space-y-2">
              {actionableProjects.map((projectProf) => {
                const action = nextStepMap[projectProf.project.id];
                if (!action) return null;
                const statusBadge = projectProf.status === 'awarded' ? 'bg-purple-400/20 text-purple-200' : 
                  projectProf.status === 'quoted' ? 'bg-blue-400/20 text-blue-200' : 
                  projectProf.status === 'accepted' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200';
                return (
                  <div key={`dash-${projectProf.id}`} className="rounded-lg bg-white/10 px-4 py-3 transition hover:bg-white/15">
                    <div className="grid gap-3">
                      {/* Title - Full Width */}
                      <p className="truncate text-sm font-bold text-white">{projectProf.project.projectName}</p>
                      
                      {/* Details Row - Responsive Grid */}
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                        {/* Project Details */}
                        <div className="col-span-2 md:col-span-1">
                          <div className="flex items-center gap-2 text-xs text-slate-300">
                            <span>{projectProf.project.region}</span>
                            <span>•</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>
                              {projectProf.status}
                            </span>
                            {projectProf.quoteAmount && (
                              <>
                                <span>•</span>
                                <span className="font-medium text-white">${Number(projectProf.quoteAmount).toLocaleString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* Badge */}
                        <div className="flex items-center">
                          <span className="rounded-full bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-200">
                            {action.actionLabel}
                          </span>
                        </div>
                        
                        {/* Button */}
                        <div className="flex items-center">
                          <Link
                            href={getProfessionalShowMeHref(projectProf.id, action.actionKey)}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
                          >
                            Show me
                          </Link>
                        </div>
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

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No projects assigned yet. Once you accept project invitations, they'll appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {projects
              .filter(p => filterStatus === 'all' ? true : (p.status === filterStatus || (filterStatus==='declined' && (p.status==='rejected' || p.status==='declined'))))
              .slice(0, visibleCount)
              .map((projectProf) => (
              <Link key={projectProf.id} href={`/professional-projects/${projectProf.id}`}>
                <div className="group relative rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  {/* Unread message bubble */}
                  {projectProf.unreadCount && projectProf.unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold shadow-md" title={`${projectProf.unreadCount} unread messages`}>
                      {projectProf.unreadCount > 99 ? '99+' : projectProf.unreadCount}
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
                    <div className="space-y-1">
                      <div className="text-base font-bold">{projectProf.project.projectName}</div>
                      <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wide">{projectProf.project.region}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(projectProf.status)}`}>{projectProf.status}</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {nextStepMap[projectProf.project.id] && (
                      <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Next step</p>
                            <p className="text-sm font-semibold text-blue-900">{nextStepMap[projectProf.project.id]?.actionLabel}</p>
                            {nextStepMap[projectProf.project.id]?.description ? (
                              <p className="text-xs text-blue-800">{nextStepMap[projectProf.project.id]?.description}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={(event) => handleCompleteNextStep(event, projectProf.project.id)}
                            disabled={Boolean(nextStepLoadingMap[projectProf.project.id])}
                            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {nextStepLoadingMap[projectProf.project.id] ? 'Updating...' : 'Mark done'}
                          </button>
                        </div>
                      </div>
                    )}

                    {projectProf.project.notes ? (
                      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 border border-slate-100">
                        <p className="font-semibold text-slate-800 mb-1">Notes</p>
                        <p className="leading-relaxed line-clamp-2">{projectProf.project.notes}</p>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>ID: {projectProf.projectId}</span>
                      {projectProf.quotedAt ? (
                        <span>Quoted: {new Date(projectProf.quotedAt).toLocaleDateString()}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {projects.length > visibleCount && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setVisibleCount((c) => c + 30)}
              className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md transition font-medium"
            >
              Display More
            </button>
          </div>
        )}

        <BackToTop />
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
    slate: { valueColor: 'text-white', activeRing: 'ring-white' },
    amber: { valueColor: 'text-amber-200', activeRing: 'ring-amber-300' },
    emerald: { valueColor: 'text-emerald-300', activeRing: 'ring-emerald-300' },
    blue: { valueColor: 'text-blue-200', activeRing: 'ring-blue-300' },
    purple: { valueColor: 'text-purple-200', activeRing: 'ring-purple-300' },
    rose: { valueColor: 'text-rose-200', activeRing: 'ring-rose-300' },
  };

  const { valueColor, activeRing } = toneMap[tone];
  const isActive = currentFilter === filterStatus;

  return (
    <button
      onClick={onClick}
      className={`rounded-lg bg-white/10 px-3 py-2 text-left transition-all hover:bg-white/20 ${
        isActive ? `ring-2 ${activeRing} bg-white/20` : ''
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-200">{label}</p>
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
