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

  const dotSize = variant === 'compact' ? 'h-5 w-5' : 'h-6 w-6';
  const labelClass = variant === 'compact' ? 'text-[11px]' : 'text-xs';
  const lineHeight = variant === 'compact' ? 'h-[2px]' : 'h-[3px]';

  const colorFor = (state: StepState) => {
    if (state === 'done') return 'from-emerald-500 to-emerald-600 border-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)]';
    if (state === 'optional-skipped') return 'from-white to-white border-slate-300 text-slate-500 shadow-[0_2px_6px_rgba(15,23,42,0.08)]';
    return 'from-slate-700 to-slate-800 border-slate-700 text-white shadow-[0_2px_8px_rgba(15,23,42,0.25)]';
  };

  const lineColor = (state: StepState) => (state === 'done' ? 'bg-emerald-200' : 'bg-slate-300');

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${variant === 'compact' ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-col gap-2">
        {/* Top labels */}
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => (
            <div key={`top-${step.key}`} className="flex-1 flex justify-center">
              {idx % 2 === 0 ? (
                <span className={`${labelClass} font-semibold text-slate-800 whitespace-nowrap`}>{step.label}</span>
              ) : (
                <span className={`${labelClass} text-transparent select-none`} aria-hidden>_</span>
              )}
            </div>
          ))}
        </div>

        {/* Dots and lines */}
        <div className="flex items-center justify-between gap-2">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            return (
              <div key={`mid-${step.key}`} className="flex-1 flex items-center">
                <div
                  className={`relative flex items-center justify-center rounded-full border bg-gradient-to-br ${dotSize} ${colorFor(step.state)} text-[11px] font-semibold`}
                  title={step.label}
                >
                  {step.pill || ''}
                </div>
                {!isLast && <div className={`flex-1 ${lineHeight} rounded-full ${lineColor(step.state)}`}></div>}
              </div>
            );
          })}
        </div>

        {/* Bottom labels */}
        <div className="flex items-center justify-between">
          {steps.map((step, idx) => (
            <div key={`bottom-${step.key}`} className="flex-1 flex justify-center">
              {idx % 2 === 1 ? (
                <span className={`${labelClass} font-semibold text-slate-800 whitespace-nowrap`}>{step.label}</span>
              ) : (
                <span className={`${labelClass} text-transparent select-none`} aria-hidden>_</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
