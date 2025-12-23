'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';
import { BackToTop } from '@/components/back-to-top';

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
    unread: projects.reduce((sum, p) => sum + (p.unreadCount || 0), 0),
  };

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/professional-login');
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
            router.push('/professional-login');
            return;
          }
          throw new Error('Failed to fetch projects');
        }

        const data = await response.json();
        const list: ProjectProfessional[] = Array.isArray(data) ? data : data.projects || [];
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
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header & Mini Dashboard */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Your Projects</h1>
              {professional && (
                <p className="mt-2 text-gray-600">
                  {professional.fullName || professional.businessName || professional.email}
                </p>
              )}
            </div>
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-gray-700"
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

          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
              <p className="text-lg font-bold text-slate-900">{totals.total}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-yellow-600">Pending</p>
              <p className="text-lg font-bold text-slate-900">{totals.pending}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-green-600">Accepted</p>
              <p className="text-lg font-bold text-slate-900">{totals.accepted}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-blue-600">Quoted</p>
              <p className="text-lg font-bold text-slate-900">{totals.quoted}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-purple-600">Awarded</p>
              <p className="text-lg font-bold text-slate-900">{totals.awarded}</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-rose-600">Declined</p>
              <p className="text-lg font-bold text-slate-900">{totals.declined}</p>
            </div>
          </div>
          <div className="mt-3">
            <span className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-1 text-sm text-red-700 border border-red-100">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              {totals.unread} unread messages
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-8">
            <div className="text-sm font-medium text-red-800">{error}</div>
          </div>
        )}

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-600 text-lg">No projects assigned yet</p>
            <p className="text-gray-500 mt-2">
              Once you accept project invitations, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects
              .filter(p => filterStatus === 'all' ? true : (p.status === filterStatus || (filterStatus==='declined' && (p.status==='rejected' || p.status==='declined'))))
              .slice(0, visibleCount)
              .map((projectProf) => (
              <Link key={projectProf.id} href={`/professional-projects/${projectProf.id}`}>
                <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {projectProf.project.projectName}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Client: {projectProf.project.clientName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {projectProf.project.region}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {projectProf.unreadCount && projectProf.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs" title={`${projectProf.unreadCount} unread messages`}>
                            {projectProf.unreadCount}
                          </span>
                        )}
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          projectProf.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : projectProf.status === 'accepted'
                            ? 'bg-green-100 text-green-800'
                            : projectProf.status === 'quoted'
                            ? 'bg-blue-100 text-blue-800'
                            : projectProf.status === 'awarded'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {projectProf.status}
                      </span>
                      </div>
                    </div>

                    {projectProf.project.budget && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-sm text-gray-600">
                          Budget:{' '}
                          <span className="font-semibold text-gray-900">
                            ${projectProf.project.budget}
                          </span>
                        </p>
                      </div>
                    )}

                    {projectProf.quoteAmount && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600">
                          Your Quote:{' '}
                          <span className="font-semibold text-gray-900">
                            ${projectProf.quoteAmount}
                          </span>
                        </p>
                        {projectProf.quotedAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(projectProf.quotedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}

                    {projectProf.project.notes && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-700">
                          Project Notes
                        </p>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {projectProf.project.notes}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                      }}
                      className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Load more */}
        {projects.length > visibleCount && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setVisibleCount((c) => c + 30)}
              className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md"
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
