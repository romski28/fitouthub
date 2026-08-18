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
import {
  AI_IMAGE_INSIGHTS_CONTRACT_VERSION,
  AI_INTAKE_TEXT_CONTRACT_VERSION,
  validateAiOutputContract,
  validateImageInsightsContract,
} from './ai-contract.validator';

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

type UnifiedPromptEnvelope = {
  schemaVersion: '1.0';
  requestId: string;
  mode: 'structured' | 'conversational';
  userPrompt: string;
  imageUrls: string[];
  imageCount: number;
  userMessage: string;
  messages: DeepSeekMessage[];
};

type MergedImageInsightsRecord = {
  schemaVersion: string;
  summary: string | null;
  conditionFindings: string[];
  safetyFlags: string[];
  followUpQuestions: string[];
  confidence: number | null;
  provider: string | null;
  model: string | null;
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

  private shouldEnforceAiContract(): boolean {
    const raw = (process.env.AI_CONTRACT_ENFORCE_STRICT || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private shouldUseUnifiedOrchestrator(): boolean {
    const raw = (process.env.AI_UNIFIED_ORCHESTRATOR_ENABLED || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
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
    return minSize > 0 && overlap / minSize >= 0.5;
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

  /** Collect the full user→AI conversation from the thread chain for context */
  private async collectThreadConversationHistory(activeThread?: { id: string; project?: unknown; rawPrompt?: string | null } | null): Promise<string> {
    if (!activeThread) return '';

    const visited = new Set<string>();
    const turns: Array<{ user: string; assistant: string }> = [];
    let cursor: { id: string; project?: unknown; rawPrompt?: string | null; rawOutput?: unknown } | null = activeThread;

    for (let depth = 0; depth < 10; depth += 1) {
      if (!cursor || visited.has(cursor.id)) break;
      visited.add(cursor.id);

      const userPrompt = typeof cursor.rawPrompt === 'string' ? cursor.rawPrompt.trim() : '';
      const rawOutput = cursor.rawOutput && typeof cursor.rawOutput === 'object' && !Array.isArray(cursor.rawOutput)
        ? (cursor.rawOutput as Record<string, unknown>)
        : null;
      const assistantText = typeof rawOutput?.conversationalText === 'string'
        ? rawOutput.conversationalText.trim().slice(0, 150)
        : '';

      if (userPrompt) {
        turns.unshift({ user: userPrompt, assistant: assistantText });
      }

      const sourceIntakeId = this.extractSourceIntakeIdFromProject(cursor.project);
      if (!sourceIntakeId) break;
      const parent = await this.prisma.aiIntake.findUnique({ where: { id: sourceIntakeId } });
      cursor = parent
        ? { id: parent.id, project: parent.project, rawPrompt: parent.rawPrompt, rawOutput: parent.rawOutput }
        : null;
    }

    if (turns.length <= 1) return ''; // No history beyond the current turn

    // Build a compact summary (exclude the latest turn — it's the LATEST_USER_UPDATE)
    const historyTurns = turns.slice(0, -1);
    return historyTurns
      .map((t, i) => `Turn ${i + 1}: User said "${this.truncateForPrompt(t.user, 200)}" → Mimo asked about "${this.truncateForPrompt(t.assistant, 100)}"`)
      .join('\n');
  }

  /** Collect raw conversation turns for scope compilation */
  private async collectThreadConversationTurns(activeThread: { id: string; project?: unknown; rawPrompt?: string | null }, latestPrompt: string): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
    const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [{ role: 'user', text: latestPrompt.trim() }];
    const visited = new Set<string>();
    let cursor: { id: string; project?: unknown; rawPrompt?: string | null; rawOutput?: unknown } | null = activeThread;
    for (let depth = 0; depth < 15; depth += 1) {
      if (!cursor || visited.has(cursor.id)) break;
      visited.add(cursor.id);
      const rawOutput = cursor.rawOutput && typeof cursor.rawOutput === 'object' && !Array.isArray(cursor.rawOutput)
        ? (cursor.rawOutput as Record<string, unknown>) : null;
      const convText = typeof rawOutput?.conversationalText === 'string' ? rawOutput.conversationalText.trim() : '';
      const userPrompt = cursor === activeThread ? null : (typeof cursor.rawPrompt === 'string' ? cursor.rawPrompt.trim() : '');
      if (convText) turns.unshift({ role: 'assistant', text: convText.slice(0, 500) });
      if (userPrompt) turns.unshift({ role: 'user', text: userPrompt.slice(0, 500) });
      const sourceIntakeId = this.extractSourceIntakeIdFromProject(cursor.project);
      if (!sourceIntakeId) break;
      const parent = await this.prisma.aiIntake.findUnique({ where: { id: sourceIntakeId } });
      cursor = parent ? { id: parent.id, project: parent.project, rawPrompt: parent.rawPrompt, rawOutput: parent.rawOutput } : null;
    }
    return turns;
  }

  /** Extract locked facts from the entire thread chain — prevents redundant questions */
  private async buildEstablishedFacts(activeThread?: { id: string; project?: unknown; rawPrompt?: string | null } | null): Promise<string> {
    if (!activeThread) return '';

    const visited = new Set<string>();
    const facts: { geographicLocation?: string; physicalLocation?: string; coreProblem?: string; exclusions: string[]; trades: string[] } = {
      exclusions: [],
      trades: [],
    };

    // Physical location keywords — rooms, fixtures, areas inside a property
    const physicalLocationKeywords = /\b(kitchen|bathroom|bedroom|living\s*room|toilet|shower|balcony|roof|ceiling|wall|floor|window|door|sink|basin|tap|pipe|drain|cabinet|counter|cupboard|under\s+\w+|behind\s+\w+|inside\s+\w+)\b/i;

    let cursor: { id: string; project?: unknown; rawPrompt?: string | null; rawOutput?: unknown } | null = activeThread;

    for (let depth = 0; depth < 10; depth += 1) {
      if (!cursor || visited.has(cursor.id)) break;
      visited.add(cursor.id);

      // Extract from parsed output
      const rawOutput = cursor.rawOutput && typeof cursor.rawOutput === 'object' && !Array.isArray(cursor.rawOutput)
        ? (cursor.rawOutput as Record<string, unknown>)
        : null;

      if (rawOutput) {
        // Geographic location — check both nested (rawOutput.location.primary) and flat (rawOutput.locationPrimary) formats
        if (!facts.geographicLocation) {
          const location = rawOutput.location && typeof rawOutput.location === 'object' && !Array.isArray(rawOutput.location)
            ? (rawOutput.location as Record<string, unknown>)
            : null;
          let geoParts: string[] = [];
          if (location) {
            geoParts = [location.tertiary, location.secondary, location.primary]
              .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          }
          if (geoParts.length === 0) {
            // Fallback: check flat fields on rawOutput
            geoParts = [rawOutput.locationTertiary, rawOutput.locationSecondary, rawOutput.locationPrimary]
              .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
          }
          if (geoParts.length > 0) {
            facts.geographicLocation = geoParts.join(', ');
          }
        }

        const summary = typeof rawOutput.summary === 'string' ? rawOutput.summary.trim() : '';
        const title = typeof rawOutput.title === 'string' ? rawOutput.title.trim() : '';

        if (!facts.coreProblem) {
          facts.coreProblem = summary || title || undefined;
        }

        // Extract physical location (room/fixture) from summary/title
        if (!facts.physicalLocation) {
          const combined = `${title} ${summary}`;
          const match = combined.match(physicalLocationKeywords);
          if (match) {
            facts.physicalLocation = match[0].replace(/\s+/g, ' ').trim();
          }
        }

        const outputTrades = Array.isArray(rawOutput.trades) ? rawOutput.trades.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [];
        for (const t of outputTrades) {
          if (!facts.trades.includes(t)) facts.trades.push(t);
        }
      }

      // Extract physical location and exclusions from user prompts
      if (cursor.rawPrompt) {
        const prompt = cursor.rawPrompt;

        // Extract physical location from user's own words
        if (!facts.physicalLocation) {
          const match = prompt.match(physicalLocationKeywords);
          if (match) {
            facts.physicalLocation = match[0].replace(/\s+/g, ' ').trim();
          }
        }

        const promptLower = prompt.toLowerCase();
        const exclusionPatterns = [
          /\bnot\s+(?:the\s+)?(\w+(?:\s+\w+)?)\b/gi,
          /\bjust\s+(?:the\s+)?(\w+(?:\s+\w+)?)\b/gi,
          /\bonly\s+(?:the\s+)?(\w+(?:\s+\w+)?)\b/gi,
          /\bno\s+(\w+(?:\s+\w+)?)\b/gi,
        ];
        for (const pattern of exclusionPatterns) {
          let match;
          while ((match = pattern.exec(prompt)) !== null) {
            const excluded = match[1].trim();
            if (excluded.length > 2 && !['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for'].includes(excluded)) {
              if (!facts.exclusions.includes(excluded)) {
                facts.exclusions.push(excluded);
              }
            }
          }
        }
      }

      const sourceIntakeId = this.extractSourceIntakeIdFromProject(cursor.project);
      if (!sourceIntakeId) break;
      const parent = await this.prisma.aiIntake.findUnique({ where: { id: sourceIntakeId } });
      cursor = parent
        ? { id: parent.id, project: parent.project, rawPrompt: parent.rawPrompt, rawOutput: parent.rawOutput }
        : null;
    }

    const lines: string[] = [];
    if (facts.geographicLocation) lines.push(`- Geographic location (for matching): ${facts.geographicLocation}`);
    if (facts.physicalLocation) lines.push(`- Physical location / problem area (inside property): ${facts.physicalLocation}`);
    if (facts.coreProblem) lines.push(`- Core problem: ${this.truncateForPrompt(facts.coreProblem, 150)}`);
    if (facts.trades.length > 0) lines.push(`- Trades identified: ${facts.trades.slice(0, 5).join(', ')}`);
    if (facts.exclusions.length > 0) lines.push(`- User exclusions: ${facts.exclusions.slice(0, 8).join(', ')}`);

    return lines.length > 0 ? `\nESTABLISHED FACTS (do NOT ask about these again — they are locked):\n${lines.join('\n')}\n` : '';
  }

  /** Build an accumulated project scope by merging summaries from the entire thread chain */
  private async buildAccumulatedScope(activeThread?: { id: string; project?: unknown; rawPrompt?: string | null; sessionId?: string | null } | null): Promise<string> {
    if (!activeThread) return '';

    const visited = new Set<string>();
    const scopeParts: string[] = [];
    const sessionId = activeThread.sessionId || undefined;
    let cursor: { id: string; project?: unknown; rawPrompt?: string | null; rawOutput?: unknown; sessionId?: string | null } | null = activeThread;

    for (let depth = 0; depth < 10; depth += 1) {
      if (!cursor || visited.has(cursor.id)) break;
      visited.add(cursor.id);

      // Guard: only pull from intakes in the same session (prevent cross-conversation contamination)
      if (sessionId && cursor.sessionId && cursor.sessionId !== sessionId) {
        this.logger.warn(`[buildAccumulatedScope] Skipping intake ${cursor.id} — session mismatch`);
        break;
      }

      const rawOutput = cursor.rawOutput && typeof cursor.rawOutput === 'object' && !Array.isArray(cursor.rawOutput)
        ? (cursor.rawOutput as Record<string, unknown>)
        : null;

      if (rawOutput) {
        const summary = typeof rawOutput.summary === 'string' ? rawOutput.summary.trim() : '';
        const title = typeof rawOutput.title === 'string' ? rawOutput.title.trim() : '';
        const scope = typeof rawOutput.scope === 'string' ? rawOutput.scope.trim() : '';

        const combined = [summary, scope, title].filter(s => s.length > 0);
        for (const part of combined.reverse()) {
          if (!scopeParts.includes(part)) {
            scopeParts.unshift(part);
          }
        }
      }

      const sourceIntakeId = this.extractSourceIntakeIdFromProject(cursor.project);
      if (!sourceIntakeId) break;
      const parent = await this.prisma.aiIntake.findUnique({ where: { id: sourceIntakeId } });
      cursor = parent
        ? { id: parent.id, project: parent.project, rawPrompt: parent.rawPrompt, rawOutput: parent.rawOutput, sessionId: parent.sessionId }
        : null;
    }

    return scopeParts.join('. ').trim();
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

  /**
   * Log a single conversation turn to ai_conversation_logs for LLM training.
   * Non-blocking — failures are caught and logged without affecting the user response.
   */
  private async logConversationTurn(params: {
    sessionId: string;
    intakeId: string;
    prompt: string;
    parsedOutput: unknown;
    requestId: string;
  }) {
    const { sessionId, intakeId, prompt, parsedOutput, requestId } = params;
    const po = parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)
      ? (parsedOutput as Record<string, unknown>)
      : null;

    // Count existing turns for this session to determine turn number
    const existingCount = await this.prisma.aiConversationLog.count({
      where: { sessionId },
    });

    // Extract safety assessment from parsed output
    const project = po?.project && typeof po.project === 'object' && !Array.isArray(po.project)
      ? (po.project as Record<string, unknown>)
      : null;
    const safetyAssessment = project?.safetyAssessment ?? po?.safetyAssessment ?? null;

    // Extract conversational text as the assistant "response"
    const conversationalText = typeof po?.conversationalText === 'string'
      ? po.conversationalText.trim()
      : null;

    await this.prisma.aiConversationLog.create({
      data: {
        sessionId,
        turn: existingCount + 1,
        role: 'user',
        prompt,
        userResponse: null,
        aiIntakeId: intakeId,
        structuredJson: po ? (po as any) : undefined,
        safetyJson: safetyAssessment as any ?? undefined,
        metadata: { requestId },
      },
    });

    // Also log the assistant turn if conversational text exists
    if (conversationalText) {
      await this.prisma.aiConversationLog.create({
        data: {
          sessionId,
          turn: existingCount + 2,
          role: 'assistant',
          prompt: null,
          userResponse: conversationalText,
          aiIntakeId: intakeId,
          structuredJson: po ? (po as any) : undefined,
          safetyJson: safetyAssessment as any ?? undefined,
          metadata: { requestId, turnLabel: 'response' },
        },
      });
    }

    this.logger.log(
      `[${requestId}] Conversation turn logged sessionId=${sessionId} turn=${existingCount + 1} hasAssistant=${!!conversationalText}`,
    );
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
5) Use location.primary, location.secondary, location.tertiary for GEOGRAPHIC location only (HK districts/zones). Do NOT put physical room/fixture names (kitchen, bathroom, sink) in these fields — those belong in summary/title.
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
- Do NOT include trades that are clearly unrelated to the user's request (e.g., no Glazier for AC cleaning, no Electrician for painting).
- Assign confidence < 0.5 to any trade you are unsure about. These will be filtered out.
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

  /**
   * Pass 1 — Facts Extraction Prompt
   * Stripped down, focused only on structured data extraction.
   * No safety assessment, risks, or recommendations — those come in Pass 2.
   */
  private async buildFactsExtractionPrompt() {
    const allowedTrades = await this.getAllowedTrades();
    const locationTaxonomy = this.buildCompactLocationTaxonomy();
    const allowedTradeNames = allowedTrades.map((trade) => trade.name);

    const systemPrompt = `You are Mimo Facts Extractor.

Convert a Hong Kong renovation request into strict JSON. Extract ONLY the core facts — no safety advice, no recommendations.

CRITICAL RULES
1) Output JSON only.
2) "trades" must contain exact values from ALLOWED_TRADES only.
3) If no exact trade exists, add the need to "unmappedNeeds".
4) Geography is Hong Kong by default.
5) Unknown values must be null or empty arrays.
6) Confidence values must be between 0 and 1.
7) Prefer precision over completeness. Do not hallucinate.

TRADE MINIMIZATION RULE
- Suggest the ABSOLUTE MINIMUM trades necessary to complete the job.
- Only include a trade if it is explicitly needed based on the user's description.
- Do NOT add Plumber, Tiler, or Shower Fitter unless there is explicit damage to plumbing/tiles/fixtures.
- EXAMPLE WRONG: "fixing shelves in shower" → Plumber, Tiler, Shower Fitter, Handyman
- EXAMPLE RIGHT: "fixing shelves in shower" → Handyman ONLY

ALLOWED_TRADES = ${JSON.stringify(allowedTradeNames)}
HK_LOCATION_TAXONOMY = ${JSON.stringify(locationTaxonomy)}

OUTPUT SCHEMA
{
  "version": "1.0",
  "language": "en|zh-HK|mixed|unknown",
  "intent": "new_project|quote_request|advice|unknown",
  "title": "string|null",
  "summary": "string|null",
  "scope": "string|null",
  "projectScale": "SCALE_1|SCALE_2|SCALE_3|null",
  "project": {
    "scopeText": "string|null",
    "propertyType": "string|null",
    "scopeLevel": "room|floor|unit|shop|office|building|house|apartment|mixed|null",
    "affectedAreas": ["string"],
    "works": ["string"],
    "deliverables": ["string"]
  },
  "size": { "value": number|null, "unit": "sqft|sqm|null", "rawText": "string|null", "confidence": number },
  "budget": { "currency": "HKD|USD|CNY|unknown|null", "min": number|null, "max": number|null, "rawText": "string|null", "confidence": number },
  "timeline": { "durationText": "string|null", "startText": "string|null", "deadlineText": "string|null", "confidence": number },
  "location": { "country": "Hong Kong", "primary": "string|null", "secondary": "string|null", "tertiary": "string|null", "rawText": "string|null", "confidence": number },
  "trades": ["string"],
  "tradeDetails": [{ "trade": "string", "confidence": number }],
  "unmappedNeeds": ["string"],
  "keyFacts": ["string"],
  "missingInfo": ["string"],
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

  /**
   * Pass 2 — Analysis Prompt
   * Takes Pass 1's structured facts as input. Focused on safety assessment,
   * risks, recommendations, and next questions. Has context so it won't
   * repeat obvious facts (e.g., "call a plumber" when plumber already listed).
   */
  private buildAnalysisPrompt(facts: Record<string, unknown>, preferredLanguage?: string) {
    const trades = Array.isArray(facts.trades) ? facts.trades : [];
    const scope = typeof facts.scope === 'string' ? facts.scope : (typeof facts.summary === 'string' ? facts.summary : '');
    const title = typeof facts.title === 'string' ? facts.title : '';
    const modeSuggested = typeof facts.modeSuggested === 'string' ? facts.modeSuggested : '';
    const locationPrimary = facts.location && typeof facts.location === 'object'
      ? (facts.location as Record<string, unknown>).primary
      : null;

    const tradesList = trades.length > 0 ? trades.join(', ') : 'unknown';
    const scopeSummary = scope ? `\nScope: ${scope}` : '';
    const titleLine = title ? `\nTitle: ${title}` : '';
    const modeLine = modeSuggested ? `\nProject mode: ${modeSuggested}` : '';
    const locationLine = locationPrimary ? `\nLocation: ${locationPrimary}` : '';

    const langNote = preferredLanguage && preferredLanguage !== 'en'
      ? `\n\nLANGUAGE: You MUST respond in ${preferredLanguage === 'zh-HK' ? 'Cantonese (Traditional Chinese, zh-HK)' : 'Mandarin (Simplified Chinese, zh-CN)'}. All analysis text (concerns, mitigations, recommendations, next questions) should be in this language.`
      : '';

    const systemPrompt = `You are Mimo Safety & Risk Analyst.

You have ALREADY extracted the core project facts. Your job is to provide ONLY the analysis layer — safety assessment, risks, assumptions, recommendations, and next questions.${langNote}

DO NOT repeat or question the trades. DO NOT suggest calling a trade that is already listed. Instead, provide useful, specific guidance based on the known facts.

KNOWN FACTS (already extracted — do NOT change or question these):
Trades needed: ${tradesList}${scopeSummary}${titleLine}${modeLine}${locationLine}

CRITICAL RULES
1) Output JSON only.
2) Do NOT suggest "call a plumber" if Plumber is already in the trades list. Instead provide specific advice relevant to that trade (e.g., "Ask plumber to check pipe condition behind cabinet").
3) Safety concerns must be specific to the described work, not generic.
4) Temporary mitigations must be practical, simple, and non-technical.
5) If there is possible immediate danger, advise leaving the area / isolating use only if safe.
6) Never suggest DIY repair steps for dangerous conditions.
7) Keep arrays concise: assumptions/risks max 3 items, concerns max 3 items, temporaryMitigations max 4 items.
8) nextQuestions should be intelligent follow-ups that the facts don't answer — not redundant questions about trades already identified.
9) Never assume the client owns any tools, equipment, materials, or supplies. Do not write assumptions like "client has basic tools" or "homeowner can provide equipment."
10) Always refer to the project owner as "the client" — never use "user," "homeowner," or "individual."

