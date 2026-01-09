'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { colors } from '@/styles/theme';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';
import { UpdatesButton } from '@/components/updates-button';

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

export default function ProfessionalProjectsPage() {
  const router = useRouter();
  const { isLoggedIn, professional, accessToken } = useProfessionalAuth();
  const [projects, setProjects] = useState<ProjectProfessional[]>([]);
  const [visibleCount, setVisibleCount] = useState(30);
  const [filterStatus, setFilterStatus] = useState<'all'|'pending'|'accepted'|'declined'|'quoted'|'awarded'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const totals = {
    total: projects.length,
    pending: projects.filter(p => p.status === 'pending').length,
    accepted: projects.filter(p => p.status === 'accepted').length,
    quoted: projects.filter(p => p.status === 'quoted').length,
    awarded: projects.filter(p => p.status === 'awarded').length,
    declined: projects.filter(p => p.status === 'rejected' || p.status === 'declined').length,
  };

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
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <SummaryCard label="Total" value={totals.total} tone="slate" />
              <SummaryCard label="Pending" value={totals.pending} tone="amber" />
              <SummaryCard label="Accepted" value={totals.accepted} tone="emerald" />
              <SummaryCard label="Quoted" value={totals.quoted} tone="blue" />
              <SummaryCard label="Awarded" value={totals.awarded} tone="purple" />
              <SummaryCard label="Declined" value={totals.declined} tone="rose" />
            </div>
          </div>
        </div>

        {/* Filters (match client styling) */}
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="relative grid gap-0.5">
              <label className="text-xs font-medium text-slate-600">Filter by status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="quoted">Quoted</option>
                <option value="awarded">Awarded</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          </div>
        </div>

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
                <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
                    <div className="space-y-1">
                      <div className="text-base font-bold">{projectProf.project.projectName}</div>
                      <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wide">{projectProf.project.region}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {projectProf.unreadCount && projectProf.unreadCount > 0 ? (
                        <span 
                          style={{
                            backgroundColor: colors.successBg,
                            color: colors.success,
                            borderColor: colors.success,
                          }}
                          className="rounded-md border-2 px-2 py-0.5 text-xs font-bold" 
                          title={`${projectProf.unreadCount} unread messages`}
                        >
                          {projectProf.unreadCount} new
                        </span>
                      ) : null}
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(projectProf.status)}`}>{projectProf.status}</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
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

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: SummaryTone }) {
  const toneMap: Record<SummaryTone, { valueColor: string }> = {
    slate: { valueColor: 'text-white' },
    amber: { valueColor: 'text-amber-200' },
    emerald: { valueColor: 'text-emerald-300' },
    blue: { valueColor: 'text-blue-200' },
    purple: { valueColor: 'text-purple-200' },
    rose: { valueColor: 'text-rose-200' },
  };

  const { valueColor } = toneMap[tone];

  return (
    <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
      <p className="text-[11px] uppercase tracking-wide text-slate-200">{label}</p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
    </div>
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
