'use client';

type AiIntakeView = {
  id?: string;
  assumptions?: unknown;
  risks?: unknown;
  [key: string]: unknown;
} | null;

interface ProjectAiPanelProps {
  aiIntake?: AiIntakeView;
  mode?: 'client' | 'professional' | 'admin';
  className?: string;
}

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

export function ProjectAiPanel({ aiIntake, mode = 'client', className = '' }: ProjectAiPanelProps) {
  if (!aiIntake) return null;

  const assumptions = toStringArray(aiIntake.assumptions);
  const risks = toStringArray(aiIntake.risks);

  if (mode === 'admin') {
    return (
      <div className={`rounded-lg border border-violet-200 bg-violet-50 p-4 ${className}`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-violet-900">From AI (Full Intake)</h3>
          {aiIntake.id && <span className="text-[11px] text-violet-700">Intake ID: {aiIntake.id}</span>}
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-[11px] text-slate-700 border border-violet-100">
          {JSON.stringify(aiIntake, null, 2)}
        </pre>
      </div>
    );
  }

  if (assumptions.length === 0 && risks.length === 0) return null;

  return (
    <div className={`rounded-lg border border-violet-200 bg-violet-50 p-4 ${className}`}>
      <h3 className="text-sm font-bold text-violet-900 mb-2">From AI</h3>
      <p className="text-xs text-violet-700 mb-3">AI assumptions and risks to review before proceeding.</p>

      {assumptions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 mb-1">Assumptions</p>
          <ul className="space-y-1">
            {assumptions.map((item, index) => (
              <li key={`assumption-${index}`} className="text-sm text-slate-700 flex gap-2">
                <span className="text-violet-500">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 mb-1">Risks</p>
          <ul className="space-y-1">
            {risks.map((item, index) => (
              <li key={`risk-${index}`} className="text-sm text-slate-700 flex gap-2">
                <span className="text-violet-500">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
