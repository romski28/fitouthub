'use client';

import React, { useEffect, useState } from 'react';
import { MilestoneTimeline } from '@/components/milestone-timeline';
import { MilestoneEditor } from '@/components/milestone-editor';

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

interface ScheduleTabProps {
  tab?: string;
  projectProfessionalId: string;
  projectStatus: string;
  tradeId?: string;
  accessToken: string | null;
  onMilestonesUpdate?: () => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  projectProfessionalId,
  projectStatus,
  tradeId,
  accessToken,
  onMilestonesUpdate,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMilestones, setEditingMilestones] = useState(false);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://fitouthub.onrender.com';
  const isAwarded = projectStatus === 'awarded';

  // Fetch milestones
  useEffect(() => {
    if (!projectProfessionalId) return;

    const fetchMilestones = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to fetch by projectProfessional first
        const response = await fetch(
          `${API_BASE_URL}/milestones/project-professional/${projectProfessionalId}`,
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
  }, [projectProfessionalId, accessToken]);

  const handleMilestonesChange = async (updatedMilestones: Milestone[]) => {
    try {
      setError(null);

      if (!accessToken) {
        setError('Authentication required');
        return;
      }

      // For now, just update local state
      // In a full implementation, this would sync with the backend
      setMilestones(updatedMilestones);
      setEditingMilestones(false);

      // Notify parent of update
      onMilestonesUpdate?.();
    } catch (err) {
      console.error('Error updating milestones:', err);
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  };

  return (
    <div className="space-y-6">
      {!isAwarded ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            📅 Schedule details will be available once the project is awarded to you.
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
              <p className="text-sm text-slate-600 mb-4">
                📋 No milestones set up yet. Create a schedule to track project progress.
              </p>
              {!editingMilestones && (
                <button
                  onClick={() => setEditingMilestones(true)}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Create Schedule
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-slate-900">Project Timeline</h3>
                  {!editingMilestones && (
                    <button
                      onClick={() => setEditingMilestones(true)}
                      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      ✏️ Edit
                    </button>
                  )}
                </div>

                <MilestoneTimeline
                  milestones={milestones}
                  title="Project Progress"
                  showPhotos={true}
                  editable={false}
                />
              </div>
            </>
          )}

          {editingMilestones && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900">Edit Schedule</h3>
                <button
                  onClick={() => setEditingMilestones(false)}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  ✕ Close
                </button>
              </div>

              <MilestoneEditor
                tradeId={tradeId || ''}
                defaultMilestones={milestones}
                onMilestonesChange={handleMilestonesChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
