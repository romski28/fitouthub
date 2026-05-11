import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LOCATIONS } from '../../../../packages/schemas/locations';
import { PrismaService } from '../prisma.service';
import { TradesService, type TradeView } from '../trades/trades.service';

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
};

type SafetyAssessment = {
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  isDangerous: boolean;
  concerns: string[];
  temporaryMitigations: string[];
  shouldEscalateEmergency: boolean;
  emergencyReason: string | null;
  requiresImmediateHumanContact: boolean;
  disclaimer: string | null;
};

type ProjectScale = 'SCALE_1' | 'SCALE_2' | 'SCALE_3';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiThreadWindowMs = 2 * 60 * 60 * 1000;

  constructor(
    private readonly tradesService: TradesService,
    private readonly prisma: PrismaService,
  ) {}

  private sanitizeSessionId(sessionId?: string) {
    const trimmed = sessionId?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 128);
  }

  private resolveDeepSeekChatEndpoint() {
    const configured = (process.env.DEEPSEEK_API_URL || '').trim();
    if (!configured) return 'https://api.deepseek.com/v1/chat/completions';
    if (configured.endsWith('/chat/completions')) return configured;
    return `${configured.replace(/\/+$/, '')}/chat/completions`;
  }

  private getAiThreadWindowStart() {
    return new Date(Date.now() - this.aiThreadWindowMs);
  }

  private buildAiThreadContextSummary(intake: {
    rawPrompt: string;
    title?: string | null;
    summary?: string | null;
    scope?: string | null;
    trades: string[];
    locationPrimary?: string | null;
    locationSecondary?: string | null;
    locationTertiary?: string | null;
    budget?: unknown;
    timeline?: unknown;
    rawOutput?: unknown;
  }) {
    const locationLabel = [intake.locationTertiary, intake.locationSecondary, intake.locationPrimary]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(', ');

    const budget = intake.budget && typeof intake.budget === 'object' && !Array.isArray(intake.budget)
      ? (intake.budget as Record<string, unknown>)
      : null;
    const timeline = intake.timeline && typeof intake.timeline === 'object' && !Array.isArray(intake.timeline)
      ? (intake.timeline as Record<string, unknown>)
      : null;
    const rawOutput = intake.rawOutput && typeof intake.rawOutput === 'object' && !Array.isArray(intake.rawOutput)
      ? (intake.rawOutput as Record<string, unknown>)
      : null;
    const conversationalText = typeof rawOutput?.conversationalText === 'string'
      ? rawOutput.conversationalText.trim()
      : '';

    return {
      priorPrompt: intake.rawPrompt.trim(),
      title: intake.title?.trim() || null,
      summary: intake.summary?.trim() || intake.scope?.trim() || null,
      trades: Array.isArray(intake.trades) ? intake.trades.filter(Boolean) : [],
      location: locationLabel || null,
      budget: typeof budget?.rawText === 'string' ? budget.rawText.trim() : null,
      timeline: typeof timeline?.durationText === 'string' ? timeline.durationText.trim() : null,
      conversationalText: conversationalText || null,
    };
  }

  private async findActiveAiThread(context?: { sessionId?: string; userId?: string; intakeId?: string }) {
    const sessionId = this.sanitizeSessionId(context?.sessionId);
    const userId = context?.userId;
    const intakeId = context?.intakeId?.trim();
    const createdAt = { gte: this.getAiThreadWindowStart() };

    if (intakeId) {
      const intake = await this.prisma.aiIntake.findUnique({ where: { id: intakeId } });
      if (!intake) return null;
      if (intake.createdAt < createdAt.gte) return null;
      if (intake.userId && userId && intake.userId === userId) return intake;
      if (intake.sessionId && sessionId && intake.sessionId === sessionId) return intake;
    }

    const whereClauses: Array<Record<string, unknown>> = [];
    if (userId) whereClauses.push({ userId });
    if (sessionId) whereClauses.push({ sessionId });
    if (whereClauses.length === 0) return null;

    return this.prisma.aiIntake.findFirst({
      where: {
        AND: [
          { createdAt },
          { OR: whereClauses },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private normalizeLocationText(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async resolveAreaCodesForLocationKeyword(location: string): Promise<string[]> {
    const keyword = location.trim();
    if (!keyword) return [];

    const normalized = this.normalizeLocationText(keyword);
    const uppercaseKeyword = keyword.toUpperCase();

    const [areasByNameOrCode, aliasMatches, zoneMatches] = await Promise.all([
      (this.prisma as any).regionArea.findMany({
        where: {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { code: { contains: uppercaseKeyword, mode: 'insensitive' } },
          ],
        },
        select: { code: true },
      }),
      (this.prisma as any).regionAreaAlias.findMany({
        where: {
          OR: [
            { alias: { contains: keyword, mode: 'insensitive' } },
            normalized ? { aliasNormalized: { contains: normalized } } : undefined,
          ].filter(Boolean),
        },
        select: {
          area: {
            select: { code: true },
          },
        },
      }),
      (this.prisma as any).regionZone.findMany({
        where: {
          OR: [
            { label: { contains: keyword, mode: 'insensitive' } },
            { labelZh: { contains: keyword, mode: 'insensitive' } },
            { code: { contains: uppercaseKeyword, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const matchedZoneIds = (zoneMatches as Array<{ id: string }>).map((zone) => zone.id);
    const zoneAreaMatches = matchedZoneIds.length
      ? await (this.prisma as any).regionArea.findMany({
          where: { zoneId: { in: matchedZoneIds } },
          select: { code: true },
        })
      : [];

    const codes = new Set<string>();
    for (const area of areasByNameOrCode as Array<{ code: string }>) {
      if (area?.code) codes.add(area.code);
    }
    for (const alias of aliasMatches as Array<{ area?: { code?: string } | null }>) {
      const code = alias?.area?.code;
      if (code) codes.add(code);
    }
    for (const area of zoneAreaMatches as Array<{ code: string }>) {
      if (area?.code) codes.add(area.code);
    }

    return Array.from(codes);
  }

  private readonly fallbackTrades = [
    {
      name: 'Builder',
      category: 'General',
      aliases: ['new build', 'extension', 'structural works'],
      description: 'New builds, extensions, and structural works.',
    },
    {
      name: 'Renovator',
      category: 'General',
      aliases: ['refurbishment', 'interior renovation', 'makeover'],
      description: 'Interior and exterior refurbishments.',
    },
    {
      name: 'Project Manager',
      category: 'General',
      aliases: ['fitout manager', 'coordination', 'timeline management'],
      description: 'Coordination of timelines, budgets, and stakeholders.',
    },
    {
      name: 'Electrician',
      category: 'Systems',
      aliases: ['lighting', 'wiring', 'power', 'socket'],
      description: 'Wiring, lighting, and safety systems.',
    },
    {
      name: 'Plumber',
      category: 'Systems',
      aliases: ['drainage', 'pipework', 'water heater', 'sanitary'],
      description: 'Water systems, heating, and drainage.',
    },
    {
      name: 'HVAC Technician',
      category: 'Systems',
      aliases: ['ac', 'air conditioning', 'ventilation', 'cooling'],
      description: 'Air conditioning, ventilation, and heating.',
    },
  ];

  private buildLocationTaxonomy() {
    const taxonomy: Record<string, Record<string, string[]>> = {};

    for (const loc of LOCATIONS) {
      if (!taxonomy[loc.primary]) {
        taxonomy[loc.primary] = {};
      }
      if (!taxonomy[loc.primary][loc.secondary]) {
        taxonomy[loc.primary][loc.secondary] = [];
      }
      if (loc.tertiary) {
        taxonomy[loc.primary][loc.secondary].push(loc.tertiary);
      }
    }

    return taxonomy;
  }

  private buildCompactLocationTaxonomy() {
    const taxonomy: Record<string, string[]> = {};

    for (const loc of LOCATIONS) {
      if (!taxonomy[loc.primary]) {
        taxonomy[loc.primary] = [];
      }

      if (!taxonomy[loc.primary].includes(loc.secondary)) {
        taxonomy[loc.primary].push(loc.secondary);
      }
    }

    return taxonomy;
  }

  private async getAllowedTrades() {
    try {
      const trades = await this.tradesService.findAll();
      if (Array.isArray(trades) && trades.length > 0) {
        return trades.map((trade: TradeView) => ({
          name: trade.name,
          category: trade.category,
          professionType: trade.professionType ?? null,
          aliases: Array.isArray(trade.aliases) ? trade.aliases : [],
          description: trade.description ?? null,
        }));
      }
    } catch (error) {
      this.logger.warn(
        `Falling back to static trades in AI prompt wrapper: ${(error as Error).message}`,
      );
    }

    return this.fallbackTrades;
  }

  private async buildPromptWrapper() {
    const allowedTrades = await this.getAllowedTrades();
    const locationTaxonomy = this.buildCompactLocationTaxonomy();
    const allowedTradeNames = allowedTrades.map((trade) => trade.name);

    const systemPrompt = `You are Mimo Intake Extractor.

Convert a Hong Kong renovation or fitout request into strict JSON for routing and project setup.

CRITICAL RULES
1) Output JSON only.
2) \"trades\" must contain exact values from ALLOWED_TRADES only.
3) If no exact trade exists, add the need to \"unmappedNeeds\".
4) Geography is Hong Kong by default.
5) Use location.primary, location.secondary, location.tertiary.
6) Unknown values must be null or empty arrays.
7) Confidence values must be between 0 and 1.
8) Prefer precision over completeness. Do not hallucinate.
9) Return every top-level key in the schema.

ALLOWED_TRADES = ${JSON.stringify(allowedTradeNames)}

HK_LOCATION_TAXONOMY = ${JSON.stringify(locationTaxonomy)}

NORMALIZATION RULES
- Currency: HKD if HK context uses HKD, HK$, or $.
- Budget shorthand: 450k => 450000, 1.2m => 1200000.
- If one budget figure is given, set min and max the same.
- Normalize size units to sqft or sqm.
- Capture durationText, startText, deadlineText separately.
- Use country=Hong Kong. Set tertiary only if explicit in the user prompt.
- Flag safety hazards if the request narrative suggests immediate risk.
- Temporary mitigations must be conservative, simple, and non-technical.
- If there is possible immediate danger, advise leaving the area / isolating use only if safe and contacting emergency services or utility provider as appropriate.
- Never suggest DIY repair steps for dangerous conditions.
- Keep arrays concise unless essential: assumptions/risks/keyFacts/missingInfo/followUpQuestions max 4 items, concerns max 3 items, temporaryMitigations max 4 items.

OUTPUT SCHEMA
{
  "version": "1.0",
  "language": "en|zh-HK|mixed|unknown",
  "intent": "new_project|quote_request|advice|unknown",
  "title": "string|null",
  "summary": "string|null",
  "scope": "string|null",
  "projectScale": "SCALE_1|SCALE_2|SCALE_3|null",
  "assumptions": ["string"],
  "risks": ["string"],
  "nextQuestions": ["string"],
  "project": {
    "scopeText": "string|null",
    "propertyType": "string|null",
    "scopeLevel": "room|floor|unit|shop|office|building|house|apartment|mixed|null",
    "affectedAreas": ["string"],
    "works": ["string"],
    "deliverables": ["string"]
  },
  "size": {
    "value": number|null,
    "unit": "sqft|sqm|null",
    "rawText": "string|null",
    "confidence": number
  },
  "budget": {
    "currency": "HKD|USD|CNY|unknown|null",
    "min": number|null,
    "max": number|null,
    "rawText": "string|null",
    "confidence": number
  },
  "timeline": {
    "durationText": "string|null",
    "startText": "string|null",
    "deadlineText": "string|null",
    "confidence": number
  },
  "location": {
    "country": "Hong Kong",
    "primary": "string|null",
    "secondary": "string|null",
    "tertiary": "string|null",
    "rawText": "string|null",
    "confidence": number
  },
  "trades": ["string"],
  "tradeDetails": [{ "trade": "string", "confidence": number }],
  "unmappedNeeds": ["string"],
  "keyFacts": ["string"],
  "missingInfo": ["string"],
  "followUpQuestions": ["string"],
  "safetyAssessment": {
    "riskLevel": "none|low|medium|high|critical",
    "isDangerous": true,
    "concerns": ["string"],
    "temporaryMitigations": ["string"],
    "shouldEscalateEmergency": false,
    "emergencyReason": "string|null",
    "requiresImmediateHumanContact": false,
    "disclaimer": "string|null"
  },
  "overallConfidence": number
}`;

    return {
      systemPrompt,
      allowedTradesCount: allowedTrades.length,
      locationEntryCount: Object.keys(locationTaxonomy).length,
    };
  }

  private async buildConversationalPrompt() {
    const allowedTrades = await this.getAllowedTrades();
    const locationTaxonomy = this.buildCompactLocationTaxonomy();
    const allowedTradeNames = allowedTrades.map((trade) => trade.name);

    const systemPrompt = `You are Mimo Friendly Assistant.

Help users understand their renovation/fitout needs in a warm, encouraging tone while extracting structured project data.

CONVERSATION STYLE
- Be warm, friendly, and conversational
- Show genuine interest in their project
- Use casual language (not stiff or formal)
- Acknowledge their needs and validate any concerns
- Include encouraging phrases about working with Mimo
- End with an invitation to connect with professionals

CRITICAL RULES FOR DATA EXTRACTION
1) Extract and validate ALL fields as in structured mode
2) Generate JSON with ALL of these keys: conversationalText, trades, location (primary, secondary, tertiary), budget, timeline, propertyType, summary, title, overallConfidence
3) "conversationalText" is MANDATORY - warm, friendly narrative (3-5 sentences) acknowledging their project and validating their needs
4) "trades" must contain exact values from ALLOWED_TRADES only
5) Use Hong Kong as the default location context

ALLOWED_TRADES = ${JSON.stringify(allowedTradeNames)}

HK_LOCATION_TAXONOMY = ${JSON.stringify(locationTaxonomy)}

OUTPUT FORMAT (JSON only)
{
  "conversationalText": "Warm, friendly narrative response here. Acknowledge the project, validate their needs, and express optimism about connecting them with professionals.",
  "trades": ["Trade1", "Trade2"],
  "location": {
    "primary": "string|null",
    "secondary": "string|null",
    "tertiary": "string|null"
  },
  "budget": {
    "rawText": "string|null",
    "min": number|null,
    "max": number|null,
    "currency": "HKD|null"
  },
  "timeline": {
    "durationText": "string|null",
    "startText": "string|null"
  },
  "propertyType": "string|null",
  "summary": "string|null",
  "title": "string|null",
  "overallConfidence": number
}`;

    return {
      systemPrompt,
      allowedTradesCount: allowedTrades.length,
      locationEntryCount: Object.keys(locationTaxonomy).length,
    };
  }

  private buildConversationalTextFallback(parsedOutput: unknown, prompt: string): string | null {
    const source =
      parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)
        ? (parsedOutput as Record<string, unknown>)
        : null;

    const title = typeof source?.title === 'string' ? source.title.trim() : '';
    const summary = typeof source?.summary === 'string' ? source.summary.trim() : '';
    const trades = Array.isArray(source?.trades)
      ? source.trades.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    const locationObj =
      source?.location && typeof source.location === 'object' && !Array.isArray(source.location)
        ? (source.location as Record<string, unknown>)
        : null;
    const primary = typeof locationObj?.primary === 'string' ? locationObj.primary.trim() : '';
    const secondary = typeof locationObj?.secondary === 'string' ? locationObj.secondary.trim() : '';
    const locationLabel = [secondary, primary].filter(Boolean).join(', ');

    const tradeLabel =
      trades.length === 0
        ? 'the right renovation professionals'
        : trades.length === 1
          ? trades[0]
          : `${trades[0]} and ${trades.length - 1} other specialist${trades.length > 2 ? 's' : ''}`;

    const lead = title || summary || 'Thanks for sharing your project details.';
    const locationSentence = locationLabel
      ? ` We can focus this around ${locationLabel} in Hong Kong.`
      : ' We can tailor this for your area in Hong Kong.';

    const previewPrompt = prompt.trim().replace(/\s+/g, ' ').slice(0, 140);
    const contextSentence = previewPrompt
      ? ` Based on your request ("${previewPrompt}${prompt.trim().length > 140 ? '...' : ''}"),`
      : ' Based on your request,';

    return `${lead} ${contextSentence} we can help you connect with ${tradeLabel}.${locationSentence} If you create an account, we can turn this into a full project brief and start matching you right away.`;
  }

  private normalizeSafetyAssessment(value: unknown): SafetyAssessment {
    const source =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const concerns = Array.isArray(source.concerns)
      ? source.concerns.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const temporaryMitigations = Array.isArray(source.temporaryMitigations)
      ? source.temporaryMitigations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    const allowedRiskLevels = new Set(['none', 'low', 'medium', 'high', 'critical']);
    const riskLevelRaw = typeof source.riskLevel === 'string' ? source.riskLevel.toLowerCase() : 'none';
    const riskLevel = allowedRiskLevels.has(riskLevelRaw)
      ? (riskLevelRaw as SafetyAssessment['riskLevel'])
      : 'none';

    return {
      riskLevel,
      isDangerous:
        typeof source.isDangerous === 'boolean'
          ? source.isDangerous
          : concerns.length > 0 || riskLevel === 'high' || riskLevel === 'critical',
      concerns,
      temporaryMitigations,
      shouldEscalateEmergency:
        typeof source.shouldEscalateEmergency === 'boolean'
          ? source.shouldEscalateEmergency
          : riskLevel === 'high' || riskLevel === 'critical',
      emergencyReason:
        typeof source.emergencyReason === 'string' && source.emergencyReason.trim().length > 0
          ? source.emergencyReason.trim()
          : null,
      requiresImmediateHumanContact:
        typeof source.requiresImmediateHumanContact === 'boolean'
          ? source.requiresImmediateHumanContact
          : riskLevel === 'high' || riskLevel === 'critical',
      disclaimer:
        typeof source.disclaimer === 'string' && source.disclaimer.trim().length > 0
          ? source.disclaimer.trim()
          : 'If there is immediate danger, move to safety and contact emergency services or the relevant utility provider.',
    };
  }

  private normalizeProjectScale(value: unknown): ProjectScale | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'SCALE_1' || normalized === 'SCALE_2' || normalized === 'SCALE_3') {
      return normalized;
    }
    return null;
  }

  private extractJsonStringValue(source: string, key: string): string | null {
    const regex = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\])*)"`, 'i');
    const match = source.match(regex);
    if (!match) return null;
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1];
    }
  }

  private extractJsonNumberValue(source: string, key: string): number | null {
    const regex = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i');
    const match = source.match(regex);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  private extractJsonBooleanValue(source: string, key: string): boolean | null {
    const regex = new RegExp(`"${key}"\\s*:\\s*(true|false)`, 'i');
    const match = source.match(regex);
    if (!match) return null;
    return match[1].toLowerCase() === 'true';
  }

  private extractJsonStringArray(source: string, key: string): string[] {
    const regex = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'i');
    const match = source.match(regex);
    if (!match) return [];
    const inner = match[1];
    const values: string[] = [];
    const itemRegex = /"((?:\\.|[^"\\])*)"/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(inner)) !== null) {
      try {
        values.push(JSON.parse(`"${itemMatch[1]}"`) as string);
      } catch {
        values.push(itemMatch[1]);
      }
    }
    return values.filter((item) => item.trim().length > 0);
  }

  private extractNestedObject(source: string, key: string): string | null {
    const keyIndex = source.indexOf(`"${key}"`);
    if (keyIndex === -1) return null;
    const openIndex = source.indexOf('{', keyIndex);
    if (openIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = openIndex; i < source.length; i++) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return source.slice(openIndex, i + 1);
        }
      }
    }

    return source.slice(openIndex);
  }

  private extractPartialParsedOutput(rawOutput: string) {
    const projectSource = this.extractNestedObject(rawOutput, 'project') ?? '';
    const locationSource = this.extractNestedObject(rawOutput, 'location') ?? '';
    const sizeSource = this.extractNestedObject(rawOutput, 'size') ?? '';
    const budgetSource = this.extractNestedObject(rawOutput, 'budget') ?? '';
    const timelineSource = this.extractNestedObject(rawOutput, 'timeline') ?? '';
    const safetySource = this.extractNestedObject(rawOutput, 'safetyAssessment') ?? '';

    const partial = {
      title: this.extractJsonStringValue(rawOutput, 'title'),
      summary: this.extractJsonStringValue(rawOutput, 'summary'),
      scope: this.extractJsonStringValue(rawOutput, 'scope'),
      assumptions: this.extractJsonStringArray(rawOutput, 'assumptions'),
      risks: this.extractJsonStringArray(rawOutput, 'risks'),
      nextQuestions: this.extractJsonStringArray(rawOutput, 'nextQuestions'),
      followUpQuestions: this.extractJsonStringArray(rawOutput, 'followUpQuestions'),
      trades: this.extractJsonStringArray(rawOutput, 'trades'),
      keyFacts: this.extractJsonStringArray(rawOutput, 'keyFacts'),
      overallConfidence: this.extractJsonNumberValue(rawOutput, 'overallConfidence'),
      project: {
        scopeText: this.extractJsonStringValue(projectSource, 'scopeText'),
        propertyType: this.extractJsonStringValue(projectSource, 'propertyType'),
        affectedAreas: this.extractJsonStringArray(projectSource, 'affectedAreas'),
        works: this.extractJsonStringArray(projectSource, 'works'),
        deliverables: this.extractJsonStringArray(projectSource, 'deliverables'),
      },
      location: {
        primary: this.extractJsonStringValue(locationSource, 'primary'),
        secondary: this.extractJsonStringValue(locationSource, 'secondary'),
        tertiary: this.extractJsonStringValue(locationSource, 'tertiary'),
      },
      size: {
        rawText: this.extractJsonStringValue(sizeSource, 'rawText'),
        value: this.extractJsonNumberValue(sizeSource, 'value'),
        unit: this.extractJsonStringValue(sizeSource, 'unit'),
      },
      budget: {
        rawText: this.extractJsonStringValue(budgetSource, 'rawText'),
        min: this.extractJsonNumberValue(budgetSource, 'min'),
        max: this.extractJsonNumberValue(budgetSource, 'max'),
        currency: this.extractJsonStringValue(budgetSource, 'currency'),
      },
      timeline: {
        durationText: this.extractJsonStringValue(timelineSource, 'durationText'),
        startText: this.extractJsonStringValue(timelineSource, 'startText'),
        deadlineText: this.extractJsonStringValue(timelineSource, 'deadlineText'),
      },
      safetyAssessment: {
        riskLevel: this.extractJsonStringValue(safetySource, 'riskLevel') ?? 'none',
        isDangerous: this.extractJsonBooleanValue(safetySource, 'isDangerous') ?? false,
        concerns: this.extractJsonStringArray(safetySource, 'concerns'),
        temporaryMitigations: this.extractJsonStringArray(safetySource, 'temporaryMitigations'),
        shouldEscalateEmergency:
          this.extractJsonBooleanValue(safetySource, 'shouldEscalateEmergency') ?? false,
        emergencyReason: this.extractJsonStringValue(safetySource, 'emergencyReason'),
        requiresImmediateHumanContact:
          this.extractJsonBooleanValue(safetySource, 'requiresImmediateHumanContact') ?? false,
        disclaimer: this.extractJsonStringValue(safetySource, 'disclaimer'),
      },
    };

    const hasUsefulContent = Boolean(
      partial.title || partial.summary || partial.scope || partial.trades.length > 0,
    );

    return hasUsefulContent ? partial : null;
  }

  private normalizeParsedOutput(parsedOutput: unknown) {
    if (!parsedOutput || typeof parsedOutput !== 'object' || Array.isArray(parsedOutput)) {
      return parsedOutput;
    }

    const result = parsedOutput as Record<string, unknown>;
    const project =
      result.project && typeof result.project === 'object' && !Array.isArray(result.project)
        ? ({ ...(result.project as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const summary = typeof result.summary === 'string' ? result.summary : null;
    const providedTitle = typeof result.title === 'string' ? result.title.trim() : '';
    const derivedTitle = summary
      ? summary.split('.').map((part) => part.trim()).filter(Boolean)[0]?.slice(0, 70) ?? null
      : null;
    const title = providedTitle || derivedTitle;
    const scope =
      typeof result.scope === 'string'
        ? result.scope
        : typeof project.scopeText === 'string'
          ? (project.scopeText as string)
          : null;
    const assumptions = Array.isArray(result.assumptions)
      ? result.assumptions
      : [];
    const risks = Array.isArray(result.risks) ? result.risks : [];
    const nextQuestions = Array.isArray(result.nextQuestions)
      ? result.nextQuestions
      : Array.isArray(result.followUpQuestions)
        ? result.followUpQuestions
        : [];
    const safetyAssessment = this.normalizeSafetyAssessment(result.safetyAssessment);
    const projectScale =
      this.normalizeProjectScale(result.projectScale) ||
      this.normalizeProjectScale(project.projectScale) ||
      this.normalizeProjectScale(project.projectScaleSuggested);

    if (!project.scopeText && scope) {
      project.scopeText = scope;
    }

    project.safetyAssessment = safetyAssessment;
    if (projectScale) {
      project.projectScale = projectScale;
      project.projectScaleSuggested = projectScale;
    }

    return {
      ...result,
      title,
      summary,
      scope,
      assumptions,
      risks,
      nextQuestions,
      projectScale,
      followUpQuestions: Array.isArray(result.followUpQuestions)
        ? result.followUpQuestions
        : nextQuestions,
      safetyAssessment,
      project,
      contractDocumentation: {
        title,
        summary,
        scope,
        assumptions,
        risks,
        nextQuestions,
      },
    };
  }

  async getSandboxHealth() {
    const endpoint = this.resolveDeepSeekChatEndpoint();
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeoutRaw = process.env.DEEPSEEK_TIMEOUT_MS;
    const timeoutMs = Number(timeoutRaw || '60000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '1200');
    const apiKeyPresent = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
    const promptWrapper = await this.buildPromptWrapper();

    return {
      ok: apiKeyPresent,
      status: apiKeyPresent ? 'configured' : 'missing_api_key',
      provider: 'deepseek',
      config: {
        model,
        endpoint,
        timeoutMs,
        timeoutRaw: timeoutRaw ?? null,
        maxOutputTokens,
        apiKeyPresent,
      },
      promptWrapper: {
        systemPromptChars: promptWrapper.systemPrompt.length,
        allowedTradesCount: promptWrapper.allowedTradesCount,
        locationEntryCount: promptWrapper.locationEntryCount,
      },
      runtime: {
        renderGitCommit: process.env.RENDER_GIT_COMMIT ?? null,
        renderServiceName: process.env.RENDER_SERVICE_NAME ?? null,
        nodeEnv: process.env.NODE_ENV ?? null,
      },
    };
  }

  async testVisionAccess(context: {
    model?: string;
    imageUrl?: string;
  }) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('DeepSeek sandbox is not configured');
    }

    const endpoint = this.resolveDeepSeekChatEndpoint();
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const model = (context.model || process.env.DEEPSEEK_VISION_MODEL || 'deepseek-vl2').trim();
    const imageUrl =
      (context.imageUrl || process.env.DEEPSEEK_VISION_TEST_IMAGE_URL || 'https://picsum.photos/id/1062/1200/800')
        .trim();

    if (!/^https?:\/\//i.test(imageUrl)) {
      throw new BadRequestException('imageUrl must be an absolute http/https URL');
    }

    const requestId = `ds_vl_${Date.now().toString(36)}`;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const promptText = `What's in this image? Describe it briefly for renovation triage.`;

    const candidates: Array<{
      label: string;
      body: Record<string, unknown>;
    }> = [
      {
        label: 'openai_content_parts_image_url',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
      },
      {
        label: 'message_images_array',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: promptText,
              images: [imageUrl],
            },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
      },
      {
        label: 'top_level_images_array',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: promptText,
            },
          ],
          images: [imageUrl],
          max_tokens: 200,
          temperature: 0.2,
        },
      },
    ];

    const attempts: Array<{ format: string; statusCode: number; providerError: string }> = [];

    try {
      for (const candidate of candidates) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(candidate.body),
          signal: controller.signal,
        });

        const rawText = await response.text();

        let payload: Record<string, unknown> | null = null;
        try {
          payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
        } catch {
          payload = null;
        }

        const providerErrorMessage = (() => {
          if (!payload || typeof payload !== 'object') return rawText.slice(0, 300);
          const errorField = payload.error;
          if (typeof errorField === 'string') return errorField;
          if (errorField && typeof errorField === 'object') {
            const nested = errorField as Record<string, unknown>;
            if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim();
            if (typeof nested.code === 'string' && nested.code.trim()) return nested.code.trim();
          }
          if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
          return rawText.slice(0, 300);
        })();

        const content =
          payload &&
          Array.isArray(payload.choices) &&
          payload.choices[0] &&
          typeof payload.choices[0] === 'object' &&
          (payload.choices[0] as Record<string, unknown>).message &&
          typeof (payload.choices[0] as Record<string, unknown>).message === 'object' &&
          typeof ((payload.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content === 'string'
            ? ((((payload.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content as string) || '').trim()
            : null;

        if (response.ok) {
          const durationMs = Date.now() - startedAt;
          return {
            ok: true,
            requestId,
            model,
            imageUrl,
            endpoint,
            statusCode: response.status,
            durationMs,
            formatUsed: candidate.label,
            attempts,
            contentPreview: content,
            usage:
              payload && typeof payload.usage === 'object' && payload.usage
                ? payload.usage
                : null,
          };
        }

        attempts.push({
          format: candidate.label,
          statusCode: response.status,
          providerError: providerErrorMessage,
        });
      }

      const durationMs = Date.now() - startedAt;
      const lastAttempt = attempts[attempts.length - 1];
      return {
        ok: false,
        requestId,
        model,
        imageUrl,
        endpoint,
        statusCode: lastAttempt?.statusCode ?? 400,
        durationMs,
        formatUsed: null,
        attempts,
        providerError: lastAttempt?.providerError ?? 'Vision model call failed',
        message: 'Vision model call failed',
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if ((error as Error).name === 'AbortError') {
        return {
          ok: false,
          requestId,
          model,
          imageUrl,
          endpoint,
          statusCode: 408,
          durationMs,
          attempts,
          message: 'Vision test timed out',
        };
      }
      return {
        ok: false,
        requestId,
        model,
        imageUrl,
        endpoint,
        statusCode: 500,
        durationMs,
        attempts,
        message: (error as Error).message || 'Vision test failed',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async previewRequirements(prompt: string, context?: { sessionId?: string; userId?: string; intakeId?: string; mode?: 'structured' | 'conversational' }) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new BadRequestException('Prompt is required');
    }
    if (trimmedPrompt.length > 4000) {
      throw new BadRequestException('Prompt is too long (max 4000 chars)');
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('DeepSeek sandbox is not configured');
    }

    const endpoint = this.resolveDeepSeekChatEndpoint();
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    // Increased default timeout to 30000ms (30s) for large prompts
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '1200');

    const requestId = `ds_${Date.now().toString(36)}`;
    const startedAt = Date.now();
    const mode = context?.mode ?? 'structured';
    const promptWrapper = mode === 'conversational' ? await this.buildConversationalPrompt() : await this.buildPromptWrapper();

    const activeThread = await this.findActiveAiThread(context);
    const threadSummary = activeThread ? this.buildAiThreadContextSummary(activeThread) : null;

    const userMessage = threadSummary
      ? `THREAD_MODE: This is a follow-up refinement within the same Mimo intake thread. Treat the new user message as an addition, clarification, or correction to the earlier request, not as a brand new unrelated request. Keep prior confirmed details unless the latest message clearly changes them.\n\nEARLIER_USER_PROMPT:\n${threadSummary.priorPrompt}\n\nEARLIER_EXTRACTED_CONTEXT:\n- Title: ${threadSummary.title ?? 'unknown'}\n- Summary: ${threadSummary.summary ?? 'unknown'}\n- Trades: ${threadSummary.trades.length > 0 ? threadSummary.trades.join(', ') : 'unknown'}\n- Location: ${threadSummary.location ?? 'unknown'}\n- Budget: ${threadSummary.budget ?? 'unknown'}\n- Timeline: ${threadSummary.timeline ?? 'unknown'}\n- Prior assistant reply: ${threadSummary.conversationalText ?? 'unknown'}\n\nLATEST_USER_UPDATE:\n${trimmedPrompt}\n\nContext:\n- Market: Hong Kong\n- Use only allowed trades from the provided list\n- Normalize output for platform matching and triage\n- Merge the latest update into the earlier request`
      : `USER_PROMPT:\n${trimmedPrompt}\n\nContext:\n- Market: Hong Kong\n- Use only allowed trades from the provided list\n- Normalize output for platform matching and triage`;

    const messages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: promptWrapper.systemPrompt,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const totalMessageChars = messages.reduce((sum, message) => sum + message.content.length, 0);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      this.logger.log(
        `[${requestId}] DeepSeek request started model=${model} timeoutMs=${timeoutMs} userPromptChars=${trimmedPrompt.length} userMessageChars=${userMessage.length} systemPromptChars=${promptWrapper.systemPrompt.length} totalMessageChars=${totalMessageChars} allowedTrades=${promptWrapper.allowedTradesCount} locationEntries=${promptWrapper.locationEntryCount}`,
      );

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        this.logger.error(
          `[${requestId}] DeepSeek request failed status=${response.status} body=${rawText.slice(0, 800)}`,
        );
        throw new ServiceUnavailableException('DeepSeek request failed');
      }

      let payload: DeepSeekChatResponse;
      try {
        payload = JSON.parse(rawText) as DeepSeekChatResponse;
      } catch {
        this.logger.error(`[${requestId}] Invalid JSON from DeepSeek`);
        throw new InternalServerErrorException('Invalid DeepSeek response');
      }

      const output = payload.choices?.[0]?.message?.content?.trim() || '';
      const durationMs = Date.now() - startedAt;
      const usage = payload.usage || {};
      let parsedOutput: unknown = null;

      if (output) {
        try {
          parsedOutput = this.normalizeParsedOutput(JSON.parse(output));
        } catch {
          this.logger.warn(`[${requestId}] DeepSeek returned non-parseable JSON content`);
          const salvaged = this.extractPartialParsedOutput(output);
          if (salvaged) {
            parsedOutput = this.normalizeParsedOutput(salvaged);
            this.logger.warn(`[${requestId}] Recovered partial structured AI output after truncation/parse failure`);
          }
        }
      }

      if (mode === 'conversational' && parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
        const parsedObject = parsedOutput as Record<string, unknown>;
        const currentConversationalText =
          typeof parsedObject.conversationalText === 'string' ? parsedObject.conversationalText.trim() : '';
        if (!currentConversationalText) {
          const fallbackConversationalText = this.buildConversationalTextFallback(parsedOutput, trimmedPrompt);
          if (fallbackConversationalText) {
            parsedObject.conversationalText = fallbackConversationalText;
            parsedOutput = parsedObject;
            this.logger.warn(`[${requestId}] conversationalText missing from model output; fallback text generated`);
          }
        }
      }

      const normalizedContractDocumentation =
        parsedOutput &&
        typeof parsedOutput === 'object' &&
        !Array.isArray(parsedOutput) &&
        'contractDocumentation' in parsedOutput
          ? (parsedOutput as Record<string, unknown>).contractDocumentation
          : null;

      this.logger.log(
        `[${requestId}] DeepSeek request completed durationMs=${durationMs} promptTokens=${usage.prompt_tokens ?? 0} completionTokens=${usage.completion_tokens ?? 0} totalTokens=${usage.total_tokens ?? 0}`,
      );

      // Extract structured fields for DB storage
      const p = parsedOutput as Record<string, unknown> | null;
      const locObj = p?.location && typeof p.location === 'object' ? (p.location as Record<string, unknown>) : null;
      const budgetObj = p?.budget && typeof p.budget === 'object' ? p.budget : null;
      const timelineObj = p?.timeline && typeof p.timeline === 'object' ? p.timeline : null;
      const projectObj = p?.project && typeof p.project === 'object' ? p.project : null;

      let intakeId: string | null = null;
      const sessionId = this.sanitizeSessionId(context?.sessionId);
      const userId = context?.userId;

      try {
        const intake = await this.prisma.aiIntake.create({
          data: {
            requestId,
            rawPrompt: trimmedPrompt,
            userId: userId ?? null,
            sessionId: sessionId ?? null,
            model: payload.model || model,
            durationMs,
            promptTokens: usage.prompt_tokens ?? null,
            completionTokens: usage.completion_tokens ?? null,
            title: typeof p?.title === 'string' ? p.title : null,
            intent: typeof p?.intent === 'string' ? p.intent : null,
            trades: Array.isArray(p?.trades) ? (p.trades as string[]) : [],
            locationPrimary: typeof locObj?.primary === 'string' ? locObj.primary : null,
            locationSecondary: typeof locObj?.secondary === 'string' ? locObj.secondary : null,
            locationTertiary: typeof locObj?.tertiary === 'string' ? locObj.tertiary : null,
            summary: typeof p?.summary === 'string' ? p.summary : null,
            scope: typeof p?.scope === 'string' ? p.scope : null,
            risks: Array.isArray(p?.risks) ? p.risks : undefined,
            assumptions: Array.isArray(p?.assumptions) ? p.assumptions : undefined,
            nextQuestions: Array.isArray(p?.nextQuestions) ? p.nextQuestions : undefined,
            budget: budgetObj ?? undefined,
            timeline: timelineObj ?? undefined,
            overallConfidence: typeof p?.overallConfidence === 'number' ? p.overallConfidence : null,
            rawOutput: parsedOutput ? (parsedOutput as object) : undefined,
            project: {
              ...(projectObj && typeof projectObj === 'object' ? (projectObj as Record<string, unknown>) : {}),
              aiThread: activeThread
                ? {
                    sourceIntakeId: activeThread.id,
                    windowExpiresAt: new Date(activeThread.createdAt.getTime() + this.aiThreadWindowMs).toISOString(),
                  }
                : undefined,
            },
            status: 'draft',
          },
        });
        intakeId = intake.id;
        this.logger.log(`[${requestId}] Intake saved id=${intakeId}`);
      } catch (dbErr) {
        // Non-fatal — log and continue; don't fail the user response
        this.logger.warn(`[${requestId}] Intake save failed: ${(dbErr as Error).message}`);
      }

      return {
        requestId,
        intakeId,
        model: payload.model || model,
        durationMs,
        usage: {
          promptTokens: usage.prompt_tokens ?? null,
          completionTokens: usage.completion_tokens ?? null,
          totalTokens: usage.total_tokens ?? null,
        },
        wrapper: {
          allowedTradesCount: promptWrapper.allowedTradesCount,
          locationEntryCount: promptWrapper.locationEntryCount,
        },
        output,
        parsedOutput,
        threadContext: activeThread
          ? {
              sourceIntakeId: activeThread.id,
              windowExpiresAt: new Date(activeThread.createdAt.getTime() + this.aiThreadWindowMs).toISOString(),
            }
          : null,
        conversationalText: mode === 'conversational' && parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)
          ? (parsedOutput as Record<string, unknown>).conversationalText ?? null
          : null,
        contractDocumentation: normalizedContractDocumentation,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if ((error as Error).name === 'AbortError') {
        this.logger.warn(`[${requestId}] DeepSeek request timeout after ${durationMs}ms`);
        throw new ServiceUnavailableException('DeepSeek request timed out');
      }
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `[${requestId}] DeepSeek request unexpected error after ${durationMs}ms: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException('DeepSeek sandbox unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async previewConversationalRequirements(prompt: string, context?: { sessionId?: string; userId?: string; intakeId?: string }) {
    const baseResponse = await this.previewRequirements(prompt, {
      ...context,
      mode: 'conversational',
    });

    const parsedFromBase =
      baseResponse.parsedOutput && typeof baseResponse.parsedOutput === 'object' && !Array.isArray(baseResponse.parsedOutput)
        ? (baseResponse.parsedOutput as Record<string, unknown>)
        : null;

    const recoveredFromOutput = !parsedFromBase && typeof baseResponse.output === 'string'
      ? this.extractPartialParsedOutput(baseResponse.output)
      : null;

    const normalizedParsedOutput = recoveredFromOutput ? this.normalizeParsedOutput(recoveredFromOutput) : parsedFromBase;
    const parsedObject =
      normalizedParsedOutput && typeof normalizedParsedOutput === 'object' && !Array.isArray(normalizedParsedOutput)
        ? (normalizedParsedOutput as Record<string, unknown>)
        : null;

    const existingConversationalText =
      typeof baseResponse.conversationalText === 'string' && baseResponse.conversationalText.trim().length > 0
        ? baseResponse.conversationalText.trim()
        : parsedObject && typeof parsedObject.conversationalText === 'string' && parsedObject.conversationalText.trim().length > 0
          ? parsedObject.conversationalText.trim()
          : null;

    const fallbackConversationalText = this.buildConversationalTextFallback(parsedObject, prompt);
    const conversationalText = existingConversationalText || fallbackConversationalText ||
      'Thanks for sharing your project. We can help you understand the next steps and connect you with the right professionals.';

    const trades = parsedObject && Array.isArray(parsedObject.trades)
      ? parsedObject.trades.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    const responseParsedOutput = {
      ...(parsedObject || {}),
      conversationalText,
      trades,
    };

    return {
      ...baseResponse,
      conversationalText,
      parsedOutput: responseParsedOutput,
      trades,
    };
  }

  async convertIntake(
    intakeId: string,
    context?: {
      userId?: string;
      sessionId?: string;
      followUpAnswers?: Array<{ question?: string; answer?: string }>;
      finalSummary?: string;
    },
  ) {
    const userId = context?.userId;
    const sessionId = this.sanitizeSessionId(context?.sessionId);
    const intake = await this.prisma.aiIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new NotFoundException('AI intake not found');

    const normalizedFollowUpAnswers = Array.isArray(context?.followUpAnswers)
      ? context.followUpAnswers
          .map((item) => {
            const question = typeof item?.question === 'string' ? item.question.trim() : '';
            const answer = typeof item?.answer === 'string' ? item.answer.trim() : '';
            if (!question || !answer) return null;
            return { question, answer };
          })
          .filter(
            (item): item is { question: string; answer: string } => Boolean(item),
          )
      : [];

    const finalSummary =
      typeof context?.finalSummary === 'string' && context.finalSummary.trim().length > 0
        ? context.finalSummary.trim()
        : null;

    const projectJson =
      intake.project && typeof intake.project === 'object' && !Array.isArray(intake.project)
        ? ({ ...(intake.project as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const safetyAssessment = this.normalizeSafetyAssessment(projectJson.safetyAssessment);

    const shouldPersistFollowUp = normalizedFollowUpAnswers.length > 0 || Boolean(finalSummary);

    // Access control: allow convert only for owning user or matching anonymous session
    if (intake.userId) {
      if (!userId || intake.userId !== userId) {
        throw new NotFoundException('AI intake not found');
      }
    } else if (intake.sessionId) {
      if (!sessionId || intake.sessionId !== sessionId) {
        throw new NotFoundException('AI intake not found');
      }
    }

    // Update intake to reflect conversion intent
    await this.prisma.aiIntake.update({
      where: { id: intakeId },
      data: {
        status: 'pending_project',
        ...(userId ? { userId } : {}),
        ...(!intake.sessionId && sessionId ? { sessionId } : {}),
        ...(shouldPersistFollowUp
          ? {
              project: {
                ...projectJson,
                ...(normalizedFollowUpAnswers.length > 0
                  ? { followUpAnswers: normalizedFollowUpAnswers }
                  : {}),
                ...(finalSummary ? { finalSummary } : {}),
              },
            }
          : {}),
      },
    });

    const toStringArray = (value: unknown): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0);
    };

    // ── Budget mapping ────────────────────────────────────────────────
    const budgetJson = intake.budget as {
      min?: number | null;
      max?: number | null;
      currency?: string | null;
    } | null;
    let draftBudget: number | null = null;
    if (budgetJson) {
      const { min, max } = budgetJson;
      if (max && max > 0) draftBudget = max;
      else if (min && min > 0) draftBudget = min;
    }

    // ── Timeline → endDate ────────────────────────────────────────────
    const timelineJson = intake.timeline as {
      durationText?: string | null;
      startText?: string | null;
      deadlineText?: string | null;
    } | null;

    const asapKeywords = /\b(asap|immediately|urgent|today|tonight|right now|right away|straight away|as soon as possible)\b/i;
    const isAsap = asapKeywords.test(intake.rawPrompt) || asapKeywords.test(timelineJson?.startText ?? '');
    const isEmergency =
      /\b(emergency|urgent|asap|immediately|today|tonight|right now)\b/i.test(intake.rawPrompt) ||
      safetyAssessment.shouldEscalateEmergency ||
      safetyAssessment.riskLevel === 'high' ||
      safetyAssessment.riskLevel === 'critical';

    let draftEndDate: string | null = null;
    const now = new Date();

    if (isAsap) {
      // ASAP → 1 week from creation
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      draftEndDate = d.toISOString().slice(0, 10);
    } else if (timelineJson?.durationText) {
      // Try to parse "X weeks", "X months", "X days"
      const match = timelineJson.durationText.match(/(\d+(?:\.\d+)?)\s*(day|week|month|year)/i);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        const d = new Date(now);
        if (unit.startsWith('day')) d.setDate(d.getDate() + Math.round(value));
        else if (unit.startsWith('week')) d.setDate(d.getDate() + Math.round(value * 7));
        else if (unit.startsWith('month')) d.setMonth(d.getMonth() + Math.round(value));
        else if (unit.startsWith('year')) d.setFullYear(d.getFullYear() + Math.round(value));
        draftEndDate = d.toISOString().slice(0, 10);
      }
    }

    const followUpTranscript = normalizedFollowUpAnswers
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join('\n\n');
    const draftNotes = finalSummary ?? intake.scope ?? intake.summary ?? '';
    const draftUserPrompt = followUpTranscript
      ? `${intake.rawPrompt}\n\nFollow-up answers:\n${followUpTranscript}`
      : intake.rawPrompt;

    // Return pre-populated project draft data for the create-project page
    return {
      intakeId: intake.id,
      draft: {
        projectName: intake.title ?? intake.summary ?? '',
        region: intake.locationPrimary ?? '',
        tradesRequired: intake.trades,
        notes: draftNotes,
        userPrompt: draftUserPrompt,
        aiFrom: {
          assumptions: toStringArray(intake.assumptions),
          risks: toStringArray(intake.risks),
          safety: safetyAssessment,
        },
        ...(draftBudget !== null ? { budget: draftBudget } : {}),
        ...(draftEndDate ? { endDate: draftEndDate } : {}),
        ...(isEmergency ? { isEmergency: true } : {}),
      },
    };
  }

  async acknowledgeSafetyTriage(
    intakeId: string,
    context: { adminUserId: string; adminName?: string },
  ) {
    const intake = await this.prisma.aiIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new NotFoundException('AI intake not found');

    const projectJson =
      intake.project && typeof intake.project === 'object' && !Array.isArray(intake.project)
        ? ({ ...(intake.project as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const safetyAssessment = this.normalizeSafetyAssessment(projectJson.safetyAssessment);

    if (!safetyAssessment.isDangerous && safetyAssessment.concerns.length === 0) {
      throw new BadRequestException('No safety triage to acknowledge');
    }

    const reviewedSafety = {
      ...safetyAssessment,
      adminReview: {
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedByUserId: context.adminUserId,
        acknowledgedByName: context.adminName ?? null,
      },
    };

    const updated = await this.prisma.aiIntake.update({
      where: { id: intakeId },
      data: {
        project: {
          ...projectJson,
          safetyAssessment: reviewedSafety,
        },
      },
      select: {
        id: true,
        project: true,
      },
    });

    await (this.prisma as any).activityLog.create({
      data: {
        actorName: context.adminName || 'Admin',
        actorType: 'admin',
        userId: context.adminUserId,
        action: 'ai_safety_acknowledged',
        resource: 'AiIntake',
        resourceId: intakeId,
        details: 'AI safety triage acknowledged by admin',
        metadata: {
          intakeId,
          projectId: intake.projectId,
          riskLevel: safetyAssessment.riskLevel,
          concerns: safetyAssessment.concerns,
        },
        status: 'warning',
      },
    }).catch((error) => {
      this.logger.warn(
        `[acknowledgeSafetyTriage] Failed to write activity log: ${(error as Error).message}`,
      );
    });

    return updated;
  }

  async countProfessionals(trades?: string[], location?: string): Promise<{
    count: number;
    hasTrades: boolean;
    hasLocation: boolean;
    fullCoverageCompanyCount: number;
    specialistCount: number;
    perTradeCounts: Array<{ trade: string; count: number }>;
  }> {
    try {
      const hasTrades = Array.isArray(trades) && trades.length > 0;
      const hasLocation = Boolean(location?.trim());

      // If no trades and no location provided, return 0
      if (!hasTrades && !hasLocation) {
        return {
          count: 0,
          hasTrades: false,
          hasLocation: false,
          fullCoverageCompanyCount: 0,
          specialistCount: 0,
          perTradeCounts: [],
        };
      }

      const where: any = { status: 'approved' };

      // Build trade filters from array
      const tradeFilters =
        hasTrades
          ? trades.map((trade) => ({
              OR: [
                { primaryTrade: { contains: trade, mode: 'insensitive' } },
                { tradesOffered: { hasSome: [trade] } },
              ],
            }))
          : null;

      const locationKeyword = location?.trim() || '';
      const normalizedAreaCodes = hasLocation
        ? await this.resolveAreaCodesForLocationKeyword(locationKeyword)
        : [];

      // Prefer normalized coverage filter when location resolves to canonical area codes.
      // Fallback to legacy text fields only when we cannot resolve canonical codes.
      const locationFilters = hasLocation
        ? normalizedAreaCodes.length > 0
          ? [
              {
                regionCoverage: {
                  some: {
                    area: {
                      code: {
                        in: normalizedAreaCodes,
                      },
                    },
                  },
                },
              },
            ]
          : [
              {
                regionCoverage: {
                  some: {
                    OR: [
                      { area: { name: { contains: locationKeyword, mode: 'insensitive' } } },
                      { zone: { label: { contains: locationKeyword, mode: 'insensitive' } } },
                      { zone: { code: { contains: locationKeyword, mode: 'insensitive' } } },
                    ],
                  },
                },
              },
              { locationPrimary: { contains: locationKeyword, mode: 'insensitive' } },
              { locationSecondary: { contains: locationKeyword, mode: 'insensitive' } },
              { locationTertiary: { contains: locationKeyword, mode: 'insensitive' } },
              { serviceArea: { contains: locationKeyword, mode: 'insensitive' } },
            ]
        : null;

      // Combine filters based on what's available
      if (tradeFilters && locationFilters) {
        // Both trades and location: match any trade AND any location
        where.AND = [
          { OR: tradeFilters.reduce((acc, f) => [...acc, ...f.OR], [] as any[]) },
          { OR: locationFilters },
        ];
      } else if (tradeFilters) {
        // Only trades: match any trade
        where.OR = tradeFilters.reduce((acc, f) => [...acc, ...f.OR], [] as any[]);
      } else if (locationFilters) {
        // Only location: match any location
        where.OR = locationFilters;
      }

      const count = await (this.prisma as any).professional.count({ where });

      const normalizedTrades = hasTrades
        ? Array.from(
            new Set(
              (trades || [])
                .map((trade) => (trade || '').trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : [];

      const matchedProfessionals = await (this.prisma as any).professional.findMany({
        where,
        select: {
          professionType: true,
          primaryTrade: true,
          tradesOffered: true,
          suppliesOffered: true,
        },
      });

      const getProfessionalTradeSet = (professional: {
        primaryTrade?: string | null;
        tradesOffered?: string[] | null;
        suppliesOffered?: string[] | null;
      }) => {
        const allTrades = [
          professional.primaryTrade,
          ...(Array.isArray(professional.tradesOffered) ? professional.tradesOffered : []),
          ...(Array.isArray(professional.suppliesOffered) ? professional.suppliesOffered : []),
        ]
          .map((value) => (value || '').trim().toLowerCase())
          .filter(Boolean);

        return new Set(allTrades);
      };

      const fullCoverageCompanyCount = normalizedTrades.length > 0
        ? matchedProfessionals.filter((professional: any) => {
            if ((professional?.professionType || '').toLowerCase() !== 'company') return false;
            const tradeSet = getProfessionalTradeSet(professional);
            return normalizedTrades.every((trade) => tradeSet.has(trade));
          }).length
        : 0;

      const specialistSet = new Set<number>();
      const perTradeCounts = normalizedTrades.map((trade) => {
        let tradeCount = 0;
        matchedProfessionals.forEach((professional: any, index: number) => {
          const tradeSet = getProfessionalTradeSet(professional);
          if (tradeSet.has(trade)) {
            tradeCount += 1;
            specialistSet.add(index);
          }
        });

        return {
          trade,
          count: tradeCount,
        };
      });

      return {
        count,
        hasTrades,
        hasLocation,
        fullCoverageCompanyCount,
        specialistCount: specialistSet.size,
        perTradeCounts,
      };
    } catch (error) {
      this.logger.warn(
        `Error counting professionals for AI extraction: ${(error as Error).message}`,
      );
      return {
        count: 0,
        hasTrades: false,
        hasLocation: false,
        fullCoverageCompanyCount: 0,
        specialistCount: 0,
        perTradeCounts: [],
      };
    }
  }
}
