'use client';

import React, { useEffect, useState } from 'react';
import { MilestoneEditor } from '@/components/milestone-editor';
import { API_BASE_URL } from '@/config/api';
import { Pencil, Trash2, Calendar, Clock } from 'lucide-react';

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
  startTimeSlot?: string;
  endTimeSlot?: string;
  estimatedHours?: number;
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

interface ScheduleTabProps {
  tab?: string;
  projectId: string;
  projectProfessionalId: string;
  projectStatus: string;
  tradeId?: string;
  accessToken: string | null;
  onMilestonesUpdate?: () => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  projectId,
  projectProfessionalId,
  projectStatus,
  tradeId,
  accessToken,
  onMilestonesUpdate,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  const isAwarded = projectStatus === 'awarded';

  // Helper to convert date string to ISO-8601 DateTime
  const toISODateTime = (dateStr: string | undefined): string | undefined => {
    if (!dateStr) return undefined;
    // If it's already in ISO format, return as is
    if (dateStr.includes('T')) return dateStr;
    // Convert YYYY-MM-DD to YYYY-MM-DDTHH:MM:SSZ
    return `${dateStr}T00:00:00Z`;
  };

  const formatWeekday = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  const formatDayMonth = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
  };

  const isSameDate = (date1?: string | null, date2?: string | null) => {
    if (!date1 || !date2) return true;
    return date1.split("T")[0] === date2.split("T")[0];
  };

  const getStatusPercent = (status: string, percentComplete: number) => {
    if (status === "completed") return 100;
    if (status === "not_started") return 0;
    return percentComplete;
  };

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
          const milestonesData = Array.isArray(data) ? data : data.milestones || [];
          console.log(`[ScheduleTab] Fetched ${milestonesData.length} milestones`);
          setMilestones(milestonesData);
        } else {
          // No milestones yet
          console.log('[ScheduleTab] No milestones found (404)');
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

  const handleSaveMilestone = async (milestone: {
    title: string;
    sequence: number;
    status: 'not_started' | 'in_progress' | 'completed';
    percentComplete: number;
    plannedStartDate?: string;
    plannedEndDate?: string;
    startTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    endTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    estimatedHours?: number;
    siteAccessRequired?: boolean;
    siteAccessNotes?: string;
    description?: string;
  }) => {
    try {
      setError(null);

      if (!accessToken) {
        setError('Authentication required');
        return;
      }

      // Normalize milestone data
      // Calculate next sequence if not provided
      const nextSequence = milestone.sequence || Math.max(...milestones.map(m => m.sequence || 0), 0) + 1;

      const data: any = {
        projectId,
        projectProfessionalId,
        title: milestone.title,
        sequence: nextSequence,
        status: milestone.status || 'not_started',
        percentComplete: milestone.percentComplete || 0,
        siteAccessRequired: milestone.siteAccessRequired ?? true,
      };

      // Only include optional fields if they have values
      if (milestone.description) data.description = milestone.description;
      if (milestone.plannedStartDate) data.plannedStartDate = toISODateTime(milestone.plannedStartDate);
      if (milestone.plannedEndDate) data.plannedEndDate = toISODateTime(milestone.plannedEndDate);
      if (milestone.startTimeSlot) data.startTimeSlot = milestone.startTimeSlot;
      if (milestone.endTimeSlot) data.endTimeSlot = milestone.endTimeSlot;
      if (milestone.estimatedHours !== undefined && milestone.estimatedHours !== null) data.estimatedHours = milestone.estimatedHours;
      if (milestone.siteAccessNotes) data.siteAccessNotes = milestone.siteAccessNotes;

      console.log('[ScheduleTab] Saving new milestone:', JSON.stringify(data, null, 2));

      const response = await fetch(
        `${API_BASE_URL}/milestones`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ScheduleTab] Save milestone error response:', errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to save milestone');
      }

      const savedMilestone = await response.json();
      
      // Add to local state
      setMilestones([...milestones, savedMilestone]);
      setIsAddingNew(false);
      onMilestonesUpdate?.();
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Task saved successfully', type: 'success' }
        }));
      }
    } catch (err) {
      console.error('Error saving milestone:', err);
      setError(err instanceof Error ? err.message : 'Failed to save task');
    }
  };

  const handleUpdateMilestone = async (milestoneId: string, updated: {
    title: string;
    sequence: number;
    status: 'not_started' | 'in_progress' | 'completed';
    percentComplete: number;
    plannedStartDate?: string;
    plannedEndDate?: string;
    startTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    endTimeSlot?: 'AM' | 'PM' | 'ALL_DAY';
    estimatedHours?: number;
    siteAccessRequired?: boolean;
    siteAccessNotes?: string;
    description?: string;
  }) => {
    try {
      setError(null);

      if (!accessToken) {
        setError('Authentication required');
        return;
      }

      // Normalize milestone data
      const data: any = {
        title: updated.title,
        status: updated.status || 'not_started',
        percentComplete: updated.percentComplete || 0,
        siteAccessRequired: updated.siteAccessRequired ?? true,
        description: updated.description,
      };

      // Only include optional fields if they have values
      if (updated.plannedStartDate) data.plannedStartDate = toISODateTime(updated.plannedStartDate);
      if (updated.plannedEndDate) data.plannedEndDate = toISODateTime(updated.plannedEndDate);
      if (updated.startTimeSlot) data.startTimeSlot = updated.startTimeSlot;
      if (updated.endTimeSlot) data.endTimeSlot = updated.endTimeSlot;
      if (updated.estimatedHours !== undefined && updated.estimatedHours !== null) data.estimatedHours = updated.estimatedHours;
      if (updated.siteAccessNotes) data.siteAccessNotes = updated.siteAccessNotes;

      console.log(`[ScheduleTab] Updating milestone ${milestoneId}:`, JSON.stringify(data, null, 2));

      const response = await fetch(
        `${API_BASE_URL}/milestones/${milestoneId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ScheduleTab] Update milestone error response:', errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to update milestone');
      }

      const updatedMilestone = await response.json();
      
      // Update local state
      setMilestones(milestones.map(m => m.id === milestoneId ? updatedMilestone : m));
      setEditingIndex(null);
      onMilestonesUpdate?.();
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Task updated successfully', type: 'success' }
        }));
      }
    } catch (err) {
      console.error('Error updating milestone:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    try {
      setError(null);

      if (!accessToken) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/milestones/${milestoneId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete milestone');
      }

      // Remove from local state
      setMilestones(milestones.filter(m => m.id !== milestoneId));
      setDeleteConfirmIndex(null);
      onMilestonesUpdate?.();
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Task deleted successfully', type: 'success' }
        }));
      }
    } catch (err) {
      console.error('Error deleting milestone:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleDeleteTask = (index: number) => {
    // Just show confirmation dialog
    setDeleteConfirmIndex(index);
  };

  const confirmDelete = () => {
    if (deleteConfirmIndex !== null) {
      const milestone = milestones[deleteConfirmIndex];
      handleDeleteMilestone(milestone.id);
    }
  };

  return (
    <div className="space-y-6">
      {!isAwarded ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 p-4">
          <p className="text-sm text-amber-200">
            📅 Schedule details will be available once the project is awarded to you.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/15 p-4">
              <p className="text-sm font-medium text-rose-200">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300">Loading schedule...</p>
            </div>
          ) : isAddingNew || editingIndex !== null ? (
            // FORM VIEW: Add/Edit mode
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">
                  {isAddingNew ? 'Add New Task' : 'Edit Task'}
                </h3>
              </div>

              <MilestoneEditor
                tradeId={tradeId || ''}
                showSavedList={false}
                defaultMilestones={
                  editingIndex !== null
                    ? [
                        {
                          title: milestones[editingIndex].title,
                          sequence: milestones[editingIndex].sequence,
                          status: milestones[editingIndex].status,
                          percentComplete: milestones[editingIndex].percentComplete,
                          plannedStartDate: milestones[editingIndex].plannedStartDate,
                          plannedEndDate: milestones[editingIndex].plannedEndDate,
                          description: milestones[editingIndex].description,
                          startTimeSlot: milestones[editingIndex].startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                          endTimeSlot: milestones[editingIndex].endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                          estimatedHours: milestones[editingIndex].estimatedHours,
                          siteAccessRequired: milestones[editingIndex].siteAccessRequired,
                          siteAccessNotes: milestones[editingIndex].siteAccessNotes,
                        },
                      ]
                    : []
                }
                onMilestonesChange={(updated) => {
                  if (editingIndex !== null) {
                    // Editing existing task - update the milestone with its ID
                    handleUpdateMilestone(milestones[editingIndex].id, updated[0]);
                  } else {
                    // Adding new task - save it
                    handleSaveMilestone(updated[0]);
                  }
                }}
              />

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setEditingIndex(null);
                    setIsAddingNew(false);
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : milestones.length === 0 ? (
            // EMPTY STATE
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-8 text-center">
              <p className="text-sm text-slate-300 mb-4">📋 No tasks set up yet.</p>
              <button
                onClick={() => setIsAddingNew(true)}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Add Task
              </button>
            </div>
          ) : (
            // LIST VIEW: Showing tasks
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Tasks</h3>
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  + Add Task
                </button>
              </div>

              {milestones.map((milestone, index) => {
                const statusPercent = getStatusPercent(milestone.status, milestone.percentComplete);
                const statusLabel =
                  statusPercent === 100 ? "Complete" :
                  statusPercent === 0 ? "Not Started" :
                  `${statusPercent}% Complete`;
                const showProgressBar = statusPercent > 0 && statusPercent < 100;
                const sameDate = isSameDate(milestone.plannedStartDate, milestone.plannedEndDate);

                return (
                  <div
                    key={milestone.id || index}
                    className="bg-slate-900/60 rounded-lg border border-slate-700 hover:bg-slate-800/60 transition overflow-hidden"
                  >
                    <div className="flex items-stretch">
                      {/* Date Box */}
                      <div className="w-24 bg-slate-900 text-white flex flex-col items-center justify-center px-2 py-3">
                        {sameDate ? (
                          <>
                            <div className="text-xs font-semibold uppercase tracking-wide">
                              {formatWeekday(milestone.plannedStartDate)}
                            </div>
                            <div className="text-sm font-semibold mt-1">
                              {formatDayMonth(milestone.plannedStartDate)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] font-semibold">
                              {formatDayMonth(milestone.plannedStartDate)}
                            </div>
                            <div className="text-[9px] font-medium my-0.5">thru</div>
                            <div className="text-[10px] font-semibold">
                              {formatDayMonth(milestone.plannedEndDate)}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 p-3 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-2">
                            <h4 className="text-base font-semibold text-white">
                              {milestone.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap mb-2">
                            <span className="text-xs text-slate-300">
                              {statusLabel}
                            </span>
                            {showProgressBar && (
                              <div className="w-24">
                                <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden border border-slate-600">
                                  <div
                                    className="absolute left-0 top-0 h-full bg-emerald-500"
                                    style={{ width: `${statusPercent}%` }}
                                  />
                                  <span className="relative z-10 block text-[8px] font-semibold text-white text-center leading-3">
                                    {statusPercent}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {milestone.accessDeclined && (
                            <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1">
                              <p className="text-[11px] font-semibold text-amber-200">
                                ⚠ Access blocked for requested date{milestone.plannedEndDate ? 's' : ''}
                              </p>
                              {milestone.accessDeclinedReason && (
                                <p className="text-[11px] text-amber-300">
                                  Client reason: {milestone.accessDeclinedReason}
                                </p>
                              )}
                            </div>
                          )}

                          {milestone.description && (
                            <p className="text-xs text-slate-300 mb-2">
                              {milestone.description}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setEditingIndex(index)}
                            className="p-2 text-slate-300 hover:bg-slate-700 rounded transition"
                            title="Edit task"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(index)}
                            className="p-2 text-slate-300 hover:bg-rose-500/20 hover:text-rose-200 rounded transition"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Task?</h3>
            <p className="text-sm text-slate-300 mb-6">
              Are you sure you want to delete <strong>{milestones[deleteConfirmIndex]?.title}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmIndex(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-100 bg-slate-800 rounded hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded hover:bg-rose-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
