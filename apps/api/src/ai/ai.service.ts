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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly tradesService: TradesService,
    private readonly prisma: PrismaService,
  ) {}

  private sanitizeSessionId(sessionId?: string) {
    const trimmed = sessionId?.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, 128);
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

    const systemPrompt = `You are Fitout Hub Intake Extractor.

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

OUTPUT SCHEMA
{
  "version": "1.0",
  "language": "en|zh-HK|mixed|unknown",
  "intent": "new_project|quote_request|advice|unknown",
  "title": "string|null",
  "summary": "string|null",
  "scope": "string|null",
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
  "overallConfidence": number
}`;

    return {
      systemPrompt,
      allowedTradesCount: allowedTrades.length,
      locationEntryCount: Object.keys(locationTaxonomy).length,
    };
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

    if (!project.scopeText && scope) {
      project.scopeText = scope;
    }

    return {
      ...result,
      title,
      summary,
      scope,
      assumptions,
      risks,
      nextQuestions,
      followUpQuestions: Array.isArray(result.followUpQuestions)
        ? result.followUpQuestions
        : nextQuestions,
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
    const endpoint = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeoutRaw = process.env.DEEPSEEK_TIMEOUT_MS;
    const timeoutMs = Number(timeoutRaw || '60000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '700');
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

  async previewRequirements(prompt: string, context?: { sessionId?: string; userId?: string }) {
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

    const endpoint = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    // Increased default timeout to 30000ms (30s) for large prompts
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '700');

    const requestId = `ds_${Date.now().toString(36)}`;
    const startedAt = Date.now();
    const promptWrapper = await this.buildPromptWrapper();

    const userMessage = `USER_PROMPT:\n${trimmedPrompt}\n\nContext:\n- Market: Hong Kong\n- Use only allowed trades from the provided list\n- Normalize output for platform matching and triage`;

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
            project: projectObj ?? undefined,
            budget: budgetObj ?? undefined,
            timeline: timelineObj ?? undefined,
            overallConfidence: typeof p?.overallConfidence === 'number' ? p.overallConfidence : null,
            rawOutput: parsedOutput ? (parsedOutput as object) : undefined,
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

  async convertIntake(intakeId: string, context?: { userId?: string; sessionId?: string }) {
    const userId = context?.userId;
    const sessionId = this.sanitizeSessionId(context?.sessionId);
    const intake = await this.prisma.aiIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new NotFoundException('AI intake not found');

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
      },
    });

    // Return pre-populated project draft data for the create-project page
    return {
      intakeId: intake.id,
      draft: {
        projectName: intake.title ?? intake.summary ?? '',
        region: intake.locationPrimary ?? '',
        tradesRequired: intake.trades,
        notes: intake.scope ?? intake.summary ?? '',
        userPrompt: intake.rawPrompt,
      },
    };
  }

  async countProfessionals(trades?: string[], location?: string): Promise<{
    count: number;
    hasTrades: boolean;
    hasLocation: boolean;
  }> {
    try {
      const hasTrades = Array.isArray(trades) && trades.length > 0;
      const hasLocation = Boolean(location?.trim());

      // If no trades and no location provided, return 0
      if (!hasTrades && !hasLocation) {
        return { count: 0, hasTrades: false, hasLocation: false };
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

      // Build location filters
      const locationFilters = hasLocation
        ? [
            { locationPrimary: { contains: location, mode: 'insensitive' } },
            { locationSecondary: { contains: location, mode: 'insensitive' } },
            { locationTertiary: { contains: location, mode: 'insensitive' } },
            { serviceArea: { contains: location, mode: 'insensitive' } },
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
      return {
        count,
        hasTrades,
        hasLocation,
      };
    } catch (error) {
      this.logger.warn(
        `Error counting professionals for AI extraction: ${(error as Error).message}`,
      );
      return { count: 0, hasTrades: false, hasLocation: false };
    }
  }
}
