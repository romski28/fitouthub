export type EmergencyAiProjectScale = 'SCALE_1' | 'SCALE_2' | 'SCALE_3';

export interface EmergencyAiSafetyAssessment {
  riskLevel: string;
  isDangerous: boolean;
  concerns: string[];
  temporaryMitigations: string[];
  shouldEscalateEmergency: boolean;
  emergencyReason: string | null;
  requiresImmediateHumanContact: boolean;
  disclaimer: string | null;
}

export interface EmergencyAiBrief {
  title: string | null;
  summary: string | null;
  scope: string | null;
  projectScale: EmergencyAiProjectScale | null;
  propertyType: string | null;
  keyFacts: string[];
  assumptions: string[];
  risks: string[];
  missingInfo: string[];
  nextQuestions: string[];
  followUpQuestions: string[];
  advisoryTrades: string[];
  advisoryUnmappedNeeds: string[];
  budgetLabel: string | null;
  timelineLabel: string | null;
  overallConfidence: number | null;
  safetyAssessment: EmergencyAiSafetyAssessment | null;
}

const toString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

const normalizeScale = (value: unknown): EmergencyAiProjectScale | null => {
  return value === 'SCALE_1' || value === 'SCALE_2' || value === 'SCALE_3' ? value : null;
};

const normalizeSafetyAssessment = (value: unknown): EmergencyAiSafetyAssessment | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  const riskLevel = toString(source.riskLevel) || 'none';
  const concerns = toStringArray(source.concerns);
  const temporaryMitigations = toStringArray(source.temporaryMitigations);

  const hasSignal =
    riskLevel !== 'none' ||
    concerns.length > 0 ||
    temporaryMitigations.length > 0 ||
    typeof source.isDangerous === 'boolean' ||
    typeof source.shouldEscalateEmergency === 'boolean' ||
    typeof source.requiresImmediateHumanContact === 'boolean' ||
    toString(source.emergencyReason) !== null ||
    toString(source.disclaimer) !== null;

  if (!hasSignal) return null;

  return {
    riskLevel,
    isDangerous: source.isDangerous === true,
    concerns,
    temporaryMitigations,
    shouldEscalateEmergency: source.shouldEscalateEmergency === true,
    emergencyReason: toString(source.emergencyReason),
    requiresImmediateHumanContact: source.requiresImmediateHumanContact === true,
    disclaimer: toString(source.disclaimer),
  };
};

const buildBudgetLabel = (budget: Record<string, unknown> | null): string | null => {
  if (!budget) return null;
  const rawText = toString(budget.rawText);
  if (rawText) return rawText;

  const min = typeof budget.min === 'number' ? budget.min : null;
  const max = typeof budget.max === 'number' ? budget.max : null;
  const currency = toString(budget.currency) || 'HKD';
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) return `${currency} ${min.toLocaleString()}-${max.toLocaleString()}`;
  const value = max ?? min;
  return value !== null ? `${currency} ${value.toLocaleString()}` : null;
};

const buildTimelineLabel = (timeline: Record<string, unknown> | null): string | null => {
  if (!timeline) return null;
  const parts = [
    toString(timeline.durationText),
    toString(timeline.startText),
    toString(timeline.deadlineText),
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' | ') : null;
};

