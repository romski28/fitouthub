import {
  AI_IMAGE_INSIGHTS_CONTRACT_VERSION,
  AI_INTAKE_TEXT_CONTRACT_VERSION,
  validateAiOutputContract,
  validateImageInsightsContract,
} from './ai-contract.validator';

describe('AI contract validator', () => {
  it('accepts a valid structured output fixture', () => {
    const validStructured = {
      version: AI_INTAKE_TEXT_CONTRACT_VERSION,
      title: 'Bathroom leakage repair',
      summary: 'Leak near shower enclosure with water damage signs.',
      scope: 'Investigate source and restore affected wall section.',
      trades: ['Handyman'],
      assumptions: ['Access available on weekday afternoon'],
      risks: ['Possible concealed plumbing damage'],
      nextQuestions: ['Do you have photos of the affected corner?'],
      followUpQuestions: ['Do you have photos of the affected corner?'],
      overallConfidence: 0.82,
      modeSuggested: 'repair',
      modeConfidence: 0.88,
      modeReasoning: 'The request focuses on fault fixing and restoration.',
      location: {
        primary: 'Hong Kong Island',
        secondary: 'Wan Chai',
        tertiary: null,
      },
      budget: {
        currency: 'HKD',
        min: 5000,
        max: 15000,
        rawText: 'around HK$15k',
        confidence: 0.65,
      },
      timeline: {
        durationText: 'about 1 week',
        startText: 'as soon as possible',
        deadlineText: null,
        confidence: 0.72,
      },
      project: {
        scopeText: 'Repair and restore affected area',
      },
      safetyAssessment: {
        riskLevel: 'medium',
        isDangerous: false,
        concerns: ['Moisture near electrical outlet'],
        temporaryMitigations: ['Avoid using nearby socket until checked'],
        shouldEscalateEmergency: false,
        emergencyReason: null,
        requiresImmediateHumanContact: false,
        disclaimer: 'If danger increases, contact emergency services.',
      },
      conversationalText: 'Thanks for sharing this, we can help you tackle it quickly.',
    };

    const result = validateAiOutputContract(validStructured, 'conversational');

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.schemaVersion).toBe(AI_INTAKE_TEXT_CONTRACT_VERSION);
  });

  it('rejects structured output with wrong schema version and invalid confidence', () => {
    const invalidStructured = {
      version: '2.0',
      trades: ['Handyman'],
      overallConfidence: 1.4,
      conversationalText: 'Short reply',
    };

    const result = validateAiOutputContract(invalidStructured, 'conversational');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`version must equal ${AI_INTAKE_TEXT_CONTRACT_VERSION}`);
    expect(result.errors).toContain('overallConfidence must be between 0 and 1');
  });

  it('accepts a valid image insights fixture', () => {
    const validImageInsights = {
      imageSummary: 'Visible staining under sink cabinet and loose silicone edge.',
      suggestedTrades: ['Handyman'],
      conditionFindings: ['Moisture staining around lower cabinet panel'],
      safetyFlags: ['Potential slip hazard'],
      followUpQuestions: ['Can you confirm if water appears after shower use?'],
      confidence: 0.74,
    };

    const result = validateImageInsightsContract(validImageInsights);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.schemaVersion).toBe(AI_IMAGE_INSIGHTS_CONTRACT_VERSION);
  });

  it('rejects image insights with invalid confidence and arrays', () => {
    const invalidImageInsights = {
      imageSummary: 'summary',
      suggestedTrades: ['Handyman', 1],
      conditionFindings: [],
      safetyFlags: [],
      followUpQuestions: [],
      confidence: -0.1,
    };

    const result = validateImageInsightsContract(invalidImageInsights);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('suggestedTrades must be string[]');
    expect(result.errors).toContain('confidence must be a number between 0 and 1');
  });
});