import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LOCATIONS } from '../../../../packages/schemas/locations';
import { PrismaService } from '../prisma.service';
import { ActivityLogService } from '../activity-log.service';
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

type ProjectActor = { actorId: string; role: 'client' | 'professional' | 'admin' };

type ScopeEntry = {
  id: string;
  sequence: number;
  workPackage: string;
  deliverable: string;
  primaryTrade: string;
  durationMinDays: number;
  durationMaxDays: number;
  dependencies: string[];
  phase: string;
  milestoneCode: string | null;
  notes: string;
};

type ScopeStatus = 'draft' | 'pm_reviewed' | 'published' | 'superseded';

type ScopeAuditEntry = {
  fromStatus: ScopeStatus;
  toStatus: ScopeStatus;
  byActorId: string;
  byRole: 'admin';
  at: string;
  note?: string;
};

type ScopeVersion = {
  id: string;
  version: number;
  createdAt: string;
  status: ScopeStatus;
  publishedAt?: string;
  scopeAuditLog: ScopeAuditEntry[];
  createdByRole: 'client' | 'professional' | 'admin';
  promptInputs: {
    additionalContext?: string;
    siteConstraints?: string;
    longLeadItems?: string;
    workingCalendar?: string;
    deadline?: string;
  };
  projectSummary: {
    projectType: string;
    location: string;
    assumptions: string[];
    constraints: string[];
  };
  entries: ScopeEntry[];
  milestones: Array<{
    code: string;
    name: string;
    targetDay: number;
    acceptanceCriteria: string;
  }>;
  programme: {
    startDay: number;
    finishDay: number;
    criticalPath: string[];
    timelineByPhase: Array<{
      phase: string;
      dayRange: string;
      includedEntryIds: string[];
    }>;
  };
  confidence: {
    level: 'low' | 'medium' | 'high';
    notes: string;
  };
};

