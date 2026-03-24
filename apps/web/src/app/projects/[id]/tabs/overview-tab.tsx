'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { ProjectProgressBar } from '@/components/project-progress-bar';
import ProjectFinancialsCard from '@/components/project-financials-card';
import { ProjectAiPanel } from '@/components/project-ai-panel';
import { fetchPrimaryNextStep, type NextStepAction } from '@/lib/next-steps';
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
  fundsSecured: boolean;
  onScheduleUpdate: (data: { startDate?: string; endDate?: string }) => Promise<void>;
  onContactUpdate: (data: { name?: string; phone?: string; email?: string }) => Promise<void>;
  onPayInvoice: () => Promise<void>;
  isUpdatingSchedule: boolean;
  isUpdatingContact: boolean;
  isPayingInvoice: boolean;
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

const projectStatusBadge: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
  approved: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40',
  rejected: 'bg-rose-500/20 text-rose-200 border border-rose-500/40',
  withdrawn: 'bg-slate-700 text-slate-300 border border-slate-600',
  awarded: 'bg-blue-500/20 text-blue-200 border border-blue-500/40',
};

type TimelineStepDef = {
  id: string;
  title: string;
  description: string;
  actionKeys: string[];
  tab: string;
};

const timelineSteps: TimelineStepDef[] = [
  {
    id: 'created-invite',
    title: 'Project Created & Invite',
    description: 'Create the project and invite professionals to bid.',
    actionKeys: ['WAIT_FOR_QUOTES', 'INVITE_PROFESSIONALS'],
    tab: 'professionals',
  },
  {
    id: 'bidding',
    title: 'Bidding & Quote Intake',
    description: 'Collect and review incoming quotations.',
    actionKeys: ['REVIEW_INCOMING_QUOTES', 'REQUEST_SITE_VISIT'],
    tab: 'professionals',
  },
  {
    id: 'site-visit',
    title: 'Site Visit Coordination',
    description: 'Confirm access and schedule site visit where needed.',
    actionKeys: ['CONFIRM_SITE_VISIT'],
    tab: 'site-access',
  },
  {
    id: 'compare',
    title: 'Compare Quotes',
    description: 'Review and compare final offers.',
    actionKeys: ['COMPARE_QUOTES'],
    tab: 'professionals',
  },
  {
    id: 'select',
    title: 'Select Professional',
    description: 'Choose who will execute the project.',
    actionKeys: ['SELECT_PROFESSIONAL'],
    tab: 'professionals',
  },
  {
    id: 'contract',
    title: 'Contract & Sign-off',
    description: 'Review terms and finalise the contract.',
    actionKeys: ['REVIEW_CONTRACT'],
    tab: 'contract',
  },
  {
    id: 'pre-work',
    title: 'Pre-work Setup',
    description: 'Confirm start details before works begin.',
    actionKeys: ['CONFIRM_START_DETAILS'],
    tab: 'overview',
  },
  {
    id: 'work-progress',
    title: 'Work In Progress',
    description: 'Track updates and monitor delivery progress.',
    actionKeys: ['REVIEW_PROGRESS'],
    tab: 'schedule',
  },
  {
    id: 'milestones',
    title: 'Milestone Review',
    description: 'Approve milestones and confirm next phase.',
    actionKeys: ['APPROVE_MILESTONE', 'CONFIRM_NEXT_PHASE'],
    tab: 'schedule',
  },
  {
    id: 'final-inspection-plan',
    title: 'Final Inspection Planning',
    description: 'Arrange final walkthrough and close-out checks.',
    actionKeys: ['SCHEDULE_FINAL_INSPECTION'],
    tab: 'schedule',
  },
  {
    id: 'handover',
    title: 'Final Approval & Handover',
    description: 'Approve final work and complete handover.',
    actionKeys: ['APPROVE_FINAL_WORK'],
    tab: 'schedule',
  },
  {
    id: 'warranty',
    title: 'Warranty Period',
    description: 'Monitor defects and warranty support.',
    actionKeys: ['ENTER_WARRANTY_PERIOD', 'REPORT_DEFECT'],
    tab: 'schedule',
  },
];

