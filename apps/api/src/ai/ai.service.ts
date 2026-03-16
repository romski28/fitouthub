import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LOCATIONS } from '../../../../packages/schemas/locations';
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

  constructor(private readonly tradesService: TradesService) {}

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
    const locationTaxonomy = this.buildLocationTaxonomy();

    const systemPrompt = `You are Fitout Hub Intake Extractor.

Your job is to convert a free-text renovation or fitout request into strict JSON that is directly useful to the Fitout Hub platform in Hong Kong.

  The response must serve TWO purposes at the same time:
  1) a contract-friendly narrative summary block
  2) a platform-friendly structured extraction block

CRITICAL RULES
1) Output JSON only. No markdown. No prose outside JSON.
2) The \"trades\" array must contain only exact values from ALLOWED_TRADES.name.
3) If a user need is mentioned but no exact trade exists in ALLOWED_TRADES, add it to \"unmappedNeeds\" and do not invent a trade.
4) Geography is Hong Kong by default. Normalize location using the HK_LOCATION_TAXONOMY.
5) Use location fields that match the platform structure: primary, secondary, tertiary.
6) If a field is unknown, use null or an empty array. Do not guess.
7) Preserve raw snippets where useful, especially for scope, size, budget, timeline, and location.
8) Confidence values must be numbers between 0 and 1.
9) Prefer precision over completeness. Never hallucinate facts.
10) Return every key in the schema.
11) The narrative keys summary, scope, assumptions, risks, and nextQuestions are mandatory because they may be reused in contract documentation and project records.

ALLOWED_TRADES = ${JSON.stringify(allowedTrades)}

HK_LOCATION_TAXONOMY = ${JSON.stringify(locationTaxonomy)}

NORMALIZATION RULES
- Currency: If the prompt uses HKD, HK$, or $ in Hong Kong context, normalize currency to HKD.
- Budget shorthand: 450k => 450000, 1.2m => 1200000.
- If one budget figure is given, set min and max to the same value.
- Size: normalize common units to sqft or sqm. Keep rawText even when numeric parsing succeeds.
- Space: identify propertyType and scopeLevel such as room, floor, unit, shop, office, building, house, apartment.
- Timeline: capture durationText, startText, deadlineText separately.
- Trades: choose all relevant exact trade names from ALLOWED_TRADES.name.
- Location: use country=Hong Kong and normalize into primary/secondary/tertiary where possible.

OUTPUT SCHEMA
{
  "version": "1.0",
  "language": "en|zh-HK|mixed|unknown",
  "intent": "new_project|quote_request|advice|unknown",
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
  "tradeDetails": [
    {
      "trade": "string",
      "confidence": number,
      "reason": "string",
      "evidence": "string"
    }
  ],
  "unmappedNeeds": ["string"],
  "keyFacts": ["string"],
  "missingInfo": ["string"],
  "followUpQuestions": ["string"],
  "overallConfidence": number
}`;

    return {
      systemPrompt,
      allowedTradesCount: allowedTrades.length,
      locationEntryCount: LOCATIONS.length,
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
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '30000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '450');
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
        maxOutputTokens,
        apiKeyPresent,
      },
      promptWrapper: {
        systemPromptChars: promptWrapper.systemPrompt.length,
        allowedTradesCount: promptWrapper.allowedTradesCount,
        locationEntryCount: promptWrapper.locationEntryCount,
      },
    };
  }

  async previewRequirements(prompt: string) {
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
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '30000');
    const maxOutputTokens = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '450');

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
        `[${requestId}] DeepSeek request started model=${model} userPromptChars=${trimmedPrompt.length} userMessageChars=${userMessage.length} systemPromptChars=${promptWrapper.systemPrompt.length} totalMessageChars=${totalMessageChars} allowedTrades=${promptWrapper.allowedTradesCount} locationEntries=${promptWrapper.locationEntryCount}`,
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

      return {
        requestId,
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
}
