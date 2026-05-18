'use client';

export type SafetyGuidance = {
  riskLevel?: string | null;
  summary?: string | null;
  details?: string[];
  immediateActions?: string[];
  disclaimer?: string | null;
};

type SafetyGuidanceCardProps = {
  guidance: SafetyGuidance | null | undefined;
  size?: 'default' | 'compact';
  className?: string;
};

type RiskTone = 'high' | 'medium' | 'low' | 'default';

function normalizeRiskTone(value?: string | null): RiskTone {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'critical' || normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'moderate') return 'medium';
  if (normalized === 'low') return 'low';
  return 'default';
}

function getRiskToneClasses(tone: RiskTone) {
  switch (tone) {
    case 'high':
      return {
        border: 'border-red-300',
        text: 'text-red-700',
        badge: 'bg-red-100 text-red-700',
      };
    case 'medium':
      return {
        border: 'border-amber-300',
        text: 'text-amber-700',
        badge: 'bg-amber-100 text-amber-700',
      };
    case 'low':
      return {
        border: 'border-emerald-300',
        text: 'text-emerald-700',
        badge: 'bg-emerald-100 text-emerald-700',
      };
    default:
      return {
        border: 'border-slate-300',
        text: 'text-slate-700',
        badge: 'bg-slate-200 text-slate-700',
      };
  }
}

function splitActionLine(value: string): string[] {
  return value
    .split(/\s*;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseSafetyGuidanceText(warnings?: string): SafetyGuidance | null {
  const lines = (warnings || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  let riskLevel: string | undefined;
  let summary: string | undefined;
  const details: string[] = [];
  let immediateActions: string[] = [];
  let disclaimer: string | undefined;

  for (const line of lines) {
    const riskMatch = line.match(/^Risk:\s*(.+)$/i);
    if (riskMatch) {
      riskLevel = riskMatch[1]?.trim();
      continue;
    }

    const immediateMatch = line.match(/^Immediate\s+(?:steps|actions):\s*(.+)$/i);
    if (immediateMatch) {
      immediateActions = splitActionLine(immediateMatch[1] || '');
      continue;
    }

    if (!summary) {
      summary = line;
      continue;
    }

    if (/disclaimer/i.test(line)) {
      disclaimer = line;
      continue;
    }

    details.push(line);
  }

  return {
    riskLevel,
    summary,
    details,
    immediateActions,
    disclaimer,
  };
}

export function buildSafetyGuidanceFromAssessment(safety: {
  riskLevel?: string;
  emergencyReason?: string | null;
  concerns?: string[];
  temporaryMitigations?: string[];
  disclaimer?: string | null;
} | null | undefined): SafetyGuidance | null {
  if (!safety) return null;

  const details = Array.isArray(safety.concerns) ? safety.concerns.filter(Boolean) : [];
  const immediateActions = Array.isArray(safety.temporaryMitigations)
    ? safety.temporaryMitigations.filter(Boolean)
    : [];

  if (!safety.riskLevel && !safety.emergencyReason && details.length === 0 && immediateActions.length === 0 && !safety.disclaimer) {
    return null;
  }

  return {
    riskLevel: safety.riskLevel,
    summary: safety.emergencyReason,
    details,
    immediateActions,
    disclaimer: safety.disclaimer,
  };
}

export function SafetyGuidanceCard({ guidance, size = 'default', className = '' }: SafetyGuidanceCardProps) {
  if (!guidance) return null;

  const riskToneClasses = getRiskToneClasses(normalizeRiskTone(guidance.riskLevel));
  const riskLabel = guidance.riskLevel?.trim().toUpperCase();
  const details = guidance.details?.filter(Boolean) || [];
  const immediateActions = guidance.immediateActions?.filter(Boolean) || [];
  const isCompact = size === 'compact';

  return (
    <div className={`rounded-xl border bg-[#F5EEDE]/90 ${riskToneClasses.border} ${isCompact ? 'px-3 py-3' : 'px-4 py-4'} ${className}`.trim()}>
      <div className={`flex items-start gap-3 ${isCompact ? 'text-xs' : 'text-sm'}`}>
        <span className={isCompact ? 'text-3xl leading-none' : 'text-4xl leading-none'}>⚠</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-slate-900`}>Your saftey - Please read</p>
            {riskLabel && (
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${riskToneClasses.badge}`}>
                {riskLabel}
              </span>
            )}
          </div>

          {riskLabel && (
            <p className={`mt-2 ${isCompact ? 'text-xs' : 'text-sm'} text-slate-800`}>
              Risk: <span className={`font-semibold ${riskToneClasses.text}`}>{riskLabel}</span>
            </p>
          )}

          {guidance.summary && (
            <p className={`mt-2 ${isCompact ? 'text-xs' : 'text-sm'} text-slate-800`}>{guidance.summary}</p>
          )}

          {details.length > 0 && (
            <div className={`mt-2 space-y-2 ${isCompact ? 'text-xs' : 'text-sm'} text-slate-800`}>
              {details.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          {immediateActions.length > 0 && (
            <div className={`mt-3 ${isCompact ? 'text-xs' : 'text-sm'} text-slate-800`}>
              <p className="font-semibold text-slate-900">Immediate actions</p>
              <div className="mt-1 space-y-1">
                {immediateActions.map((action) => (
                  <p key={action}>{action}</p>
                ))}
              </div>
            </div>
          )}

          {guidance.disclaimer && (
            <p className={`mt-3 ${isCompact ? 'text-[11px]' : 'text-xs'} text-slate-500`}>{guidance.disclaimer}</p>
          )}
        </div>
      </div>
    </div>
  );
}