const inferTimelineIndexFromStatus = (status?: string) => {
  const normalized = (status || '').toLowerCase();

  if (normalized === 'completed' || normalized === 'rated') {
    return timelineSteps.length;
  }

  if (normalized === 'started') return 7;
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
  fundsSecured,
  onScheduleUpdate,
  onContactUpdate,
  onPayInvoice,
  isUpdatingSchedule,
  isUpdatingContact,
  isPayingInvoice,
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
  const awardedPro = project.professionals?.find((pp) => pp.status === 'awarded');
  const projectCostValue = Number(awardedPro?.quoteAmount || project.approvedBudget || project.budget || 0);
  const hasAiInsights = Boolean(
    project.aiIntake &&
      (project.aiIntake.assumptions || project.aiIntake.risks || project.aiIntake.project),
  );

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

  const maxTimelineStartIndex = Math.max(0, timelineSteps.length - 3);
  const homeTimelineStartIndex = Math.min(
    Math.max(currentTimelineStepIndex - 1, 0),
    maxTimelineStartIndex,
  );
  const [timelineStartIndex, setTimelineStartIndex] = useState(homeTimelineStartIndex);

  useEffect(() => {
    setTimelineStartIndex((previous) => {
      const clampedPrevious = Math.min(Math.max(previous, 0), maxTimelineStartIndex);
      const windowEnd = clampedPrevious + 2;
      if (currentTimelineStepIndex < clampedPrevious || currentTimelineStepIndex > windowEnd) {
        return homeTimelineStartIndex;
      }
      return clampedPrevious;
    });
  }, [currentTimelineStepIndex, homeTimelineStartIndex, maxTimelineStartIndex]);

  const timelineWindow = useMemo(
    () =>
      timelineSteps
        .map((step, index) => ({ step, index }))
        .slice(timelineStartIndex, timelineStartIndex + 3),
    [timelineStartIndex],
  );

  const handleTimelineWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    setTimelineStartIndex((prev) => {
      if (event.deltaY > 0) {
        return Math.min(maxTimelineStartIndex, prev + 1);
      }
      return Math.max(0, prev - 1);
    });
  };

  const currentStepIsDelayed = useMemo(() => {
    if (!currentTimelineStep) return false;
    const referenceDate = project.updatedAt || project.createdAt;
    if (!referenceDate) return false;

    const ageMs = Date.now() - new Date(referenceDate).getTime();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    return ageMs > seventyTwoHoursMs;
  }, [currentTimelineStep, project.updatedAt, project.createdAt]);

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
              <div className="space-y-2" onWheel={handleTimelineWheel}>
                <div className="rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setTimelineStartIndex((prev) => Math.max(0, prev - 1))}
                      disabled={timelineStartIndex === 0}
                      className="inline-flex items-center rounded-md border border-slate-600 bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50 transition"
                    >
                      ↑ Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineStartIndex(homeTimelineStartIndex)}
                      disabled={timelineStartIndex === homeTimelineStartIndex}
                      className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                    >
                      Home
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTimelineStartIndex((prev) => Math.min(maxTimelineStartIndex, prev + 1))
                      }
                      disabled={timelineStartIndex >= maxTimelineStartIndex}
                      className="inline-flex items-center rounded-md border border-slate-600 bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50 transition"
                    >
                      Down ↓
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Showing steps {timelineStartIndex + 1}–
                    {Math.min(timelineStartIndex + 3, timelineSteps.length)} of {timelineSteps.length}
                  </p>
                </div>

                {timelineWindow.map(({ step, index }) => {
                  const isComplete = index < currentTimelineStepIndex;
                  const isCurrent = index === currentTimelineStepIndex;
                  const isFuture = index > currentTimelineStepIndex;
                  const currentStepHref = `/projects/${project.id}?tab=${encodeURIComponent(step.tab)}`;
                  const currentActionLabel =
                    primaryNextStep?.actionLabel && primaryNextStep.actionLabel !== step.title
                      ? primaryNextStep.actionLabel
                      : null;

                  const toneClasses = isComplete
                    ? {
                        dot: 'bg-emerald-500',
                        border: 'border-emerald-500/40',
                        bg: 'bg-emerald-500/15',
                        text: 'text-emerald-200',
                        label: 'Complete',
                      }
                    : isCurrent
                      ? currentStepIsDelayed
                        ? {
                            dot: 'bg-rose-500',
                            border: 'border-rose-500/40',
                            bg: 'bg-rose-500/15',
                            text: 'text-rose-200',
                            label: 'Delayed',
                          }
                        : {
                            dot: 'bg-amber-500',
                            border: 'border-amber-500/40',
                            bg: 'bg-amber-500/15',
                            text: 'text-amber-200',
                            label: 'In progress',
                          }
                      : {
                          dot: 'bg-slate-500',
                          border: 'border-slate-600',
                          bg: 'bg-slate-800/50',
                          text: 'text-slate-300',
                          label: 'Planned',
                        };

                  return (
                    <div
                      key={step.id}
                      className={`rounded-md border px-3 py-2 ${toneClasses.border} ${toneClasses.bg}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${toneClasses.dot}`} />
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
                              <div className="flex flex-col items-start gap-2 self-start">
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClasses.text}`}>
                                  {toneClasses.label}
                                </span>
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
                            <p className="text-xs text-slate-400">{step.description}</p>
                            {isCurrent && primaryNextStep?.description && (
                              <p className="text-xs text-slate-300">
                                {primaryNextStep.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AccordionItem>

        {/* Schedule & Contractor Contact */}
        <AccordionItem
          id="schedule-contact"
          title="Schedule & Contractor Contact"
          isOpen={expandedAccordions['schedule-contact'] === true}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-4">
            {/* Schedule Section */}
            <div className="rounded-md bg-slate-800/50 p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white">Schedule</h4>
                {!editingSchedule && (
                  <button
                    onClick={() => setEditingSchedule(true)}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {editingSchedule ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={scheduleForm.startDate}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, startDate: e.target.value })}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">End Date</label>
                    <input
                      type="date"
                      value={scheduleForm.endDate}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, endDate: e.target.value })}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      onClick={() => setEditingSchedule(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-300 border border-slate-600 rounded-md hover:bg-slate-700/50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleScheduleSave}
                      disabled={isUpdatingSchedule}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 transition"
                    >
                      {isUpdatingSchedule ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Start Date</p>
                    <p className="font-medium text-white">{formatDate(project.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">End Date</p>
                    <p className="font-medium text-white">{formatDate(project.endDate)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Contractor Contact Section */}
            <div className="rounded-md bg-slate-800/50 p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-white">Contractor Contact</h4>
                {!editingContact && (
                  <button
                    onClick={() => setEditingContact(true)}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {editingContact ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="e.g., John Doe"
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="e.g., +852 1234 5678"
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="e.g., john@example.com"
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      onClick={() => setEditingContact(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-300 border border-slate-600 rounded-md hover:bg-slate-700/50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleContactSave}
                      disabled={isUpdatingContact}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 transition"
                    >
                      {isUpdatingContact ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Name</p>
                    <p className="font-medium text-white">{project.contractorContactName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Phone</p>
                    <p className="font-medium text-white">{project.contractorContactPhone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Email</p>
                    <p className="font-medium text-white">{project.contractorContactEmail || '—'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AccordionItem>

        {/* Progress & Financials */}
        <AccordionItem
          id="progress-financials"
          title="Progress & Financials"
          isOpen={expandedAccordions['progress-financials'] === true}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-4">
            {/* Project Progress Bar */}
            <ProjectProgressBar
              project={{
                id: project.id,
                status: project.status,
                startDate: project.startDate,
                endDate: project.endDate,
                professionals:
                  project.professionals?.map((p) => ({
                    status: p.status,
                    quoteAmount: p.quoteAmount,
                    invoice: p.invoice || null,
                  })) || [],
              }}
              hasAssist={false}
              variant="compact"
              fundsSecured={fundsSecured}
            />

            {/* Project Financials */}
            {accessToken && (
              <ProjectFinancialsCard
                projectId={project.id}
                accessToken={accessToken}
                projectCost={projectCostValue}
                originalBudget={project.budget}
                role="client"
                onClarify={() => {
                  // This callback could trigger navigation to chat tab
                  // For now, just console log
                  console.log('Clarify clicked');
                }}
              />
            )}
          </div>
        </AccordionItem>
      </AccordionGroup>
    </div>
  );
};