OUTPUT SCHEMA
{
  "assumptions": ["string"],
  "risks": ["string"],
  "nextQuestions": ["string"],
  "followUpQuestions": ["string"],
  "safetyAssessment": {
    "riskLevel": "none|low|medium|high|critical",
    "isDangerous": boolean,
    "concerns": ["string"],
    "temporaryMitigations": ["string"],
    "shouldEscalateEmergency": boolean,
    "emergencyReason": "string|null",
    "requiresImmediateHumanContact": boolean,
    "disclaimer": "string|null"
  }
}`;

    return systemPrompt;
  }

  /**
   * Conversational split — Pass A: Trade Matcher.
   * Small, focused prompt that returns ONLY the trade list (plus mode and a
   * short title/summary for thread continuity). The next-question prompt runs
   * separately with these trades injected, keeping per-turn output small.
   */
  private async buildTradeMatcherPrompt() {
    const allowedTrades = await this.getAllowedTrades();
    const allowedTradeNames = allowedTrades.map((trade) => trade.name);

    const systemPrompt = `You are Mimo Trade Matcher. Given the client's renovation need and the conversation so far, return ONLY the list of trades required. Nothing else.

# CLASSIFY MODE FIRST
- repair: fixing faults, leaks, damage, breakage, malfunction.
- refresh: cosmetic or light upgrades without major redesign.
- design: full renovation, refit, fitout, layout rethink, or transformation-led scope (e.g. "full bathroom renovation", "refit my kitchen").

