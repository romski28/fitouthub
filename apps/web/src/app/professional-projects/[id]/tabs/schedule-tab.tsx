'use client';

import React, { useEffect, useState } from 'react';
import { MilestoneEditor } from '@/components/milestone-editor';
import { API_BASE_URL } from '@/config/api';
import { Pencil, Trash2, GripVertical } from 'lucide-react';

interface Milestone {
  id: string;
  projectId: string;
  projectProfessionalId?: string;
  title: string;
  isFinancial?: boolean;
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

interface StartProposal {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'superseded' | string;
  proposedStartAt: string;
  durationMinutes: number;
  notes?: string | null;
  responseNotes?: string | null;
  respondedAt?: string | null;
  projectedEndAt?: string;
  createdAt: string;
}

interface ScheduleTabProps {
  tab?: string;
  projectId: string;
  projectProfessionalId: string;
  projectStatus: string;
  quoteEstimatedStartAt?: string;
  quoteEstimatedDurationMinutes?: number;
  tradeId?: string;
  accessToken: string | null;
  onMilestonesUpdate?: () => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  projectId,
  projectProfessionalId,
  projectStatus,
  quoteEstimatedStartAt,
  quoteEstimatedDurationMinutes,
  tradeId,
  accessToken,
  onMilestonesUpdate,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [startProposals, setStartProposals] = useState<StartProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [draggedMilestoneId, setDraggedMilestoneId] = useState<string | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [resettingDefaults, setResettingDefaults] = useState(false);
  const [proposalDate, setProposalDate] = useState('');
  const [proposalTime, setProposalTime] = useState('09:00');
  const [proposalDurationHours, setProposalDurationHours] = useState('4');
  const [proposalNotes, setProposalNotes] = useState('');
  const [proposalFormInitialized, setProposalFormInitialized] = useState(false);
  const [prefilledFromQuote, setPrefilledFromQuote] = useState(false);

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

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleString('en-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDuration = (durationMinutes?: number) => {
    if (!durationMinutes) return 'Not set';
    if (durationMinutes < 60) return `${durationMinutes} min`;
    const hours = durationMinutes / 60;
    return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)} hour${hours === 1 ? '' : 's'}`;
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

  useEffect(() => {
    if (!projectId || !accessToken || !isAwarded) return;

    const fetchStartProposals = async () => {
      try {
        setProposalLoading(true);
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/start-proposals`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok && response.status !== 404) {
          throw new Error('Failed to load start proposal');
        }

        if (!response.ok) {
          setStartProposals([]);
          return;
        }

        const data = await response.json();
        setStartProposals(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching start proposals:', err);
        setError(err instanceof Error ? err.message : 'Failed to load start proposal');
      } finally {
        setProposalLoading(false);
      }
    };

    fetchStartProposals();
  }, [projectId, accessToken, isAwarded]);

  const handleSubmitStartProposal = async () => {
    if (!accessToken) {
      setError('Authentication required');
      return;
    }

    if (!proposalDate || !proposalTime) {
      setError('Please choose a proposed start date and time');
      return;
    }

    const durationHours = Number(proposalDurationHours);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      setError('Please enter a valid duration');
      return;
    }

    const scheduledAt = new Date(`${proposalDate}T${proposalTime}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError('Please enter a valid start date and time');
      return;
    }

    try {
      setProposalSubmitting(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/start-proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: Math.round(durationHours * 60),
          notes: proposalNotes || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send start proposal');
      }

      if (data?.proposal) {
        setStartProposals((prev) => [data.proposal, ...prev.filter((p) => p.id !== data.proposal.id)]);
      }
      setProposalNotes('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Start proposal sent to client', type: 'success' }
        }));
      }
    } catch (err) {
      console.error('Error submitting start proposal:', err);
      setError(err instanceof Error ? err.message : 'Failed to send start proposal');
    } finally {
      setProposalSubmitting(false);
    }
  };

  const latestStartProposal = startProposals[0];

  useEffect(() => {
    if (!isAwarded || proposalFormInitialized) return;

    if (latestStartProposal?.proposedStartAt) {
      const start = new Date(latestStartProposal.proposedStartAt);
      if (!Number.isNaN(start.getTime())) {
        const pad = (value: number) => String(value).padStart(2, '0');
        setProposalDate(
          `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        );
        setProposalTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
      }

      if (latestStartProposal.durationMinutes) {
        const hours = latestStartProposal.durationMinutes / 60;
        setProposalDurationHours(
          Number.isInteger(hours)
            ? String(hours)
            : hours.toFixed(1).replace(/\.0$/, ''),
        );
      }

      setProposalNotes(latestStartProposal.notes || '');
      setPrefilledFromQuote(false);
      setProposalFormInitialized(true);
      return;
    }

    if (quoteEstimatedStartAt) {
      const quotedStart = new Date(quoteEstimatedStartAt);
      if (!Number.isNaN(quotedStart.getTime())) {
        const pad = (value: number) => String(value).padStart(2, '0');
        setProposalDate(
          `${quotedStart.getFullYear()}-${pad(quotedStart.getMonth() + 1)}-${pad(quotedStart.getDate())}`,
        );
        setProposalTime(`${pad(quotedStart.getHours())}:${pad(quotedStart.getMinutes())}`);
      }

      if (quoteEstimatedDurationMinutes) {
        const quotedHours = quoteEstimatedDurationMinutes / 60;
        setProposalDurationHours(
          Number.isInteger(quotedHours)
            ? String(quotedHours)
            : quotedHours.toFixed(1).replace(/\.0$/, ''),
        );
      }

      setPrefilledFromQuote(true);
      setProposalFormInitialized(true);
    }
  }, [
    isAwarded,
    latestStartProposal,
    proposalFormInitialized,
    quoteEstimatedStartAt,
    quoteEstimatedDurationMinutes,
  ]);

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
      const existingWorkMilestones = milestones.filter((item) => !item.isFinancial);
      const nextSequence = milestone.sequence || Math.max(...existingWorkMilestones.map(m => m.sequence || 0), 0) + 1;

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
      const workMilestones = milestones
        .filter((milestone) => !milestone.isFinancial)
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      const milestone = workMilestones[deleteConfirmIndex];
      if (!milestone) {
        setDeleteConfirmIndex(null);
        return;
      }
      handleDeleteMilestone(milestone.id);
    }
  };

  const financialMilestones = milestones
    .filter((milestone) => !!milestone.isFinancial)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const workMilestones = milestones
    .filter((milestone) => !milestone.isFinancial)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const persistWorkMilestoneOrder = async (orderedWorkMilestones: Milestone[]) => {
    if (!accessToken) return;

    const originalById = new Map(
      milestones.map((milestone) => [milestone.id, milestone.sequence]),
    );

    const changed = orderedWorkMilestones.filter((milestone, index) => {
      const nextSequence = index + 1;
      return originalById.get(milestone.id) !== nextSequence;
    });

    if (!changed.length) return;

    setReorderSaving(true);
    try {
      await Promise.all(
        changed.map((milestone, index) =>
          fetch(`${API_BASE_URL}/milestones/${milestone.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ sequence: orderedWorkMilestones.indexOf(milestone) + 1 }),
          }).then(async (response) => {
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              throw new Error(data.message || `Failed to reorder task ${index + 1}`);
            }
          }),
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save new task order';
      setError(message);
    } finally {
      setReorderSaving(false);
    }
  };

  const handleDropMilestone = async (targetMilestoneId: string) => {
    if (!draggedMilestoneId || draggedMilestoneId === targetMilestoneId) {
      setDraggedMilestoneId(null);
      return;
    }

    const current = [...workMilestones];
    const fromIndex = current.findIndex((milestone) => milestone.id === draggedMilestoneId);
    const toIndex = current.findIndex((milestone) => milestone.id === targetMilestoneId);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggedMilestoneId(null);
      return;
    }

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const reSequenced = current.map((milestone, index) => ({
      ...milestone,
      sequence: index + 1,
    }));

    const financial = milestones.filter((milestone) => !!milestone.isFinancial);
    setMilestones([...financial, ...reSequenced]);
    setDraggedMilestoneId(null);
    await persistWorkMilestoneOrder(reSequenced);
    onMilestonesUpdate?.();
  };

  const handleResetMilestonesToDefault = async () => {
    if (!accessToken || !projectProfessionalId) {
      setError('Authentication required');
      return;
    }

    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(
            'Reset this project to the default class-based financial milestone spine? This will remove your current non-financial milestones and restore the default financial schedule milestones.',
          )
        : false;

    if (!confirmed) return;

    try {
      setResettingDefaults(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/milestones/project-professional/${projectProfessionalId}/reset-default`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset milestones to default');
      }

      const refreshed = await fetch(
        `${API_BASE_URL}/milestones/project-professional/${projectProfessionalId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (refreshed.ok) {
        const refreshedData = await refreshed.json();
        const milestonesData = Array.isArray(refreshedData) ? refreshedData : refreshedData?.milestones || [];
        setMilestones(milestonesData);
      }

      onMilestonesUpdate?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: 'Milestones reset to default successfully', type: 'success' },
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset milestones to default');
    } finally {
      setResettingDefaults(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 space-y-6">
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

          <div className="flex items-center justify-between rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Schedule Actions</h3>
              <p className="text-xs text-slate-400">Review the default financial milestone spine, then add and manage any extra non-financial work tasks.</p>
            </div>
            <div className="flex items-center gap-3">
              {reorderSaving && <span className="text-xs text-slate-300">Saving order...</span>}
              <button
                onClick={handleResetMilestonesToDefault}
                disabled={resettingDefaults}
                className="inline-flex items-center justify-center rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                {resettingDefaults ? 'Resetting...' : 'Reset to Defaults'}
              </button>
              <button
                onClick={() => setIsAddingNew(true)}
                disabled={isAddingNew || editingIndex !== null}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                + Add Task
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Simple lane</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Propose start date, time and duration</h3>
                <p className="mt-2 text-sm text-slate-200">
                  Best for simple jobs. For more involved work, keep using the detailed task schedule below as the progress and payment lane.
                </p>
                {latestStartProposal && (
                  <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">Latest proposal:</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${
                        latestStartProposal.status === 'accepted'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : latestStartProposal.status === 'proposed'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : latestStartProposal.status === 'declined'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                      }`}>
                        {latestStartProposal.status}
                      </span>
                    </div>
                    <p className="mt-2">Start: <span className="font-medium text-white">{formatDateTime(latestStartProposal.proposedStartAt)}</span></p>
                    <p>Estimated duration: <span className="font-medium text-white">{formatDuration(latestStartProposal.durationMinutes)}</span></p>
                    {latestStartProposal.projectedEndAt && (
                      <p>Estimated finish: <span className="font-medium text-white">{formatDateTime(latestStartProposal.projectedEndAt)}</span></p>
                    )}
                    {latestStartProposal.notes && <p className="mt-2 text-slate-300">Notes: {latestStartProposal.notes}</p>}
                    {latestStartProposal.responseNotes && <p className="mt-2 text-slate-300">Client response: {latestStartProposal.responseNotes}</p>}
                  </div>
                )}
              </div>

              <div className="w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                {prefilledFromQuote && !latestStartProposal && (
                  <div className="mb-3 rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs text-sky-200">
                    Prefilled from your awarded quote timing. Confirm and send this to the client for approval.
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm text-slate-200">
                    <span className="mb-1 block">Start date</span>
                    <input
                      type="date"
                      value={proposalDate}
                      onChange={(e) => {
                        setProposalDate(e.target.value);
                        setPrefilledFromQuote(false);
                        setProposalFormInitialized(true);
                      }}
                      className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>
                  <label className="text-sm text-slate-200">
                    <span className="mb-1 block">Start time</span>
                    <input
                      type="time"
                      value={proposalTime}
                      onChange={(e) => {
                        setProposalTime(e.target.value);
                        setPrefilledFromQuote(false);
                        setProposalFormInitialized(true);
                      }}
                      className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>
                  <label className="text-sm text-slate-200">
                    <span className="mb-1 block">Duration (hrs)</span>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={proposalDurationHours}
                      onChange={(e) => {
                        setProposalDurationHours(e.target.value);
                        setPrefilledFromQuote(false);
                        setProposalFormInitialized(true);
                      }}
                      className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>
                </div>
                <label className="mt-3 block text-sm text-slate-200">
                  <span className="mb-1 block">Notes for client</span>
                  <textarea
                    rows={3}
                    value={proposalNotes}
                    onChange={(e) => {
                      setProposalNotes(e.target.value);
                      setPrefilledFromQuote(false);
                      setProposalFormInitialized(true);
                    }}
                    placeholder="Optional notes about access, materials, or timing"
                    className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">
                    {proposalLoading ? 'Loading previous proposals…' : 'You can revise by sending an updated proposal.'}
                  </p>
                  <button
                    onClick={handleSubmitStartProposal}
                    disabled={proposalSubmitting}
                    className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {proposalSubmitting
                      ? 'Sending…'
                      : latestStartProposal?.status === 'proposed'
                        ? 'Update Proposal'
                        : prefilledFromQuote
                          ? 'Confirm & Send to Client'
                          : 'Send Proposal'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center">
              <p className="text-sm text-slate-300">Loading schedule...</p>
            </div>
          ) : isAddingNew || editingIndex !== null ? (
            // FORM VIEW: Add/Edit mode
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-6">
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
                          title: workMilestones[editingIndex].title,
                          sequence: workMilestones[editingIndex].sequence,
                          status: workMilestones[editingIndex].status,
                          percentComplete: workMilestones[editingIndex].percentComplete,
                          plannedStartDate: workMilestones[editingIndex].plannedStartDate,
                          plannedEndDate: workMilestones[editingIndex].plannedEndDate,
                          description: workMilestones[editingIndex].description,
                          startTimeSlot: workMilestones[editingIndex].startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                          endTimeSlot: workMilestones[editingIndex].endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                          estimatedHours: workMilestones[editingIndex].estimatedHours,
                          siteAccessRequired: workMilestones[editingIndex].siteAccessRequired,
                          siteAccessNotes: workMilestones[editingIndex].siteAccessNotes,
                        },
                      ]
                    : []
                }
                onMilestonesChange={(updated) => {
                  if (editingIndex !== null) {
                    // Editing existing task - update the milestone with its ID
                    handleUpdateMilestone(workMilestones[editingIndex].id, updated[0]);
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
          ) : (
            // LIST VIEW: Showing financial milestone spine + additional work tasks
            <div className="space-y-6">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Financial Milestones</h3>
                    <p className="text-xs text-slate-300 mt-1">
                      These class-based milestones drive the payment plan shown in Financials.
                    </p>
                  </div>
                  <span className="text-xs text-blue-200">
                    {financialMilestones.length} linked payment milestone{financialMilestones.length === 1 ? '' : 's'}
                  </span>
                </div>

                {financialMilestones.length === 0 ? (
                  <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
                    No financial milestones have been generated yet. Reset to defaults or review the Financials tab.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {financialMilestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className="rounded-md border border-blue-500/30 bg-slate-900/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-white">{milestone.title}</h4>
                              <span className="rounded-full border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                                Financial
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-300">
                              Start: <span className="text-white">{formatDateTime(milestone.plannedStartDate)}</span>
                            </p>
                            <p className="text-xs text-slate-300">
                              Due / finish: <span className="text-white">{formatDateTime(milestone.plannedEndDate || milestone.plannedStartDate)}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-semibold uppercase text-slate-400">Status</p>
                            <p className="text-xs text-white">{milestone.status.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Additional Work Tasks</h3>
                    <p className="text-xs text-slate-400 mt-1">Drag and drop to reorder extra non-financial schedule tasks.</p>
                  </div>
                  <span className="text-xs text-slate-400">Non-financial milestones only</span>
                </div>

                {workMilestones.length === 0 ? (
                  <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center">
                    <p className="text-sm text-slate-300 mb-4">📋 No extra work tasks yet.</p>
                    <button
                      onClick={() => setIsAddingNew(true)}
                      className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      Add Task
                    </button>
                  </div>
                ) : workMilestones.map((milestone, index) => {
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
                    className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg border border-slate-700 hover:from-slate-800 hover:to-slate-700 transition overflow-hidden"
                    draggable
                    onDragStart={() => setDraggedMilestoneId(milestone.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropMilestone(milestone.id)}
                    onDragEnd={() => setDraggedMilestoneId(null)}
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
                            type="button"
                            className="p-2 text-slate-300 hover:bg-slate-700 rounded transition cursor-grab"
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
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
              Are you sure you want to delete <strong>{workMilestones[deleteConfirmIndex]?.title}</strong>? This action cannot be undone.
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
