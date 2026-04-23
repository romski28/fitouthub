'use client';

import React, { useEffect, useState } from 'react';
import { MilestoneEditor } from '@/components/milestone-editor';
import { API_BASE_URL } from '@/config/api';
import { Pencil, Trash2, GripVertical } from 'lucide-react';
import { StartDateNegotiationPanel } from '@/components/start-date-negotiation-panel';

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

// StartProposal is imported as StartProposalRow from the shared component
// Keeping a local alias for backward compatibility within this file
interface StartProposal {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'superseded' | string;
  proposedByRole?: 'professional' | 'client' | string;
  proposedByUserId?: string | null;
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
  projectCurrentStage?: string;
  quoteEstimatedStartAt?: string;
  quoteEstimatedDurationMinutes?: number;
  tradeId?: string;
  accessToken: string | null;
  onMilestonesUpdate?: () => void;
  hideStartNegotiationPanel?: boolean;
  onScheduleConfirmed?: () => void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  projectId,
  projectProfessionalId,
  projectStatus,
  projectCurrentStage,
  quoteEstimatedStartAt,
  quoteEstimatedDurationMinutes,
  tradeId,
  accessToken,
  onMilestonesUpdate,
  hideStartNegotiationPanel = false,
  onScheduleConfirmed,
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [startProposals, setStartProposals] = useState<StartProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
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
  const [percentDraftByMilestone, setPercentDraftByMilestone] = useState<Record<string, string>>({});
  const [proposalResponseNotes, setProposalResponseNotes] = useState<Record<string, string>>({});
  const [updateDateByProposal, setUpdateDateByProposal] = useState<Record<string, string>>({});
  const [updateTimeByProposal, setUpdateTimeByProposal] = useState<Record<string, string>>({});
  const [scheduleNextStep, setScheduleNextStep] = useState<{ actionKey: string; actionLabel: string; description?: string } | null>(null);
  const [nextStepLoading, setNextStepLoading] = useState(false);
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);

  const contractWorkflowStages = new Set([
    'CONTRACT_PHASE',
    'PRE_WORK',
    'WORK_IN_PROGRESS',
    'MILESTONE_PENDING',
    'PAYMENT_RELEASED',
    'NEAR_COMPLETION',
    'FINAL_INSPECTION',
    'COMPLETE',
    'WARRANTY_PERIOD',
    'CLOSED',
  ]);
  const normalizedStage = String(projectCurrentStage || '').toUpperCase();
  const isInContractWorkflow = projectStatus === 'awarded' || contractWorkflowStages.has(normalizedStage);

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

  const fetchMilestones = React.useCallback(async (options?: { silent?: boolean }) => {
    if (!projectProfessionalId) return;

    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/milestones/project-professional/${projectProfessionalId}?_ts=${Date.now()}`,
        {
          cache: 'no-store',
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
        setPercentDraftByMilestone(
          milestonesData.reduce((acc: Record<string, string>, milestone: Milestone) => {
            acc[milestone.id] = String(Math.max(0, Math.min(100, milestone.percentComplete || 0)));
            return acc;
          }, {}),
        );
      } else {
        console.log('[ScheduleTab] No milestones found (404)');
        setMilestones([]);
      }
    } catch (err) {
      console.error('Error fetching milestones:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [projectProfessionalId, accessToken]);

  // Fetch milestones
  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  useEffect(() => {
    if (!projectId || !accessToken || !isInContractWorkflow) return;

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
  }, [projectId, accessToken, isInContractWorkflow]);

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
  const startDateAgreed = latestStartProposal?.status === 'accepted';

  const handleRespondStartProposal = async (proposalId: string, status: 'accepted' | 'updated') => {
    if (!accessToken) {
      setError('Authentication required');
      return;
    }

    if (status === 'updated') {
      const date = updateDateByProposal[proposalId];
      const time = updateTimeByProposal[proposalId] || '09:00';
      const updatedAt = date ? new Date(`${date}T${time}`) : null;
      if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
        setError('Please provide a valid counter-proposed start date and time.');
        return;
      }
    }

    try {
      setError(null);
      setProposalBusyId(proposalId);

      const response = await fetch(`${API_BASE_URL}/projects/start-proposals/${proposalId}/respond`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(
          status === 'updated'
            ? {
                status: 'updated',
                updatedScheduledAt: (() => {
                  const date = updateDateByProposal[proposalId];
                  const time = updateTimeByProposal[proposalId] || '09:00';
                  if (!date) return undefined;
                  return new Date(`${date}T${time}`).toISOString();
                })(),
                responseNotes: proposalResponseNotes[proposalId] || undefined,
              }
            : {
                status,
                responseNotes: proposalResponseNotes[proposalId] || undefined,
              },
        ),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to respond to client update');
      }

      await (async () => {
        const refreshResponse = await fetch(`${API_BASE_URL}/projects/${projectId}/start-proposals`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const refreshData = await refreshResponse.json().catch(() => []);
        if (refreshResponse.ok) {
          setStartProposals(Array.isArray(refreshData) ? refreshData : []);
        }
      })();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: status === 'accepted' ? 'Client update accepted' : 'Counter proposal sent to client',
            type: 'success',
          }
        }));
      }
    } catch (err) {
      console.error('Error responding to start proposal:', err);
      setError(err instanceof Error ? err.message : 'Failed to respond to client update');
    } finally {
      setProposalBusyId(null);
    }
  };

  useEffect(() => {
    if (!isInContractWorkflow || proposalFormInitialized) return;

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
    isInContractWorkflow,
    latestStartProposal,
    proposalFormInitialized,
    quoteEstimatedStartAt,
    quoteEstimatedDurationMinutes,
  ]);

  const openProposal = startProposals.find((p) => p.status === 'proposed') ?? null;

  useEffect(() => {
    if (!openProposal?.id) return;
    const d = new Date(openProposal.proposedStartAt);
    if (Number.isNaN(d.getTime())) return;
    const pad = (v: number) => String(v).padStart(2, '0');
    const dateVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeVal = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setUpdateDateByProposal((prev) => ({ ...prev, [openProposal.id]: prev[openProposal.id] ?? dateVal }));
    setUpdateTimeByProposal((prev) => ({ ...prev, [openProposal.id]: prev[openProposal.id] ?? timeVal }));
  }, [openProposal?.id, openProposal?.proposedStartAt]);

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

  const handleSavePercentComplete = async (milestone: Milestone) => {
    const rawValue = percentDraftByMilestone[milestone.id] ?? String(milestone.percentComplete || 0);
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
      setError('Percent complete must be between 0 and 100');
      return;
    }

    await handleUpdateMilestone(milestone.id, {
      title: milestone.title,
      sequence: milestone.sequence,
      status: numericValue >= 100 ? 'completed' : numericValue <= 0 ? 'not_started' : 'in_progress',
      percentComplete: Math.round(numericValue),
      plannedStartDate: milestone.plannedStartDate,
      plannedEndDate: milestone.plannedEndDate,
      startTimeSlot: milestone.startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
      endTimeSlot: milestone.endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
      estimatedHours: milestone.estimatedHours,
      siteAccessRequired: milestone.siteAccessRequired,
      siteAccessNotes: milestone.siteAccessNotes,
      description: milestone.description,
    });
  };

  const financialMilestones = milestones
    .filter((milestone) => !!milestone.isFinancial)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const workMilestones = milestones
    .filter((milestone) => !milestone.isFinancial)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const combinedMilestones = [...milestones].sort((a, b) => {
    const aDate = a.plannedStartDate || a.plannedEndDate || '';
    const bDate = b.plannedStartDate || b.plannedEndDate || '';
    const aTime = aDate ? new Date(aDate).getTime() : Number.POSITIVE_INFINITY;
    const bTime = bDate ? new Date(bDate).getTime() : Number.POSITIVE_INFINITY;

    if (aTime !== bTime) return aTime - bTime;
    if ((a.sequence || 0) !== (b.sequence || 0)) return (a.sequence || 0) - (b.sequence || 0);
    if (!!a.isFinancial !== !!b.isFinancial) return a.isFinancial ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  const confirmDelete = () => {
    if (deleteConfirmIndex !== null) {
      const milestone = combinedMilestones[deleteConfirmIndex];
      if (!milestone || milestone.isFinancial) {
        setDeleteConfirmIndex(null);
        return;
      }
      handleDeleteMilestone(milestone.id);
    }
  };

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

      await fetchMilestones({ silent: true });

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

  const fetchNextSteps = React.useCallback(async () => {
    if (!projectId || !accessToken || !isInContractWorkflow) return;
    setNextStepLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/next-steps`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      const primary: Array<{ actionKey: string; actionLabel: string; description?: string }> = data.PRIMARY ?? [];
      const followUp = primary.find((s) => s.actionKey === 'START_PROJECT' || s.actionKey === 'WAIT_FOR_CLIENT_FUNDS');
      setScheduleNextStep(followUp ?? null);
    } catch {
      // silently ignore — schedule confirmation state is nice-to-have
    } finally {
      setNextStepLoading(false);
    }
  }, [projectId, accessToken, isInContractWorkflow]);

  useEffect(() => {
    fetchNextSteps();
  }, [fetchNextSteps]);

  const handleConfirmSchedule = async () => {
    if (!projectId || !accessToken || confirmingSchedule) return;
    setConfirmingSchedule(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/next-steps/CONFIRM_SCHEDULE`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userAction: 'COMPLETED' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to confirm schedule');
      }
      await fetchNextSteps();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Schedule confirmed', type: 'success' },
        }));
      }
      onScheduleConfirmed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm schedule');
    } finally {
      setConfirmingSchedule(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 space-y-6">
      {!isInContractWorkflow ? (
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

          {!hideStartNegotiationPanel ? (
            <StartDateNegotiationPanel
              proposals={startProposals}
              proposalLoading={proposalLoading}
              proposalBusyId={proposalBusyId}
              updateDateByProposal={updateDateByProposal}
              updateTimeByProposal={updateTimeByProposal}
              proposalResponseNotes={proposalResponseNotes}
              setUpdateDateByProposal={setUpdateDateByProposal}
              setUpdateTimeByProposal={setUpdateTimeByProposal}
              setProposalResponseNotes={setProposalResponseNotes}
              onRespond={handleRespondStartProposal}
              viewerRole="professional"
              onSubmitNew={handleSubmitStartProposal}
              proposalSubmitting={proposalSubmitting}
              proposalDate={proposalDate}
              proposalTime={proposalTime}
              proposalDurationHours={proposalDurationHours}
              proposalNotes={proposalNotes}
              prefilledFromQuote={prefilledFromQuote}
              setProposalDate={setProposalDate}
              setProposalTime={setProposalTime}
              setProposalDurationHours={setProposalDurationHours}
              setProposalNotes={setProposalNotes}
              setPrefilledFromQuote={setPrefilledFromQuote}
              setProposalFormInitialized={setProposalFormInitialized}
              allowDurationEdit={false}
            />
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Schedule</h3>
                <p className="text-xs text-slate-400 mt-0.5">Milestone name, start, finish and % complete.</p>
              </div>
              <span className="text-xs text-slate-400">{financialMilestones.length} financial · {workMilestones.length} non-financial</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3">
              <p className="text-xs text-slate-400">Review the default financial milestone spine, then add and manage any extra non-financial work tasks.</p>
              <div className="flex items-center gap-2 flex-wrap">
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
                {!scheduleNextStep && !nextStepLoading && (
                  <button
                    onClick={handleConfirmSchedule}
                    disabled={confirmingSchedule}
                    className="inline-flex items-center justify-center rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {confirmingSchedule ? 'Confirming…' : '✓ Confirm Schedule'}
                  </button>
                )}
              </div>
            </div>

            {scheduleNextStep && (
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
                <span className="mt-0.5 text-lg leading-none">✅</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-200">Schedule confirmed</p>
                  {scheduleNextStep.description && (
                    <p className="mt-0.5 text-xs text-slate-300">{scheduleNextStep.description}</p>
                  )}
                  <p className="mt-2 text-sm font-semibold text-white">
                    Next step: {scheduleNextStep.actionLabel}{' '}
                    {scheduleNextStep.actionKey === 'START_PROJECT' ? '🚀' : '⏳'}
                  </p>
                </div>
              </div>
            )}

          {loading ? (
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center">
              <p className="text-sm text-slate-300">Loading schedule...</p>
            </div>
          ) : isAddingNew || editingIndex !== null ? (
            // FORM VIEW: Add/Edit mode
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">
                  {isAddingNew ? 'Add New Task' : 'Edit Milestone'}
                </h3>
              </div>

              <MilestoneEditor
                tradeId={tradeId || ''}
                showSavedList={false}
                defaultMilestones={
                  editingIndex !== null
                    ? [
                        {
                          title: combinedMilestones[editingIndex].title,
                          sequence: combinedMilestones[editingIndex].sequence,
                          status: combinedMilestones[editingIndex].status,
                          percentComplete: combinedMilestones[editingIndex].percentComplete,
                          plannedStartDate: combinedMilestones[editingIndex].plannedStartDate,
                          plannedEndDate: combinedMilestones[editingIndex].plannedEndDate,
                          description: combinedMilestones[editingIndex].description,
                          startTimeSlot: combinedMilestones[editingIndex].startTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                          endTimeSlot: combinedMilestones[editingIndex].endTimeSlot as 'AM' | 'PM' | 'ALL_DAY' | undefined,
                          estimatedHours: combinedMilestones[editingIndex].estimatedHours,
                          siteAccessRequired: combinedMilestones[editingIndex].siteAccessRequired,
                          siteAccessNotes: combinedMilestones[editingIndex].siteAccessNotes,
                        },
                      ]
                    : []
                }
                onMilestonesChange={(updated) => {
                  if (editingIndex !== null) {
                    handleUpdateMilestone(combinedMilestones[editingIndex].id, updated[0]);
                  } else {
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
          ) : combinedMilestones.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center">
              <p className="text-sm text-slate-300 mb-4">📋 No milestones set up yet.</p>
              <button
                onClick={() => setIsAddingNew(true)}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Add Task
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-950/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Milestone</th>
                      <th className="px-3 py-2 text-left font-semibold">Start</th>
                      <th className="px-3 py-2 text-left font-semibold">Finish</th>
                      <th className="px-3 py-2 text-left font-semibold">% Complete</th>
                      <th className="px-3 py-2 text-left font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedMilestones.map((milestone, index) => {
                      const isFinancialMilestone = !!milestone.isFinancial;
                      return (
                        <tr key={milestone.id || index} className="border-b border-slate-800">
                          <td className="px-3 py-3 text-white">
                            <span className="font-semibold">{isFinancialMilestone ? '💰 ' : ''}{milestone.title}</span>
                            {isFinancialMilestone ? (
                              <span className="ml-2 rounded-full border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                                Financial
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-slate-300">{formatDayMonth(milestone.plannedStartDate) || 'No date'}</td>
                          <td className="px-3 py-3 text-slate-300">{formatDayMonth(milestone.plannedEndDate) || 'No date'}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={percentDraftByMilestone[milestone.id] ?? String(milestone.percentComplete || 0)}
                                onChange={(e) =>
                                  setPercentDraftByMilestone((prev) => ({
                                    ...prev,
                                    [milestone.id]: e.target.value,
                                  }))
                                }
                                className="w-20 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                              />
                              <span className="text-xs text-slate-400">%</span>
                              <button
                                type="button"
                                onClick={() => handleSavePercentComplete(milestone)}
                                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                              >
                                Save
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingIndex(index)}
                                className="p-2 text-slate-300 hover:bg-slate-700 rounded transition"
                                title={isFinancialMilestone ? 'Edit milestone' : 'Edit task'}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {!isFinancialMilestone && (
                                <button
                                  onClick={() => handleDeleteTask(index)}
                                  className="p-2 text-slate-300 hover:bg-rose-500/20 hover:text-rose-200 rounded transition"
                                  title="Delete task"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          )}
          </div>
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
