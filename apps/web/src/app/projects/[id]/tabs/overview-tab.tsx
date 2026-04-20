'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { ProjectAiPanel } from '@/components/project-ai-panel';
import { fetchPrimaryNextStep, type NextStepAction } from '@/lib/next-steps';
import { clientTimelineSteps, getClientTabForAction } from '@/lib/client-workflow';
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
  aiIntake?: {
    id?: string;
    assumptions?: unknown;
    risks?: unknown;
    project?: unknown;
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

const projectStatusBadge: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
  approved: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40',
  rejected: 'bg-rose-500/20 text-rose-200 border border-rose-500/40',
  withdrawn: 'bg-slate-700 text-slate-300 border border-slate-600',
  awarded: 'bg-blue-500/20 text-blue-200 border border-blue-500/40',
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
      <AccordionGroup>
        {/* Project Details */}
        <AccordionItem
          id="project-details"
          title="Project Details"
          isOpen={expandedAccordions['project-details'] !== false}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-3">
            {project.notes && (
              <div className="rounded-md bg-slate-800/50 px-3 py-2 text-sm border border-slate-700">
                <p className="font-semibold text-white mb-1">Description</p>
                <p className="text-slate-300 leading-relaxed">{project.notes}</p>
              </div>
            )}

            {project.tradesRequired && project.tradesRequired.length > 0 && (
              <div className="rounded-md bg-slate-800/50 px-3 py-2 text-sm border border-slate-700">
                <p className="font-semibold text-white mb-2">Required Trades</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.tradesRequired.map((trade) => (
                    <span key={trade} className="inline-flex items-center rounded-full bg-sky-950 border border-sky-400 px-2.5 py-1 text-xs font-medium text-white">
                      {trade}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {project.budget && (
                <div className="rounded-md bg-slate-800/50 p-3 border border-slate-700">
                  <p className="text-xs text-white font-bold uppercase">Budget</p>
                  <p className="text-white font-normal mt-1">{formatHKD(project.budget)}</p>
                </div>
              )}

              {project.approvedBudget && (
                <div className="rounded-md bg-slate-800/50 p-3 border border-slate-700">
                  <p className="text-xs text-white font-bold uppercase">Approved Budget</p>
                  <p className="text-white font-normal mt-1">{formatHKD(project.approvedBudget)}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 text-xs text-white border-t border-slate-700 pt-3">
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
                  <span className="text-slate-400">
                    Stage {Math.min(currentTimelineStepIndex + 1, timelineSteps.length)} of {timelineSteps.length}
                    {currentTimelineStep ? ` — ${currentTimelineStep.title}` : ''}
                  </span>
                  <span className="text-slate-500">
                    {Math.round((currentTimelineStepIndex / timelineSteps.length) * 100)}% complete
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.round((currentTimelineStepIndex / timelineSteps.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {timelineLoading && (
              <div className="rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-400">
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
                        border: 'border-emerald-500/40',
                        bg: 'bg-emerald-500/15',
                        text: 'text-emerald-200',
                      }
                    : isCurrent
                      ? currentStepIsDelayed
                        ? {
                            dot: 'bg-rose-500',
                            border: 'border-rose-500/40',
                            bg: 'bg-rose-500/15',
                            text: 'text-rose-200',
                          }
                        : {
                            dot: 'bg-amber-500',
                            border: 'border-amber-500/40',
                            bg: 'bg-amber-500/15',
                            text: 'text-amber-200',
                          }
                      : {
                          dot: 'bg-slate-500',
                          border: 'border-slate-600',
                          bg: 'bg-slate-800/50',
                          text: 'text-slate-300',
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
                          <p className="mt-0.5 text-xs text-slate-400 leading-snug">{step.description}</p>
                          {isCurrent && currentActionLabel && (
                            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-white/90">
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
                          <div key={metric.label} className="flex items-start justify-between rounded border border-slate-700 bg-slate-900/50 px-2 py-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">{metric.label}</p>
                            <p className="whitespace-pre-line text-xs font-semibold leading-tight text-slate-100 text-right">{metric.value}</p>
                          </div>
                        ))}
                      </div>

                      {!isCurrent && (
                        <Link
                          href={detailsHref}
                          className="mt-2 inline-flex items-center rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/20 transition"
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
      </AccordionGroup>
    </div>
  );
};
