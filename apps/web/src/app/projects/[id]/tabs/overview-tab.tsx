'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { ProjectAiPanel } from '@/components/project-ai-panel';
import { ProjectAiScopePanel } from '@/components/project-ai-scope-panel';
import { ProfessionalDetailsModal } from '@/components/professional-details-modal';
import { QuoteBreakdownModal, type QuoteDetail } from '@/components/quote-breakdown-modal';
import { fetchPrimaryNextStep, type NextStepAction } from '@/lib/next-steps';
import { getProjectScope } from '@/lib/project-scope';
import { clientTimelineSteps, getClientTabForAction } from '@/lib/client-workflow';
import { API_BASE_URL } from '@/config/api';
import type { Professional } from '@/lib/types';
import toast from 'react-hot-toast';

interface ProjectDetail {
  id: string;
  projectName: string;
  region: string;
  status?: string;
  budget?: string;
  approvedBudget?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
  clientSignedAt?: string;
  professionalSignedAt?: string;
  projectScale?: string;
  escrowHeld?: string | number;
  escrowRequired?: string | number;
  escrowHeldUpdatedAt?: string;
  milestones?: Array<{ amount?: string | number; totalAmount?: string | number; sequence?: number; escrowFundedAt?: string }>;
  paymentPlan?: {
    milestones?: Array<{ amount?: string | number; totalAmount?: string | number; sequence?: number; escrowFundedAt?: string }>;
  };
  walletTransferStatus?: string | null;
  walletTransferCompletedAt?: string | null;
  startProposals?: Array<{
    status?: string;
    createdAt?: string;
    proposedStartAt?: string;
    respondedAt?: string;
  }>;
  contractorContactName?: string;
  contractorContactPhone?: string;
  contractorContactEmail?: string;
  tradesRequired?: string[];
  professionals?: any[];
  mimoProjectExtras?: Array<{
    id: string;
    extraType: 'survey' | 'design' | string;
    status: string;
    price?: number | string | null;
    currency?: string | null;
    requestedAt?: string;
    scheduledAt?: string | null;
  }>;
  aiIntake?: {
    id?: string;
    summary?: string;
    scope?: string;
    title?: string;
    assumptions?: unknown;
    risks?: unknown;
    project?: unknown;
    safetyAssessment?: unknown;
  } | null;
}

interface OverviewTabProps {
  project: ProjectDetail;
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  accessToken: string;
  onScheduleUpdate: (data: { startDate?: string; endDate?: string }) => Promise<void>;
  onContactUpdate: (data: { name?: string; phone?: string; email?: string }) => Promise<void>;
  isUpdatingSchedule: boolean;
  isUpdatingContact: boolean;
  siteAccessRequests?: any[];
  quoteOverdueBlocker?: boolean;
  onRemindProfessional?: (projectProfessional: any) => void;
  remindingProfessionalIds?: string[];
  onOpenChatTab?: () => void;
  onCompareAward?: () => void;
  onOpenSiteInspection?: () => void;
  onOpenFinancials?: () => void;
  onShowWithdrawConfirm?: () => void;
}

const formatDate = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

const formatHKD = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'HK$ —';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDateTime = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