export function normalizeEmergencyAiBrief(
  parsedOutput: unknown,
  selectedTrade?: string | null,
): EmergencyAiBrief | null {
  if (!parsedOutput || typeof parsedOutput !== 'object' || Array.isArray(parsedOutput)) {
    return null;
  }

  const source = parsedOutput as Record<string, unknown>;
  const project =
    source.project && typeof source.project === 'object' && !Array.isArray(source.project)
      ? (source.project as Record<string, unknown>)
      : null;

  const advisoryTrades = toStringArray(source.trades).filter((trade) => {
    if (!selectedTrade) return true;
    return trade.toLowerCase() !== selectedTrade.trim().toLowerCase();
  });

  const brief: EmergencyAiBrief = {
    title: toString(source.title),
    summary: toString(source.summary),
    scope: toString(source.scope) || toString(project?.scopeText),
    projectScale: normalizeScale(source.projectScale) || normalizeScale(project?.projectScale),
    propertyType: toString(source.propertyType) || toString(project?.propertyType),
    keyFacts: toStringArray(source.keyFacts),
    assumptions: toStringArray(source.assumptions),
    risks: toStringArray(source.risks),
    missingInfo: toStringArray(source.missingInfo),
    nextQuestions: toStringArray(source.nextQuestions),
    followUpQuestions: toStringArray(source.followUpQuestions),
    advisoryTrades,
    advisoryUnmappedNeeds: toStringArray(source.unmappedNeeds),
    budgetLabel: buildBudgetLabel(
      source.budget && typeof source.budget === 'object' && !Array.isArray(source.budget)
        ? (source.budget as Record<string, unknown>)
        : null,
    ),
    timelineLabel: buildTimelineLabel(
      source.timeline && typeof source.timeline === 'object' && !Array.isArray(source.timeline)
        ? (source.timeline as Record<string, unknown>)
        : null,
    ),
    overallConfidence: typeof source.overallConfidence === 'number' ? source.overallConfidence : null,
    safetyAssessment: normalizeSafetyAssessment(source.safetyAssessment),
  };

  const hasContent = Boolean(
    brief.title ||
      brief.summary ||
      brief.scope ||
      brief.projectScale ||
      brief.propertyType ||
      brief.keyFacts.length > 0 ||
      brief.assumptions.length > 0 ||
      brief.risks.length > 0 ||
      brief.safetyAssessment ||
      brief.advisoryTrades.length > 0 ||
      brief.advisoryUnmappedNeeds.length > 0 ||
      brief.budgetLabel ||
      brief.timelineLabel,
  );

  return hasContent ? brief : null;
}

export function buildEmergencyProjectNotes(userNotes: string, aiBrief: EmergencyAiBrief | null): string {
  const sections: string[] = [];
  const trimmedUserNotes = userNotes.trim();

  if (trimmedUserNotes) {
    sections.push(trimmedUserNotes);
  }

  if (aiBrief?.summary) {
    sections.push(`AI summary: ${aiBrief.summary}`);
  } else if (aiBrief?.scope) {
    sections.push(`AI scope: ${aiBrief.scope}`);
  }

  if (aiBrief?.keyFacts.length) {
    sections.push(`Key facts: ${aiBrief.keyFacts.slice(0, 3).join('; ')}`);
  }

  if (aiBrief?.safetyAssessment) {
    const safetyBits = [
      aiBrief.safetyAssessment.emergencyReason,
      ...aiBrief.safetyAssessment.concerns.slice(0, 2),
      aiBrief.safetyAssessment.temporaryMitigations.length > 0
        ? `Temporary steps: ${aiBrief.safetyAssessment.temporaryMitigations.slice(0, 2).join('; ')}`
        : null,
    ].filter((value): value is string => Boolean(value));

    if (safetyBits.length > 0) {
      sections.push(`Safety: ${safetyBits.join(' | ')}`);
    }
  }

  if (aiBrief?.advisoryTrades.length || aiBrief?.advisoryUnmappedNeeds.length) {
    const extraNeeds = [
      aiBrief.advisoryTrades.length > 0 ? `Possible additional trades: ${aiBrief.advisoryTrades.slice(0, 3).join(', ')}` : null,
      aiBrief.advisoryUnmappedNeeds.length > 0 ? `Possible additional needs: ${aiBrief.advisoryUnmappedNeeds.slice(0, 3).join(', ')}` : null,
    ].filter((value): value is string => Boolean(value));
    if (extraNeeds.length > 0) {
      sections.push(extraNeeds.join(' | '));
    }
  }

  return sections.join('\n\n').trim();
}