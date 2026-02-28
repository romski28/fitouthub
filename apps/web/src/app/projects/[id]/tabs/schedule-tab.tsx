'use client';

import React, { useEffect, useState } from 'react';
import { MilestoneTimeline } from '@/components/milestone-timeline';

interface Milestone {
  id: string;
  projectId: string;
  projectProfessionalId?: string;
  title: string;
  description?: string;
  sequence: number;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  siteAccessRequired?: boolean;
  siteAccessNotes?: string;
  accessDeclined?: boolean;
  accessDeclinedReason?: string;
  accessDeclinedAt?: string;
  photoUrls?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ClientScheduleTabProps {
  tab?: string;
  projectId: string;
  projectStatus: string;
  accessToken: string | null;
  awardedProfessionalId?: string;
}

export const ClientScheduleTab: React.FC<ClientScheduleTabProps> = ({
  projectId,
  projectStatus,
  accessToken,
  awardedProfessionalId,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declineReasonByMilestone, setDeclineReasonByMilestone] = useState<Record<string, string>>({});
  const [decliningMilestoneId, setDecliningMilestoneId] = useState<string | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fitouthub.onrender.com';
  const isAwarded = projectStatus === 'awarded';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No date set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateRange = (start?: string, end?: string) => {
    if (!start && !end) return 'No dates set';
    if (start && end) {
      const startOnly = start.split('T')[0];
      const endOnly = end.split('T')[0];
      if (startOnly === endOnly) return formatDate(start);
      return `${formatDate(start)} → ${formatDate(end)}`;
    }
    return formatDate(start || end);
  };

  const handleDeclineAccess = async (milestoneId: string) => {
    if (!accessToken) {
      setError('Authentication required');
      return;
    }

    const reason = (declineReasonByMilestone[milestoneId] || '').trim();
    if (reason.length < 3) {
      setError('Please provide a short reason (at least 3 characters).');
      return;
    }

    try {
      setError(null);
      setDecliningMilestoneId(milestoneId);

      const response = await fetch(`${API_BASE_URL}/milestones/${milestoneId}/decline-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Failed to decline access date');
      }

      const result = await response.json();
      const updatedMilestone = result?.milestone;
      if (updatedMilestone) {
        setMilestones((prev) =>
          prev.map((m) => (m.id === milestoneId ? { ...m, ...updatedMilestone } : m)),
        );
      }
    } catch (err) {
      console.error('Failed to decline access for milestone:', err);
      setError(err instanceof Error ? err.message : 'Failed to decline access date');
    } finally {
      setDecliningMilestoneId(null);
    }
  };

  // Fetch milestones for the awarded professional
  useEffect(() => {
    if (!projectId || !isAwarded) return;

    const fetchMilestones = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch milestones by project ID
        const response = await fetch(
          `${API_BASE_URL}/milestones/project/${projectId}`,
          {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          }
        );

        if (!response.ok && response.status !== 404) {
          throw new Error('Failed to fetch milestones');
        }

        if (response.ok) {
          const data = await response.json();
          setMilestones(Array.isArray(data) ? data : data.milestones || []);
        } else {
          // No milestones yet
          setMilestones([]);
        }
      } catch (err) {
        console.error('Error fetching milestones:', err);
        setError(err instanceof Error ? err.message : 'Failed to load schedule');
      } finally {
        setLoading(false);
      }
    };

    fetchMilestones();
  }, [projectId, isAwarded, accessToken]);

  return (
    <div className="space-y-6">
      {!isAwarded ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            📅 Contractor's schedule will appear here once you award the project.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">Loading schedule...</p>
            </div>
          ) : milestones.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">
                📋 Contractor hasn't set up a project schedule yet. Check back soon for progress milestones and timeline.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="mb-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Site Access Requests by Task</h4>
                <div className="space-y-3">
                  {milestones.filter((m) => m.siteAccessRequired).length === 0 ? (
                    <p className="text-xs text-slate-600">No current tasks require site access.</p>
                  ) : (
                    milestones
                      .filter((m) => m.siteAccessRequired)
                      .map((m) => (
                        <div key={`access-${m.id}`} className="rounded-md border border-slate-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                              <p className="text-xs text-slate-600">Requested date(s): {formatDateRange(m.plannedStartDate, m.plannedEndDate)}</p>
                            </div>
                            {m.accessDeclined ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                                Access Declined
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                                Access Requested
                              </span>
                            )}
                          </div>

                          {m.accessDeclined ? (
                            <p className="text-xs text-amber-700">
                              Reason: {m.accessDeclinedReason || 'No reason provided'}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <textarea
                                value={declineReasonByMilestone[m.id] || ''}
                                onChange={(e) =>
                                  setDeclineReasonByMilestone((prev) => ({ ...prev, [m.id]: e.target.value }))
                                }
                                placeholder="Reason for declining these access dates"
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                                rows={2}
                              />
                              <button
                                onClick={() => handleDeclineAccess(m.id)}
                                disabled={decliningMilestoneId === m.id}
                                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                              >
                                {decliningMilestoneId === m.id ? 'Declining…' : 'Decline Access for These Dates'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-slate-900 mb-6">Project Timeline & Progress</h3>
              <MilestoneTimeline
                milestones={milestones.map(m => ({
                  ...m,
                  photoUrls: m.photoUrls || []
                }))}
                title="Contractor's Schedule"
                showPhotos={true}
                editable={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
