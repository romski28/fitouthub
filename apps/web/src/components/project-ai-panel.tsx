'use client';

import { SafetyGuidanceCard, buildSafetyGuidanceFromAssessment } from '@/components/safety-guidance-card';

type AiIntakeView = {
  id?: string;
  title?: unknown;
  summary?: unknown;
  scope?: unknown;
  overallConfidence?: unknown;
  rawOutput?: unknown;
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

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  const projectJson =
    aiIntake.project && typeof aiIntake.project === 'object' && !Array.isArray(aiIntake.project)
      ? (aiIntake.project as Record<string, unknown>)
      : null;
  const rawOutput =
    aiIntake.rawOutput && typeof aiIntake.rawOutput === 'object' && !Array.isArray(aiIntake.rawOutput)
      ? (aiIntake.rawOutput as Record<string, unknown>)
      : null;
  const title = toStringValue(aiIntake.title);
  const summary =
    toStringValue(aiIntake.summary) ||
    toStringValue(aiIntake.scope) ||
    toStringValue(projectJson?.scopeText);
  const propertyType = toStringValue(projectJson?.propertyType);
  const projectScale =
    rawOutput?.projectScale === 'SCALE_1' || rawOutput?.projectScale === 'SCALE_2' || rawOutput?.projectScale === 'SCALE_3'
      ? rawOutput.projectScale
      : projectJson?.projectScale === 'SCALE_1' || projectJson?.projectScale === 'SCALE_2' || projectJson?.projectScale === 'SCALE_3'
        ? projectJson.projectScale
        : null;
  const keyFacts = toStringArray(rawOutput?.keyFacts).slice(0, 4);
  const missingInfo = toStringArray(rawOutput?.missingInfo).slice(0, 3);
  const overallConfidence = typeof aiIntake.overallConfidence === 'number' ? aiIntake.overallConfidence : null;
  const detectedLanguage = typeof rawOutput?.language === 'string' ? rawOutput.language : null;
  const languageLabel: Record<string, string> = {
    en: 'English',
    'zh-HK': '廣東話',
    'zh-CN': '普通话',
    mixed: 'English / 中文',
  };
  const safety = parseSafetyAssessment(aiIntake);
  const normalizedRiskLevel = (safety?.riskLevel || '').toLowerCase();
  const safetyGuidance = buildSafetyGuidanceFromAssessment(safety);
  const hasSafety = Boolean(
    safety &&
      (
        safety.isDangerous ||
        safety.shouldEscalateEmergency ||
        safety.requiresImmediateHumanContact ||
        Boolean(safety.emergencyReason) ||
        safety.concerns.length > 0 ||
        safety.temporaryMitigations.length > 0 ||
        (normalizedRiskLevel.length > 0 && normalizedRiskLevel !== 'none')
      ),
  );
  const isSafetyAcknowledged = safety?.adminReview?.status === 'acknowledged';

  const safetyBlock = hasSafety ? (
    <div className="mb-3 space-y-2">
      {mode === 'admin' && onAcknowledgeSafety && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">Safety review</p>
          <button
            type="button"
            onClick={() => void onAcknowledgeSafety()}
            disabled={isAcknowledgingSafety || isSafetyAcknowledged}
            className="rounded-md border border-current bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 disabled:opacity-60"
          >
            {isSafetyAcknowledged ? 'OK recorded' : isAcknowledgingSafety ? 'Saving…' : 'OK'}
          </button>
        </div>
      )}
      <SafetyGuidanceCard guidance={safetyGuidance} />
      {mode === 'admin' && isSafetyAcknowledged && safety?.adminReview?.acknowledgedByName && (
        <p className="mt-2 text-xs text-white/80">Acknowledged by {safety.adminReview.acknowledgedByName}</p>
      )}
    </div>
  ) : null;

  if (mode === 'admin') {
    return (
      <div className={`rounded-lg border border-violet-500/40 bg-violet-500/15 p-4 ${className}`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-violet-200">From AI (Full Intake)</h3>
          <div className="flex items-center gap-2">
            {detectedLanguage && detectedLanguage !== 'en' && (
              <span className="text-[10px] bg-violet-500/20 text-violet-200 px-2 py-0.5 rounded-full">
                {languageLabel[detectedLanguage] || detectedLanguage}
              </span>
            )}
            {aiIntake.id && <span className="text-[11px] text-violet-300/70">Intake ID: {aiIntake.id}</span>}
          </div>
        </div>
        {(title || summary) && (
          <div className="mb-3 rounded-lg border border-violet-500/25 bg-slate-950/25 p-3">
            {title && <p className="text-sm font-semibold text-white">{title}</p>}
            {summary && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{summary}</p>}
          </div>
        )}
        {(projectScale || propertyType || overallConfidence !== null) && (
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {projectScale && (
              <div className="rounded-lg border border-violet-500/25 bg-slate-950/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-violet-200/80">Project scale</p>
                <p className="text-sm font-semibold text-white">{projectScale}</p>
              </div>
            )}
            {propertyType && (
              <div className="rounded-lg border border-violet-500/25 bg-slate-950/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-violet-200/80">Property type</p>
                <p className="text-sm font-semibold text-white">{propertyType}</p>
              </div>
            )}
            {overallConfidence !== null && (
              <div className="rounded-lg border border-violet-500/25 bg-slate-950/25 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-violet-200/80">Confidence</p>
                <p className="text-sm font-semibold text-white">{Math.round(overallConfidence * 100)}%</p>
              </div>
            )}
          </div>
        )}
        {safetyBlock}
        {keyFacts.length > 0 && (
          <div className="mb-3 rounded-lg border border-violet-500/25 bg-slate-950/25 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-200">Key facts</p>
            <ul className="space-y-1">
              {keyFacts.map((item, index) => (
                <li key={`ai-key-fact-${index}`} className="flex gap-2 text-sm text-slate-200">
                  <span className="text-violet-300">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {missingInfo.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-100">Still missing</p>
            <ul className="space-y-1">
              {missingInfo.map((item, index) => (
                <li key={`ai-missing-${index}`} className="flex gap-2 text-sm text-amber-50">
                  <span className="text-amber-200">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900/50 p-3 text-[11px] text-slate-300 border border-violet-500/20">
          {JSON.stringify(aiIntake, null, 2)}
        </pre>
      </div>
    );
  }

  if (!hasSafety && assumptions.length === 0 && risks.length === 0) return null;

  const clientContent = (
    <>
      <p className="text-xs text-white mb-3">Safety information prepared by Mimo with support from DeepSeek AI. For clarification or professional advice, please reach out through the chat button.</p>

      {safetyBlock}

      {assumptions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white mb-1">Assumptions</p>
          <ul className="space-y-1">
            {assumptions.map((item, index) => (
              <li key={`assumption-${index}`} className="text-sm text-white flex gap-2">
                <span className="text-white">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white mb-1">Risks</p>
          <ul className="space-y-1">
            {risks.map((item, index) => (
              <li key={`risk-${index}`} className="text-sm text-white flex gap-2">
                <span className="text-white">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return className ? <div className={className}>{clientContent}</div> : clientContent;
}
