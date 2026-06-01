export const AI_INTAKE_TEXT_CONTRACT_VERSION = '1.0';
export const AI_IMAGE_INSIGHTS_CONTRACT_VERSION = '1.0';

export type AiContractMode = 'structured' | 'conversational';

export type AiContractValidationResult = {
  valid: boolean;
  schemaVersion: string;
  errors: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNullableString = (value: unknown): boolean =>
  value === null || typeof value === 'string';

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isNullableFiniteNumber = (value: unknown): boolean =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

const isConfidence = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const hasOptionalNullableString = (source: Record<string, unknown>, key: string): boolean =>
  !(key in source) || isNullableString(source[key]);

const hasOptionalStringArray = (source: Record<string, unknown>, key: string): boolean =>
  !(key in source) || isStringArray(source[key]);

const hasOptionalNullableNumber = (source: Record<string, unknown>, key: string): boolean =>
  !(key in source) || isNullableFiniteNumber(source[key]);

export function validateAiOutputContract(
  value: unknown,
  mode: AiContractMode,
): AiContractValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      schemaVersion: AI_INTAKE_TEXT_CONTRACT_VERSION,
      errors: ['output must be an object'],
    };
  }

  const output = value;
  const version = output.version;
  if (version !== AI_INTAKE_TEXT_CONTRACT_VERSION) {
    errors.push(`version must equal ${AI_INTAKE_TEXT_CONTRACT_VERSION}`);
  }

  if (!hasOptionalNullableString(output, 'title')) errors.push('title must be string|null');
  if (!hasOptionalNullableString(output, 'summary')) errors.push('summary must be string|null');
  if (!hasOptionalNullableString(output, 'scope')) errors.push('scope must be string|null');
  if (!hasOptionalStringArray(output, 'trades')) errors.push('trades must be string[]');
  if (!hasOptionalStringArray(output, 'assumptions')) errors.push('assumptions must be string[]');
  if (!hasOptionalStringArray(output, 'risks')) errors.push('risks must be string[]');
  if (!hasOptionalStringArray(output, 'nextQuestions')) errors.push('nextQuestions must be string[]');
  if (!hasOptionalStringArray(output, 'followUpQuestions')) errors.push('followUpQuestions must be string[]');
  if (!hasOptionalNullableNumber(output, 'overallConfidence')) {
    errors.push('overallConfidence must be number|null');
  }
  if ('overallConfidence' in output && output.overallConfidence !== null && !isConfidence(output.overallConfidence)) {
    errors.push('overallConfidence must be between 0 and 1');
  }

  if (mode === 'conversational') {
    if (typeof output.conversationalText !== 'string' || output.conversationalText.trim().length === 0) {
      errors.push('conversationalText must be a non-empty string in conversational mode');
    }
  }

  if ('modeSuggested' in output) {
    const allowed = new Set(['repair', 'refresh', 'design']);
    if (typeof output.modeSuggested !== 'string' || !allowed.has(output.modeSuggested)) {
      errors.push('modeSuggested must be repair|refresh|design');
    }
  }

  if ('modeConfidence' in output) {
    if (!isNullableFiniteNumber(output.modeConfidence)) {
      errors.push('modeConfidence must be number|null');
    } else if (typeof output.modeConfidence === 'number' && !isConfidence(output.modeConfidence)) {
      errors.push('modeConfidence must be between 0 and 1');
    }
  }

  if ('modeReasoning' in output && !isNullableString(output.modeReasoning)) {
    errors.push('modeReasoning must be string|null');
  }

  if ('location' in output) {
    if (!isRecord(output.location)) {
      errors.push('location must be an object');
    } else {
      const location = output.location;
      if (!hasOptionalNullableString(location, 'primary')) errors.push('location.primary must be string|null');
      if (!hasOptionalNullableString(location, 'secondary')) errors.push('location.secondary must be string|null');
      if (!hasOptionalNullableString(location, 'tertiary')) errors.push('location.tertiary must be string|null');
    }
  }

  if ('budget' in output) {
    if (!isRecord(output.budget)) {
      errors.push('budget must be an object');
    } else {
      const budget = output.budget;
      if (!hasOptionalNullableString(budget, 'currency')) errors.push('budget.currency must be string|null');
      if (!hasOptionalNullableNumber(budget, 'min')) errors.push('budget.min must be number|null');
      if (!hasOptionalNullableNumber(budget, 'max')) errors.push('budget.max must be number|null');
      if (!hasOptionalNullableString(budget, 'rawText')) errors.push('budget.rawText must be string|null');
      if ('confidence' in budget && budget.confidence !== null && !isConfidence(budget.confidence)) {
        errors.push('budget.confidence must be between 0 and 1');
      }
    }
  }

  if ('timeline' in output) {
    if (!isRecord(output.timeline)) {
      errors.push('timeline must be an object');
    } else {
      const timeline = output.timeline;
      if (!hasOptionalNullableString(timeline, 'durationText')) {
        errors.push('timeline.durationText must be string|null');
      }
      if (!hasOptionalNullableString(timeline, 'startText')) {
        errors.push('timeline.startText must be string|null');
      }
      if (!hasOptionalNullableString(timeline, 'deadlineText')) {
        errors.push('timeline.deadlineText must be string|null');
      }
      if ('confidence' in timeline && timeline.confidence !== null && !isConfidence(timeline.confidence)) {
        errors.push('timeline.confidence must be between 0 and 1');
      }
    }
  }

  if ('project' in output) {
    if (!isRecord(output.project)) {
      errors.push('project must be an object');
    }
  }

  if ('safetyAssessment' in output) {
    if (!isRecord(output.safetyAssessment)) {
      errors.push('safetyAssessment must be an object');
    } else {
      const safety = output.safetyAssessment;
      const allowedRiskLevels = new Set(['none', 'low', 'medium', 'high', 'critical']);
      if ('riskLevel' in safety) {
        if (typeof safety.riskLevel !== 'string' || !allowedRiskLevels.has(safety.riskLevel)) {
          errors.push('safetyAssessment.riskLevel must be none|low|medium|high|critical');
        }
      }
      if ('isDangerous' in safety && typeof safety.isDangerous !== 'boolean') {
        errors.push('safetyAssessment.isDangerous must be boolean');
      }
      if (!hasOptionalStringArray(safety, 'concerns')) errors.push('safetyAssessment.concerns must be string[]');
      if (!hasOptionalStringArray(safety, 'temporaryMitigations')) {
        errors.push('safetyAssessment.temporaryMitigations must be string[]');
      }
      if ('shouldEscalateEmergency' in safety && typeof safety.shouldEscalateEmergency !== 'boolean') {
        errors.push('safetyAssessment.shouldEscalateEmergency must be boolean');
      }
      if ('requiresImmediateHumanContact' in safety && typeof safety.requiresImmediateHumanContact !== 'boolean') {
        errors.push('safetyAssessment.requiresImmediateHumanContact must be boolean');
      }
      if (!hasOptionalNullableString(safety, 'emergencyReason')) {
        errors.push('safetyAssessment.emergencyReason must be string|null');
      }
      if (!hasOptionalNullableString(safety, 'disclaimer')) {
        errors.push('safetyAssessment.disclaimer must be string|null');
      }
    }
  }

  return {
    valid: errors.length === 0,
    schemaVersion: AI_INTAKE_TEXT_CONTRACT_VERSION,
    errors,
  };
}

export function validateImageInsightsContract(value: unknown): AiContractValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      schemaVersion: AI_IMAGE_INSIGHTS_CONTRACT_VERSION,
      errors: ['image insights must be an object'],
    };
  }

  if (typeof value.imageSummary !== 'string' || value.imageSummary.trim().length === 0) {
    errors.push('imageSummary must be a non-empty string');
  }
  if (!isStringArray(value.suggestedTrades)) errors.push('suggestedTrades must be string[]');
  if (!isStringArray(value.conditionFindings)) errors.push('conditionFindings must be string[]');
  if (!isStringArray(value.safetyFlags)) errors.push('safetyFlags must be string[]');
  if (!isStringArray(value.followUpQuestions)) errors.push('followUpQuestions must be string[]');

  if (typeof value.confidence !== 'number' || !isConfidence(value.confidence)) {
    errors.push('confidence must be a number between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    schemaVersion: AI_IMAGE_INSIGHTS_CONTRACT_VERSION,
    errors,
  };
}