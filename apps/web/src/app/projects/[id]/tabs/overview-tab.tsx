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
  const [expandedTimelineCards, setExpandedTimelineCards] = useState<Record<string, boolean>>({});

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
      case 'created-invite':
        return [
          { label: 'Invited', value: String(invitedCount) },
          { label: 'Accepted/Quoted', value: String(quotedCount) },
          { label: 'Pending', value: String(pendingQuoteCount) },
        ];
      case 'bidding':
      case 'compare':
        return [
          { label: 'Quotes Received', value: String(quotedCount) },
          {
            label: 'Lowest Quote',
            value:
              quotedProfessionals.length > 0
                ? formatHKD(
                    Math.min(
                      ...quotedProfessionals
                        .map((p) => Number(p?.quoteAmount || Number.POSITIVE_INFINITY))
                        .filter((n) => Number.isFinite(n)),
                    ),
                  )
                : '—',
          },
          { label: 'Pending Quotes', value: String(pendingQuoteCount) },
        ];
      case 'select':
        return [
          {
            label: 'Awarded Pro',
            value: awardedProfessional ? (awardedProfessional.professional?.fullName || awardedProfessional.professional?.businessName || 'Yes') : 'No',
          },
          { label: 'Awarded Quote', value: awardedProfessional ? formatHKD(awardedQuoteValue) : '—' },
          {
            label: 'Vs Budget',
            value:
              budgetDeltaValue === null
                ? '—'
                : `${budgetDeltaValue >= 0 ? '+' : ''}${formatHKD(Math.abs(budgetDeltaValue))}`,
          },
        ];
      case 'contract':
        return [
          { label: 'Current Stage', value: currentTimelineStep?.title || 'Contract' },
          { label: 'Status', value: projectStatus },
          { label: 'Last Updated', value: formatDate(project.updatedAt) },
        ];
      case 'escrow-funding':
        return [
          { label: 'Current Stage', value: 'Escrow Funding' },
          { label: 'Next Action', value: primaryNextStep?.actionLabel || 'Deposit funds' },
          { label: 'Last Updated', value: formatDate(project.updatedAt) },
        ];
      case 'pre-work':
        return [
          { label: 'Start Date', value: formatDate(project.startDate) },
          { label: 'End Date', value: formatDate(project.endDate) },
          { label: 'Next Action', value: primaryNextStep?.actionLabel || '—' },
        ];
      default:
        return [
          { label: 'Status', value: projectStatus },
          { label: 'Current Action', value: primaryNextStep?.actionLabel || '—' },
          { label: 'Updated', value: formatDate(project.updatedAt) },
        ];
    }
  };

  const toggleTimelineCard = (id: string) => {
    setExpandedTimelineCards((prev) => ({ ...prev, [id]: !prev[id] }));
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
            <p className="text-xs text-slate-400">
              Temporary preview of the end-to-end process mapped to next-step workflow logic.
            </p>

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
                  const detailsOpen = expandedTimelineCards[step.id] === true || isCurrent;

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
                      <div className="flex items-start gap-3 flex-1">
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className={`text-sm font-semibold ${toneClasses.text}`}>{step.title}</p>
                                {isCurrent && currentActionLabel && (
                                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/90">
                                    Action: {currentActionLabel}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2 self-start">
                                <span className={`mt-0.5 h-[15px] w-[15px] rounded-full ${toneClasses.dot}`} />
                                {isCurrent && (
                                  <Link
                                    href={currentStepHref}
                                    className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                                  >
                                    Open stage
                                  </Link>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5">
                              {metrics.map((metric) => (
                                <div key={metric.label} className="rounded border border-slate-700 bg-slate-900/50 p-2">
                                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{metric.label}</p>
                                  <p className="mt-1 text-xs font-semibold text-slate-100 break-words">{metric.value}</p>
                                </div>
                              ))}
                            </div>

                            <p className="text-xs text-slate-400">{step.description}</p>
                            <button
                              type="button"
                              onClick={() => toggleTimelineCard(step.id)}
                              className="text-xs font-semibold text-sky-300 hover:text-sky-200"
                            >
                              {detailsOpen ? 'Hide details' : 'Show details'}
                            </button>

                            {detailsOpen && (
                              <div className="rounded-md border border-slate-700 bg-slate-950/40 p-2.5 space-y-2">
                                <p className="text-[11px] text-slate-300">
                                  {isCurrent && primaryNextStep?.description
                                    ? primaryNextStep.description
                                    : 'No additional events recorded for this stage yet.'}
                                </p>
                                <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                                  <span>Updated: {formatDateTime(project.updatedAt)}</span>
                                  {project.createdAt && <span>Created: {formatDate(project.createdAt)}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
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