# TRADE RULES
- "trades" must contain exact values from ALLOWED_TRADES only.
- repair mode → ABSOLUTE MINIMUM trades. Prefer a single trade; add another only if the described fault clearly needs it.
  - WRONG: "leaking tap" → Plumber, Handyman
  - RIGHT: "leaking tap" → Plumber
  - WRONG: "bath drain blocked" → Bath Fitter, Plumber
  - RIGHT: "bath drain blocked" → Plumber
- design/renovation mode → list EVERY trade implied by the works described:
  - floor/tiles → Tiler; sanitary ware / fittings / waterproofing → Plumber;
    lighting / sockets / wiring → Electrician; painting → Painter;
    structure / partitions / demolition → Builder; joinery / cabinetry → Carpenter.
  - If the user says "full renovation" WITHOUT specifics, still list the standard trade set for that room (e.g. bathroom → Plumber, Tiler, Electrician, Builder) and record the unstated specifics in "missingScope".
  - WRONG: "full bathroom renovation — floor, sanitary ware, lighting" → Handyman
  - RIGHT: "full bathroom renovation — floor, sanitary ware, lighting" → Plumber, Tiler, Electrician
- refresh mode → minimal + surface trade(s) only where justified (e.g. "repaint kitchen" → Painter only).
- Assign confidence per trade. Use confidence < 0.5 for trades you are unsure about.

ALLOWED_TRADES = ${JSON.stringify(allowedTradeNames)}

# OUTPUT (JSON only)
{
  "mode": "repair|refresh|design",
  "modeConfidence": 0.0,
  "modeReasoning": "one short sentence",
  "title": "short project title",
  "summary": "one-sentence summary of what the client needs",
  "trades": ["..."],
  "tradeDetails": [{ "trade": "...", "confidence": 0.0 }],
  "missingScope": ["floor", "sanitary ware", "lighting"]
}`;

    return {
      systemPrompt,
      allowedTradesCount: allowedTrades.length,
      locationEntryCount: 0,
    };
  }

  /**
   * Conversational split — Pass B: Next Question.
   * Slim prompt that asks ONE question. Trades come from the trade matcher pass
   * (injected as KNOWN_TRADES); scope/risks/safety are computed at wrap-up.
   */
  private buildConversationalPrompt(known?: { knownTrades: string[]; mode: string; missingScope: string[] }) {
    const knownTrades = Array.isArray(known?.knownTrades) ? known.knownTrades : [];
    const mode = known?.mode || 'repair';
    const missingScope = Array.isArray(known?.missingScope) ? known.missingScope : [];

    const systemPrompt = `You are Mimo, a friendly renovation assistant. Ask ONE question to understand the client's project better. Respond in JSON.

# KNOWN_TRADES (from the trade matcher — do NOT suggest trades; focus only on the next question)
trades = ${knownTrades.length > 0 ? JSON.stringify(knownTrades) : 'unknown'}
mode = ${mode}
missingScope = ${JSON.stringify(missingScope)}

# FACT TRACKING
- Build a mental checklist of EXPLICIT FACTS. These are LOCKED and must never be contradicted.
- Examples: "it is a bath" → fixture is a bath, not a shower. "just the kitchen" → kitchen only.
- When the user corrects you, immediately update facts and acknowledge the correction.
- Before generating ANY response, review: "What has the user explicitly stated?"
- "not X" / "just Y" / "only Z" — EXCLUSIONS. Respect them absolutely.

# PROBLEM FOCUS
- Identify the CORE PROBLEM and NEVER lose sight of it.
- Fixture is often just the LOCATION, not the scope of work.
- EXAMPLE: "bath drain blocked" → core problem is DRAINAGE. Do NOT ask about bath replacement.
- EXAMPLE: "kitchen tap leaking" → core problem is LEAK. Do NOT ask about sink replacement.
- If the user says "no" to a fixture question, immediately return to core problem. If the user says "no" to a wrap-up or "anything else" question, it means they have nothing more to add — do NOT treat it as an exclusion of previously stated facts.

# SURFACE-AREA PROJECTS
- Painting, decoration, flooring, tiling, wallpaper, plastering → room size MANDATORY.
- Make it your FIRST question. Do not proceed past turn 2 without a rough estimate.
- Accept rough estimates ("small bedroom", "about 3m x 4m", "~150 sq ft").

# REQUIREMENT TRACKING
- Track confirmed requirements in the "coveredTopics" field.
- Valid keys: "roomSize", "existingCondition", "materialPreference", "fixtureType", "existingWiring", "pipeAccess".
- Add a key when the user has provided definite information on that topic.

# CRITICAL RULES
1) conversationalText = ONE warm sentence acknowledging what they just said. Never end with "?". Never say "Tell me more" or "Got it. Tell me more".
2) nextQuestions = ONE question per turn. Never combine topics with "and" or "or". The JSON output must include conversationalText, nextQuestions, options, coveredTopics, and overallConfidence only.
3) Always include answer options with every question. Match options to YOUR question — don't recycle options from previous turns.
4) YES/NO questions (no alternatives listed in the question) → [{label:"Yes",value:"yes"},{label:"No",value:"no"},{label:"Not sure",value:"I am not sure"}]. If your question contains "or" presenting different choices (e.g. "X or Y"), it is NOT a yes/no question — use rule 5 instead.
5) CHOICE questions — your question presents distinct alternatives. The options MUST be the alternatives you named. Extract exact phrases from your question as individual option labels. Examples:
   Q: "Would you like a standard service or a more thorough clean and check?" → Options: "Standard service", "Thorough clean and check", "Not sure"
   Q: "Is it wall-mounted or a standing unit?" → Options: "Wall-mounted", "Standing unit", "Not sure"
   Q: "Do you want paint or wallpaper?" → Options: "Paint", "Wallpaper", "Not sure"
   Never use Yes/No for a question that contains "or" with alternatives.
6) BANNED options: "Tell me more", "That's all", "Other", "Something else", "Or something else". Always include "Not sure" last. Max 4 options.
7) Never repeat questions. Read "Already asked questions" and ESTABLISHED FACTS.
8) Do not expand scope beyond what the client described.
9) The user's LATEST message is the source of truth. Exclusions ("not X", "just Y", "only Z") are hard constraints.
10) When the user corrects you, acknowledge the correction in conversationalText ("Got it, just the bath."). Never repeat the incorrect assumption.
11) Ask only ONE best next question each turn. Cap nextQuestions/followUpQuestions to max 1 item.
12) Fresh options per turn — never recycle answer options from a previous turn.
13) No generic options — always tailor to the specific question asked.
14) Never ask about location, budget, or timeline.
- If the client clarifies their need (e.g. "not a repair, an extension", "not a leak, just replacing"), acknowledge the clarification and ask ONE natural follow-up. Never return empty conversationalText or nextQuestions — you must always provide both.
- If the client answers "yes" or confirms something, immediately narrow down with ONE specific follow-up question. Examples:
  "Is it for a specific appliance?" → yes → "What type of appliance is it?"
  "Are you replacing something?" → yes → "What needs replacing?"
  "Do you have the materials already?" → yes → "What materials do you have?"
- If the client is adding or installing something NEW (not repairing), and you already know what it is,
  ask ONE question about style, colour, finish, or whether they want the pro to make suggestions.
  Example: "Do you have a style or finish in mind, or let the professional suggest options?"
  Options: "I have a preference", "Let the pro suggest", "Standard is fine", "Not sure".
  Only ask this after you've established what's being installed — not on the first turn.
