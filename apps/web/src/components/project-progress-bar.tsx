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
  pill?: string;
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
    { key: 'new', label: 'New', state: 'done' },
    { key: 'assist', label: 'Help', state: hasAssist ? 'done' : 'optional-skipped' },
    { key: 'contacted', label: 'Invited', state: contactedState, pill: total ? String(total) : undefined },
    { key: 'replied', label: 'Replied', state: repliedState, pill: repliedState === 'done' ? String(accepted + declined) : undefined },
    { key: 'awarded', label: 'Awarded', state: awardedState },
    { key: 'funds', label: 'Funds', state: fundsState },
    { key: 'started', label: 'Started', state: startedState },
    { key: 'completed', label: 'Done', state: completedState },
    { key: 'feedback', label: 'Feedback', state: feedbackState },
  ];

  const dotSize = variant === 'compact' ? 'h-4 w-4' : 'h-5 w-5';
  const labelClass = variant === 'compact' ? 'text-[11px]' : 'text-xs';
  const gapClass = variant === 'compact' ? 'gap-3' : 'gap-4';
  const lineWidth = variant === 'compact' ? 'w-12 md:w-14' : 'w-16 md:w-20';

  const colorFor = (state: StepState) => {
    if (state === 'done') return 'bg-emerald-500 border-emerald-500';
    if (state === 'optional-skipped') return 'bg-transparent border-slate-300';
    return 'bg-slate-700 border-slate-700';
  };

  const lineColor = (state: StepState) => (state === 'done' ? 'bg-emerald-200' : 'bg-slate-300');

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${variant === 'compact' ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center">
        <div className="flex flex-1 items-center overflow-x-auto py-2">
          {steps.map((step, idx) => {
            const labelOnTop = idx % 2 === 0;
            return (
              <div key={step.key} className={`flex items-center ${gapClass}`}>
                <div className="relative flex flex-col items-center">
                  {labelOnTop && (
                    <div className={`${labelClass} font-semibold text-slate-800 mb-2 whitespace-nowrap`}>{step.label}</div>
                  )}
                  <div className={`relative rounded-full border ${dotSize} ${colorFor(step.state)} flex items-center justify-center text-[11px] font-semibold text-white`}
                    title={step.label}
                  >
                    {step.pill || ''}
                  </div>
                  {!labelOnTop && (
                    <div className={`${labelClass} font-semibold text-slate-800 mt-2 whitespace-nowrap`}>{step.label}</div>
                  )}
                </div>
                {idx !== steps.length - 1 && <div className={`${lineWidth} h-[2px] rounded-full ${lineColor(step.state)}`}></div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