const formatDuration = (minutes?: number) => {
  if (!minutes || !Number.isFinite(minutes)) return '—';
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours`;
  }
  return `${minutes} min`;
};

const formatRangeWithBreak = (
  min: number | null,
  max: number | null,
  formatter: (value: number) => string,
) => {
  if (min === null || max === null) return '—';
  if (min === max) return formatter(min);
  return `Lowest: ${formatter(min)}\nHighest: ${formatter(max)}`;
};

const formatProjectClass = (value?: string) => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'SCALE_1') return 'Class 1';
  if (normalized === 'SCALE_2') return 'Class 2';
  if (normalized === 'SCALE_3') return 'Class 3';
  if (!normalized) return '—';
  return value || '—';
};

const formatExtraTypeLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'survey') return 'MIMO Surveying+';
  if (normalized === 'design') return 'MIMO Interior Design';
  return value || 'MIMO service';
};

const formatExtraStatusLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized.replace(/_/g, ' ');
};

const getExtraStatusClasses = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (['scheduled', 'in_progress'].includes(normalized)) {
    return 'border-sky-300 bg-sky-50 text-sky-700';
  }
  if (['completed'].includes(normalized)) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (['declined', 'cancelled'].includes(normalized)) {
    return 'border-rose-300 bg-rose-50 text-rose-700';
  }
  return 'border-amber-300 bg-amber-50 text-amber-700';
};

const CHIP_TONES = {
  neutral: 'border-[#818589] bg-[#818589] text-white',
  waiting: 'border-amber-500 bg-amber-500 text-white',
  active: 'border-blue-600 bg-blue-600 text-white',
  done: 'border-emerald-600 bg-emerald-600 text-white',
  negative: 'border-rose-500 bg-rose-500 text-white',
} as const;

const projectStatusChipOf = (status?: string): { label: string; cls: string } => {
  const normalized = String(status || 'pending').toLowerCase();
  const label = String(status || 'pending').replace(/_/g, ' ');
  if (['awarded', 'approved', 'completed', 'started'].includes(normalized)) {
    return { label, cls: CHIP_TONES.done };
  }
  if (['quoted', 'counter_requested'].includes(normalized)) {
    return { label, cls: CHIP_TONES.active };
  }
  if (['withdrawn', 'rejected'].includes(normalized)) {
    return { label, cls: CHIP_TONES.negative };
  }
  return { label, cls: CHIP_TONES.waiting };
};

type TimelineMetric = {
  label: string;
  value: string;
};

const timelineSteps = clientTimelineSteps;

const inferTimelineIndexFromStatus = (status?: string) => {
  const normalized = (status || '').toLowerCase();

  if (normalized === 'completed' || normalized === 'rated') {
    return timelineSteps.length;
  }

  if (normalized === 'started') return 8;
  if (normalized === 'awarded' || normalized === 'approved') return 5;
  if (normalized === 'quoted' || normalized === 'counter_requested') return 3;
  if (normalized === 'pending') return 1;

  return 0;
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  expandedAccordions,
  onToggleAccordion,
  accessToken,
  onScheduleUpdate,
  onContactUpdate,
  isUpdatingSchedule,
  isUpdatingContact,
  siteAccessRequests,
  quoteOverdueBlocker = false,
  onRemindProfessional,
  remindingProfessionalIds = [],
  onOpenChatTab,
  onCompareAward,
  onOpenSiteInspection,
  onOpenFinancials,
  onShowWithdrawConfirm,
}) => {
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    startDate: project.startDate || '',
    endDate: project.endDate || '',
  });

  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: project.contractorContactName || '',
    phone: project.contractorContactPhone || '',
    email: project.contractorContactEmail || '',
  });
  const [primaryNextStep, setPrimaryNextStep] = useState<NextStepAction | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [detailsPro, setDetailsPro] = useState<Professional | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [quoteModalPro, setQuoteModalPro] = useState<QuoteDetail | null>(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [siteAddress, setSiteAddress] = useState<{
    buildingName?: string | null;
    addressFull?: string | null;
    unitNumber?: string | null;
    floorLevel?: string | null;
    district?: string | null;
  } | null>(null);

  const handleOpenProDetails = async (professionalId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/professionals/${professionalId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const pro = await res.json();
        setDetailsPro(pro);
        setDetailsOpen(true);
      }
    } catch { /* silently fail */ }
  };

  const fetchAddress = useCallback(async () => {
    if (!project?.id || !accessToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${project.id}/address`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSiteAddress(data?.address ?? null);
      }
    } catch {
      // silently ignore
    }
  }, [project?.id, accessToken]);

  useEffect(() => {
    fetchAddress();
  }, [fetchAddress]);

  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    const loadNextStep = async () => {
      setTimelineLoading(true);
      try {
        const action = await fetchPrimaryNextStep(project.id, accessToken, {
          cacheScope: `client-project-timeline:${project.id}`,
        });
        if (!cancelled) setPrimaryNextStep(action);
      } catch {
        if (!cancelled) setPrimaryNextStep(null);
      } finally {
        if (!cancelled) setTimelineLoading(false);
      }
    };

    loadNextStep();

    return () => {
      cancelled = true;
    };
  }, [project.id, accessToken]);

  const handleScheduleSave = async () => {
    if (!scheduleForm.startDate && !scheduleForm.endDate) {
      toast.error('Please enter at least a start or end date');
      return;
    }

    try {
      await onScheduleUpdate({
        startDate: scheduleForm.startDate || undefined,
        endDate: scheduleForm.endDate || undefined,
      });
      setEditingSchedule(false);
      toast.success('Schedule updated!');
    } catch (e) {
      console.error('Schedule update failed', e);
      toast.error('Failed to update schedule');
    }
  };

  const handleContactSave = async () => {
    if (!contactForm.name && !contactForm.phone && !contactForm.email) {
      toast.error('Please enter at least one contact detail');
      return;
    }

    try {
      await onContactUpdate({
        name: contactForm.name || undefined,
        phone: contactForm.phone || undefined,
        email: contactForm.email || undefined,
      });
      setEditingContact(false);
      toast.success('Contractor contact updated!');
    } catch (e) {
      console.error('Contact update failed', e);
      toast.error('Failed to update contractor contact');
    }
  };

  const projectStatus = project.status ?? 'pending';
  const projectStatusChip = projectStatusChipOf(projectStatus);
  const hasAiInsights = Boolean(
    project.aiIntake &&
      (project.aiIntake.assumptions || project.aiIntake.risks || project.aiIntake.project),
  );
  const invitedCount = project.professionals?.length ?? 0;
  const quotedProfessionals =
    project.professionals?.filter((pp) => {
      const status = String(pp?.status || '').toLowerCase();
      return (
        status === 'quoted' ||
        status === 'counter_requested' ||
        status === 'awarded' ||
        Boolean(pp?.quotedAt)
      );
    }) ?? [];
  const quotedCount = quotedProfessionals.length;
  const biddingRows =
    project.professionals?.map((pp) => {
      const professionalName =
        pp?.professional?.fullName ||
        pp?.professional?.businessName ||
        pp?.professional?.email ||
        'Professional';
      const status = String(pp?.status || '').toLowerCase();
      const bidAt =
        pp?.quotedAt ||
        (status === 'quoted' || status === 'counter_requested' || status === 'awarded'
          ? pp?.respondedAt
          : undefined);

      return {
        id: pp?.id || professionalName,
        professionalId: pp?.professional?.id || '',
        professionalName,
        status,
        isAwarded: status === 'awarded',
        bidDateLabel: bidAt ? formatDate(bidAt) : 'No bid',
        totalQuoteLabel: pp?.quoteAmount ? formatHKD(pp.quoteAmount) : 'HK$ —',
        pp,
      };
    }) ?? [];
  const pendingQuoteCount = Math.max(invitedCount - quotedCount, 0);
  const awardedProfessional =
    project.professionals?.find((pp) => String(pp?.status || '').toLowerCase() === 'awarded') || null;
  const awardedQuoteValue = awardedProfessional?.quoteAmount;
  const budgetValue = Number(project.approvedBudget || project.budget || 0);
  const awardedQuoteNumeric = Number(awardedQuoteValue || 0);
  const budgetDeltaValue =
    budgetValue > 0 && Number.isFinite(awardedQuoteNumeric)
      ? awardedQuoteNumeric - budgetValue
      : null;
  const hasBiddingActivity =
    invitedCount > 0 ||
    quotedCount > 0 ||
    pendingQuoteCount > 0 ||
    projectStatus === 'pending' ||
    projectStatus === 'quoted' ||
    projectStatus === 'counter_requested';
  const mimoExtras = Array.isArray(project.mimoProjectExtras)
    ? project.mimoProjectExtras
    : [];

  const hasSubmittedQuote = (pp: any): boolean => {
    const status = String(pp?.status || '').toLowerCase();
    return status === 'quoted' || status === 'counter_requested' || status === 'awarded' || Boolean(pp?.quotedAt);
  };

  const quotationStatusOf = (pp: any): { label: string; cls: string } => {
    const status = String(pp?.status || '').toLowerCase();
    if (status === 'awarded') return { label: 'Quote: Awarded', cls: CHIP_TONES.done };
    if (status === 'rejected') return { label: 'Quote: Pro declined', cls: CHIP_TONES.negative };
    if (status === 'declined') return { label: 'Quote: Not awarded', cls: CHIP_TONES.neutral };
    if (hasSubmittedQuote(pp)) return { label: 'Quote: Received', cls: CHIP_TONES.active };
    return { label: 'Quote: Awaiting', cls: CHIP_TONES.waiting };
  };

  const siteStatusOf = (pp: any): { label: string; cls: string } => {
    const req = (siteAccessRequests ?? []).find(
      (r: any) => r?.professional?.id && r.professional.id === pp?.professional?.id,
    );
    if (!req) return { label: 'Site: Not requested', cls: CHIP_TONES.neutral };
    const status = String(req.status || '').toLowerCase();
    if (status === 'pending') return { label: 'Site: Requested', cls: CHIP_TONES.waiting };
    if (status === 'approved_visit_scheduled' || status === 'approved_no_visit') return { label: 'Site: Accepted', cls: CHIP_TONES.active };
    if (status === 'visited') return { label: 'Site: Completed', cls: CHIP_TONES.done };
    return { label: 'Site: Not requested', cls: CHIP_TONES.neutral };
  };

  const proDeclinedProfessionals = (project.professionals ?? []).filter(
    (pp) => String(pp?.status || '').toLowerCase() === 'rejected',
  );
  const notAwardedProfessionals = (project.professionals ?? []).filter(
    (pp) => String(pp?.status || '').toLowerCase() === 'declined',
  );
  const hasOutstandingQuotes = quotedProfessionals.length > 0 && !awardedProfessional;
  const hasOutstandingSiteInspections = (siteAccessRequests ?? []).some(
    (r: any) => String(r?.status || '').toLowerCase() === 'pending',
  );

  const openQuoteModal = (pp: any) => {
    const name =
      pp?.professional?.fullName ||
      pp?.professional?.businessName ||
      pp?.professional?.email ||
      'Professional';
    setQuoteModalPro({
      name,
      quoteAmount: pp?.quoteAmount ?? null,
      quoteBreakdown: pp?.quoteBreakdown ?? null,
      quoteNotes: pp?.quoteNotes ?? null,
      quoteEstimatedStartAt: pp?.quoteEstimatedStartAt ?? null,
      quoteEstimatedDurationMinutes: pp?.quoteEstimatedDurationMinutes ?? null,
      quoteEstimatedDurationUnit: pp?.quoteEstimatedDurationUnit ?? null,
      quotePricingMode: pp?.quotePricingMode ?? null,
      subcontracting: pp?.subcontracting ?? null,
      quotedTrades: pp?.quotedTrades ?? null,
    });
    setQuoteModalOpen(true);
  };

  const currentTimelineStepIndex = useMemo(() => {
    const actionKey = primaryNextStep?.actionKey;
    if (actionKey) {
      const indexFromAction = timelineSteps.findIndex((step) => step.actionKeys.includes(actionKey));
      if (indexFromAction >= 0) return indexFromAction;
    }
    return inferTimelineIndexFromStatus(project.status);
  }, [primaryNextStep?.actionKey, project.status]);

  const currentTimelineStep =
    currentTimelineStepIndex >= 0 && currentTimelineStepIndex < timelineSteps.length
      ? timelineSteps[currentTimelineStepIndex]
      : null;

  const currentStepIsDelayed = useMemo(() => {
    if (!currentTimelineStep) return false;
    const referenceDate = project.updatedAt || project.createdAt;
    if (!referenceDate) return false;

    const ageMs = Date.now() - new Date(referenceDate).getTime();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    return ageMs > seventyTwoHoursMs;
  }, [currentTimelineStep, project.updatedAt, project.createdAt]);

  useEffect(() => {
    if (timelineLoading) return;
    if (expandedAccordions['timeline-preview'] !== true) return;
    if (!currentTimelineStep) return;

    const card = timelineCardRefs.current[currentTimelineStep.id];
    if (!card) return;

    requestAnimationFrame(() => {
      card.scrollIntoView({
        behavior: 'smooth',
        inline: 'start',
        block: 'nearest',
      });
    });
  }, [
    timelineLoading,
    expandedAccordions,
    currentTimelineStep,
    currentTimelineStepIndex,
    primaryNextStep?.actionKey,
  ]);

  const getTimelineMetrics = (stepId: string): TimelineMetric[] => {
    switch (stepId) {
      case 'created-invite': {
        const firstInviteDate = project.professionals?.reduce<string | undefined>((earliest, pp) => {
          if (!pp?.createdAt) return earliest;
          if (!earliest) return pp.createdAt;
          return new Date(pp.createdAt) < new Date(earliest) ? pp.createdAt : earliest;
        }, undefined);
        return [
          { label: 'Professionals Invited', value: invitedCount > 0 ? String(invitedCount) : '—' },
          { label: 'Date of Invitation', value: formatDate(firstInviteDate) },
        ];
      }
      case 'bidding': {
        const declinedByProfessionalCount = project.professionals?.filter((p) => {
          const st = String(p?.status || '').toLowerCase();
          // Count only declines initiated by professionals.
          return st === 'declined';
        }).length ?? 0;
        const notReceivedCount = Math.max(invitedCount - quotedCount - declinedByProfessionalCount, 0);
        const lastQuoteAt = quotedProfessionals.reduce<string | undefined>((latest, p) => {
          if (!p?.quotedAt) return latest;
          if (!latest) return p.quotedAt;
          return new Date(p.quotedAt) > new Date(latest) ? p.quotedAt : latest;
        }, undefined);
        const hasExtension = project.professionals?.some(
          (p) => p?.quoteExtendedUntil || p?.quoteReminderSentAt,
        ) ?? false;
        return [
          { label: 'Quotes Received', value: `${quotedCount} of ${invitedCount}` },
          { label: 'Quotes Declined', value: String(declinedByProfessionalCount) },
          { label: 'Quotes Not Received', value: String(notReceivedCount) },
          { label: 'Last Quote Received', value: formatDate(lastQuoteAt) },
          { label: 'Extension Given', value: hasExtension ? 'Yes' : 'No' },
        ];
      }
      case 'site-visit': {
        const anyRequested = (siteAccessRequests?.length ?? 0) > 0;
        const anyGranted = siteAccessRequests?.some((r: any) =>
          ['approved_no_visit', 'approved_visit_scheduled', 'visited'].includes(r.status)
        ) ?? false;
        return [
          { label: 'Pre-quote access requested', value: anyRequested ? 'Yes' : 'No' },
          { label: 'Site access granted', value: anyGranted ? 'Yes' : 'No' },
        ];
      }
      case 'compare': {
        const quoteAmounts = quotedProfessionals
          .map((p) => Number(p?.quoteAmount))
          .filter((n) => Number.isFinite(n) && n > 0);
        const quoteMin = quoteAmounts.length > 0 ? Math.min(...quoteAmounts) : null;
        const quoteMax = quoteAmounts.length > 0 ? Math.max(...quoteAmounts) : null;
        const quoteRange =
          formatRangeWithBreak(quoteMin, quoteMax, (value) => formatHKD(value));
        const durations = quotedProfessionals
          .map((p) => Number(p?.quoteEstimatedDurationMinutes))
          .filter((n) => Number.isFinite(n) && n > 0);
        const durMin = durations.length > 0 ? Math.min(...durations) : null;
        const durMax = durations.length > 0 ? Math.max(...durations) : null;
        const durationRange =
          formatRangeWithBreak(durMin, durMax, (value) => formatDuration(value));
        return [
          { label: 'Quote Range', value: quoteRange },
          { label: 'Duration Range', value: durationRange },
        ];
      }
      case 'select':
        return [
          {
            label: 'Awarded Pro',
            value: awardedProfessional ? (awardedProfessional.professional?.fullName || awardedProfessional.professional?.businessName || 'Yes') : 'No',
          },
          { label: 'Awarded Quote', value: awardedProfessional ? formatHKD(awardedQuoteValue) : '—' },
          {
            label: 'Agreed Duration',
            value: awardedProfessional ? formatDuration(Number(awardedProfessional?.quoteEstimatedDurationMinutes)) : '—',
          },
          {
            label: 'Date Awarded',
            value: awardedProfessional
              ? formatDate(
                  awardedProfessional?.updatedAt ||
                    awardedProfessional?.respondedAt ||
                    awardedProfessional?.quotedAt,
                )
              : 'No',
          },
        ];
      case 'contract':
        return [
          {
            label: 'Project Class',
            value: formatProjectClass(project.projectScale),
          },
          {
            label: 'Professional Signed',
            value: project.professionalSignedAt ? formatDate(project.professionalSignedAt) : 'No',
          },
          {
            label: 'Client Signed',
            value: project.clientSignedAt ? formatDate(project.clientSignedAt) : 'No',
          },
        ];
      case 'escrow-funding':
      {
        const escrowFundedValue = Number(project.escrowHeld || 0);
        const projectValue = Number(project.approvedBudget || project.budget || project.escrowRequired || 0);
        const escrowToProjectPct =
          projectValue > 0 && Number.isFinite(escrowFundedValue)
            ? `${Math.min((escrowFundedValue / projectValue) * 100, 100).toFixed(1).replace(/\.0$/, '')}%`
            : '—';

        const allMilestones = [
          ...(project.paymentPlan?.milestones || []),
          ...(project.milestones || []),
        ];
        const firstMilestone =
          allMilestones
            .slice()
            .sort((a, b) => Number(a?.sequence || 0) - Number(b?.sequence || 0))[0] || null;
        const firstMilestoneAmount = firstMilestone
          ? firstMilestone.amount ?? firstMilestone.totalAmount
          : null;
        const firstEscrowFundedAt = allMilestones
          .filter((m) => Boolean(m?.escrowFundedAt))
          .sort((a, b) => Number(new Date(a?.escrowFundedAt || 0)) - Number(new Date(b?.escrowFundedAt || 0)))[0]
          ?.escrowFundedAt;
        const isProcurementWorkflowProject = ['SCALE_1', 'SCALE_2'].includes(String(project.projectScale || '').toUpperCase());
        const walletTransferStatus =
          String(project.walletTransferStatus || '').toLowerCase() === 'completed'
            ? 'Completed'
            : 'Pending';

        const metrics = [
          { label: 'Escrow Funded', value: formatHKD(escrowFundedValue) },
          {
            label: 'Escrow Funded On',
            value: formatDate(firstEscrowFundedAt || (escrowFundedValue > 0 ? project.escrowHeldUpdatedAt : undefined)),
          },
          { label: 'Escrow to Project', value: escrowToProjectPct },
          { label: 'First Milestone Value', value: firstMilestoneAmount !== null ? formatHKD(firstMilestoneAmount as any) : '—' },
        ];

        if (isProcurementWorkflowProject) {
          metrics.splice(2, 0, { label: 'Wallet Transfer', value: walletTransferStatus });
        }

        return metrics;
      }
      case 'pre-work': {
        const latestProposal =
          project.startProposals
            ?.slice()
            .sort((a, b) => Number(new Date(b?.createdAt || 0)) - Number(new Date(a?.createdAt || 0)))[0] || null;
        const hasConfirmedProposal =
          project.startProposals?.some((proposal) => String(proposal?.status || '').toLowerCase() === 'accepted') ||
          false;
        const dateStatus = hasConfirmedProposal
          ? 'Confirmed'
          : latestProposal && String(latestProposal.status || '').toLowerCase() === 'proposed'
            ? 'Proposed'
            : project.startDate
              ? 'Confirmed'
              : '—';

        return [
          { label: 'Start Date', value: formatDate(project.startDate || latestProposal?.proposedStartAt) },
          { label: 'End Date', value: formatDate(project.endDate) },
          { label: 'Date Status', value: dateStatus },
        ];
      }
      default:
        return [
          { label: 'Status', value: projectStatus },
          { label: 'Current Action', value: primaryNextStep?.actionLabel || '—' },
          { label: 'Updated', value: formatDate(project.updatedAt) },
        ];
    }
  };

  return (
    <div className="space-y-4">
      {hasBiddingActivity && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-5 shadow-[0_18px_40px_rgba(81,55,32,0.06)] backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Bidding Status</h2>
              <p className="mt-1 text-sm text-slate-600">
                Summary of invited professionals, bid dates, and total quote values.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${projectStatusChip.cls}`}>
                {projectStatusChip.label}
              </span>
            </div>
          </div>

          {biddingRows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.72)]">
              <div className="divide-y divide-[rgba(120,53,15,0.10)]">
                {biddingRows.map((row) => {
                  const quoteChip = quotationStatusOf(row.pp);
                  const siteChip = siteStatusOf(row.pp);
                  return (
                    <div key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium text-slate-800 transition hover:text-[#b94e2d] hover:underline"
                        onClick={() => handleOpenProDetails(row.professionalId)}
                      >
                        {row.isAwarded && (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                          </span>
                        )}
                        <span className="truncate">{row.professionalName}</span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${siteChip.cls}`}>
                          {siteChip.label}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${quoteChip.cls}`}>
                          {quoteChip.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <span className="font-semibold text-slate-900">{row.totalQuoteLabel}</span>
                        {hasSubmittedQuote(row.pp) && (
                          <button
                            type="button"
                            onClick={() => openQuoteModal(row.pp)}
                            className="rounded-md border border-[#D4C8A0] bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-[#F5EEDE]"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(onOpenSiteInspection || onCompareAward) && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              {onOpenSiteInspection && (
                <button
                  type="button"
                  onClick={onOpenSiteInspection}
                  disabled={!hasOutstandingSiteInspections}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-[#818589] disabled:hover:bg-[#818589] disabled:text-white text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight disabled:cursor-not-allowed"
                >
                  Site inspections
                </button>
              )}
              {onCompareAward && (
                <button
                  type="button"
                  onClick={onCompareAward}
                  disabled={!hasOutstandingQuotes}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#818589] disabled:hover:bg-[#818589] disabled:text-white text-white px-4 py-2 text-sm font-semibold transition text-center leading-tight disabled:cursor-not-allowed"
                >
                  Compare &amp; Award
                </button>
              )}
            </div>
          )}

          {(awardedProfessional || proDeclinedProfessionals.length > 0 || notAwardedProfessionals.length > 0) && (
            <div className="mt-4 space-y-3">
              {awardedProfessional && (
                <div className="rounded-2xl border border-emerald-200 bg-[rgba(255,250,240,0.78)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      </span>
                      <p className="text-sm font-semibold text-slate-900">
                        Awarded: {awardedProfessional.professional?.fullName || awardedProfessional.professional?.businessName || awardedProfessional.professional?.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openQuoteModal(awardedProfessional)}
                        className="text-sm font-semibold text-[#b94e2d] hover:underline"
                      >
                        {formatHKD(awardedProfessional.quoteAmount)}
                      </button>
                      {onOpenFinancials && (
                        <button
                          type="button"
                          onClick={onOpenFinancials}
                          className="text-xs font-semibold text-[#b94e2d] hover:underline"
                        >
                          Financials →
                        </button>
                      )}
                    </div>
                  </div>
                  {Array.isArray(awardedProfessional.quoteRequestedTrades) && awardedProfessional.quoteRequestedTrades.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {awardedProfessional.quoteRequestedTrades.map((trade: string) => (
                        <span key={trade} className="rounded-full border border-[#D4C8A0] bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {trade}
                        </span>
                      ))}
                    </div>
                  )}
                  {awardedProfessional.quoteNotes && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{awardedProfessional.quoteNotes}</p>
                  )}
                </div>
              )}
              {(proDeclinedProfessionals.length > 0 || notAwardedProfessionals.length > 0) && (
                <div className="rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.66)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other professionals</p>
                  <div className="mt-2 space-y-1.5">
                    {notAwardedProfessionals.map((pp: any) => (
                      <div key={pp.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-700">{pp.professional?.fullName || pp.professional?.businessName || pp.professional?.email}</span>
                        <span className="text-xs font-medium text-slate-500">Not awarded</span>
                      </div>
                    ))}
                    {proDeclinedProfessionals.map((pp: any) => (
                      <div key={pp.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-700">{pp.professional?.fullName || pp.professional?.businessName || pp.professional?.email}</span>
                        <span className="text-xs font-medium text-rose-600">Pro declined</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {quoteOverdueBlocker && (
            <div className="mt-4 space-y-4 rounded-2xl border border-rose-200 bg-[rgba(255,250,240,0.78)] p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Quote window expired</p>
                <p className="mt-1 text-sm text-slate-600">
                  No quote was received within the {(project as any)?.isEmergency ? '12-hour' : '3-day'} window. Use the options below to continue.
                </p>
              </div>

              {(() => {
                const terminalStatuses = ['declined', 'rejected', 'withdrawn', 'quoted', 'awarded', 'counter_requested'];
                const pendingPros = project.professionals?.filter((pp) => {
                  const st = (pp.status || '').toLowerCase();
                  return !terminalStatuses.includes(st) && !pp.quotedAt;
                }) ?? [];

                if (pendingPros.length === 0) return null;

                return (
                  <div className="rounded-2xl border border-[rgba(120,53,15,0.12)] bg-transparent p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Step 1 - Remind professional{pendingPros.length > 1 ? 's' : ''}</p>
                    <p className="text-xs text-slate-500">Sends a notification and grants an additional 24-hour window one time per professional.</p>
                    <div className="mt-1 flex flex-col gap-2">
                      {pendingPros.map((pp) => {
                        const name = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                        const alreadySent = Boolean(pp.quoteReminderSentAt);
                        return (
                          <div key={pp.id} className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.12)] px-3 py-2 text-sm">
                            <span className="font-medium text-slate-700">{name}</span>
                            {alreadySent ? (
                              <span className="text-xs font-medium text-emerald-600">Reminded (+24h granted)</span>
                            ) : onRemindProfessional ? (
                              <button
                                type="button"
                                onClick={() => onRemindProfessional(pp)}
                                disabled={remindingProfessionalIds.includes(pp.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                              >
                                {remindingProfessionalIds.includes(pp.id) ? 'Sending...' : 'Remind & extend 24h'}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-2">
                {onOpenChatTab && (
                  <button
                    type="button"
                    onClick={onOpenChatTab}
                    className="inline-flex items-center rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open chat
                  </button>
                )}
                {onShowWithdrawConfirm && (
                  <button
                    type="button"
                    onClick={onShowWithdrawConfirm}
                    className="inline-flex items-center rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Withdraw project
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mimoExtras.length > 0 && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-5 shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">MIMO Added Services</h2>
              <p className="mt-1 text-sm text-slate-600">
                Track requested Surveying+ and Design services for this project.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {mimoExtras.map((extra) => (
              <div
                key={extra.id}
                className="rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.72)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatExtraTypeLabel(extra.extraType)}
                  </p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getExtraStatusClasses(extra.status)}`}
                  >
                    {formatExtraStatusLabel(extra.status)}
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {extra.price ? (
                    <p>
                      Price: {String(extra.currency || 'HKD').toUpperCase()} {Number(extra.price).toLocaleString('en-HK')}
                    </p>
                  ) : null}
                  {extra.requestedAt ? <p>Requested: {formatDateTime(extra.requestedAt)}</p> : null}
                  {extra.scheduledAt ? <p>Scheduled: {formatDateTime(extra.scheduledAt)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AccordionGroup>
        {/* Project Overview */}
        <AccordionItem
          id="project-overview"
          title="Project Overview"
          isOpen={expandedAccordions['project-overview'] !== false}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {project.projectName?.trim() || 'Untitled project'}
              </h3>
            </div>

            <div className="space-y-1.5 text-sm text-slate-700">
              {project.region && (
                <p>
                  <span className="font-semibold text-slate-900">Location:</span> {project.region}
                </p>
              )}
              {siteAddress?.addressFull && (
                <p>
                  <span className="font-semibold text-slate-900">📍 Address:</span>{' '}
                  {[
                    siteAddress.buildingName,
                    siteAddress.unitNumber,
                    siteAddress.floorLevel,
                    siteAddress.addressFull,
                    siteAddress.district,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {(() => { const scope = getProjectScope(project); return scope ? (
                <p>
                  <span className="font-semibold text-slate-900">Scope:</span>{' '}
                  <span className="leading-relaxed text-slate-800">{scope}</span>
                </p>
              ) : null; })()}
              {project.budget && (
                <p>
                  <span className="font-semibold text-slate-900">Budget:</span> {formatHKD(project.budget)}
                </p>
              )}
              {(project as any)?.isEmergency && (
                <p>
                  <span className="font-semibold text-slate-900">Priority:</span> 🚨 Emergency
                </p>
              )}
            </div>

            <div className="flex gap-3 border-t border-[rgba(120,53,15,0.12)] pt-3 text-xs text-slate-500">
              {project.createdAt && <span>Created: {formatDate(project.createdAt)}</span>}
              {project.updatedAt && <span>Updated: {formatDate(project.updatedAt)}</span>}
            </div>
          </div>
        </AccordionItem>

        {hasAiInsights && (
          <AccordionItem
            id="from-ai"
            title="Safety, Assumptions and Risks"
            isOpen={expandedAccordions['from-ai'] === true}
            onToggle={onToggleAccordion}
          >
            <ProjectAiPanel aiIntake={project.aiIntake ?? null} mode="client" />
          </AccordionItem>
        )}

        <AccordionItem
          id="timeline-preview"
          title="Process Timeline (Preview)"
          isOpen={expandedAccordions['timeline-preview'] === true}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-3">
            {/* Progress bar header */}
            {!timelineLoading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    Stage {Math.min(currentTimelineStepIndex + 1, timelineSteps.length)} of {timelineSteps.length}
                    {currentTimelineStep ? ` — ${currentTimelineStep.title}` : ''}
                  </span>
                  <span className="text-slate-500">
                    {Math.round((currentTimelineStepIndex / timelineSteps.length) * 100)}% complete
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(120,53,15,0.15)]">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.round((currentTimelineStepIndex / timelineSteps.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {timelineLoading && (
              <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.72)] px-3 py-2 text-sm text-slate-600">
                Loading timeline status...
              </div>
            )}

            {!timelineLoading && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500">
                  Scroll left/right to view all {timelineSteps.length} stages.
                </p>
                <div
                  ref={timelineContainerRef}
                  className="flex gap-3 overflow-x-auto px-1 pb-2 snap-x snap-mandatory"
                >
                {timelineSteps.map((step, index) => {
                  const isComplete = index < currentTimelineStepIndex;
                  const isCurrent = index === currentTimelineStepIndex;
                  const stepActionKey =
                    (isCurrent && primaryNextStep?.actionKey) ||
                    step.actionKeys.find((actionKey) => Boolean(getClientTabForAction(actionKey))) ||
                    undefined;
                  const stepTab = getClientTabForAction(stepActionKey) || 'overview';
                  const currentStepHref = `/projects/${project.id}?tab=${encodeURIComponent(stepTab)}`;
                  const currentActionLabel =
                    primaryNextStep?.actionLabel && primaryNextStep.actionLabel !== step.title
                      ? primaryNextStep.actionLabel
                      : null;
                  const metrics = getTimelineMetrics(step.id);
                  const detailsHref =
                    step.id === 'created-invite'
                      ? `/projects/${project.id}?tab=overview&openAi=1&collapseTimeline=1`
                      : `/projects/${project.id}?tab=${encodeURIComponent(stepTab)}`;

                  const toneClasses = isComplete
                    ? {
                        dot: 'bg-emerald-500',
                        border: 'border-emerald-200',
                        bg: 'bg-emerald-50',
                        text: 'text-emerald-800',
                      }
                    : isCurrent
                      ? currentStepIsDelayed
                        ? {
                            dot: 'bg-rose-500',
                            border: 'border-rose-200',
                            bg: 'bg-rose-50',
                            text: 'text-rose-700',
                          }
                        : {
                            dot: 'bg-amber-500',
                            border: 'border-amber-200',
                            bg: 'bg-amber-50',
                            text: 'text-amber-800',
                          }
                      : {
                          dot: 'bg-slate-400',
                          border: 'border-[rgba(120,53,15,0.16)]',
                          bg: 'bg-[rgba(255,250,240,0.66)]',
                          text: 'text-slate-700',
                        };

                  return (
                    <div
                      key={step.id}
                      ref={(el) => {
                        timelineCardRefs.current[step.id] = el;
                      }}
                      className={`w-[calc(100%-0.5rem)] sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)] 2xl:w-[calc((100%-2.25rem)/4)] min-w-0 shrink-0 snap-start rounded-md border px-3 py-2 ${toneClasses.border} ${toneClasses.bg}`}
                    >
                      {/* Card header: title + description + status dot pinned top-right */}
                      <div className="relative mb-2">
                        <div className="pr-6">
                          <p className={`text-sm font-semibold leading-snug ${toneClasses.text}`}>{step.title}</p>
                          <p className="mt-0.5 text-xs leading-snug text-slate-500">{step.description}</p>
                          {isCurrent && currentActionLabel && (
                            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                              Action: {currentActionLabel}
                            </p>
                          )}
                          {isCurrent && (
                            <Link
                              href={currentStepHref}
                              className="mt-2 inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                            >
                              Open stage
                            </Link>
                          )}
                        </div>
                        {/* Status dot always top-right */}
                        <span className={`absolute top-0 right-0 h-[15px] w-[15px] rounded-full ${toneClasses.dot}`} />
                      </div>

                      {/* Metrics: always stacked, never wrapped */}
                      <div className="flex flex-col gap-1">
                        {metrics.map((metric) => (
                          <div key={metric.label} className="flex items-start justify-between rounded-xl border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.68)] px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">{metric.label}</p>
                            {metric.label === 'Awarded Pro' && awardedProfessional?.professional?.id ? (
                              <button
                                type="button"
                                className="whitespace-pre-line text-right text-xs font-semibold leading-tight text-[#b94e2d] hover:underline transition"
                                onClick={() => handleOpenProDetails(awardedProfessional.professional.id)}
                              >
                                {metric.value}
                              </button>
                            ) : (
                              <p className="whitespace-pre-line text-right text-xs font-semibold leading-tight text-slate-800">{metric.value}</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {!isCurrent && (
                        <Link
                          href={detailsHref}
                          className="mt-2 inline-flex items-center rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                        >
                          Open details
                        </Link>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem
          id="programme-of-works"
          title="Programme of Works"
          isOpen={expandedAccordions['programme-of-works'] !== false}
          onToggle={onToggleAccordion}
        >
          <ProjectAiScopePanel
            projectId={project.id}
            accessToken={accessToken}
            mode="client"
          />
        </AccordionItem>
      </AccordionGroup>

      <ProfessionalDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        professional={detailsPro}
      />

      <QuoteBreakdownModal
        isOpen={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        quote={quoteModalPro}
      />
    </div>
  );
};
