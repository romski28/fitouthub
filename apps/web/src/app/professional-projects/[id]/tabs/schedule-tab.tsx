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

  const handleMilestonesChange = async (updatedMilestones: Array<{
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
  }>) => {
    try {
      setError(null);

      if (!accessToken) {
        setError('Authentication required');
        return;
      }

      // Use batch endpoint to replace all milestones at once
      const response = await fetch(
        `${API_BASE_URL}/milestones/batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            projectId,
            projectProfessionalId,
            milestones: updatedMilestones.map(m => ({
              projectProfessionalId,
              title: m.title,
              description: m.description,
              sequence: m.sequence,
              status: m.status,
              percentComplete: m.percentComplete,
              plannedStartDate: toISODateTime(m.plannedStartDate),
              plannedEndDate: toISODateTime(m.plannedEndDate),
              startTimeSlot: m.startTimeSlot,
              endTimeSlot: m.endTimeSlot,
              estimatedHours: m.estimatedHours,
              siteAccessRequired: m.siteAccessRequired,
              siteAccessNotes: m.siteAccessNotes,
            })),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save milestones');
      }

      const savedMilestones = await response.json();
      
      // Update local state with saved milestones
      setMilestones(Array.isArray(savedMilestones) ? savedMilestones : []);
      setEditingIndex(null);
      setIsAddingNew(false);
      onMilestonesUpdate?.();
      
      // Show success message
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Schedule saved successfully', type: 'success' }
        }));
      }
    } catch (err) {
      console.error('Error saving milestones:', err);
      setError(err instanceof Error ? err.message : 'Failed to save milestones');
    }
  };

  const handleDeleteTask = (index: number) => {
    const newMilestones = milestones.filter((_, i) => i !== index);
    handleMilestonesChange(newMilestones.map(m => ({
      title: m.title,
      sequence: m.sequence,
      status: m.status,
      percentComplete: m.percentComplete,
      plannedStartDate: m.plannedStartDate,
      plannedEndDate: m.plannedEndDate,
      description: m.description,
      startTimeSlot: m.startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
      endTimeSlot: m.endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
      estimatedHours: m.estimatedHours,
      siteAccessRequired: m.siteAccessRequired,
      siteAccessNotes: m.siteAccessNotes,
    })));
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
          ) : isAddingNew || editingIndex !== null ? (
            // FORM VIEW: Add/Edit mode
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  {isAddingNew ? 'Add New Task' : 'Edit Task'}
                </h3>
              </div>

              <MilestoneEditor
                tradeId={tradeId || ''}
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
                    // Editing existing task
                    const newMilestones = [...milestones];
                    newMilestones[editingIndex] = {
                      ...newMilestones[editingIndex],
                      ...updated[0],
                    };
                    handleMilestonesChange(
                      newMilestones.map(m => ({
                        title: m.title,
                        sequence: m.sequence,
                        status: m.status,
                        percentComplete: m.percentComplete,
                        plannedStartDate: m.plannedStartDate,
                        plannedEndDate: m.plannedEndDate,
                        description: m.description,
                        startTimeSlot: m.startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                        endTimeSlot: m.endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                        estimatedHours: m.estimatedHours,
                        siteAccessRequired: m.siteAccessRequired,
                        siteAccessNotes: m.siteAccessNotes,
                      }))
                    );
                  } else {
                    // Adding new task
                    handleMilestonesChange([
                      ...milestones.map(m => ({
                        title: m.title,
                        sequence: m.sequence,
                        status: m.status,
                        percentComplete: m.percentComplete,
                        plannedStartDate: m.plannedStartDate,
                        plannedEndDate: m.plannedEndDate,
                        description: m.description,
                        startTimeSlot: m.startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                        endTimeSlot: m.endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                        estimatedHours: m.estimatedHours,
                        siteAccessRequired: m.siteAccessRequired,
                        siteAccessNotes: m.siteAccessNotes,
                      })),
                      updated[0],
                    ]);
                  }
                }}
              />

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setEditingIndex(null);
                    setIsAddingNew(false);
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : milestones.length === 0 ? (
            // EMPTY STATE
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600 mb-4">📋 No tasks set up yet.</p>
              <button
                onClick={() => setIsAddingNew(true)}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Add Task
              </button>
            </div>
          ) : (
            // LIST VIEW: Showing tasks
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Tasks</h3>
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
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
                    className="bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition overflow-hidden"
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
                            <h4 className="text-base font-semibold text-slate-900">
                              {milestone.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap mb-2">
                            <span className="text-xs text-slate-600">
                              {statusLabel}
                            </span>
                            {showProgressBar && (
                              <div className="w-24">
                                <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                                  <div
                                    className="absolute left-0 top-0 h-full bg-emerald-500"
                                    style={{ width: `${statusPercent}%` }}
                                  />
                                  <span className="relative z-10 block text-[8px] font-semibold text-slate-800 text-center leading-3">
                                    {statusPercent}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {milestone.description && (
                            <p className="text-xs text-slate-600 mb-2">
                              {milestone.description}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setEditingIndex(index)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded transition"
                            title="Edit task"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(index)}
                            className="p-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded transition"
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
    </div>
  );
};
