'use client';

type AiIntakeView = {
  id?: string;
  assumptions?: unknown;
  risks?: unknown;
  project?: unknown;
  safetyAssessment?: unknown;
  [key: string]: unknown;
} | null;

interface ProjectAiPanelProps {
  aiIntake?: AiIntakeView;
  mode?: 'client' | 'professional' | 'admin';
  className?: string;
  onAcknowledgeSafety?: () => Promise<void> | void;
  isAcknowledgingSafety?: boolean;
}

type SafetyAssessmentView = {
  riskLevel: string;
  isDangerous: boolean;
  concerns: string[];
  temporaryMitigations: string[];
  shouldEscalateEmergency: boolean;
  emergencyReason: string | null;
  requiresImmediateHumanContact: boolean;
  disclaimer: string | null;
  adminReview?: {
    status?: string;
    acknowledgedAt?: string | null;
    acknowledgedByName?: string | null;
  } | null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

const parseSafetyAssessment = (aiIntake: AiIntakeView): SafetyAssessmentView | null => {
  if (!aiIntake) return null;

  const projectJson =
    aiIntake.project && typeof aiIntake.project === 'object' && !Array.isArray(aiIntake.project)
      ? (aiIntake.project as Record<string, unknown>)
      : null;
  const raw =
    (projectJson?.safetyAssessment as Record<string, unknown> | undefined) ||
    (aiIntake.safetyAssessment as Record<string, unknown> | undefined);

  if (!raw || typeof raw !== 'object') return null;

  return {
    riskLevel: typeof raw.riskLevel === 'string' ? raw.riskLevel : 'none',
    isDangerous: typeof raw.isDangerous === 'boolean' ? raw.isDangerous : false,
    concerns: toStringArray(raw.concerns),
    temporaryMitigations: toStringArray(raw.temporaryMitigations),
    shouldEscalateEmergency:
      typeof raw.shouldEscalateEmergency === 'boolean' ? raw.shouldEscalateEmergency : false,
    emergencyReason:
      typeof raw.emergencyReason === 'string' && raw.emergencyReason.trim().length > 0
        ? raw.emergencyReason
        : null,
    requiresImmediateHumanContact:
      typeof raw.requiresImmediateHumanContact === 'boolean'
        ? raw.requiresImmediateHumanContact
        : false,
    disclaimer:
      typeof raw.disclaimer === 'string' && raw.disclaimer.trim().length > 0
        ? raw.disclaimer
        : null,
    adminReview:
      raw.adminReview && typeof raw.adminReview === 'object'
        ? (raw.adminReview as SafetyAssessmentView['adminReview'])
        : null,
  };
};

export function ProjectAiPanel({
  aiIntake,
  mode = 'client',
  className = '',
  onAcknowledgeSafety,
  isAcknowledgingSafety = false,
}: ProjectAiPanelProps) {
  if (!aiIntake) return null;

  const assumptions = toStringArray(aiIntake.assumptions);
  const risks = toStringArray(aiIntake.risks);
  const safety = parseSafetyAssessment(aiIntake);
  const normalizedRiskLevel = (safety?.riskLevel || '').toLowerCase();
  const hasSafety = Boolean(
    safety &&
      (
        safety.isDangerous ||
        safety.shouldEscalateEmergency ||
        safety.requiresImmediateHumanContact ||
        Boolean(safety.emergencyReason) ||
        safety.concerns.length > 0 ||
        safety.temporaryMitigations.length > 0 ||
        normalizedRiskLevel === 'high' ||
        normalizedRiskLevel === 'critical'
      ),
  );
  const isSafetyAcknowledged = safety?.adminReview?.status === 'acknowledged';

  const safetyTone =
    safety?.riskLevel === 'critical'
      ? 'border-rose-300 bg-rose-50 text-rose-900'
      : safety?.riskLevel === 'high'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : 'border-yellow-300 bg-yellow-50 text-yellow-900';

  const safetyBlock = hasSafety ? (
    <div className={`rounded-lg border p-4 ${safetyTone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold">Safety flag: {safety?.riskLevel || 'review'}</h4>
          {safety?.emergencyReason && (
            <p className="mt-1 text-sm font-medium">{safety.emergencyReason}</p>
          )}
        </div>
        {mode === 'admin' && onAcknowledgeSafety && (
          <button
            type="button"
            onClick={() => void onAcknowledgeSafety()}
            disabled={isAcknowledgingSafety || isSafetyAcknowledged}
            className="rounded-md border border-current bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            {isSafetyAcknowledged ? 'OK recorded' : isAcknowledgingSafety ? 'Saving…' : 'OK'}
          </button>
        )}
      </div>

      {safety?.concerns && safety.concerns.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1">Concerns</p>
          <ul className="space-y-1">
            {safety.concerns.map((item, index) => (
              <li key={`safety-concern-${index}`} className="text-sm flex gap-2">
                <span>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {safety?.temporaryMitigations && safety.temporaryMitigations.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1">Suggested mitigations</p>
          <ul className="space-y-1">
            {safety.temporaryMitigations.map((item, index) => (
              <li key={`safety-mitigation-${index}`} className="text-sm flex gap-2">
                <span>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {safety?.disclaimer && <p className="mt-3 text-xs opacity-90">{safety.disclaimer}</p>}
      {mode === 'admin' && isSafetyAcknowledged && safety?.adminReview?.acknowledgedByName && (
        <p className="mt-2 text-xs opacity-80">Acknowledged by {safety.adminReview.acknowledgedByName}</p>
      )}
    </div>
  ) : null;

  if (mode === 'admin') {
    return (
      <div className={`rounded-lg border border-violet-200 bg-violet-50 p-4 ${className}`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-violet-900">From AI (Full Intake)</h3>
          {aiIntake.id && <span className="text-[11px] text-violet-700">Intake ID: {aiIntake.id}</span>}
        </div>
        {safetyBlock && <div className="mb-3">{safetyBlock}</div>}
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-[11px] text-slate-700 border border-violet-100">
          {JSON.stringify(aiIntake, null, 2)}
        </pre>
      </div>
    );
  }

  if (!hasSafety && assumptions.length === 0 && risks.length === 0) return null;

  return (
    <div className={`rounded-lg border border-violet-200 bg-violet-50 p-4 ${className}`}>
      <h3 className="text-sm font-bold text-violet-900 mb-2">From AI</h3>
      <p className="text-xs text-violet-700 mb-3">AI assumptions and risks to review before proceeding.</p>

      {safetyBlock && <div className="mb-3">{safetyBlock}</div>}

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