type ScopeContainer = {
  currentVersionId: string | null;
  publishedVersionId: string | null;
  versions: ScopeVersion[];
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiThreadWindowMs = 2 * 60 * 60 * 1000;

  constructor(
    private readonly tradesService: TradesService,
    private readonly prisma: PrismaService,
    private readonly activityLogService: ActivityLogService,
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

  private resolveQwenChatEndpoint() {
    const configured = (process.env.QWEN_API_URL || '').trim();
    if (!configured) {
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
    }
    if (configured.endsWith('/chat/completions')) return configured;
    return `${configured.replace(/\/+$/, '')}/chat/completions`;
  }

  private getAiThreadWindowStart() {
    return new Date(Date.now() - this.aiThreadWindowMs);
  }

  private isMemoryResetPrompt(prompt: string): boolean {
    const normalized = prompt.trim().toLowerCase();
    if (!normalized) return false;

    return /(forget\s+(everything|all|this|that)|reset\s+(conversation|chat|context|memory)|start\s+(over|fresh|new)|clear\s+(conversation|chat|context|memory)|new\s+conversation\b)/i.test(normalized);
  }

  private buildAiThreadContextSummary(intake: {
    id?: string;
    project?: unknown;
    rawPrompt?: string | null;
    title?: string | null;
    summary?: string | null;
    scope?: string | null;
    trades?: string[] | null;
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
      priorPrompt: typeof intake.rawPrompt === 'string' ? intake.rawPrompt.trim() : '',
      title: intake.title?.trim() || null,
      summary: intake.summary?.trim() || intake.scope?.trim() || null,
      trades: Array.isArray(intake.trades) ? intake.trades.filter(Boolean) : [],
      location: locationLabel || null,
      budget: typeof budget?.rawText === 'string' ? budget.rawText.trim() : null,
      timeline: typeof timeline?.durationText === 'string' ? timeline.durationText.trim() : null,
      conversationalText: conversationalText || null,
    };
  }

  private normalizeQuestionTopicKey(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private areQuestionsNearDuplicate(a: string, b: string): boolean {
    const keyA = this.normalizeQuestionTopicKey(a);
    const keyB = this.normalizeQuestionTopicKey(b);
    if (!keyA || !keyB) return false;
    if (keyA === keyB) return true;
    if (keyA.includes(keyB) || keyB.includes(keyA)) return true;

    const tokensA = new Set(keyA.split(' ').filter((token) => token.length > 2));
    const tokensB = new Set(keyB.split(' ').filter((token) => token.length > 2));
    if (tokensA.size === 0 || tokensB.size === 0) return false;

    let overlap = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) overlap += 1;
    }

    const minSize = Math.min(tokensA.size, tokensB.size);
    return minSize > 0 && overlap / minSize >= 0.7;
  }

  private filterRepeatedQuestions(candidates: string[], alreadyAsked: string[]): string[] {
    const unique: string[] = [];
    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      if (!trimmed) continue;

      const isRepeatedInHistory = alreadyAsked.some((asked) => this.areQuestionsNearDuplicate(trimmed, asked));
      if (isRepeatedInHistory) continue;

      const isRepeatedInBatch = unique.some((existing) => this.areQuestionsNearDuplicate(trimmed, existing));
      if (isRepeatedInBatch) continue;

      unique.push(trimmed);
    }
    return unique;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private extractAskedQuestionsFromIntakeOutput(rawOutput: unknown): string[] {
    if (!rawOutput || typeof rawOutput !== 'object' || Array.isArray(rawOutput)) return [];
    const parsed = rawOutput as Record<string, unknown>;
    return Array.from(
      new Set([
        ...this.toStringArray(parsed.nextQuestions),
        ...this.toStringArray(parsed.followUpQuestions),
      ]),
    );
  }

  private async collectThreadAskedQuestions(activeThread?: { id: string; project?: unknown } | null): Promise<string[]> {
    if (!activeThread) return [];

    const visited = new Set<string>();
    const chain: Array<{ id: string; project?: unknown; rawOutput?: unknown }> = [];
    let cursor: { id: string; project?: unknown; rawOutput?: unknown } | null = activeThread;

    for (let depth = 0; depth < 20; depth += 1) {
      if (!cursor || visited.has(cursor.id)) break;
      visited.add(cursor.id);
      chain.push(cursor);

      const sourceIntakeId = this.extractSourceIntakeIdFromProject(cursor.project);
      if (!sourceIntakeId) break;
      const parent = await this.prisma.aiIntake.findUnique({ where: { id: sourceIntakeId } });
      cursor = parent
        ? { id: parent.id, project: parent.project, rawOutput: parent.rawOutput }
        : null;
    }

    const questionsByKey = new Map<string, string>();
    for (const intake of chain) {
      for (const question of this.extractAskedQuestionsFromIntakeOutput(intake.rawOutput)) {
        const key = this.normalizeQuestionTopicKey(question);
        if (!key) continue;
        if (!questionsByKey.has(key)) {
          questionsByKey.set(key, question.trim());
        }
      }
    }

    return Array.from(questionsByKey.values());
  }

  private extractSourceIntakeIdFromProject(project: unknown): string | null {
    if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
    const projectRecord = project as Record<string, unknown>;
    const aiThread = projectRecord.aiThread;
    if (!aiThread || typeof aiThread !== 'object' || Array.isArray(aiThread)) return null;
    const sourceIntakeId = (aiThread as Record<string, unknown>).sourceIntakeId;
    return typeof sourceIntakeId === 'string' && sourceIntakeId.trim().length > 0
      ? sourceIntakeId.trim()
      : null;
  }

  private async resolveThreadOriginIntake(intake: { id: string; project?: unknown }) {
    let current = intake;
    const visited = new Set<string>([intake.id]);

    for (let depth = 0; depth < 10; depth += 1) {
      const sourceIntakeId = this.extractSourceIntakeIdFromProject(current.project);
      if (!sourceIntakeId || visited.has(sourceIntakeId)) {
        break;
      }
      visited.add(sourceIntakeId);

      const parent = await this.prisma.aiIntake.findUnique({ where: { id: sourceIntakeId } });
      if (!parent) break;
      current = parent;
    }

    return current;
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
      // When session id is present, require session affinity to prevent stale cross-session carryover.
      if (sessionId) {
        if (intake.sessionId && intake.sessionId === sessionId) return intake;
        return null;
      }

      if (intake.userId && userId && intake.userId === userId) return intake;
    }

    const identityClause = sessionId
      ? { sessionId }
      : userId
        ? { userId }
        : null;
    if (!identityClause) return null;

    return this.prisma.aiIntake.findFirst({
      where: {
        AND: [
          { createdAt },
          identityClause,
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private truncateForPrompt(value: string | null | undefined, maxChars: number): string {
    if (!value) return '';
    const compact = value.replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= maxChars) return compact;
    return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
  }

  private classifyScopeSignal(text: string): 'room' | 'whole' | 'unknown' {
    const normalized = text.toLowerCase();
    if (!normalized.trim()) return 'unknown';

    const wholeScopePattern = /(whole\s+(flat|apartment|home|house|unit)|entire\s+(flat|apartment|home|house|unit)|full\s+(flat|apartment|home|house|unit)|throughout|all\s+rooms|complete\s+renovation|full\s+renovation|gut\s+renovation)/i;
    if (wholeScopePattern.test(normalized)) return 'whole';

    const roomScopePattern = /(bathroom|toilet|washroom|powder\s+room|kitchen|bedroom|living\s+room|study\s+room|single\s+room|one\s+room|shower\s+area|balcony)/i;
    if (roomScopePattern.test(normalized)) return 'room';

    return 'unknown';
  }

  private isExplicitScopeExpansionPrompt(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    return /(expand|whole\s+(flat|apartment|home|house|unit)|entire\s+(flat|apartment|home|house|unit)|full\s+(flat|apartment|home|house|unit)|not\s+just\s+the\s+bathroom|instead\s+of\s+bathroom|change\s+to\s+whole|upgrade\s+to\s+full)/i.test(normalized);
  }

  private enforceScopeContinuity(params: {
    parsedObject: Record<string, unknown>;
    prompt: string;
    threadSummary: { title: string | null; summary: string | null; priorPrompt: string };
    threadOriginSummary: { priorPrompt: string } | null;
    requestId: string;
  }): Record<string, unknown> {
    const { parsedObject, prompt, threadSummary, threadOriginSummary, requestId } = params;

    const priorReferenceText = [
      threadOriginSummary?.priorPrompt || '',
      threadSummary.priorPrompt || '',
      threadSummary.title || '',
      threadSummary.summary || '',
    ].join(' ');

    const project =
      parsedObject.project && typeof parsedObject.project === 'object' && !Array.isArray(parsedObject.project)
        ? ({ ...(parsedObject.project as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const candidateText = [
      typeof parsedObject.title === 'string' ? parsedObject.title : '',
      typeof parsedObject.summary === 'string' ? parsedObject.summary : '',
      typeof parsedObject.scope === 'string' ? parsedObject.scope : '',
      typeof project.scopeText === 'string' ? project.scopeText : '',
    ].join(' ');

    const priorScope = this.classifyScopeSignal(priorReferenceText);
    const nextScope = this.classifyScopeSignal(candidateText);
    const canExpandScope = this.isExplicitScopeExpansionPrompt(prompt);

    if (priorScope === 'room' && nextScope === 'whole' && !canExpandScope) {
      if (threadSummary.title) {
        parsedObject.title = threadSummary.title;
      }
      if (threadSummary.summary) {
        parsedObject.summary = threadSummary.summary;
        parsedObject.scope = threadSummary.summary;
        project.scopeText = threadSummary.summary;
      }

      const clarification = 'To confirm, should this stay bathroom-only, or expand to the whole flat?';
      parsedObject.nextQuestions = [clarification];
      parsedObject.followUpQuestions = [clarification];
      parsedObject.project = project;

      const conversationalText =
        typeof parsedObject.conversationalText === 'string' ? parsedObject.conversationalText.trim() : '';
      if (conversationalText) {
        parsedObject.conversationalText = `${conversationalText}\n\nI will keep this scoped to the bathroom unless you tell me to expand it.`;
      }

      this.logger.warn(`[${requestId}] Scope continuity guard prevented unintended expansion from room-level to whole-property`);
    }

    return parsedObject;
  }

  private async persistAiIntakeImageInsights(params: {
    intakeId: string;
    imageUrls: string[];
    requestId: string;
    visionUsage: Record<string, unknown>;
    imageInsights?: {
      summary: string | null;
      conditionFindings: string[];
      safetyFlags: string[];
      followUpQuestions: string[];
      confidence: number | null;
      provider: string | null;
      model: string | null;
    } | null;
  }) {
    const normalizedUrls = Array.from(
      new Set(
        params.imageUrls
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => url.length > 0),
      ),
    );

    if (normalizedUrls.length === 0) return;

    const provider =
      typeof params.imageInsights?.provider === 'string'
        ? params.imageInsights.provider
        : typeof params.visionUsage.provider === 'string'
          ? params.visionUsage.provider
          : null;
    const model =
      typeof params.imageInsights?.model === 'string'
        ? params.imageInsights.model
        : typeof params.visionUsage.model === 'string'
          ? params.visionUsage.model
          : null;
    const status = typeof params.visionUsage.status === 'string' ? params.visionUsage.status : null;
    const durationMs = typeof params.visionUsage.durationMs === 'number' ? params.visionUsage.durationMs : null;

    const summary = params.imageInsights?.summary || null;
    const conditionFindings = params.imageInsights?.conditionFindings || [];
    const safetyFlags = params.imageInsights?.safetyFlags || [];
    const followUpQuestions = params.imageInsights?.followUpQuestions || [];
    const confidence = typeof params.imageInsights?.confidence === 'number' ? params.imageInsights.confidence : null;

    for (const imageUrl of normalizedUrls) {
      try {
        await this.prisma.$executeRawUnsafe(
          `
          INSERT INTO ai_intake_image_insights
            ("intakeId", "imageUrl", provider, model, status, "requestId", "durationMs", summary, "conditionFindings", "safetyFlags", "followUpQuestions", confidence, "updatedAt")
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, now())
          ON CONFLICT ("intakeId", "imageUrl")
          DO UPDATE SET
            provider = EXCLUDED.provider,
            model = EXCLUDED.model,
            status = EXCLUDED.status,
            "requestId" = EXCLUDED."requestId",
            "durationMs" = EXCLUDED."durationMs",
            summary = EXCLUDED.summary,
            "conditionFindings" = EXCLUDED."conditionFindings",
            "safetyFlags" = EXCLUDED."safetyFlags",
            "followUpQuestions" = EXCLUDED."followUpQuestions",
            confidence = EXCLUDED.confidence,
            "updatedAt" = now()
          `,
          params.intakeId,
          imageUrl,
          provider,
          model,
          status,
          params.requestId,
          durationMs,
          summary,
          JSON.stringify(conditionFindings),
          JSON.stringify(safetyFlags),
          JSON.stringify(followUpQuestions),
          confidence,
        );
      } catch (error) {
        this.logger.warn(
          `[${params.requestId}] Failed to persist ai_intake_image_insights row for intake=${params.intakeId}: ${(error as Error).message}`,
        );
      }
    }
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

PROJECT MODE CLASSIFICATION (NEW)
- Classify the project into exactly one mode based on dominant user intent.
- Allowed values for modeSuggested:
  - repair: fixing faults, leaks, damage, breakage, malfunction, urgent restoration.
  - refresh: cosmetic or light upgrades without major redesign.
  - design: layout rethink, substantial redesign, or transformation-led scope.
- If signals are mixed, choose the dominant intent and explain briefly in modeReasoning.
- modeSuggested must never be null.
- modeConfidence must be between 0 and 1.
- modeReasoning should be 1-2 short sentences grounded in the user request.

TRADE MINIMIZATION RULE (CRITICAL)
- Suggest the ABSOLUTE MINIMUM trades necessary to complete the job.
- Only include a trade if it is explicitly needed based on the user's description.
- Prefer single-trade solutions when possible.
- In Hong Kong, \"Handyman\" typically handles: shelf fixing, basic repairs, minor carpentry, general maintenance.
- Do NOT add Plumber, Tiler, or Shower Fitter unless there is explicit damage to plumbing/tiles/fixtures.
- EXAMPLE WRONG: User says \"fixing shelves in shower\" → Plumber, Tiler, Shower Fitter, Handyman
- EXAMPLE RIGHT: User says \"fixing shelves in shower\" → Handyman ONLY (unless grout damage is explicitly mentioned)
- Include extra trades ONLY if damage is explicitly stated in the user's description.

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
  "overallConfidence": number,
  "modeSuggested": "repair|refresh|design",
  "modeConfidence": number,
  "modeReasoning": "string"
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

Help people understand their renovation/fitout needs in a warm, encouraging tone while extracting structured project data.

CONVERSATION STYLE
- Be warm, friendly, and conversational
- Show genuine interest in their project
- Use casual language (not stiff or formal)
- Acknowledge their needs and validate any concerns
- Include encouraging phrases about working with Mimo
- End with an invitation to connect with professionals
- Always address the person as "you"; never refer to them as "the user"
- If the prompt contains risk/emergency language (danger, hazard, urgent, leak, electrical risk, safety), reduce humor and switch to clear, calm, practical wording

CRITICAL RULES FOR DATA EXTRACTION
1) Extract and validate ALL fields as in structured mode
2) Generate JSON with ALL of these keys: conversationalText, trades, location (primary, secondary, tertiary), budget, timeline, propertyType, summary, title, nextQuestions, followUpQuestions, overallConfidence
3) "conversationalText" is MANDATORY - warm, friendly narrative (3-5 sentences) acknowledging their project and validating their needs
4) "trades" must contain exact values from ALLOWED_TRADES only
5) Use Hong Kong as the default location context
6) Do NOT ask location-related follow-up questions in nextQuestions/followUpQuestions because location is collected separately in the wizard (avoid asking about district/area/region/address).
7) Do NOT ask budget or timing follow-up questions in nextQuestions/followUpQuestions (budget, price, cost, completion date, deadline, timeline, site inspection) because these are collected in dedicated wizard steps.
8) Avoid repeating previously asked questions. If prior context already answered a point, do not ask it again.
9) Preserve the user's core project objective from earlier thread context. Treat new messages as refinements unless they explicitly replace the objective.
10) Ask only ONE best next question each turn (highest-value missing field for matching/tender quality). Keep nextQuestions/followUpQuestions to max 1 item.
11) Do NOT expand project scope from room-level (e.g., bathroom) to whole-property unless the latest user message explicitly requests expansion.