19) Wrap-up: set nextQuestions = [] ONLY when overallConfidence ≥ 0.85 AND all required topics for the mode are covered. Below that, always ask one more substantive question.
20) For design/renovation mode, work through missingScope FIRST (size → what's included → existing condition → finishes) before asking anything else. If the user answers "yes" to a broad confirmation ("Is it a full renovation?"), immediately narrow with ONE specific follow-up — never a generic "anything else".

# RELEVANCE
- Stay focused on the client's stated need. If this is a new installation or upgrade (not a repair), do NOT ask about problems or symptoms — ask about requirements instead. Match options to YOUR question — never recycle options from a previous turn.

# OUTPUT (JSON only)
{
  "conversationalText": "Got it — that helps.",
  "nextQuestions": ["your question here (or [] only when wrapping up)"],
  "options": [{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not sure","value":"not sure"}],
  "coveredTopics": ["fixtureType"],
  "overallConfidence": 0.3
}`;

    return {
      systemPrompt,
      allowedTradesCount: 0,
      locationEntryCount: 0,
    };
  }

  /** Generate sensible fallback options when the AI produces a question but no valid options. */
  private generateFallbackOptions(question: string): Array<{ label: string; value: string }> | null {
    if (!question) return null;
    const q = question.trim();
    // Fallback question — must be checked BEFORE yes/no so "Is there anything else..."
    // gets the single "No" option, not Yes/No/Not sure
    if (/is there anything else/i.test(q)) {
      return [{ label: 'No', value: 'no' }];
    }
    // Choice question — contains "or" presenting distinct alternatives
    // Extract the alternatives as individual options instead of Yes/No
    const orChoices = this.extractChoiceOptions(q);
    if (orChoices) return orChoices;
    // Yes/No question → Yes / No / Not sure
    if (/^(is (?:there|it)|are (?:there|you)|do you|does|did you|have you|has|can you|could you|will|would you|should)\b/i.test(q)) {
      return [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
        { label: 'Not sure', value: 'not sure' },
      ];
    }
    // What/which/how → open-ended
    if (/\b(what|which|how)\b/i.test(q.toLowerCase())) {
      return [
        { label: 'Tell me more', value: 'let me give you more details' },
        { label: 'Not sure yet', value: 'I am not sure yet' },
      ];
    }
    return null;
  }

  /** Detect choice questions ("X or Y" / "A, B, or C") and extract alternatives as options. */
  private extractChoiceOptions(question: string): Array<{ label: string; value: string }> | null {
    const q = question.trim();
    if (!/\b(?:or|,)\b/i.test(q)) return null;
    const cleaned = q.replace(/\?+$/, '').trim();

    const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\?+$/, '');

    // Case 1: comma-separated list "A, B, or C" / "A, B, C"
    const commaParts = cleaned
      .split(/,\s*(?:or\s+)?/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (commaParts.length >= 3) {
      // The first part carries the question stem ("Is your lounge wall plasterboard").
      // Take only its last word as the first option; remaining parts are clean options.
      const firstWords = commaParts[0].split(/\s+/);
      const firstOption = firstWords[firstWords.length - 1];
      const options = [firstOption, ...commaParts.slice(1)]
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      if (options.length >= 2 && !/\b(yes|no)\b/i.test(options.join(' '))) {
        return [
          ...options.slice(0, 4).map((s) => ({ label: capFirst(s), value: s.toLowerCase() })),
          { label: 'Not sure', value: 'not sure' },
        ];
      }
    }

    // Case 2: simple "X or Y" (no commas)
    const orIdx = cleaned.toLowerCase().lastIndexOf(' or ');
    if (orIdx < 0) return null;
    const beforeOr = cleaned.substring(0, orIdx).trim();
    const afterOr = cleaned.substring(orIdx + 4).trim();
    // The question stem lives before the final alternative — take only the
    // last word as the first option ("Is the wall in your dining room drywall" → "drywall").
    const beforeWords = beforeOr.split(/\s+/);
    const firstAlt = beforeWords[beforeWords.length - 1] || '';
    // Strip a leading article from the second option ("a hinged door" → "hinged door").
    const afterStripped = afterOr.replace(/^(a|an|the)\s+/i, '').trim();
    const secondAlt = afterStripped;
    if (!firstAlt || !secondAlt || firstAlt.length < 2 || secondAlt.length < 2) return null;
    if (/\b(yes|no|not)\b/i.test(`${firstAlt} ${secondAlt}`)) return null;
    return [
      { label: capFirst(firstAlt), value: firstAlt.toLowerCase().replace(/\?+$/, '') },
      { label: capFirst(secondAlt), value: secondAlt.toLowerCase().replace(/\?+$/, '') },
      { label: 'Not sure', value: 'not sure' },
    ];
  }

  private buildConversationalTextFallback(parsedOutput: unknown, prompt: string): string | null {
    const source =
      parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)
        ? (parsedOutput as Record<string, unknown>)
        : null;

    const title = typeof source?.title === 'string' ? source.title.trim() : '';
    const summary = typeof source?.summary === 'string' ? source.summary.trim() : '';
    const nextQuestions = Array.isArray(source?.nextQuestions) ? source.nextQuestions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0) : [];
    const trades = Array.isArray(source?.trades)
      ? source.trades.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const overallConfidence = typeof source?.overallConfidence === 'number' ? source.overallConfidence : 0;

    // Wrap-up — brief closing
    if (overallConfidence >= 0.75) {
      return 'I think we have enough to get started.';
    }

    // User said "no" to the fallback — wrap up warmly, don't let catch-all fire
    if (/^no$/i.test(prompt.trim()) && nextQuestions.length === 0) {
      return "No problem — I think we've covered everything we need.";
    }

    // Got useful data from the model — use it
    if (title && summary) {
      return `Got it. ${summary}`;
    }
    if (title) {
      return `Got it — ${title}.`;
    }
    if (summary) {
      return `Got it. ${summary}`;
    }

    // The model gave us a next question — acknowledge and move on
    if (nextQuestions.length > 0 && trades.length > 0) {
      const tradeList = trades.slice(0, 2).join(' and ');
      return `Understood. A ${tradeList} is the right call for this.`;
    }

    // Nothing useful from the model — let the final catch-all handle it
    return null;
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
    const regex = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
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
      version:
        typeof result.version === 'string' && result.version.trim().length > 0
          ? result.version
          : AI_INTAKE_TEXT_CONTRACT_VERSION,
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
        schemaVersion: AI_INTAKE_TEXT_CONTRACT_VERSION,
        title,
        summary,
        scope,
        assumptions,
        risks,
        nextQuestions,
      },
    };
  }

  private buildUnifiedPromptEnvelope(input: {
    mode: 'structured' | 'conversational';
    requestId: string;
    trimmedPrompt: string;
    promptWrapper: { systemPrompt: string };
    threadSummary: ReturnType<AiService['buildAiThreadContextSummary']> | null;
    threadOriginSummary: ReturnType<AiService['buildAiThreadContextSummary']> | null;
    askedQuestionsSummary: string;
    conversationHistory: string;
    establishedFacts: string;
    accumulatedScope: string;
  }): UnifiedPromptEnvelope {
    const summarizedOriginPrompt = this.truncateForPrompt(
      input.threadOriginSummary?.priorPrompt || input.threadSummary?.priorPrompt,
      500,
    );
    const summarizedPriorPrompt = this.truncateForPrompt(input.threadSummary?.priorPrompt, 450);
    const summarizedPriorTitle = this.truncateForPrompt(input.threadSummary?.title, 120) || 'unknown';
    const summarizedPriorSummary = this.truncateForPrompt(input.threadSummary?.summary, 260) || 'unknown';
    const summarizedPriorLocation = this.truncateForPrompt(input.threadSummary?.location, 120) || 'unknown';
    const summarizedPriorBudget = this.truncateForPrompt(input.threadSummary?.budget, 80) || 'unknown';
    const summarizedPriorTimeline = this.truncateForPrompt(input.threadSummary?.timeline, 80) || 'unknown';
    const summarizedPriorReply = this.truncateForPrompt(input.threadSummary?.conversationalText, 220) || 'unknown';

    const userMessage = input.threadSummary
      ? `THREAD_MODE: You are CONTINUING an existing project conversation. The core project subject, trades, and scope from prior context remain valid unless the user explicitly changes them. Do NOT restart, change the subject, or treat this as a new project.${input.establishedFacts}${input.accumulatedScope ? `\nACCUMULATED PROJECT SCOPE (growing summary — ADD new details, never remove existing ones):\n${input.accumulatedScope}\n` : ''}
The LATEST_USER_UPDATE is the user's answer to your last question — integrate it into the existing project. If it contradicts any earlier context, the user's latest words win. Treat negation words ("not", "just", "only") as explicit exclusions. IMPORTANT: if the word "no" appears as a standalone answer to a wrap-up or "anything else" question, it means the client has nothing more to add — do NOT treat it as an exclusion of previously stated facts.

ORIGINAL_THREAD_OBJECTIVE:\n${summarizedOriginPrompt || 'unknown'}\n${input.conversationHistory ? `\nCONVERSATION SO FAR:\n${input.conversationHistory}\n` : ''}\nEARLIER_USER_PROMPT:\n${summarizedPriorPrompt || 'unknown'}\n\nEXISTING PROJECT CONTEXT (this is the SAME project — do not reset):\n- Title: ${summarizedPriorTitle}\n- Summary: ${summarizedPriorSummary}\n- Trades: ${input.threadSummary.trades.length > 0 ? input.threadSummary.trades.slice(0, 6).join(', ') : 'unknown'}\n- Location: ${summarizedPriorLocation}\n- Budget: ${summarizedPriorBudget}\n- Timeline: ${summarizedPriorTimeline}\n- Prior assistant reply: ${summarizedPriorReply}\n- Already asked questions: ${input.askedQuestionsSummary || 'none'}\n\nLATEST_USER_UPDATE (the user's answer — integrate this into the existing project):\n${input.trimmedPrompt}\n\nContext:\n- Market: Hong Kong\n- Use only allowed trades from the provided list\n- Normalize output for platform matching and triage\n- Merge the latest update into the existing project, giving priority to user corrections\n- If the user explicitly excludes something (not, just, only, no), exclude it from trades, scope, and questions\n- Ask only one best next question and do not repeat previously asked topics\n- The prior assistant reply is what YOU said — the user is answering IT. Stay on that thread.\n- Q&A BOUNDARY: Each user answer belongs ONLY to the question you just asked. In CONVERSATION SO FAR, the "User said X → Mimo asked Y" pairs are self-contained — X answers Y, period. Do NOT cross-connect answers across turns. A standalone "no" to "Is there anything else?" simply means the client has finished — it does NOT modify any earlier statements.`
      : `USER_PROMPT:\n${input.trimmedPrompt}\n\nContext:\n- Market: Hong Kong\n- Use only allowed trades from the provided list\n- Normalize output for platform matching and triage`;

    return {
      schemaVersion: '1.0',
      requestId: input.requestId,
      mode: input.mode,
      userPrompt: input.trimmedPrompt,
      imageUrls: [],
      imageCount: 0,
      userMessage,
      messages: [
        {
          role: 'system',
          content: input.promptWrapper.systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    };
  }

  private mergeStructuredAndVisionOutputs(input: {
    parsedOutput: unknown;
    qwenParsed: Record<string, unknown>;
    qwenModel: string;
  }): {
    parsedOutput: unknown;
    imageInsightsRecord: MergedImageInsightsRecord;
  } {
    const suggestedTrades = Array.isArray(input.qwenParsed.suggestedTrades)
      ? input.qwenParsed.suggestedTrades.filter(
          (trade): trade is string => typeof trade === 'string' && trade.trim().length > 0,
        )
      : [];

    const conditionFindings = Array.isArray(input.qwenParsed.conditionFindings)
      ? input.qwenParsed.conditionFindings.filter((item): item is string => typeof item === 'string')
      : [];
    const safetyFlags = Array.isArray(input.qwenParsed.safetyFlags)
      ? input.qwenParsed.safetyFlags.filter((item): item is string => typeof item === 'string')
      : [];
    const followUpQuestions = Array.isArray(input.qwenParsed.followUpQuestions)
      ? input.qwenParsed.followUpQuestions.filter((item): item is string => typeof item === 'string')
      : [];

    let mergedOutput = input.parsedOutput;
    if (mergedOutput && typeof mergedOutput === 'object' && !Array.isArray(mergedOutput)) {
      const parsedObject = mergedOutput as Record<string, unknown>;
      const existingTrades = Array.isArray(parsedObject.trades)
        ? parsedObject.trades.filter(
            (trade): trade is string => typeof trade === 'string' && trade.trim().length > 0,
          )
        : [];
      parsedObject.trades = Array.from(new Set([...existingTrades, ...suggestedTrades]));

      const projectObject =
        parsedObject.project && typeof parsedObject.project === 'object' && !Array.isArray(parsedObject.project)
          ? (parsedObject.project as Record<string, unknown>)
          : {};

      projectObject.imageInsights = {
        schemaVersion: AI_IMAGE_INSIGHTS_CONTRACT_VERSION,
        summary: typeof input.qwenParsed.imageSummary === 'string' ? input.qwenParsed.imageSummary : null,
        conditionFindings,
        safetyFlags,
        followUpQuestions,
        confidence: typeof input.qwenParsed.confidence === 'number' ? input.qwenParsed.confidence : null,
        provider: 'qwen',
        model: input.qwenModel,
      };
      parsedObject.project = projectObject;
      mergedOutput = parsedObject;
    }

    return {
      parsedOutput: mergedOutput,
      imageInsightsRecord: {
        schemaVersion: AI_IMAGE_INSIGHTS_CONTRACT_VERSION,
        summary: typeof input.qwenParsed.imageSummary === 'string' ? input.qwenParsed.imageSummary : null,
        conditionFindings,
        safetyFlags,
        followUpQuestions,
        confidence: typeof input.qwenParsed.confidence === 'number' ? input.qwenParsed.confidence : null,
        provider: 'qwen',
        model: input.qwenModel,
      },
    };
  }

  async getSandboxHealth() {
    const endpoint = this.resolveDeepSeekChatEndpoint();
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
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
    // Kill switch — set QWEN_VISION_ENABLED=false in Render to skip vision entirely
    if (process.env.QWEN_VISION_ENABLED === 'false') {
      throw new ServiceUnavailableException('Qwen vision is disabled via QWEN_VISION_ENABLED');
    }

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

    this.logger.log(`[${requestId}] Qwen vision request started model=${model} imageCount=${imageUrls.length}`);

    const contentParts: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text:
          `Analyze these renovation-related photos and return strict JSON with this shape: ` +
          `{"imageSummary":string,"suggestedTrades":string[],"conditionFindings":string[],"safetyFlags":string[],"followUpQuestions":string[],"confidence":number}. ` +
          `Keep suggestedTrades concise and relevant to Hong Kong renovation context. ` +
          `confidence must be a decimal number like 0.85 (not a string). User prompt: ${userPrompt}`,
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

      // Sanitize confidence: ensure it's a number between 0 and 1
      if (parsed.confidence !== undefined && parsed.confidence !== null) {
        const num = Number(parsed.confidence);
        if (Number.isFinite(num)) {
          parsed.confidence = Math.max(0, Math.min(1, num));
        } else {
          parsed.confidence = 0.5;
        }
      } else {
        parsed.confidence = 0.5;
      }

      this.logger.log(`[${requestId}] Qwen vision request completed durationMs=${Date.now() - startedAt}`);

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

  /**
   * Run a single DeepSeek pass with the given messages and return the parsed output.
   */
  private async runDeepSeekPass(params: {
    requestId: string;
    messages: DeepSeekMessage[];
    timeoutMs: number;
    maxOutputTokens: number;
    label: string;
  }): Promise<{ output: string; parsedOutput: Record<string, unknown>; durationMs: number; usage: Record<string, number> }> {
    const { requestId, messages, timeoutMs, maxOutputTokens, label } = params;
    const apiKey = process.env.DEEPSEEK_API_KEY!;
    const endpoint = this.resolveDeepSeekChatEndpoint();
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    const passStartedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      this.logger.log(`[${requestId}] ${label} started`);
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
        this.logger.error(`[${requestId}] ${label} failed status=${response.status}`);
        throw new ServiceUnavailableException('DeepSeek request failed');
      }

      let payload: DeepSeekChatResponse;
      try {
        payload = JSON.parse(rawText) as DeepSeekChatResponse;
      } catch {
        this.logger.error(`[${requestId}] ${label} invalid JSON`);
        throw new InternalServerErrorException('Invalid DeepSeek response');
      }

      const output = payload.choices?.[0]?.message?.content?.trim() || '';
      const durationMs = Date.now() - passStartedAt;
      const usage = (payload.usage || {}) as Record<string, number>;

      let parsedOutput: Record<string, unknown> = {};
      if (output) {
        try {
          parsedOutput = JSON.parse(output) as Record<string, unknown>;
        } catch {
          this.logger.warn(`[${requestId}] ${label} non-parseable JSON`);
        }
      }

      this.logger.log(`[${requestId}] ${label} completed durationMs=${durationMs}`);
      return { output, parsedOutput, durationMs, usage };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Two-pass pipeline for structured mode:
   * Pass 1: Extract facts (trades, scope, location, budget, timeline)
   * Pass 2: Analyze with context (safety, risks, recommendations)
   * Merges both outputs into a combined result.
   */
  private async runTwoPassPipeline(params: {
    requestId: string;
    trimmedPrompt: string;
    timeoutMs: number;
    maxOutputTokens: number;
    factsPromptWrapper: { systemPrompt: string; allowedTradesCount: number; locationEntryCount: number };
    preferredLanguage?: string;
  }) {
    const { requestId, trimmedPrompt, timeoutMs, maxOutputTokens, factsPromptWrapper, preferredLanguage } = params;
    const pass1Start = Date.now();

    const langInstruction = preferredLanguage && preferredLanguage !== 'en'
      ? `\n\nLANGUAGE: The user prefers ${preferredLanguage === 'zh-HK' ? 'Cantonese (Traditional Chinese)' : 'Mandarin (Simplified Chinese)'}. Detect the actual language of the input and set "language" accordingly.`
      : '\n\nLANGUAGE: Detect the input language and set "language" to en, zh-HK, zh-CN, or mixed.';

    const pass1SystemPrompt = factsPromptWrapper.systemPrompt + langInstruction;

    // Pass 1 — Facts extraction
    const pass1Messages: DeepSeekMessage[] = [
      { role: 'system', content: pass1SystemPrompt },
      { role: 'user', content: trimmedPrompt },
    ];

    const pass1 = await this.runDeepSeekPass({
      requestId: `${requestId}_p1`,
      messages: pass1Messages,
      timeoutMs,
      maxOutputTokens,
      label: 'Pass1-Facts',
    });

    const facts = pass1.parsedOutput;
    this.logger.log(`[${requestId}] Pass1 facts: trades=${JSON.stringify(facts.trades)} mode=${facts.modeSuggested} hasProject=${!!facts.project}`);

    // Pass 2 — Analysis with context
    const analysisPrompt = this.buildAnalysisPrompt(facts, preferredLanguage);
    this.logger.log(`[${requestId}] Pass2 prompt length=${analysisPrompt.length}`);
    const pass2Messages: DeepSeekMessage[] = [
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: `Original request: ${trimmedPrompt}` },
    ];

    const pass2 = await this.runDeepSeekPass({
      requestId: `${requestId}_p2`,
      messages: pass2Messages,
      timeoutMs,
      maxOutputTokens: maxOutputTokens,
      label: 'Pass2-Analysis',
    });

    this.logger.log(`[${requestId}] Pass2 raw (first 500): ${pass2.output.slice(0, 500)}`);
    this.logger.log(`[${requestId}] Pass2 full output length: ${pass2.output.length} chars`);
    this.logger.log(`[${requestId}] Pass2 parsed keys: ${Object.keys(pass2.parsedOutput).join(', ') || 'EMPTY'}`);

    // Merge Pass 1 facts + Pass 2 analysis
    const rawMerged: Record<string, unknown> = {
      ...facts,
      ...pass2.parsedOutput,
      // Ensure trades from Pass 1 are preserved
      trades: facts.trades || [],
      tradeDetails: facts.tradeDetails || [],
      unmappedNeeds: facts.unmappedNeeds || [],
    };

    // Run through normalizer to move safetyAssessment into project.safetyAssessment etc.
    const merged = this.normalizeParsedOutput(rawMerged) as Record<string, unknown>;
    const mergedSafety = merged.project && typeof merged.project === 'object'
      ? (merged.project as Record<string, unknown>).safetyAssessment
      : undefined;
    this.logger.log(
      `[${requestId}] Merged output: safetyInProject=${!!mergedSafety} topSafety=${!!(merged as Record<string, unknown>).safetyAssessment}`,
    );

    const totalDurationMs = Date.now() - pass1Start;
    const totalUsage = {
      prompt_tokens: (pass1.usage.prompt_tokens || 0) + (pass2.usage.prompt_tokens || 0),
      completion_tokens: (pass1.usage.completion_tokens || 0) + (pass2.usage.completion_tokens || 0),
      total_tokens: (pass1.usage.total_tokens || 0) + (pass2.usage.total_tokens || 0),
    };

    this.logger.log(
      `[${requestId}] Two-pass pipeline completed totalDurationMs=${totalDurationMs} p1DurationMs=${pass1.durationMs} p2DurationMs=${pass2.durationMs}`,
    );

    return {
      output: pass1.output,  // Pass 1 output is the primary structured response
      parsedOutput: merged,
      durationMs: totalDurationMs,
      usage: totalUsage,
    };
  }

  async previewRequirements(prompt: string, context?: { sessionId?: string; userId?: string; userRole?: string; ipAddress?: string; intakeId?: string; imageUrls?: string[]; mode?: 'structured' | 'conversational'; preferredLanguage?: string }) {
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
    const rawImageUrls = Array.isArray(context?.imageUrls)
      ? context!.imageUrls
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => /^https?:\/\//i.test(url))
      : [];
    // Strip images from AI input when vision is disabled — images are saved & linked
    // to the project but not sent to DeepSeek or Qwen.
    const normalizedImageUrls = process.env.QWEN_VISION_ENABLED === 'false' ? [] : rawImageUrls;
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
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    // Increased default timeout to 30000ms (30s) for large prompts
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || '60000');

    const requestId = `ds_${Date.now().toString(36)}`;
    const startedAt = Date.now();
    const mode = context?.mode ?? 'structured';
    const maxOutputTokens = mode === 'conversational'
      ? Number(process.env.DEEPSEEK_CONVERSATIONAL_MAX_TOKENS || '1500')
      : Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || '2000');
    const orchestratorEnabled = this.shouldUseUnifiedOrchestrator();
    const promptWrapper = mode === 'conversational' ? await this.buildTradeMatcherPrompt() : await this.buildPromptWrapper();
    const factsPromptWrapper = mode === 'conversational' ? null : await this.buildFactsExtractionPrompt();

    const shouldResetMemory = this.isMemoryResetPrompt(trimmedPrompt);
    const activeThread = shouldResetMemory ? null : await this.findActiveAiThread(context);
    const threadSummary = activeThread ? this.buildAiThreadContextSummary(activeThread) : null;
    const threadOrigin = activeThread ? await this.resolveThreadOriginIntake(activeThread) : null;
    const threadOriginSummary = threadOrigin ? this.buildAiThreadContextSummary(threadOrigin) : null;
    const askedQuestions = await this.collectThreadAskedQuestions(activeThread as { id: string; project?: unknown } | null);
    const conversationHistory = await this.collectThreadConversationHistory(activeThread as any);
    const establishedFacts = await this.buildEstablishedFacts(activeThread as { id: string; project?: unknown; rawPrompt?: string | null } | null);
    const accumulatedScope = await this.buildAccumulatedScope(
      activeThread ? { ...activeThread, sessionId: context?.sessionId || (activeThread as any).sessionId } : null
    );

    const askedQuestionsSummary = askedQuestions
      .slice(0, 6)
      .map((question) => this.truncateForPrompt(question, 120))
      .filter((question) => question.length > 0)
      .join(' | ');

    const envelope = this.buildUnifiedPromptEnvelope({
      mode,
      requestId,
      trimmedPrompt,
      promptWrapper,
      threadSummary,
      threadOriginSummary,
      askedQuestionsSummary,
      conversationHistory,
      establishedFacts,
      accumulatedScope,
    });
    envelope.imageUrls = normalizedImageUrls;
    envelope.imageCount = requestedImageCount;

    if (orchestratorEnabled) {
      this.logger.log(
        `[${requestId}] Unified orchestrator enabled envelopeVersion=${envelope.schemaVersion} mode=${envelope.mode} imageCount=${envelope.imageCount}`,
      );
    }

    const messages: DeepSeekMessage[] = envelope.messages;

    const totalMessageChars = messages.reduce((sum, message) => sum + message.content.length, 0);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      this.logger.log(
        `[${requestId}] DeepSeek request started model=${model} timeoutMs=${timeoutMs} userPromptChars=${trimmedPrompt.length} userMessageChars=${envelope.userMessage.length} systemPromptChars=${promptWrapper.systemPrompt.length} totalMessageChars=${totalMessageChars} allowedTrades=${promptWrapper.allowedTradesCount} locationEntries=${promptWrapper.locationEntryCount}`,
      );

      // ── Two-pass pipeline (structured mode) or single-pass (conversational) ──
      let output: string;
      let durationMs: number;
      let usage: Record<string, number>;
      let parsedOutput: unknown = null;

      if (mode === 'structured' && factsPromptWrapper) {
        const pipelineResult = await this.runTwoPassPipeline({
          requestId,
          trimmedPrompt,
          timeoutMs,
          maxOutputTokens,
          factsPromptWrapper,
          preferredLanguage: context?.preferredLanguage,
        });
        output = pipelineResult.output;
        durationMs = pipelineResult.durationMs;
        usage = pipelineResult.usage;
        parsedOutput = pipelineResult.parsedOutput;
      } else if (mode === 'conversational') {
        // ── Conversational split: Pass A (trade matcher) → Pass B (next question) ──
        // Pass A uses the envelope built with the trade-matcher system prompt.
        let passAUsage: Record<string, number> = {};
        let tradeContext: {
          trades: string[];
          mode: string;
          missingScope: string[];
          title: string | null;
          summary: string | null;
          tradeDetails: Array<{ trade: string; confidence: number }>;
          modeConfidence: number | null;
          modeReasoning: string | null;
        } = {
          trades: [],
          mode: 'repair',
          missingScope: [],
          title: null,
          summary: null,
          tradeDetails: [],
          modeConfidence: null,
          modeReasoning: null,
        };

        const priorTrades = () =>
          threadSummary?.trades && threadSummary.trades.length > 0
            ? threadSummary.trades.slice(0, 6)
            : this.fallbackTrades.map((t) => t.name).slice(0, 6);

        try {
          const passA = await this.runDeepSeekPass({
            requestId: `${requestId}_trade`,
            messages,
            timeoutMs,
            maxOutputTokens,
            label: 'Conversational-TradeMatcher',
          });
          passAUsage = passA.usage;
          this.logger.log(`[${requestId}_trade] raw output (${passA.output.length} chars): ${passA.output.slice(0, 800)}`);
          const a = passA.parsedOutput;
          tradeContext = {
            trades: Array.isArray(a.trades) ? (a.trades as string[]) : [],
            mode:
              typeof a.mode === 'string' && ['repair', 'refresh', 'design'].includes(a.mode)
                ? a.mode
                : 'repair',
            missingScope: Array.isArray(a.missingScope) ? (a.missingScope as string[]) : [],
            title: typeof a.title === 'string' ? a.title : null,
            summary: typeof a.summary === 'string' ? a.summary : null,
            tradeDetails: Array.isArray(a.tradeDetails)
              ? (a.tradeDetails as Array<{ trade: string; confidence: number }>)
              : [],
            modeConfidence: typeof a.modeConfidence === 'number' ? a.modeConfidence : null,
            modeReasoning: typeof a.modeReasoning === 'string' ? a.modeReasoning : null,
          };
          if (tradeContext.trades.length === 0) {
            tradeContext.trades = priorTrades();
            this.logger.warn(`[${requestId}] Trade matcher returned no trades; reusing prior/fallback trades`);
          }
        } catch (tradeErr) {
          this.logger.warn(
            `[${requestId}] Trade matcher pass failed; reusing prior/fallback trades. ${(tradeErr as Error).message}`,
          );
          tradeContext.trades = priorTrades();
        }

        // Pass B — next question, with the trade list injected for context.
        const conversationalWrapper = this.buildConversationalPrompt({
          knownTrades: tradeContext.trades,
          mode: tradeContext.mode,
          missingScope: tradeContext.missingScope,
        });
        const passBMessages: DeepSeekMessage[] = [
          { role: 'system', content: conversationalWrapper.systemPrompt },
          { role: 'user', content: envelope.userMessage },
        ];
        const passB = await this.runDeepSeekPass({
          requestId: `${requestId}_question`,
          messages: passBMessages,
          timeoutMs,
          maxOutputTokens,
          label: 'Conversational-NextQuestion',
        });

        this.logger.log(`[${requestId}_question] raw output (${passB.output.length} chars): ${passB.output.slice(0, 800)}`);

        output = passB.output;
        durationMs = Date.now() - startedAt;
        usage = {
          prompt_tokens: (passAUsage.prompt_tokens || 0) + (passB.usage.prompt_tokens || 0),
          completion_tokens: (passAUsage.completion_tokens || 0) + (passB.usage.completion_tokens || 0),
          total_tokens: (passAUsage.total_tokens || 0) + (passB.usage.total_tokens || 0),
        };

        const merged: Record<string, unknown> = {
          ...passB.parsedOutput,
          trades: tradeContext.trades,
          tradeDetails: tradeContext.tradeDetails,
          mode: tradeContext.mode,
          modeSuggested: tradeContext.mode,
          modeConfidence: tradeContext.modeConfidence,
          modeReasoning: tradeContext.modeReasoning,
          missingScope: tradeContext.missingScope,
          title:
            tradeContext.title ??
            (typeof passB.parsedOutput.title === 'string' ? passB.parsedOutput.title : null),
          summary: tradeContext.summary ?? null,
        };
        parsedOutput = this.normalizeParsedOutput(merged);
      } else {
        // Non-conversational single-pass fallback (rare: structured mode without facts wrapper)
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

        output = payload.choices?.[0]?.message?.content?.trim() || '';
        durationMs = Date.now() - startedAt;
        usage = (payload.usage || {}) as Record<string, number>;
        if (output) {
          try {
            parsedOutput = this.normalizeParsedOutput(JSON.parse(output));
          } catch {
            const salvaged = this.extractPartialParsedOutput(output);
            if (salvaged) parsedOutput = this.normalizeParsedOutput(salvaged);
          }
        }
      }
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
        schemaVersion: string;
        summary: string | null;
        conditionFindings: string[];
        safetyFlags: string[];
        followUpQuestions: string[];
        confidence: number | null;
        provider: string | null;
        model: string | null;
      } | null = null;

      // Only parse output into parsedOutput if the two-pass pipeline didn't already set it
      if (!parsedOutput && output) {
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
          const imageContractValidation = validateImageInsightsContract(parsed);
          if (!imageContractValidation.valid) {
            this.logger.warn(
              `[${requestId}] Vision output contract mismatch schemaVersion=${imageContractValidation.schemaVersion} errors=${imageContractValidation.errors.join(' | ')}`,
            );
            if (this.shouldEnforceAiContract()) {
              throw new InternalServerErrorException('AI image output failed contract validation');
            }
          }
          const merged = this.mergeStructuredAndVisionOutputs({
            parsedOutput,
            qwenParsed: parsed,
            qwenModel: qwenVision.model,
          });
          parsedOutput = merged.parsedOutput;
          imageInsightsRecord = merged.imageInsightsRecord;

          // Inject Qwen's image summary as the primary conversational text — replace DeepSeek's generic response
          if (
            parsedOutput &&
            typeof parsedOutput === 'object' &&
            !Array.isArray(parsedOutput) &&
            typeof parsed.imageSummary === 'string' &&
            parsed.imageSummary.trim()
          ) {
            const po = parsedOutput as Record<string, unknown>;
            const tradesFromVision = Array.isArray(parsed.suggestedTrades)
              ? parsed.suggestedTrades.filter((t: unknown) => typeof t === 'string')
              : [];
            const tradeHint = tradesFromVision.length > 0
              ? ` Based on what I can see, trades like ${tradesFromVision.join(', ')} may be needed.`
              : '';
            const conditionFindings = Array.isArray(parsed.conditionFindings)
              ? parsed.conditionFindings.filter((c: unknown) => typeof c === 'string')
              : [];
            const conditionText = conditionFindings.length > 0
              ? `\n\nI noticed: ${conditionFindings.join('; ')}.`
              : '';
            po.conversationalText = `${parsed.imageSummary}.${tradeHint}${conditionText}`;
            this.logger.log(`[${requestId}] Replaced conversationalText with Qwen image summary (${parsed.imageSummary.length} chars, ${tradesFromVision.length} trades, ${conditionFindings.length} conditions)`);
          }

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
        const maxQuestions = mode === 'structured' ? 3 : 1;
        const proposedQuestions = this.filterRepeatedQuestions(
          [
            ...this.toStringArray(parsedObject.nextQuestions),
            ...this.toStringArray(parsedObject.followUpQuestions),
          ],
          askedQuestions,
        ).slice(0, maxQuestions);

        parsedObject.nextQuestions = proposedQuestions;
        parsedObject.followUpQuestions = proposedQuestions;
        parsedOutput = parsedObject;
      }

      if (parsedOutput && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)) {
        const aiContractValidation = validateAiOutputContract(parsedOutput, mode);
        if (!aiContractValidation.valid) {
          this.logger.warn(
            `[${requestId}] AI output contract mismatch mode=${mode} schemaVersion=${aiContractValidation.schemaVersion} errors=${aiContractValidation.errors.join(' | ')}`,
          );
          if (this.shouldEnforceAiContract()) {
            throw new InternalServerErrorException('AI output failed contract validation');
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
      const projectSafety = p?.project && typeof p.project === 'object'
        ? !!(p.project as Record<string, unknown>).safetyAssessment
        : false;
      this.logger.log(`[${requestId}] Before DB save: project.safetyAssessment=${projectSafety} topLevelSafety=${!!(p as any)?.safetyAssessment}`);
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
                // Chain to the PREVIOUS turn's intake (context.intakeId), not the root.
                // This creates a linked list, not a star, so backward walks find all turns.
                sourceIntakeId: context?.intakeId || activeThread.id,
                windowExpiresAt: new Date(activeThread.createdAt.getTime() + this.aiThreadWindowMs).toISOString(),
              } as Prisma.InputJsonValue,
            }
          : {}),
      };

      try {
        // Debug: log what's in parsedOutput before saving
        const po = parsedOutput as Record<string, unknown> | null;
        const allKeys = po ? Object.keys(po).join(',') : 'N/A';
        const nq = Array.isArray(po?.nextQuestions) ? po!.nextQuestions as string[] : [];
        const fuq = Array.isArray(po?.followUpQuestions) ? po!.followUpQuestions as string[] : [];
        this.logger.log(
          `[${requestId}] Saving rawOutput: ALL keys=[${allKeys}]`,
        );
        if (nq.length > 0) this.logger.log(`[${requestId}] nextQuestions: ${JSON.stringify(nq)}`);
        if (fuq.length > 0) this.logger.log(`[${requestId}] followUpQuestions: ${JSON.stringify(fuq)}`);

        const intake = await this.prisma.aiIntake.create({
          data: {
            requestId,
            rawPrompt: trimmedPrompt,
            userId: userId ?? null,
            sessionId: sessionId ?? null,
            model,
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

        // Note: conversation turn logging moved to previewConversationalRequirements
        // so it captures enriched output (fallback conversationalText, options) the user actually sees.

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
        model,
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
        orchestrator: {
          enabled: orchestratorEnabled,
          envelopeVersion: envelope.schemaVersion,
          imageCount: envelope.imageCount,
        },
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

  /**
   * Compile a full conversation thread into a comprehensive project scope.
   * Called by the wizard when the client leaves the AI chat screen.
   * Walks the thread chain from the given intake, sends the full transcript
   * to DeepSeek, and persists the compiled scope to the intake record.
   */
  async compileIntakeScope(intakeId: string) {
    const intake = await this.prisma.aiIntake.findUnique({ where: { id: intakeId } });
    if (!intake) throw new NotFoundException('AI intake not found');

    // Find the LATEST intake in the thread. The given intakeId is the root;
    // query by sessionId (all turns share the same session) to get the most recent.
    let latestIntake = intake;
    if (intake.sessionId) {
      const latest = await (this.prisma as any).aiIntake.findFirst({
        where: { sessionId: intake.sessionId },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) latestIntake = latest;
    }

    // Collect all conversation turns, starting from the latest and walking backward
    const turns = await this.collectThreadConversationTurns(
      latestIntake as { id: string; project?: unknown; rawPrompt?: string | null },
      latestIntake.rawPrompt || intake.rawPrompt || '',
    );
    if (turns.length < 2) {
      // Not enough conversation to compile — return existing summary if any
      return {
        summary: intake.summary || intake.scope || '',
        title: intake.title || '',
        trades: intake.trades || [],
        assumptions: intake.assumptions || [],
        risks: intake.risks || [],
      };
    }

    const transcript = turns.map((t) => `${t.role === 'user' ? 'Client' : 'Mimo'}: ${t.text}`).join('\n\n');
    this.logger.log(`[compileIntakeScope] collected ${turns.length} turns, transcript ${transcript.length} chars`);

    const endpoint = process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions';
    const apiKey = process.env.DEEPSEEK_API_KEY || '';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    const compileMessages: DeepSeekMessage[] = [
      {
        role: 'system',
        content: `You are a renovation project scope compiler. Read the conversation below and produce a factual scope for a tradesperson.

CRITICAL RULES:
- Include every concrete detail the client shared in the summary. Be brief: 2-4 sentences. No filler.
- NEVER write "was not specified", "no details were provided", or "not mentioned" — just describe what IS known.
- Even when the conversation is short, produce reasonable assumptions and risks based on the trade and job type. A tradesperson needs to know what to expect before arriving — use your knowledge of the trade to fill in standard assumptions.
- assumptions: 2-3 standard things any tradesperson would assume (e.g. residential property, standard materials, accessible work area).
- risks: 2-3 common things that could go wrong for this type of work.
- safetyAssessment is MANDATORY — always include concerns and mitigations, even for low-risk jobs.
- If the client says "no" in response to a wrap-up or "anything else" question, it means they have finished describing the scope — do NOT treat it as contradicting or excluding earlier details. Only treat "no" as exclusion when it directly responds to a specific substantive question.

Return ONLY valid JSON (no markdown):

{
  "summary": "2-4 sentence factual scope. List every concrete detail from the conversation.",
  "title": "6-10 word job title",
  "trades": ["exact", "trade", "names"],
  "assumptions": ["Standard residential property", "Existing wiring in serviceable condition", "Accessible distribution board"],
  "risks": ["Circuit capacity may be insufficient for new load", "Wall chasing may reveal unexpected obstacles"],
  "safetyAssessment": {
    "riskLevel": "low|medium|high|critical",
    "concerns": ["Turn off mains before any electrical work", "Test circuits before touching"],
    "temporaryMitigations": ["Isolate the circuit at the distribution board before starting"]
  }
}`,
      },
      { role: 'user', content: transcript },
    ];

    const compileResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: compileMessages, temperature: 0.1, max_tokens: 800 }),
      signal: AbortSignal.timeout(20000),
    });

    if (!compileResponse.ok) {
      this.logger.warn(`[compileIntakeScope] DeepSeek compile failed status=${compileResponse.status}`);
      return {
        summary: intake.summary || intake.scope || '',
        title: intake.title || '',
        trades: intake.trades || [],
        assumptions: intake.assumptions || [],
        risks: intake.risks || [],
      };
    }

    const compileRaw = await compileResponse.text();
    const compilePayload = JSON.parse(compileRaw) as DeepSeekChatResponse;
    const content = compilePayload.choices?.[0]?.message?.content?.trim() || '';

    // Parse the JSON from the response
    let compiled: Record<string, unknown> = {};
    try {
      // Strip markdown fences if present
      const jsonStr = content.replace(/```(?:json)?\s*|```/gi, '').trim();
      compiled = JSON.parse(jsonStr);
    } catch {
      this.logger.warn(`[compileIntakeScope] Failed to parse compile response as JSON`);
      return {
        summary: content.slice(0, 500) || intake.summary || '',
        title: intake.title || '',
        trades: intake.trades || [],
        assumptions: intake.assumptions || [],
        risks: intake.risks || [],
      };
    }

    const summary = typeof compiled.summary === 'string' ? compiled.summary.trim() : '';
    const title = typeof compiled.title === 'string' ? compiled.title.trim() : '';
    const trades = Array.isArray(compiled.trades) ? compiled.trades.filter((t): t is string => typeof t === 'string') : [];
    const assumptions = Array.isArray(compiled.assumptions) ? compiled.assumptions.filter((a): a is string => typeof a === 'string') : [];
    const risks = Array.isArray(compiled.risks) ? compiled.risks.filter((r): r is string => typeof r === 'string') : [];
    const safetyAssessment = compiled.safetyAssessment && typeof compiled.safetyAssessment === 'object' ? compiled.safetyAssessment : null;

    // Persist compiled scope to the intake record
    const existingIntake = await this.prisma.aiIntake.findUnique({
      where: { id: intakeId },
      select: { project: true },
    });
    const existingProject = (existingIntake?.project as Record<string, unknown>) || {};

    await this.prisma.aiIntake.update({
      where: { id: intakeId },
      data: {
        summary: summary || undefined,
        title: title || undefined,
        trades: trades.length > 0 ? trades : undefined,
        assumptions: assumptions.length > 0 ? assumptions : undefined,
        risks: risks.length > 0 ? risks : undefined,
        project: safetyAssessment
          ? { ...existingProject, safetyAssessment }
          : undefined,
      } as any,
    });

    this.logger.log(`[compileIntakeScope] Compiled scope for intake ${intakeId}: summary=${summary.length}chars, title=${title}, trades=${trades.join(',')}`);

    return { summary, title, trades, assumptions, risks, safetyAssessment };
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

    const rawTrades: string[] = parsedObject && Array.isArray(parsedObject.trades)
      ? (parsedObject.trades as unknown[]).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    // Validate against DB trade list — discard AI hallucinations like "Flooring"
    const allowedTrades = await this.getAllowedTrades();
    const allowedNames = new Set(allowedTrades.map((t) => t.name.toLowerCase()));
    const trades = rawTrades.filter((trade) => allowedNames.has(trade.toLowerCase()));

    if (rawTrades.length > trades.length) {
      const discarded = rawTrades.filter((t) => !allowedNames.has(t.toLowerCase()));
      this.logger.warn(`Discarded invalid AI trades: ${discarded.join(', ')}`);
    }

    // Filter by confidence from tradeDetails — drop low-confidence trades
    const tradeDetails = Array.isArray(parsedObject?.tradeDetails)
      ? (parsedObject!.tradeDetails as Array<{ trade?: string; confidence?: number }>)
      : [];
    const confidenceMap = new Map<string, number>();
    for (const td of tradeDetails) {
      if (td.trade?.trim()) {
        confidenceMap.set(td.trade.trim().toLowerCase(), typeof td.confidence === 'number' ? td.confidence : 0.5);
      }
    }

    const finalTrades = trades.filter((trade) => {
      const conf = confidenceMap.get(trade.toLowerCase());
      return conf === undefined ? true : conf >= 0.5;
    });

    if (trades.length > finalTrades.length) {
      const lowConf = trades.filter((t) => !finalTrades.includes(t));
      this.logger.warn(`Dropped low-confidence trades (<0.5): ${lowConf.join(', ')}`);
    }

    const nextQ = this.filterRepeatedQuestions(
      this.toStringArray((parsedObject as Record<string, unknown> | null)?.nextQuestions),
      [],
    ).slice(0, 1);
    // Safety net: if AI produced no question AND hasn't reached high confidence, inject a seed.
    // Only skip the seed when the user explicitly said "no" or confidence is already high.
    let finalNextQuestions = nextQ;
    let injectedOptions: Array<{ label: string; value: string }> | undefined;
    const isUserSayingNo = /^no$/i.test(prompt.trim());
    const confidenceHigh = typeof (parsedObject as Record<string, unknown> | null)?.overallConfidence === 'number'
      && (parsedObject as Record<string, unknown>).overallConfidence as number >= 0.85;
    if (finalNextQuestions.length === 0 && !isUserSayingNo && !confidenceHigh) {
      const trade = finalTrades[0]?.toLowerCase() || '';
      if (trade.includes('air condition') || trade.includes('ac') || trade.includes('hvac')) {
        finalNextQuestions = ['Can you tell me a bit more about the AC work needed?'];
        injectedOptions = [{ label: 'Installation', value: 'installation' }, { label: 'Repair or service', value: 'repair' }, { label: 'Maintenance', value: 'maintenance' }, { label: 'Not sure', value: 'not sure' }];
      } else if (trade.includes('plumb')) {
        finalNextQuestions = ['Can you tell me a bit more about the plumbing work?'];
        injectedOptions = [{ label: 'New installation', value: 'new install' }, { label: 'Leak or repair', value: 'repair' }, { label: 'Upgrade or change', value: 'upgrade' }, { label: 'Not sure', value: 'not sure' }];
      } else if (trade.includes('electric')) {
        finalNextQuestions = ['Can you tell me a bit more about the electrical work needed?'];
        injectedOptions = [{ label: 'New installation', value: 'new install' }, { label: 'Repair or fault', value: 'repair' }, { label: 'Upgrade or change', value: 'upgrade' }, { label: 'Not sure', value: 'not sure' }];
      } else {
        finalNextQuestions = ['Is there anything else you can tell me about the work needed?'];
        injectedOptions = [{ label: 'No', value: 'no' }];
      }
    }

    // SHELVED: size/area question filter — kept for future reference
    // if (finalNextQuestions.length > 0) { ... }

    // When user says "no" to a wrap-up, strip AI-generated summary to prevent
    // "then said no" from being treated as exclusion of prior facts
    const sanitizedParsed = isUserSayingNo
      ? { ...(parsedObject || {}), summary: conversationalText, title: undefined }
      : (parsedObject || {});

    const responseParsedOutput: Record<string, unknown> = {
      ...sanitizedParsed,
      conversationalText,
      trades: finalTrades,
      nextQuestions: finalNextQuestions,
      ...(injectedOptions ? { options: injectedOptions } : {}),
      followUpQuestions: this.filterRepeatedQuestions(
        this.toStringArray((parsedObject as Record<string, unknown> | null)?.followUpQuestions),
        [],
      ).slice(0, 1),
    };

    // Safety net: if AI produced a question but no valid options, generate them
    if (!injectedOptions && finalNextQuestions.length > 0) {
      const aiOptions = parsedObject?.options;
      const hasValidOptions = Array.isArray(aiOptions) && aiOptions.length > 0 &&
        aiOptions.some((o: unknown) => {
          const obj = o as Record<string, unknown>;
          return typeof obj?.label === 'string' && typeof obj?.value === 'string';
        });
      if (!hasValidOptions) {
        const q = finalNextQuestions[0];
        const opts = this.generateFallbackOptions(q);
        if (opts) {
          responseParsedOutput.options = opts;
        }
      }
    }

    // Log conversation turn with the enriched output the user actually sees
    const sessionId = this.sanitizeSessionId(context?.sessionId);
    if (sessionId && baseResponse.intakeId) {
      try {
        await this.logConversationTurn({
          sessionId,
          intakeId: baseResponse.intakeId,
          prompt,
          parsedOutput: responseParsedOutput,
          requestId: baseResponse.requestId,
        });
      } catch (logErr) {
        this.logger.warn(`Conversation log failed in previewConversationalRequirements: ${(logErr as Error).message}`);
      }
    }

    return {
      ...baseResponse,
      conversationalText,
      parsedOutput: responseParsedOutput,
      trades: finalTrades,
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

  // ── Admin: AI Conversation Log CRUD ──

  async listConversationLogs(params: {
    projectId?: string;
    sessionId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};
    if (params.projectId) where.projectId = params.projectId;
    if (params.sessionId) where.sessionId = params.sessionId;

    const [logs, total] = await Promise.all([
      this.prisma.aiConversationLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        select: {
          id: true,
          sessionId: true,
          turn: true,
          role: true,
          projectId: true,
          aiIntakeId: true,
          prompt: true,
          userResponse: true,
          safetyJson: true,
          metadata: true,
          createdAt: true,
        },
      }),
      (this.prisma as any).aiConversationLog.count({ where }),
    ]);

    return { logs, total, skip: params.skip ?? 0, take: params.take ?? 50 };
  }

  async deleteConversationLog(id: string) {
    const log = await this.prisma.aiConversationLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Conversation log not found');
    await this.prisma.aiConversationLog.delete({ where: { id } });
    return { success: true, id };
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
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
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
            const pt = (professional?.professionType || '').toLowerCase();
            if (pt !== 'company' && pt !== 'contractor') return false;
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
