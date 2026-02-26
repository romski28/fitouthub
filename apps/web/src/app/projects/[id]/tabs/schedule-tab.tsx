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

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fitouthub.onrender.com';
  const isAwarded = projectStatus === 'awarded';

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
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Project Timeline & Progress</h3>
              <MilestoneTimeline
                milestones={milestones}
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