TRADE MINIMIZATION RULE (CRITICAL)
- Suggest the ABSOLUTE MINIMUM trades necessary to complete the job.
- Only include a trade if it is explicitly needed based on the user's description.
- Prefer single-trade solutions when possible.
- In Hong Kong, "Handyman" typically handles: shelf fixing, basic repairs, minor carpentry, general maintenance.
- Do NOT add Plumber, Tiler, or Shower Fitter unless there is explicit damage to plumbing/tiles/fixtures.
- EXAMPLE WRONG: User says "fixing shelves in shower" → suggest Plumber, Tiler, Shower Fitter, Handyman
- EXAMPLE RIGHT: User says "fixing shelves in shower" → suggest Handyman ONLY (unless grout damage is explicitly mentioned)
- Include extra trades ONLY if damage or specific needs are explicitly mentioned in the user's description.

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
  "nextQuestions": ["string"],
  "followUpQuestions": ["string"],
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
    const imageInsights =
      project.imageInsights && typeof project.imageInsights === 'object' && !Array.isArray(project.imageInsights)
        ? (project.imageInsights as Record<string, unknown>)
        : null;
    const imageInsightFollowUps = imageInsights && Array.isArray(imageInsights.followUpQuestions)
      ? imageInsights.followUpQuestions
      : [];
    const nextQuestions = Array.isArray(result.nextQuestions)
      ? result.nextQuestions
      : Array.isArray(result.followUpQuestions)
        ? result.followUpQuestions
        : imageInsightFollowUps;
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
    const qwenEndpoint = this.resolveQwenChatEndpoint();
    const qwenModel = process.env.QWEN_MODEL || process.env.QWEN_VISION_MODEL || 'qwen-vl-plus-latest';
    const qwenTimeoutRaw = process.env.QWEN_TIMEOUT_MS;
    const qwenTimeoutMs = Number(qwenTimeoutRaw || timeoutRaw || '60000');
    const qwenApiKeyPresent = Boolean((process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim());
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
      providers: {
        deepseek: {
          model,
          endpoint,
          timeoutMs,
          apiKeyPresent,
        },
        qwen: {
          model: qwenModel,
          endpoint: qwenEndpoint,
          timeoutMs: qwenTimeoutMs,
          apiKeyPresent: qwenApiKeyPresent,
        },
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
    provider?: 'deepseek' | 'qwen';
  }) {
    const provider = (context.provider || 'deepseek').toLowerCase();
    if (provider === 'qwen') {
      return this.testQwenVisionAccess(context);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('DeepSeek sandbox is not configured');
    }

    const endpoint = this.resolveDeepSeekChatEndpoint();
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const requestedModel = (context.model || process.env.DEEPSEEK_VISION_MODEL || 'deepseek-v4-pro').trim();
    const modelAliasMap: Record<string, string> = {
      'deepseek-vl2': 'deepseek-v4-flash',
      'deepseek-vl2-chat': 'deepseek-v4-flash',
    };
    const model = modelAliasMap[requestedModel] ?? requestedModel;
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
    const maxInlineImageBytes = Number(process.env.DEEPSEEK_VISION_MAX_INLINE_IMAGE_BYTES || '2097152');

    let inlineImageDataUrl: string | null = null;
    let inlineImageError: string | null = null;
    try {
      const imageRes = await fetch(imageUrl, { signal: controller.signal });
      if (!imageRes.ok) {
        inlineImageError = `image fetch failed (${imageRes.status})`;
      } else {
        const contentType = (imageRes.headers.get('content-type') || 'image/png').split(';')[0].trim();
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
        if (imageBuffer.byteLength > maxInlineImageBytes) {
          inlineImageError = `image too large for inline (${imageBuffer.byteLength} bytes)`;
        } else {
          inlineImageDataUrl = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
        }
      }
    } catch (error) {
      inlineImageError = (error as Error).message || 'image fetch failed';
    }

    const candidates: Array<{
      label: string;
      body: Record<string, unknown>;
    }> = [
      {
        label: 'official_deepseek_docs_exact',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
        },
      },
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
              content: `<image>\n${promptText}`,
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
              content: `<image>\n${promptText}`,
            },
          ],
          images: [imageUrl],
          max_tokens: 200,
          temperature: 0.2,
        },
      },
    ];

    if (inlineImageDataUrl) {
      candidates.splice(1, 0, {
        label: 'message_images_array_data_url',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: `<image>\n${promptText}`,
              images: [inlineImageDataUrl],
            },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
      });
    }

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
            provider: 'deepseek',
            requestId,
            model,
            requestedModel,
            imageUrl,
            endpoint,
            statusCode: response.status,
            durationMs,
            formatUsed: candidate.label,
            attempts,
            inlineImagePrepared: Boolean(inlineImageDataUrl),
            inlineImageError,
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
        provider: 'deepseek',
        requestId,
        model,
        requestedModel,
        imageUrl,
        endpoint,
        statusCode: lastAttempt?.statusCode ?? 400,
        durationMs,
        formatUsed: null,
        attempts,
        inlineImagePrepared: Boolean(inlineImageDataUrl),
        inlineImageError,
        providerError: lastAttempt?.providerError ?? 'Vision model call failed',
        message: 'Vision model call failed',
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if ((error as Error).name === 'AbortError') {
        return {
          ok: false,
          provider: 'deepseek',
          requestId,
          model,
          requestedModel,
          imageUrl,
          endpoint,
          statusCode: 408,
          durationMs,
          attempts,
          inlineImagePrepared: Boolean(inlineImageDataUrl),
          inlineImageError,
          message: 'Vision test timed out',
        };
      }
      return {
        ok: false,
        provider: 'deepseek',
        requestId,
        model,
        requestedModel,
        imageUrl,
        endpoint,
        statusCode: 500,
        durationMs,
        attempts,
        inlineImagePrepared: Boolean(inlineImageDataUrl),
        inlineImageError,
        message: (error as Error).message || 'Vision test failed',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async testQwenVisionAccess(context: {
    model?: string;
    imageUrl?: string;
  }) {
    const apiKey = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Qwen sandbox is not configured');
    }

    const endpoint = this.resolveQwenChatEndpoint();
    const timeoutMs = Number(process.env.QWEN_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const requestedModel = (context.model || process.env.QWEN_VISION_MODEL || 'qwen-vl-plus-latest').trim();
    const model = requestedModel;
    const imageUrl =
      (context.imageUrl || process.env.QWEN_VISION_TEST_IMAGE_URL || 'https://picsum.photos/id/1062/1200/800')
        .trim();

    if (!/^https?:\/\//i.test(imageUrl)) {
      throw new BadRequestException('imageUrl must be an absolute http/https URL');
    }

    const requestId = `qwen_vl_${Date.now().toString(36)}`;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const promptText = `What's in this image? Describe it briefly for renovation triage.`;
    const maxInlineImageBytes = Number(process.env.QWEN_VISION_MAX_INLINE_IMAGE_BYTES || '3145728');

    let inlineImageDataUrl: string | null = null;
    let inlineImageError: string | null = null;
    try {
      const imageRes = await fetch(imageUrl, { signal: controller.signal });
      if (!imageRes.ok) {
        inlineImageError = `image fetch failed (${imageRes.status})`;
      } else {
        const contentType = (imageRes.headers.get('content-type') || 'image/png').split(';')[0].trim();
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
        if (imageBuffer.byteLength > maxInlineImageBytes) {
          inlineImageError = `image too large for inline (${imageBuffer.byteLength} bytes)`;
        } else {
          inlineImageDataUrl = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
        }
      }
    } catch (error) {
      inlineImageError = (error as Error).message || 'image fetch failed';
    }

    const candidates: Array<{
      label: string;
      body: Record<string, unknown>;
    }> = [
      {
        label: 'qwen_openai_content_parts_image_url',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
      },
    ];

    if (inlineImageDataUrl) {
      candidates.push({
        label: 'qwen_openai_content_parts_data_url',
        body: {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: {
                    url: inlineImageDataUrl,
                  },
                },
              ],
            },
          ],
          max_tokens: 200,
          temperature: 0.2,
        },
      });
    }

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
            provider: 'qwen',
            requestId,
            model,
            requestedModel,
            imageUrl,
            endpoint,
            statusCode: response.status,
            durationMs,
            formatUsed: candidate.label,
            attempts,
            inlineImagePrepared: Boolean(inlineImageDataUrl),
            inlineImageError,
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
        provider: 'qwen',
        requestId,
        model,
        requestedModel,
        imageUrl,
        endpoint,
        statusCode: lastAttempt?.statusCode ?? 400,
        durationMs,
        formatUsed: null,
        attempts,
        inlineImagePrepared: Boolean(inlineImageDataUrl),
        inlineImageError,
        providerError: lastAttempt?.providerError ?? 'Vision model call failed',
        message: 'Vision model call failed',
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if ((error as Error).name === 'AbortError') {
        return {
          ok: false,
          provider: 'qwen',
          requestId,
          model,
          requestedModel,
          imageUrl,
          endpoint,
          statusCode: 408,
          durationMs,
          attempts,
          inlineImagePrepared: Boolean(inlineImageDataUrl),
          inlineImageError,
          message: 'Vision test timed out',
        };
      }
      return {
        ok: false,
        provider: 'qwen',
        requestId,
        model,
        requestedModel,
        imageUrl,
        endpoint,
        statusCode: 500,
        durationMs,
        attempts,
        inlineImagePrepared: Boolean(inlineImageDataUrl),
        inlineImageError,
        message: (error as Error).message || 'Vision test failed',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private getHongKongDayWindow(nowMs = Date.now()) {
    const hkOffsetMs = 8 * 60 * 60 * 1000;
    const hkNow = new Date(nowMs + hkOffsetMs);
    const year = hkNow.getUTCFullYear();
    const month = hkNow.getUTCMonth();
    const date = hkNow.getUTCDate();
    const startUtcMs = Date.UTC(year, month, date) - hkOffsetMs;
    const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

    return {
      start: new Date(startUtcMs),
      end: new Date(endUtcMs),
      resetAt: new Date(endUtcMs).toISOString(),
    };
  }

  private getVisionLimits(context?: { userId?: string; userRole?: string }) {
    const isClient = Boolean(context?.userId) && (context?.userRole || '').toLowerCase() === 'client';
    return {
      actor: isClient ? 'client' : 'visitor',
      maxImagesPerPrompt: isClient ? 3 : 1,
      maxImagesPerDay: isClient ? 9 : 3,
    };
  }

  private extractVisionUsage(intake: {
    project?: unknown;
  }) {
    const project = intake.project && typeof intake.project === 'object' && !Array.isArray(intake.project)
      ? (intake.project as Record<string, unknown>)
      : null;
    const visionUsage = project?.visionUsage && typeof project.visionUsage === 'object' && !Array.isArray(project.visionUsage)
      ? (project.visionUsage as Record<string, unknown>)
      : null;

    return {
      provider: typeof visionUsage?.provider === 'string' ? visionUsage.provider : null,
      status: typeof visionUsage?.status === 'string' ? visionUsage.status : null,
      processedImageCount: typeof visionUsage?.processedImageCount === 'number' ? visionUsage.processedImageCount : 0,
      durationMs: typeof visionUsage?.durationMs === 'number' ? visionUsage.durationMs : null,
      model: typeof visionUsage?.model === 'string' ? visionUsage.model : null,
    };
  }

  async getVisionQuota(context?: { userId?: string; userRole?: string; sessionId?: string }) {
    const sessionId = this.sanitizeSessionId(context?.sessionId);
    const limits = this.getVisionLimits(context);
    const dayWindow = this.getHongKongDayWindow();

    const whereBase = {
      createdAt: {
        gte: dayWindow.start,
        lt: dayWindow.end,
      },
    };

    const intakeRows = await this.prisma.aiIntake.findMany({
      where: {
        ...whereBase,
        ...(limits.actor === 'client'
          ? { userId: context?.userId ?? '__no_user__' }
          : { sessionId: sessionId ?? '__no_session__' }),
      },
      select: {
        project: true,
      },
    });

    const usedToday = intakeRows.reduce((sum, row) => {
      const usage = this.extractVisionUsage(row);
      if (usage.status !== 'success') return sum;
      return sum + Math.max(0, usage.processedImageCount);
    }, 0);

    const remainingToday = Math.max(0, limits.maxImagesPerDay - usedToday);

    return {
      actor: limits.actor,
      maxImagesPerPrompt: limits.maxImagesPerPrompt,
      maxImagesPerDay: limits.maxImagesPerDay,
      usedToday,
      remainingToday,
      resetAt: dayWindow.resetAt,
      canUseVision: remainingToday > 0,
    };
  }

  private async analyzeImagesWithQwen(imageUrls: string[], userPrompt: string) {
    const apiKey = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Qwen sandbox is not configured');
    }

    const endpoint = this.resolveQwenChatEndpoint();
    const timeoutMs = Number(process.env.QWEN_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const model = (process.env.QWEN_VISION_MODEL || process.env.QWEN_MODEL || 'qwen-vl-plus-latest').trim();

    const requestId = `qwen_intake_${Date.now().toString(36)}`;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const contentParts: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          `Analyze these renovation-related photos and return strict JSON with this shape: ` +
          `{"imageSummary":string,"suggestedTrades":string[],"conditionFindings":string[],"safetyFlags":string[],"followUpQuestions":string[],"confidence":number}. ` +
          `Keep suggestedTrades concise and relevant to Hong Kong renovation context. User prompt: ${userPrompt}`,
      },
      ...imageUrls.map((url) => ({
        type: 'image_url',
        image_url: { url },
      })),
    ];

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: contentParts,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 600,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new ServiceUnavailableException(`Qwen image analysis failed (${response.status})`);
      }

      const payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      const rawContent =
        payload &&
        Array.isArray(payload.choices) &&
        payload.choices[0] &&
        typeof payload.choices[0] === 'object' &&
        (payload.choices[0] as Record<string, unknown>).message &&
        typeof (payload.choices[0] as Record<string, unknown>).message === 'object' &&
        typeof ((payload.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content === 'string'
          ? (((payload.choices[0] as Record<string, unknown>).message as Record<string, unknown>).content as string)
          : '';

      let parsed: Record<string, unknown> = {};
      try {
        parsed = rawContent ? (JSON.parse(rawContent) as Record<string, unknown>) : {};
      } catch {
        parsed = {
          imageSummary: rawContent.slice(0, 1200),
          suggestedTrades: [],
          conditionFindings: [],
          safetyFlags: [],
          followUpQuestions: [],
          confidence: 0.35,
        };
      }

      return {
        ok: true,
        provider: 'qwen' as const,
        requestId,
        model,
        durationMs: Date.now() - startedAt,
        usage: payload && typeof payload.usage === 'object' ? payload.usage : null,
        parsed,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async previewRequirements(prompt: string, context?: { sessionId?: string; userId?: string; userRole?: string; ipAddress?: string; intakeId?: string; imageUrls?: string[]; mode?: 'structured' | 'conversational' }) {
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

    const sessionId = this.sanitizeSessionId(context?.sessionId);
    const normalizedImageUrls = Array.isArray(context?.imageUrls)
      ? context!.imageUrls
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => /^https?:\/\//i.test(url))
      : [];
    const requestedImageCount = normalizedImageUrls.length;
    const quota = await this.getVisionQuota({
      userId: context?.userId,
      userRole: context?.userRole,
      sessionId,
    });
    if (requestedImageCount > quota.maxImagesPerPrompt) {
      throw new BadRequestException(
        `Image limit per prompt exceeded. Max ${quota.maxImagesPerPrompt} image${quota.maxImagesPerPrompt > 1 ? 's' : ''}.`,
      );
    }
    if (requestedImageCount > quota.remainingToday) {
      throw new BadRequestException(
        `Daily image analysis quota reached. ${quota.remainingToday} image${quota.remainingToday === 1 ? '' : 's'} remaining today.`,
      );
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

    const shouldResetMemory = this.isMemoryResetPrompt(trimmedPrompt);
    const activeThread = shouldResetMemory ? null : await this.findActiveAiThread(context);
    const threadSummary = activeThread ? this.buildAiThreadContextSummary(activeThread) : null;
    const threadOrigin = activeThread ? await this.resolveThreadOriginIntake(activeThread) : null;
    const threadOriginSummary = threadOrigin ? this.buildAiThreadContextSummary(threadOrigin) : null;
    const askedQuestions = await this.collectThreadAskedQuestions(activeThread as { id: string; project?: unknown } | null);

    const summarizedOriginPrompt = this.truncateForPrompt(threadOriginSummary?.priorPrompt || threadSummary?.priorPrompt, 500);
    const summarizedPriorPrompt = this.truncateForPrompt(threadSummary?.priorPrompt, 450);
    const summarizedPriorTitle = this.truncateForPrompt(threadSummary?.title, 120) || 'unknown';
    const summarizedPriorSummary = this.truncateForPrompt(threadSummary?.summary, 260) || 'unknown';
    const summarizedPriorLocation = this.truncateForPrompt(threadSummary?.location, 120) || 'unknown';
    const summarizedPriorBudget = this.truncateForPrompt(threadSummary?.budget, 80) || 'unknown';
    const summarizedPriorTimeline = this.truncateForPrompt(threadSummary?.timeline, 80) || 'unknown';
    const summarizedPriorReply = this.truncateForPrompt(threadSummary?.conversationalText, 220) || 'unknown';
    const askedQuestionsSummary = askedQuestions
      .slice(0, 6)
      .map((question) => this.truncateForPrompt(question, 120))
      .filter((question) => question.length > 0)
      .join(' | ');

    const userMessage = threadSummary
      ? `THREAD_MODE: This is a follow-up refinement within the same Mimo intake thread. Treat the new user message as an addition, clarification, or correction to the earlier request, not as a brand new unrelated request. Keep prior confirmed details unless the latest message clearly changes them.\n\nORIGINAL_THREAD_OBJECTIVE:\n${summarizedOriginPrompt || 'unknown'}\n\nEARLIER_USER_PROMPT:\n${summarizedPriorPrompt || 'unknown'}\n\nEARLIER_EXTRACTED_CONTEXT:\n- Title: ${summarizedPriorTitle}\n- Summary: ${summarizedPriorSummary}\n- Trades: ${threadSummary.trades.length > 0 ? threadSummary.trades.slice(0, 6).join(', ') : 'unknown'}\n- Location: ${summarizedPriorLocation}\n- Budget: ${summarizedPriorBudget}\n- Timeline: ${summarizedPriorTimeline}\n- Prior assistant reply: ${summarizedPriorReply}\n- Already asked questions: ${askedQuestionsSummary || 'none'}\n\nLATEST_USER_UPDATE:\n${trimmedPrompt}\n\nContext:\n- Market: Hong Kong\n- Use only allowed trades from the provided list\n- Normalize output for platform matching and triage\n- Merge the latest update into the earlier request\n- Keep focus on the ORIGINAL_THREAD_OBJECTIVE unless the latest user update explicitly replaces it\n- Ask only one best next question and do not repeat previously asked topics`
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
      let visionUsageMeta: Record<string, unknown> = {
        requestedImageCount,
        processedImageCount: 0,
        provider: null,
        model: null,
        status: requestedImageCount > 0 ? 'skipped' : 'not_requested',
        durationMs: null,
        error: null,
      };
      let imageInsightsRecord: {
        summary: string | null;
        conditionFindings: string[];
        safetyFlags: string[];
        followUpQuestions: string[];
        confidence: number | null;
        provider: string | null;
        model: string | null;
      } | null = null;

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

      if (requestedImageCount > 0) {
        try {
          const qwenVision = await this.analyzeImagesWithQwen(normalizedImageUrls, trimmedPrompt);
          const parsed = qwenVision.parsed;
          const suggestedTrades = Array.isArray(parsed.suggestedTrades)
            ? parsed.suggestedTrades.filter((trade): trade is string => typeof trade === 'string' && trade.trim().length > 0)
            : [];

          const conditionFindings = Array.isArray(parsed.conditionFindings)
            ? parsed.conditionFindings.filter((item): item is string => typeof item === 'string')
            : [];
          const safetyFlags = Array.isArray(parsed.safetyFlags)
            ? parsed.safetyFlags.filter((item): item is string => typeof item === 'string')
            : [];
          const followUpQuestions = Array.isArray(parsed.followUpQuestions)
            ? parsed.followUpQuestions.filter((item): item is string => typeof item === 'string')
            : [];

          if (parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
            const parsedObject = parsedOutput as Record<string, unknown>;
            const existingTrades = Array.isArray(parsedObject.trades)
              ? parsedObject.trades.filter((trade): trade is string => typeof trade === 'string' && trade.trim().length > 0)
              : [];
            parsedObject.trades = Array.from(new Set([...existingTrades, ...suggestedTrades]));

            const projectObject =
              parsedObject.project && typeof parsedObject.project === 'object' && !Array.isArray(parsedObject.project)
                ? (parsedObject.project as Record<string, unknown>)
                : {};

            projectObject.imageInsights = {
              summary: typeof parsed.imageSummary === 'string' ? parsed.imageSummary : null,
              conditionFindings,
              safetyFlags,
              followUpQuestions,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
              provider: 'qwen',
              model: qwenVision.model,
            };
            parsedObject.project = projectObject;
            parsedOutput = parsedObject;
          }

          imageInsightsRecord = {
            summary: typeof parsed.imageSummary === 'string' ? parsed.imageSummary : null,
            conditionFindings,
            safetyFlags,
            followUpQuestions,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
            provider: 'qwen',
            model: qwenVision.model,
          };

          visionUsageMeta = {
            requestedImageCount,
            processedImageCount: requestedImageCount,
            provider: 'qwen',
            model: qwenVision.model,
            status: 'success',
            durationMs: qwenVision.durationMs,
            error: null,
          };
        } catch (visionError) {
          this.logger.warn(
            `[${requestId}] Qwen image analysis failed; continuing text-only. ${(visionError as Error).message}`,
          );
          visionUsageMeta = {
            requestedImageCount,
            processedImageCount: 0,
            provider: 'qwen',
            model: process.env.QWEN_VISION_MODEL || process.env.QWEN_MODEL || 'qwen-vl-plus-latest',
            status: 'failed',
            durationMs: null,
            error: (visionError as Error).message || 'Qwen image analysis failed',
          };
        }
      }

      if (mode === 'conversational' && threadSummary && parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
        parsedOutput = this.enforceScopeContinuity({
          parsedObject: parsedOutput as Record<string, unknown>,
          prompt: trimmedPrompt,
          threadSummary: {
            title: threadSummary.title,
            summary: threadSummary.summary,
            priorPrompt: threadSummary.priorPrompt,
          },
          threadOriginSummary: threadOriginSummary
            ? { priorPrompt: threadOriginSummary.priorPrompt }
            : null,
          requestId,
        });
      }

      if (parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
        const parsedObject = parsedOutput as Record<string, unknown>;
        const proposedQuestions = this.filterRepeatedQuestions(
          [
            ...this.toStringArray(parsedObject.nextQuestions),
            ...this.toStringArray(parsedObject.followUpQuestions),
          ],
          askedQuestions,
        ).slice(0, 1);

        parsedObject.nextQuestions = proposedQuestions;
        parsedObject.followUpQuestions = proposedQuestions;
        parsedOutput = parsedObject;
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
      const userId = context?.userId;
      const projectData: Prisma.InputJsonObject = {
        ...(projectObj && typeof projectObj === 'object' ? (projectObj as Prisma.InputJsonObject) : {}),
        visionUsage: visionUsageMeta as Prisma.InputJsonValue,
        aiProviders: (requestedImageCount > 0
          ? ['deepseek', 'qwen']
          : ['deepseek']) as Prisma.InputJsonValue,
        ...(activeThread
          ? {
              aiThread: {
                sourceIntakeId: activeThread.id,
                windowExpiresAt: new Date(activeThread.createdAt.getTime() + this.aiThreadWindowMs).toISOString(),
              } as Prisma.InputJsonValue,
            }
          : {}),
      };

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
            project: projectData,
            status: 'draft',
          },
        });
        intakeId = intake.id;
        this.logger.log(`[${requestId}] Intake saved id=${intakeId}`);

        if (requestedImageCount > 0) {
          await this.persistAiIntakeImageInsights({
            intakeId,
            imageUrls: normalizedImageUrls,
            requestId,
            visionUsage: visionUsageMeta,
            imageInsights: imageInsightsRecord,
          });
        }
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
        vision: {
          requestedImageCount,
          quota,
          usage: visionUsageMeta,
        },
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

  async previewConversationalRequirements(prompt: string, context?: { sessionId?: string; userId?: string; userRole?: string; ipAddress?: string; intakeId?: string; imageUrls?: string[] }) {
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
      nextQuestions: this.filterRepeatedQuestions(
        this.toStringArray((parsedObject as Record<string, unknown> | null)?.nextQuestions),
        [],
      ).slice(0, 1),
      followUpQuestions: this.filterRepeatedQuestions(
        this.toStringArray((parsedObject as Record<string, unknown> | null)?.followUpQuestions),
        [],
      ).slice(0, 1),
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

  async saveTradeFeedback(
    intakeId: string,
    context?: {
      userId?: string;
      sessionId?: string;
      selectedTrades?: string[];
      removedTrades?: string[];
    },
  ) {
    const intake = await this.prisma.aiIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new NotFoundException('AI intake not found');

    const userId = context?.userId;
    const sessionId = this.sanitizeSessionId(context?.sessionId);

    if (intake.userId) {
      if (!userId || intake.userId !== userId) {
        throw new NotFoundException('AI intake not found');
      }
    } else if (intake.sessionId) {
      if (!sessionId || intake.sessionId !== sessionId) {
        throw new NotFoundException('AI intake not found');
      }
    }

    const normalizeTrades = (value?: string[]) =>
      Array.isArray(value)
        ? Array.from(
            new Set(
              value
                .map((trade) => (typeof trade === 'string' ? trade.trim() : ''))
                .filter((trade) => trade.length > 0),
            ),
          )
        : [];

    const selectedTrades = normalizeTrades(context?.selectedTrades);
    const removedTrades = normalizeTrades(context?.removedTrades);
    const projectJson =
      intake.project && typeof intake.project === 'object' && !Array.isArray(intake.project)
        ? ({ ...(intake.project as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    await this.prisma.aiIntake.update({
      where: { id: intakeId },
      data: {
        ...(selectedTrades.length > 0 ? { trades: selectedTrades } : {}),
        project: {
          ...projectJson,
          tradeSelection: {
            selectedTrades,
            removedTrades,
            updatedAt: new Date().toISOString(),
            updatedBy: userId ? 'user' : 'visitor',
          },
        },
      },
      select: { id: true },
    });

    return { ok: true };
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

    await this.activityLogService.record({
      actorName: context.adminName || 'Admin',
      actorType: 'admin',
      userId: context.adminUserId,
      action: 'ai_safety_acknowledged',
      resource: 'AiIntake',
      resourceId: intakeId,
      projectId: intake.projectId,
      details: 'AI safety triage acknowledged by admin',
      metadata: {
        intakeId,
        riskLevel: safetyAssessment.riskLevel,
        concerns: safetyAssessment.concerns,
      },
      status: 'warning',
    }).catch((error) => {
      this.logger.warn(
        `[acknowledgeSafetyTriage] Failed to write activity log: ${(error as Error).message}`,
      );
    });

    return updated;
  }

  private toScopeContainer(projectJson: Record<string, unknown>): ScopeContainer {
    const candidate =
      projectJson.aiScope && typeof projectJson.aiScope === 'object' && !Array.isArray(projectJson.aiScope)
        ? (projectJson.aiScope as Record<string, unknown>)
        : null;

    const versionsRaw = Array.isArray(candidate?.versions) ? candidate?.versions : [];
    const versions = versionsRaw
      .filter((version): version is ScopeVersion => typeof version === 'object' && version !== null)
      .map((version) => version as ScopeVersion);

    // Back-compat: versions with no status are treated as published
    const migratedVersions = versions.map((v) => ({
      ...v,
      status: (v.status ?? 'published') as ScopeStatus,
      scopeAuditLog: Array.isArray(v.scopeAuditLog) ? v.scopeAuditLog : [],
    }));

    const currentVersionId =
      typeof candidate?.currentVersionId === 'string' && candidate.currentVersionId.trim().length > 0
        ? candidate.currentVersionId
        : migratedVersions.length > 0
          ? migratedVersions[migratedVersions.length - 1].id
          : null;

    const publishedVersionId =
      typeof candidate?.publishedVersionId === 'string' && candidate.publishedVersionId.trim().length > 0
        ? candidate.publishedVersionId
        : (migratedVersions.slice().reverse().find((v) => v.status === 'published')?.id ?? null);

    return {
      currentVersionId,
      publishedVersionId,
      versions: migratedVersions,
    };
  }

  private async resolveProjectScopeContext(projectId: string, actor: ProjectActor) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        clientId: true,
        projectName: true,
        region: true,
        notes: true,
        tradesRequired: true,
        aiIntake: {
          select: {
            id: true,
            summary: true,
            scope: true,
            locationPrimary: true,
            trades: true,
            project: true,
          },
        },
        professionals: {
          select: {
            professionalId: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (actor.role === 'client') {
      const isOwner = project.userId === actor.actorId || project.clientId === actor.actorId;
      if (!isOwner) {
        throw new NotFoundException('Project not found');
      }
    }

    if (actor.role === 'professional') {
      const hasAccess = project.professionals.some((pp) => pp.professionalId === actor.actorId);
      if (!hasAccess) {
        throw new NotFoundException('Project not found');
      }
    }

    let intake = project.aiIntake;
    if (!intake) {
      const requestId = `scope_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      intake = await this.prisma.aiIntake.create({
        data: {
          requestId,
          rawPrompt: `AI scope workspace for project ${project.id}`,
          userId: actor.role === 'client' ? actor.actorId : null,
          trades: Array.isArray(project.tradesRequired) ? project.tradesRequired : [],
          locationPrimary: project.region || null,
          projectId: project.id,
          status: 'draft',
          project: {},
        },
        select: {
          id: true,
          summary: true,
          scope: true,
          locationPrimary: true,
          trades: true,
          project: true,
        },
      });
    }

    const projectJson =
      intake.project && typeof intake.project === 'object' && !Array.isArray(intake.project)
        ? ({ ...(intake.project as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const container = this.toScopeContainer(projectJson);

    return {
      project,
      intake,
      projectJson,
      container,
    };
  }

  private normalizeScopeEntry(entry: Partial<ScopeEntry>, sequence: number): ScopeEntry {
    const min = Number(entry.durationMinDays ?? 1);
    const max = Number(entry.durationMaxDays ?? min);
    const durationMinDays = Number.isFinite(min) && min > 0 ? Number(min.toFixed(1)) : 1;
    const durationMaxDays = Number.isFinite(max) && max >= durationMinDays
      ? Number(max.toFixed(1))
      : Number(durationMinDays.toFixed(1));

    return {
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `S${sequence}`,
      sequence,
      workPackage: typeof entry.workPackage === 'string' ? entry.workPackage.trim() : '',
      deliverable: typeof entry.deliverable === 'string' ? entry.deliverable.trim() : '',
      primaryTrade: typeof entry.primaryTrade === 'string' ? entry.primaryTrade.trim() : 'General',
      durationMinDays,
      durationMaxDays,
      dependencies: Array.isArray(entry.dependencies)
        ? entry.dependencies.filter((dep): dep is string => typeof dep === 'string' && dep.trim().length > 0)
        : [],
      phase: typeof entry.phase === 'string' && entry.phase.trim() ? entry.phase.trim() : 'Execution',
      milestoneCode: typeof entry.milestoneCode === 'string' && entry.milestoneCode.trim().length > 0
        ? entry.milestoneCode.trim()
        : null,
      notes: typeof entry.notes === 'string' ? entry.notes.trim() : '',
    };
  }

  private async callDeepSeekForScope(prompt: string) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('DeepSeek sandbox is not configured');
    }

    const endpoint = this.resolveDeepSeekChatEndpoint();
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '60000');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const systemPrompt = `You are a senior renovation project manager in Hong Kong.
  Create a pragmatic Scope of Works and Programme of Works at work-package level.
  Do not output micro-task procedural steps.
  Return JSON only — no markdown, no commentary outside the JSON object.

  DURATION CALIBRATION RULES (apply strictly to every work package):

  By project scale — infer from trade count and scope description:
  • Single-trade reactive (1 trade, targeted repair/fix): 0.5–2 days per work package; justify anything over 3 days in notes.
  • Light multi-trade (2–3 trades, partial refurbishment): 1–5 days per package; mobilisation 0.5 day.
  • Full renovation (4+ trades, whole flat/floor): 5–30 days; structural/wet works at longer end; finishing at shorter end.
  • Commercial fit-out (shopfront, F&B, office): add permit/compliance lead 5–15 days; M&E coordination buffer 3–10 days.

  By primary trade:
  • Civil/Structural (hacking, concrete, waterproofing): 2–10 days based on area.
  • Wet works (plumbing, drainage, sanitary): 1–5 days; pressure/DFU test 1 day.
  • Dry works (plastering, tiling, screed): 3–15 days; note drying time requirements.
  • M&E Electrical (first-fix, second-fix): 1–3 days per phase; 2–5 days for full rewire.
  • Carpentry/Joinery (built-ins, doors, cabinetry): 3–10 days; note 5–15 day supply lead for bespoke items.
  • Painting (internal full coverage): 2–5 days; each coat 0.5 day cure.
  • Fixture Installation (sanitary ware, hardware, fittings): 0.5–2 days per item type.
  • Glazing/Windows: 0.5–3 days install; flag 7–14 day supply lead in notes.
  • Inspection/Snagging: 0.5–1 day.
  • General/Miscellaneous: default 1 day unless scope states otherwise.

  Mandatory formatting rules:
  1. durationMinDays must always be ≤ durationMaxDays.
  2. Round all durations to nearest 0.5.
  3. Add an explanatory note in the notes field for any durationMaxDays ≥ 5.
  4. criticalPath must list work package IDs forming the longest dependency chain.`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.15,
          response_format: { type: 'json_object' },
          max_tokens: 2200,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new ServiceUnavailableException(`DeepSeek request failed (${response.status})`);
      }

      const payload = rawText ? (JSON.parse(rawText) as DeepSeekChatResponse) : null;
      const content = payload?.choices?.[0]?.message?.content?.trim() || '';
      if (!content) {
        throw new ServiceUnavailableException('DeepSeek returned empty scope output');
      }

      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new ServiceUnavailableException('DeepSeek scope generation timed out');
      }
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException((error as Error).message || 'DeepSeek scope generation failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async saveScopeContainer(intakeId: string, projectJson: Record<string, unknown>, container: ScopeContainer) {
    await this.prisma.aiIntake.update({
      where: { id: intakeId },
      data: {
        project: {
          ...projectJson,
          aiScope: container,
        },
      },
      select: { id: true },
    });
  }

  async getProjectScope(projectId: string, actor: ProjectActor) {
    const context = await this.resolveProjectScopeContext(projectId, actor);

    // Non-admins only see the latest published version
    if (actor.role !== 'admin') {
      const publishedVersion =
        context.container.versions.find((v) => v.id === context.container.publishedVersionId) ||
        context.container.versions.slice().reverse().find((v) => v.status === 'published') ||
        null;
      return {
        scope: publishedVersion,
        versionCount: context.container.versions.filter((v) => v.status === 'published').length,
        canRegenerate: false,
        canAdminCrud: false,
        workflowStatus: publishedVersion?.status ?? null,
      };
    }

    const currentVersion = context.container.versions.find((v) => v.id === context.container.currentVersionId) || null;
    const publishedVersion = context.container.versions.find((v) => v.id === context.container.publishedVersionId) || null;

    return {
      scope: currentVersion,
      publishedScope: publishedVersion,
      versionCount: context.container.versions.length,
      canRegenerate: true,
      canAdminCrud: true,
      workflowStatus: currentVersion?.status ?? null,
    };
  }

  async generateProjectScope(
    projectId: string,
    actor: ProjectActor,
    input: {
      additionalContext?: string;
      siteConstraints?: string;
      longLeadItems?: string;
      workingCalendar?: string;
      deadline?: string;
    },
  ) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const nextVersion = context.container.versions.length + 1;

    const prompt = `Project:
- Name: ${context.project.projectName || 'Unnamed project'}
- Location: ${context.project.region || context.intake.locationPrimary || 'Hong Kong'}
- Existing summary: ${context.intake.summary || context.intake.scope || context.project.notes || 'Not provided'}
- Trades: ${(context.intake.trades && context.intake.trades.length > 0 ? context.intake.trades : context.project.tradesRequired || []).join(', ') || 'To be determined'}

Additional inputs:
- Site constraints: ${input.siteConstraints || 'Not provided'}
- Long lead items: ${input.longLeadItems || 'Not provided'}
- Working calendar: ${input.workingCalendar || '6-day week unless stated'}
- Deadline: ${input.deadline || 'Not provided'}
- Extra context: ${input.additionalContext || 'Not provided'}

Return JSON with keys:
projectSummary, scopeOfWorks, milestones, programme, confidence.
scopeOfWorks[] items must include:
id, workPackage, deliverable, primaryTrade, durationMinDays, durationMaxDays, dependencies, phase, milestoneCode, notes.
programme must include: startDay, finishDay, criticalPath, timelineByPhase[].`;

    const output = await this.callDeepSeekForScope(prompt);

    const outputSummary =
      output.projectSummary && typeof output.projectSummary === 'object' && !Array.isArray(output.projectSummary)
        ? (output.projectSummary as Record<string, unknown>)
        : {};

    const outputWorks = Array.isArray(output.scopeOfWorks) ? output.scopeOfWorks : [];

    const entries = outputWorks.map((item, index) => {
      const row = item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
      return this.normalizeScopeEntry(
        {
          id: typeof row.id === 'string' ? row.id : `S${index + 1}`,
          workPackage: typeof row.workPackage === 'string' ? row.workPackage : '',
          deliverable: typeof row.deliverable === 'string' ? row.deliverable : '',
          primaryTrade: typeof row.primaryTrade === 'string' ? row.primaryTrade : 'General',
          durationMinDays: typeof row.durationMinDays === 'number' ? row.durationMinDays : 1,
          durationMaxDays: typeof row.durationMaxDays === 'number' ? row.durationMaxDays : (typeof row.durationMinDays === 'number' ? row.durationMinDays : 1),
          dependencies: Array.isArray(row.dependencies) ? row.dependencies.filter((dep): dep is string => typeof dep === 'string') : [],
          phase: typeof row.phase === 'string' ? row.phase : 'Execution',
          milestoneCode: typeof row.milestoneCode === 'string' ? row.milestoneCode : null,
          notes: typeof row.notes === 'string' ? row.notes : '',
        },
        index + 1,
      );
    }).filter((entry) => entry.workPackage.length > 0);

    const milestonesRaw = Array.isArray(output.milestones) ? output.milestones : [];
    const milestones = milestonesRaw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
      .map((item) => ({
        code: typeof item.code === 'string' ? item.code : '',
        name: typeof item.name === 'string' ? item.name : '',
        targetDay: typeof item.targetDay === 'number' ? item.targetDay : 0,
        acceptanceCriteria: typeof item.acceptanceCriteria === 'string' ? item.acceptanceCriteria : '',
      }))
      .filter((item) => item.code.length > 0 && item.name.length > 0);

    const programmeRaw =
      output.programme && typeof output.programme === 'object' && !Array.isArray(output.programme)
        ? (output.programme as Record<string, unknown>)
        : {};

    const timelineByPhaseRaw = Array.isArray(programmeRaw.timelineByPhase) ? programmeRaw.timelineByPhase : [];

    const programme: ScopeVersion['programme'] = {
      startDay: typeof programmeRaw.startDay === 'number' ? programmeRaw.startDay : 1,
      finishDay: typeof programmeRaw.finishDay === 'number' ? programmeRaw.finishDay : 1,
      criticalPath: Array.isArray(programmeRaw.criticalPath)
        ? programmeRaw.criticalPath.filter((item): item is string => typeof item === 'string')
        : [],
      timelineByPhase: timelineByPhaseRaw
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
        .map((item) => ({
          phase: typeof item.phase === 'string' ? item.phase : 'Execution',
          dayRange: typeof item.dayRange === 'string' ? item.dayRange : '',
          includedEntryIds: Array.isArray(item.includedEntryIds)
            ? item.includedEntryIds.filter((id): id is string => typeof id === 'string')
            : [],
        })),
    };

    const confidenceRaw =
      output.confidence && typeof output.confidence === 'object' && !Array.isArray(output.confidence)
        ? (output.confidence as Record<string, unknown>)
        : {};

    const confidenceLevelRaw = typeof confidenceRaw.level === 'string' ? confidenceRaw.level.toLowerCase() : 'medium';
    const confidence: ScopeVersion['confidence'] = {
      level: confidenceLevelRaw === 'low' || confidenceLevelRaw === 'high' ? confidenceLevelRaw : 'medium',
      notes: typeof confidenceRaw.notes === 'string' ? confidenceRaw.notes : '',
    };

    const versionId = `scope_v${nextVersion}_${Date.now().toString(36)}`;
    const scopeVersion: ScopeVersion = {
      id: versionId,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      status: 'draft',
      scopeAuditLog: [],
      createdByRole: actor.role,
      promptInputs: {
        additionalContext: input.additionalContext?.trim() || undefined,
        siteConstraints: input.siteConstraints?.trim() || undefined,
        longLeadItems: input.longLeadItems?.trim() || undefined,
        workingCalendar: input.workingCalendar?.trim() || undefined,
        deadline: input.deadline?.trim() || undefined,
      },
      projectSummary: {
        projectType: typeof outputSummary.projectType === 'string' ? outputSummary.projectType : 'renovation',
        location: typeof outputSummary.location === 'string'
          ? outputSummary.location
          : context.project.region || context.intake.locationPrimary || 'Hong Kong',
        assumptions: Array.isArray(outputSummary.assumptions)
          ? outputSummary.assumptions.filter((item): item is string => typeof item === 'string')
          : [],
        constraints: Array.isArray(outputSummary.constraints)
          ? outputSummary.constraints.filter((item): item is string => typeof item === 'string')
          : [],
      },
      entries,
      milestones,
      programme,
      confidence,
    };

    const container: ScopeContainer = {
      currentVersionId: scopeVersion.id,
      publishedVersionId: context.container.publishedVersionId,
      versions: [...context.container.versions, scopeVersion],
    };

    await this.saveScopeContainer(context.intake.id, context.projectJson, container);

    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_generated',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'AI project scope generated',
      metadata: { versionId: scopeVersion.id, version: scopeVersion.version },
      status: 'info',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);

    return {
      scope: scopeVersion,
      versionCount: container.versions.length,
      canRegenerate: true,
      canAdminCrud: actor.role === 'admin',
      workflowStatus: 'draft',
    };
  }

  async createProjectScopeEntry(
    projectId: string,
    actor: ProjectActor,
    input: {
      workPackage?: string;
      deliverable?: string;
      primaryTrade?: string;
      durationMinDays?: number;
      durationMaxDays?: number;
      dependencies?: string[];
      phase?: string;
      milestoneCode?: string | null;
      notes?: string;
    },
  ) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const currentVersion = context.container.versions.find((version) => version.id === context.container.currentVersionId);
    if (!currentVersion) {
      throw new BadRequestException('No AI scope exists yet. Generate scope first.');
    }

    const sequence = currentVersion.entries.length + 1;
    const entry = this.normalizeScopeEntry(
      {
        id: `S${sequence}`,
        workPackage: input.workPackage || '',
        deliverable: input.deliverable || '',
        primaryTrade: input.primaryTrade || 'General',
        durationMinDays: input.durationMinDays ?? 1,
        durationMaxDays: input.durationMaxDays ?? input.durationMinDays ?? 1,
        dependencies: input.dependencies || [],
        phase: input.phase || 'Execution',
        milestoneCode: input.milestoneCode ?? null,
        notes: input.notes || '',
      },
      sequence,
    );

    if (!entry.workPackage) {
      throw new BadRequestException('workPackage is required');
    }

    const updatedVersion: ScopeVersion = {
      ...currentVersion,
      entries: [...currentVersion.entries, entry],
    };

    const versions = context.container.versions.map((version) => (version.id === updatedVersion.id ? updatedVersion : version));
    const container: ScopeContainer = {
      ...context.container,
      versions,
    };

    await this.saveScopeContainer(context.intake.id, context.projectJson, container);

    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_entry_created',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope entry created',
      metadata: { entryId: entry.id, workPackage: entry.workPackage },
      status: 'info',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);

    return { scope: updatedVersion };
  }

  async updateProjectScopeEntry(
    projectId: string,
    entryId: string,
    actor: ProjectActor,
    input: {
      workPackage?: string;
      deliverable?: string;
      primaryTrade?: string;
      durationMinDays?: number;
      durationMaxDays?: number;
      dependencies?: string[];
      phase?: string;
      milestoneCode?: string | null;
      notes?: string;
    },
  ) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const currentVersion = context.container.versions.find((version) => version.id === context.container.currentVersionId);
    if (!currentVersion) {
      throw new BadRequestException('No AI scope exists yet. Generate scope first.');
    }

    const index = currentVersion.entries.findIndex((entry) => entry.id === entryId);
    if (index === -1) {
      throw new NotFoundException('Scope entry not found');
    }

    const merged = {
      ...currentVersion.entries[index],
      ...input,
    };
    const normalized = this.normalizeScopeEntry(merged, currentVersion.entries[index].sequence);

    const updatedEntries = [...currentVersion.entries];
    updatedEntries[index] = normalized;

    const updatedVersion: ScopeVersion = {
      ...currentVersion,
      entries: updatedEntries,
    };

    const versions = context.container.versions.map((version) => (version.id === updatedVersion.id ? updatedVersion : version));
    const container: ScopeContainer = {
      ...context.container,
      versions,
    };

    await this.saveScopeContainer(context.intake.id, context.projectJson, container);

    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_entry_updated',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope entry updated',
      metadata: { entryId },
      status: 'info',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);

    return { scope: updatedVersion };
  }

  async deleteProjectScopeEntry(projectId: string, entryId: string, actor: ProjectActor) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const currentVersion = context.container.versions.find((version) => version.id === context.container.currentVersionId);
    if (!currentVersion) {
      throw new BadRequestException('No AI scope exists yet. Generate scope first.');
    }

    const remaining = currentVersion.entries.filter((entry) => entry.id !== entryId);
    if (remaining.length === currentVersion.entries.length) {
      throw new NotFoundException('Scope entry not found');
    }

    const resequenced = remaining.map((entry, index) => ({
      ...entry,
      sequence: index + 1,
    }));

    const updatedVersion: ScopeVersion = {
      ...currentVersion,
      entries: resequenced,
    };

    const versions = context.container.versions.map((version) => (version.id === updatedVersion.id ? updatedVersion : version));
    const container: ScopeContainer = {
      ...context.container,
      versions,
    };

    await this.saveScopeContainer(context.intake.id, context.projectJson, container);

    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_entry_deleted',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope entry deleted',
      metadata: { entryId },
      status: 'warning',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);

    return { scope: updatedVersion };
  }

  // ─── Approval workflow ──────────────────────────────────────────────────────

  private appendAuditEntry(
    version: ScopeVersion,
    fromStatus: ScopeStatus,
    toStatus: ScopeStatus,
    actor: ProjectActor,
    note?: string,
  ): ScopeVersion {
    const entry: ScopeAuditEntry = {
      fromStatus,
      toStatus,
      byActorId: actor.actorId,
      byRole: 'admin',
      at: new Date().toISOString(),
      note,
    };
    return {
      ...version,
      status: toStatus,
      scopeAuditLog: [...(version.scopeAuditLog ?? []), entry],
    };
  }

  async reviewProjectScope(projectId: string, actor: ProjectActor, note?: string) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const current = context.container.versions.find((v) => v.id === context.container.currentVersionId);
    if (!current) throw new BadRequestException('No scope draft to review.');
    if (current.status !== 'draft') throw new BadRequestException(`Cannot review a scope in status '${current.status}'. Expected 'draft'.`);

    const updated = this.appendAuditEntry(current, 'draft', 'pm_reviewed', actor, note);
    const versions = context.container.versions.map((v) => (v.id === updated.id ? updated : v));
    const container: ScopeContainer = { ...context.container, versions };
    await this.saveScopeContainer(context.intake.id, context.projectJson, container);
    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_reviewed',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope reviewed',
      metadata: { note: note ?? null, status: updated.status },
      status: 'info',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);
    return { scope: updated, workflowStatus: updated.status };
  }

  async publishProjectScope(projectId: string, actor: ProjectActor, note?: string) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const current = context.container.versions.find((v) => v.id === context.container.currentVersionId);
    if (!current) throw new BadRequestException('No scope to publish.');
    if (current.status !== 'pm_reviewed') throw new BadRequestException(`Cannot publish a scope in status '${current.status}'. Expected 'pm_reviewed'.`);

    const now = new Date().toISOString();
    const published: ScopeVersion = {
      ...this.appendAuditEntry(current, 'pm_reviewed', 'published', actor, note),
      publishedAt: now,
    };

    // Supersede previous published version
    const versions = context.container.versions.map((v) => {
      if (v.id === published.id) return published;
      if (v.status === 'published') return { ...v, status: 'superseded' as ScopeStatus };
      return v;
    });

    const container: ScopeContainer = {
      ...context.container,
      publishedVersionId: published.id,
      versions,
    };
    await this.saveScopeContainer(context.intake.id, context.projectJson, container);
    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_published',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope published',
      metadata: { note: note ?? null, versionId: published.id, status: published.status },
      status: 'success',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);
    return { scope: published, workflowStatus: published.status };
  }

  async reviseProjectScope(projectId: string, actor: ProjectActor, note?: string) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const publishedVersion = context.container.versions.find((v) => v.id === context.container.publishedVersionId)
      ?? context.container.versions.slice().reverse().find((v) => v.status === 'published');
    if (!publishedVersion) throw new BadRequestException('No published scope to revise.');

    const nextVersionNum = context.container.versions.length + 1;
    const revisionId = `scope_v${nextVersionNum}_${Date.now().toString(36)}`;
    const revision: ScopeVersion = {
      ...publishedVersion,
      id: revisionId,
      version: nextVersionNum,
      createdAt: new Date().toISOString(),
      status: 'draft',
      publishedAt: undefined,
      scopeAuditLog: [
        {
          fromStatus: 'published',
          toStatus: 'draft',
          byActorId: actor.actorId,
          byRole: 'admin',
          at: new Date().toISOString(),
          note: note ?? `Revision of v${publishedVersion.version}`,
        },
      ],
    };

    const container: ScopeContainer = {
      ...context.container,
      currentVersionId: revision.id,
      versions: [...context.container.versions, revision],
    };
    await this.saveScopeContainer(context.intake.id, context.projectJson, container);
    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_revised',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope revised into a new draft version',
      metadata: { note: note ?? null, versionId: revision.id, version: revision.version },
      status: 'info',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);
    return { scope: revision, workflowStatus: revision.status };
  }

  async reorderScopeEntries(projectId: string, actor: ProjectActor, orderedEntryIds: string[]) {
    const context = await this.resolveProjectScopeContext(projectId, actor);
    const current = context.container.versions.find((v) => v.id === context.container.currentVersionId);
    if (!current) throw new BadRequestException('No scope draft to reorder.');

    const entryMap = new Map(current.entries.map((e) => [e.id, e]));
    const known = orderedEntryIds.filter((id) => entryMap.has(id));
    const untouched = current.entries.filter((e) => !orderedEntryIds.includes(e.id));
    const reordered = [
      ...known.map((id, i) => ({ ...entryMap.get(id)!, sequence: i + 1 })),
      ...untouched.map((e, i) => ({ ...e, sequence: known.length + i + 1 })),
    ];

    const updated: ScopeVersion = { ...current, entries: reordered };
    const versions = context.container.versions.map((v) => (v.id === updated.id ? updated : v));
    const container: ScopeContainer = { ...context.container, versions };
    await this.saveScopeContainer(context.intake.id, context.projectJson, container);
    await this.activityLogService.record({
      actorType: actor.role,
      action: 'project_scope_reordered',
      resource: 'AiIntake',
      resourceId: context.intake.id,
      projectId,
      projectTitle: context.project.projectName,
      details: 'Project scope entries reordered',
      metadata: { entryCount: reordered.length },
      status: 'info',
      userId: actor.role === 'admin' || actor.role === 'client' ? actor.actorId : null,
      professionalId: actor.role === 'professional' ? actor.actorId : null,
    }).catch(() => undefined);
    return { scope: updated };
  }

  async getAiAdminMetrics() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.aiIntake.findMany({
      where: {
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        model: true,
        durationMs: true,
        project: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const providerStats: Record<string, {
      requests: number;
      success: number;
      failed: number;
      totalDurationMs: number;
      imageCount: number;
    }> = {
      deepseek: { requests: 0, success: 0, failed: 0, totalDurationMs: 0, imageCount: 0 },
      qwen: { requests: 0, success: 0, failed: 0, totalDurationMs: 0, imageCount: 0 },
    };

    const daily: Array<{ day: string; deepseek: number; qwen: number }> = [];
    const dayMap = new Map<string, { deepseek: number; qwen: number }>();

    rows.forEach((row) => {
      providerStats.deepseek.requests += 1;
      providerStats.deepseek.success += 1;
      providerStats.deepseek.totalDurationMs += row.durationMs ?? 0;

      const usage = this.extractVisionUsage({ project: row.project });
      if (usage.provider === 'qwen' && usage.processedImageCount > 0) {
        providerStats.qwen.requests += 1;
        providerStats.qwen.imageCount += usage.processedImageCount;
        providerStats.qwen.totalDurationMs += usage.durationMs ?? 0;
        if (usage.status === 'success') {
          providerStats.qwen.success += 1;
        } else if (usage.status === 'failed') {
          providerStats.qwen.failed += 1;
        }
      }

      const day = row.createdAt.toISOString().slice(0, 10);
      const current = dayMap.get(day) || { deepseek: 0, qwen: 0 };
      current.deepseek += 1;
      if (usage.provider === 'qwen' && usage.processedImageCount > 0 && usage.status === 'success') {
        current.qwen += 1;
      }
      dayMap.set(day, current);
    });

    dayMap.forEach((value, day) => {
      daily.push({ day, deepseek: value.deepseek, qwen: value.qwen });
    });

    daily.sort((a, b) => a.day.localeCompare(b.day));

    const average = (total: number, count: number) => (count > 0 ? Math.round(total / count) : 0);

    return {
      window: {
        days: 7,
        since: since.toISOString(),
      },
      providers: {
        deepseek: {
          requests: providerStats.deepseek.requests,
          success: providerStats.deepseek.success,
          failed: providerStats.deepseek.failed,
          avgDurationMs: average(providerStats.deepseek.totalDurationMs, providerStats.deepseek.requests),
        },
        qwen: {
          requests: providerStats.qwen.requests,
          success: providerStats.qwen.success,
          failed: providerStats.qwen.failed,
          avgDurationMs: average(providerStats.qwen.totalDurationMs, providerStats.qwen.requests),
          imagesAnalyzed: providerStats.qwen.imageCount,
        },
      },
      daily,
    };
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
