import React from 'react';

export type ProgressProject = {
  id: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  professionals?: Array<{
    status?: string;
    quoteAmount?: string | number;
    invoice?: { paymentStatus?: string | null } | null;
  }>;
  feedbackEntered?: boolean;
};

export type ProjectProgressProps = {
  project: ProgressProject;
  hasAssist?: boolean;
  variant?: 'full' | 'compact';
};

type StepState = 'done' | 'optional-skipped' | 'upcoming';

type Step = {
  key: string;
  label: string;
  state: StepState;
  meta?: string;
};

const isPaid = (project?: ProgressProject) => {
  if (!project?.professionals) return false;
  return project.professionals.some((p) => p.invoice?.paymentStatus === 'paid');
};

const awardedProfessional = (project?: ProgressProject) => {
  return project?.professionals?.find((p) => p.status === 'awarded');
};

const countByStatus = (project?: ProgressProject) => {
  const professionals = project?.professionals || [];
  const acceptedStatuses = ['awarded', 'quoted', 'accepted', 'counter_requested'];
  const declinedStatuses = ['declined', 'rejected'];
  let accepted = 0;
  let declined = 0;
  professionals.forEach((p) => {
    if (!p.status) return;
    if (acceptedStatuses.includes(p.status)) accepted += 1;
    if (declinedStatuses.includes(p.status)) declined += 1;
  });
  return { accepted, declined, total: professionals.length };
};

const formatCounts = ({ total, accepted, declined }: { total: number; accepted: number; declined: number }) => {
  if (total === 0) return 'None yet';
  return `${accepted} accepted • ${declined} not accepted`;
};

export function ProjectProgressBar({ project, hasAssist, variant = 'full' }: ProjectProgressProps) {
  const { total, accepted, declined } = countByStatus(project);
  const contactedState: StepState = total > 0 ? 'done' : 'upcoming';
  const repliedState: StepState = accepted + declined > 0 ? 'done' : 'upcoming';
  const awardedState: StepState = awardedProfessional(project) || project.status === 'awarded' ? 'done' : 'upcoming';
  const fundsState: StepState = isPaid(project) ? 'done' : 'upcoming';
  const startedState: StepState = project.startDate ? 'done' : 'upcoming';
  const completedState: StepState = project.endDate || project.status === 'completed' ? 'done' : 'upcoming';
  const feedbackState: StepState = project.feedbackEntered ? 'done' : 'upcoming';

  const steps: Step[] = [
    { key: 'new', label: 'New project', state: 'done' },
    {
      key: 'assist',
      label: 'Help requested',
      state: hasAssist ? 'done' : 'optional-skipped',
      meta: hasAssist ? 'Fitout Hub assisting' : 'Available any time',
    },
    { key: 'contacted', label: 'Professionals contacted', state: contactedState, meta: total ? `${total} invited` : 'Invite pros' },
    {
      key: 'replied',
      label: 'Professionals replied',
      state: repliedState,
      meta: formatCounts({ total, accepted, declined }),
    },
    { key: 'awarded', label: 'Project awarded', state: awardedState, meta: awardedState === 'done' ? 'Contractor chosen' : undefined },
    { key: 'funds', label: 'Funds transferred', state: fundsState, meta: fundsState === 'done' ? 'In escrow' : 'Secure payment' },
    { key: 'started', label: 'Project started', state: startedState },
    { key: 'completed', label: 'Project completed', state: completedState },
    { key: 'feedback', label: 'Feedback entered', state: feedbackState },
  ];

  const dotSize = variant === 'compact' ? 'h-3 w-3' : 'h-4 w-4';
  const labelClass = variant === 'compact' ? 'text-[11px]' : 'text-xs';
  const metaClass = variant === 'compact' ? 'text-[10px]' : 'text-[11px]';
  const gapClass = variant === 'compact' ? 'gap-2' : 'gap-3';
  const lineWidth = variant === 'compact' ? 'w-10 md:w-12' : 'w-14 md:w-16';

  const colorFor = (state: StepState) => {
    if (state === 'done') return 'bg-emerald-500 border-emerald-500';
    if (state === 'optional-skipped') return 'bg-transparent border-slate-300';
    return 'bg-slate-700 border-slate-700';
  };

  const lineColor = (state: StepState) => (state === 'done' ? 'bg-emerald-200' : 'bg-slate-200');

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${variant === 'compact' ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center overflow-x-auto">
          {steps.map((step, idx) => (
            <div key={step.key} className={`flex items-center ${gapClass}`}>
              <div className="group flex flex-col items-center min-w-[76px] text-center">
                <div className={`rounded-full border ${dotSize} ${colorFor(step.state)} transition`}></div>
                <div className={`${labelClass} font-semibold text-slate-800 mt-1`}>{step.label}</div>
                {step.meta && <div className={`${metaClass} text-slate-500`}>{step.meta}</div>}
              </div>
              {idx !== steps.length - 1 && <div className={`${lineWidth} h-[2px] rounded-full ${lineColor(step.state)}`}></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
