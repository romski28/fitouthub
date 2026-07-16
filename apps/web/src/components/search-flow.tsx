'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { matchIntent, type IntentResult } from '@/lib/intent-matcher';
import SearchBox from '@/components/search-box';
import ChatImageUploader from '@/components/chat-image-uploader';
import { SearchHelpModal } from '@/components/search-help-modal';
import { AssistRequestModal, type AssistRequestModalSubmit } from '@/components/assist-request-modal';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { API_BASE_URL } from '@/config/api';
import { AI_STATE_CLEAR_EVENT, clearAiClientState } from '@/lib/client-session';
import { buildStructuredChatEventMessage } from '@/lib/chat-event-parser';
import { matchMultipleServices } from '@/lib/service-matcher';
import { writeCreateProjectDraftSafely } from '@/lib/draft-storage';
import { setCreateProjectDraftHandoff, setProjectDescriptionHandoff } from '@/lib/create-project-handoff';

interface IntentModalProps {
  intent: IntentResult | null;
  onClose: () => void;
  matchCount: number | null;
  countLoading: boolean;
  isLoggedIn: boolean | undefined;
  openJoinModal: () => void;
}

// Full structured fields from AI response
interface AiStructured {
  intakeId: string | null;
  projectScale: 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null;
  title: string | null;
  trades: string[];
  locationPrimary: string | null;
  locationSecondary: string | null;
  summary: string | null;
  scope: string | null;
  propertyType: string | null;
  size: { value: number | null; unit: string | null; rawText: string | null } | null;
  budget: { currency: string | null; min: number | null; max: number | null; rawText: string | null; confidence: number } | null;
  timeline: { durationText: string | null; startText: string | null } | null;
  keyFacts: string[];
  nextQuestions: string[];
  assumptions: string[];
  risks: string[];
  safetyAssessment: {
    riskLevel: string;
    isDangerous: boolean;
    concerns: string[];
    temporaryMitigations: string[];
    shouldEscalateEmergency: boolean;
    emergencyReason: string | null;
    disclaimer: string | null;
  } | null;
  overallConfidence: number | null;
  coveredTopics?: string[];
}

const normalizeTradeList = (...inputs: unknown[]): string[] => {
  const canonicalizeTrade = (value: string): { key: string; label: string } => {
    const trimmed = value.trim();
    const lowered = trimmed.toLowerCase();
    const normalized = lowered
      .replace(/[&/,+]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Collapse common woodworking synonyms to a single canonical trade.
    if (
      /\b(carpenter|carpentry|joiner|joinery)\b/.test(normalized)
    ) {
      return { key: 'carpenter', label: 'Carpenter' };
    }

    return { key: normalized || lowered, label: trimmed };
  };

  const seen = new Set<string>();
  const result: string[] = [];

  for (const input of inputs) {
    if (!Array.isArray(input)) continue;

    for (const item of input) {
      if (typeof item !== 'string') continue;
      const cleaned = item.trim();
      if (!cleaned) continue;
      const canonical = canonicalizeTrade(cleaned);
      const key = canonical.key;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(canonical.label);
    }
  }

  return result;
};

const normalizeQuestionList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const isLocationFollowUpQuestion = (question: string): boolean => {
  const normalized = question.toLowerCase();
  // Only filter questions actually asking for location — don't filter every mention of 'area' or 'building'
  return /(which\s+(district|area|region|location)|what\s+(district|area|region|location)|where\s+(is|are|in)\s+(the|your|this)|what\s+is\s+the\s+address|postal\s*code|zip\s*code|neighbourhood|hong\s*kong\s+island|kowloon|new\s*territories)/i.test(normalized);
};

const sanitizeFollowUpQuestions = (questions: string[]): string[] =>
  questions.filter((question) => !isLocationFollowUpQuestion(question));

const extractFollowUpQuestionsFromOutput = (rawOutput: string | null | undefined): string[] => {
  if (typeof rawOutput !== 'string') return [];
  const trimmed = rawOutput.trim();
  if (!trimmed.startsWith('{')) return [];

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const parsedOutput =
      parsed.parsedOutput && typeof parsed.parsedOutput === 'object' && !Array.isArray(parsed.parsedOutput)
        ? (parsed.parsedOutput as Record<string, unknown>)
        : null;
    const contractDocumentation =
      parsed.contractDocumentation && typeof parsed.contractDocumentation === 'object' && !Array.isArray(parsed.contractDocumentation)
        ? (parsed.contractDocumentation as Record<string, unknown>)
        : null;

    return sanitizeFollowUpQuestions(Array.from(
      new Set([
        ...normalizeQuestionList(parsed.nextQuestions),
        ...normalizeQuestionList(parsed.followUpQuestions),
        ...normalizeQuestionList(parsed.missingInfo),
        ...normalizeQuestionList(parsedOutput?.nextQuestions),
        ...normalizeQuestionList(parsedOutput?.followUpQuestions),
        ...normalizeQuestionList(parsedOutput?.missingInfo),
        ...normalizeQuestionList(contractDocumentation?.nextQuestions),
        ...normalizeQuestionList(contractDocumentation?.followUpQuestions),
        ...normalizeQuestionList(contractDocumentation?.missingInfo),
      ]),
    ));
  } catch {
    return [];
  }
};

const extractQuestionSentences = (input: string | null | undefined, maxItems = 4): string[] => {
  if (typeof input !== 'string' || input.trim().length === 0) return [];

  const candidates = input
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=\?)\s+/))
    .map((item) => item.replace(/^[\-\d\.)\s]+/, '').trim())
    .filter((item) => item.length > 0 && item.includes('?'))
    .map((item) => (item.endsWith('?') ? item : `${item.slice(0, 220).trim()}?`))
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12 && item.length <= 220);

  return Array.from(new Set(candidates)).slice(0, maxItems);
};

function ThinkingIndicator() {
  const phases = ['Reading your request', 'Mapping trades and location', 'Structuring project requirements'];
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const phaseInterval = window.setInterval(() => {
      setPhaseIndex((current) => (current + 1) % phases.length);
    }, 1400);
    const timerInterval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => {
      window.clearInterval(phaseInterval);
      window.clearInterval(timerInterval);
    };
  }, [phases.length]);

  return (
    <div className="rounded-lg border border-slate-200 bg-amber-50 p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex items-end gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-emerald-800">MIMO is thinking...</p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {elapsedSeconds}s
            </span>
          </div>
          <p className="text-xs text-slate-500 transition-opacity duration-200">{phases[phaseIndex]}</p>
        </div>
      </div>
    </div>
  );
}

// Human-readable summary card
function AiHumanView({ s, matchCount, matchLoading, isLoggedIn }: {
  s: AiStructured;
  matchCount: number | null;
  matchLoading: boolean;
  isLoggedIn: boolean | undefined;
}) {
  const t = useTranslations('home.searchFlow');

  const tradeLabel = (() => {
    if (s.trades.length === 0) return null;
    if (s.trades.length === 1) return s.trades[0];
    return `${s.trades[0]} + ${s.trades.length - 1} other${s.trades.length > 2 ? 's' : ''}`;
  })();

  const locationLabel = [s.locationSecondary, s.locationPrimary].filter(Boolean).join(', ') || null;

  const budgetLabel = (() => {
    if (!s.budget) return null;
    const { currency, min, max, rawText } = s.budget;
    if (rawText && !min && !max) return rawText;
    const cur = currency && currency !== 'unknown' ? currency : 'HKD';
    if (min && max && min !== max) return `${cur} ${min.toLocaleString()} – ${max.toLocaleString()}`;
    if (min) return `${cur} ${min.toLocaleString()}`;
    return null;
  })();

  const timelineLabel = (() => {
    if (!s.timeline) return null;
    const parts = [s.timeline.durationText, s.timeline.startText].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  })();

  const countMsg = (() => {
    if (matchCount === null || matchLoading) return null;
    if (matchCount === 0) return t('anonMatchNone');
    if (s.trades.length > 0 && s.locationPrimary)
      return t('anonMatchFoundInLocation', { count: matchCount, trade: s.trades[0], location: s.locationPrimary });
    if (s.trades.length > 0)
      return t('anonMatchFoundNoLocation', { count: matchCount, trade: s.trades[0] });
    if (s.locationPrimary)
      return t('anonMatchFoundNoTrade', { count: matchCount, location: s.locationPrimary });
    return t('anonMatchFoundNoBoth');
  })();

  return (
    <div className="rounded-lg border border-emerald-200 bg-amber-50 p-4 space-y-3 text-sm">
      {/* Title */}
      {s.title && (
        <h3 className="font-bold text-slate-900 text-base leading-tight">{s.title}</h3>
      )}

      {/* Trade + location tagline */}
      {(tradeLabel || locationLabel) && (
        <p className="text-emerald-700 font-semibold">
          Looks like you need{tradeLabel ? ` a ${tradeLabel}` : ' professional help'}
          {locationLabel ? ` in ${locationLabel}` : ''}
        </p>
      )}

      {/* Scope */}
      {(s.scope || s.summary) && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Scope</p>
          <p className="text-slate-700 leading-relaxed">{s.scope || s.summary}</p>
        </div>
      )}

      {/* Chips row */}
      {(s.propertyType || s.size?.rawText || budgetLabel || timelineLabel) && (
        <div className="flex flex-wrap gap-1.5">
          {s.propertyType && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 capitalize">
              🏠 {s.propertyType}
            </span>
          )}
          {s.size?.rawText && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              📐 {s.size.rawText}
            </span>
          )}
          {budgetLabel && (
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
              💰 {budgetLabel}
            </span>
          )}
          {timelineLabel && (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
              ⏱ {timelineLabel}
            </span>
          )}
        </div>
      )}

      {/* Key facts */}
      {s.keyFacts.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Key facts</p>
          <ul className="space-y-0.5">
            {s.keyFacts.slice(0, 4).map((fact, i) => (
              <li key={i} className="text-slate-600 flex gap-1.5"><span className="text-emerald-500">•</span>{fact}</li>
            ))}
          </ul>
        </div>
      )}

      {s.safetyAssessment && (
        s.safetyAssessment.isDangerous ||
        s.safetyAssessment.concerns.length > 0 ||
        s.safetyAssessment.riskLevel === 'medium' ||
        s.safetyAssessment.riskLevel === 'high' ||
        s.safetyAssessment.riskLevel === 'critical'
      ) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1">Safety flag</p>
          <p className="text-sm font-semibold text-amber-900 capitalize">Risk: {s.safetyAssessment.riskLevel}</p>
          {s.safetyAssessment.emergencyReason && (
            <p className="text-sm text-amber-900 mt-1">{s.safetyAssessment.emergencyReason}</p>
          )}
          {s.safetyAssessment.temporaryMitigations.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {s.safetyAssessment.temporaryMitigations.slice(0, 3).map((item, index) => (
                <li key={`mitigation-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>
              ))}
            </ul>
          )}
          {s.safetyAssessment.disclaimer && (
            <p className="text-xs text-amber-800 mt-2">{s.safetyAssessment.disclaimer}</p>
          )}
        </div>
      )}

      {/* Professional count for anonymous users */}
      {isLoggedIn !== true && countMsg && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5">
          <p className="font-semibold text-emerald-800">{countMsg}</p>
          {(matchCount ?? 0) > 0 && (
            <p className="text-emerald-700 mt-1">{t('anonRegisterPrompt')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Conversational view for anonymous users
function AiConversationalView({ trades, onSequenceStateChange, onRemoveTrade }: {
  trades: string[];
  onSequenceStateChange?: (done: boolean) => void;
  onRemoveTrade?: (trade: string) => void;
}) {

  useEffect(() => {
    if (!onSequenceStateChange) return;

    // Trades appear immediately, CTA follows after a short delay
    const timeoutId = window.setTimeout(() => {
      onSequenceStateChange(true);
    }, 600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onSequenceStateChange]);

  return (
    <div className="space-y-3 text-sm">
      {trades.length > 0 && (
        <div id="ai-trade-suggestions" className="space-y-2 text-center">
          <p className="text-base font-semibold text-slate-700">Looks like you need a...</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {trades.map((trade) => (
              <span key={trade} className="inline-flex items-center gap-2 rounded-full border border-[#F5EEDE] bg-[#F97362] px-3 py-1 text-base font-semibold text-[#F5EEDE]">
                <span>{trade}</span>
                {trades.length > 1 && onRemoveTrade && (
                  <button
                    type="button"
                    aria-label={`Remove ${trade}`}
                    onClick={() => onRemoveTrade(trade)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#F5EEDE]/70 bg-white/20 text-sm leading-none text-[#F5EEDE] transition hover:bg-white/35"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {trades.length > 1 && onRemoveTrade && (
            <p className="text-xs text-slate-400 mt-1">Not quite right? AI can be eager — tap × to remove trades you don&apos;t need.</p>
          )}
        </div>
      )}


    </div>
  );
}

function IntentModal({ intent, onClose, matchCount, countLoading, isLoggedIn, openJoinModal }: IntentModalProps) {
  const router = useRouter();
  const t = useTranslations('home.searchFlow');
  const [isNavigating, setIsNavigating] = useState(false);

  if (!intent || intent.confidence === 0) return null;

  const isAnonProfFind = isLoggedIn !== true && intent.action === 'find-professional';

  const handleProceed = () => {
    setIsNavigating(true);
    if (intent.metadata.professionType || intent.metadata.location || intent.metadata.description) {
      sessionStorage.setItem(
        'intentData',
        JSON.stringify({
          professionType: intent.metadata.professionType,
          location: intent.metadata.location,
          description: intent.metadata.description,
        })
      );
    }
    router.push(intent.route);
  };

  const buildCountMessage = () => {
    if (countLoading) return null;
    const trade = intent.metadata.professionType ?? null;
    const location = intent.metadata.location ?? null;
    if (matchCount === null) return null;
    if (matchCount === 0) return t('anonMatchNone');
    if (trade && location) return t('anonMatchFoundInLocation', { count: matchCount, trade, location });
    if (trade && !location) return t('anonMatchFoundNoLocation', { count: matchCount, trade });
    if (!trade && location) return t('anonMatchFoundNoTrade', { count: matchCount, location });
    return t('anonMatchFoundNoBoth');
  };

  const countMessage = buildCountMessage();

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in duration-200">
        <div className="text-5xl text-center">
          {intent.action === 'find-professional' && '🔍'}
          {intent.action === 'join' && '⭐'}
          {intent.action === 'manage-projects' && '📋'}
          {intent.action === 'unknown' && '🤔'}
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">{intent.metadata.displayText}</h2>
          {isAnonProfFind ? (
            <div className="space-y-2">
              {countLoading ? (
                <p className="text-sm text-slate-500">{t('loading')}</p>
              ) : countMessage ? (
                <>
                  <p className="text-sm font-semibold text-slate-800">{countMessage}</p>
                  {(matchCount ?? 0) > 0 && (
                    <p className="text-sm text-slate-600">{t('anonRegisterPrompt')}</p>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {intent.confidence === 1 || intent.confidence > 0.9 ? t('readyToProceed') : t('isThisRight')}
            </p>
          )}
        </div>
        {!isAnonProfFind && (intent.metadata.professionType || intent.metadata.location) && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
            {intent.metadata.professionType && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600">Professional Type:</span>
                <span className="font-semibold text-slate-900 capitalize">{intent.metadata.professionType}</span>
              </div>
            )}
            {intent.metadata.location && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600">Location:</span>
                <span className="font-semibold text-slate-900 capitalize">{intent.metadata.location}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition" disabled={isNavigating}>
            {t('back')}
          </button>
          {isAnonProfFind ? (
            <button onClick={() => { onClose(); openJoinModal(); }} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition">
              {t('anonRegisterCta')}
            </button>
          ) : (
            <button onClick={handleProceed} disabled={isNavigating} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
              {isNavigating ? t('loading') : t('letsGo')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchFlow({ autoFocusPrompt = false, resultsPortalId, resetAiSession = false, onAiLoadingChange, initialPrompt, initialImages, sourceMode }: { autoFocusPrompt?: boolean; resultsPortalId?: string; resetAiSession?: boolean; onAiLoadingChange?: (isLoading: boolean) => void; initialPrompt?: string; initialImages?: File[]; sourceMode?: 'photos' | 'words' }) {
  const AI_ASSIST_DRAFT_STORAGE_KEY = 'aiPendingAssistDraft';
  const MAX_AI_ROUNDS = 2;
  const AI_SESSION_STORAGE_KEY = 'aiSandboxSessionId';
  const AI_KEEP_CONVERSATION_PREF_KEY = 'aiKeepConversationOnRefresh';
  const ENABLE_FOLLOW_UP_COMPOSER = false; // gated — set to true to re-enable
  const deepSeekSandboxEnabled = process.env.NEXT_PUBLIC_ENABLE_DEEPSEEK_SANDBOX !== 'false';
  const qwenVisionEnabled = process.env.NEXT_PUBLIC_QWEN_VISION_ENABLED !== 'false';
  const router = useRouter();
  const t = useTranslations('home.searchFlow');
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [keepConversationOnRefresh, setKeepConversationOnRefresh] = useState(false);
  const [searchMode, setSearchMode] = useState<'legacy' | 'ai'>(deepSeekSandboxEnabled ? 'ai' : 'legacy');
  const [aiViewMode, setAiViewMode] = useState<'human' | 'json'>('human');
  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(!!(initialImages?.length));
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{ model: string; durationMs: number; totalTokens: number | null } | null>(null);
  const [aiStructured, setAiStructured] = useState<AiStructured | null>(null);
  const [activeTrades, setActiveTrades] = useState<string[]>([]);
  const [initialAiPrompt, setInitialAiPrompt] = useState<string | null>(null);
  const [aiPromptHistory, setAiPromptHistory] = useState<string[]>([]);
  const [initialAiImageUrls, setInitialAiImageUrls] = useState<string[]>([]);
  const [aiConversationalText, setAiConversationalText] = useState<string | null>(null);
  const [aiDebug, setAiDebug] = useState<{
    apiPath: string;
    modeRequested: 'structured' | 'conversational' | null;
    isLoggedInAtRequest: boolean | undefined;
    responseHasConversationalText: boolean;
    parsedOutputHasConversationalText: boolean;
    conversationalTextLength: number;
  } | null>(null);
  const [aiMatchCount, setAiMatchCount] = useState<number | null>(null);
  const [aiCountLoading, setAiCountLoading] = useState(false);
  const [aiFullCoverageCompanyCount, setAiFullCoverageCompanyCount] = useState(0);
  const [aiSpecialistCount, setAiSpecialistCount] = useState(0);
  const [aiRoundCount, setAiRoundCount] = useState(0);
  const [aiRoundNotice, setAiRoundNotice] = useState<string | null>(null);
  const [isConversationSequenceComplete, setIsConversationSequenceComplete] = useState(false);
  const [autoRedirectCountdown, setAutoRedirectCountdown] = useState<number | null>(null);
  const [promptCharCount, setPromptCharCount] = useState(0);
  const [searchBoxClearKey, setSearchBoxClearKey] = useState(0);
  const hasClearedForgottenPromptRef = useRef(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<{ ok: boolean; status: string } | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [promptImages, setPromptImages] = useState<File[]>(initialImages || []);
  const [promptUploaderClearKey, setPromptUploaderClearKey] = useState(0);
  const [visionQuotaLoading, setVisionQuotaLoading] = useState(false);
  const [visionQuota, setVisionQuota] = useState<{
    actor: 'visitor' | 'client';
    maxImagesPerPrompt: number;
    maxImagesPerDay: number;
    usedToday: number;
    remainingToday: number;
    resetAt: string;
    canUseVision: boolean;
  } | null>(null);
  const [visionQuotaError, setVisionQuotaError] = useState<string | null>(null);
  const [visionProvider, setVisionProvider] = useState<'deepseek' | 'qwen'>('deepseek');
  const [visionModel, setVisionModel] = useState('deepseek-v4-pro');
  const [visionImageUrl, setVisionImageUrl] = useState('https://picsum.photos/id/1062/1200/800');
  const lastVisionQuotaFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onAiLoadingChange?.(aiLoading);
  }, [aiLoading, onAiLoadingChange]);

  // Photo path: auto-submit when images are pre-loaded from intake
  const photoAutoSubmitRef = useRef(false);
  useEffect(() => {
    if (
      initialImages &&
      initialImages.length > 0 &&
      !initialPrompt &&
      !photoAutoSubmitRef.current &&
      deepSeekSandboxEnabled
    ) {
      photoAutoSubmitRef.current = true;
      const prompt = 'Analyze these renovation photos. What do you see? What rooms, condition, and trades might be needed?';

      // Inline the submission to avoid any state dependency issues
      (async () => {
        try {
          setAiLoading(true);
          setAiError(null);
          setAiOutput(null);
          setAiMeta(null);
          setAiStructured(null);
          setActiveTrades([]);
          setAiConversationalText(null);
          setAiDebug(null);
          setIsConversationSequenceComplete(false);
          setAiRoundNotice(null);

          let urls: string[] = [];
          if (!isAdminTester && initialImages.length > 0) {
            try {
              urls = await uploadPromptImages(initialImages);
            } catch (uploadErr) {
              setAiLoading(false);
              setAiError((uploadErr as Error).message || 'Failed to upload images');
              return;
            }
          }

          setIntent(null);
          setMatchCount(null);
          setInitialAiPrompt(prompt);
          setAiPromptHistory([prompt]);
          setInitialAiImageUrls(urls);

          runSandbox(prompt, urls);
        } catch (err) {
          setAiLoading(false);
          setAiError((err as Error).message || 'AI request failed');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [visionResult, setVisionResult] = useState<{
    ok: boolean;
    provider?: 'deepseek' | 'qwen';
    statusCode?: number;
    requestedModel?: string;
    model?: string;
    durationMs?: number;
    contentPreview?: string | null;
    providerError?: string | null;
    formatUsed?: string | null;
    attempts?: Array<{ format: string; statusCode: number; providerError: string }>;
    inlineImagePrepared?: boolean;
    inlineImageError?: string | null;
    message?: string;
  } | null>(null);
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadMobile, setLeadMobile] = useState('');
  const [showAssistModal, setShowAssistModal] = useState(false);
  const [assistSubmitting, setAssistSubmitting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const { isLoggedIn, userLocation, user, accessToken, preferredLanguage } = useAuth();
  const { openLoginModal, openJoinModal } = useAuthModalControl();
  const isAdminTester = user?.role === 'admin';
  const visionQuotaScopeKey = user?.role === 'client' && user?.id
    ? `client:${user.id}`
    : aiSessionId
      ? `visitor:${aiSessionId}`
      : null;
  const promptImageLimit = qwenVisionEnabled
    ? (visionQuota?.maxImagesPerPrompt ?? ((isLoggedIn && user?.role === 'client') ? 3 : 1))
    : 5;

  // Portal support: render AI results panel into an external DOM node
  const [portalEl, setPortalEl] = useState<Element | null>(null);
  useEffect(() => {
    if (resultsPortalId) {
      const el = document.getElementById(resultsPortalId);
      setPortalEl(el);
    }
  }, [resultsPortalId]);

  const clearAiResponseState = () => {
    setAiLoading(false);
    setAiError(null);
    setAiOutput(null);
    setAiMeta(null);
    setAiStructured(null);
    setActiveTrades([]);
    setInitialAiPrompt(null);
    setAiPromptHistory([]);
    setInitialAiImageUrls([]);
    setAiConversationalText(null);
    setAiMatchCount(null);
    setAiCountLoading(false);
    setAiFullCoverageCompanyCount(0);
    setAiSpecialistCount(0);
    setAiRoundCount(0);
    setAiRoundNotice(null);
    setIsConversationSequenceComplete(false);
    hasClearedForgottenPromptRef.current = false;
    setPromptImages([]);
    setPromptUploaderClearKey((key) => key + 1);
    setLeadName('');
    setLeadEmail('');
    setLeadMobile('');
    setShowAssistModal(false);
    setAssistSubmitting(false);
    setAssistError(null);
  };

  const clearPendingAssistDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(AI_ASSIST_DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  }, []);

  const buildAiAssistProjectPayload = useCallback(() => {
    if (!aiStructured) return null;
    const selectedTrades = activeTrades.length > 0 ? activeTrades : aiStructured.trades;
    const baseSummary = (aiStructured.summary || aiStructured.scope || '').trim();
    const assumptions = (aiStructured.assumptions || []).filter((item) => item && item.trim().length > 0);
    const notes = [
      baseSummary ? `Summary:\n${baseSummary}` : '',
      assumptions.length > 0 ? `Assumptions:\n${assumptions.map((item) => `- ${item}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    const userFullName = [user?.firstName, user?.surname].filter(Boolean).join(' ').trim();
    const clientName = userFullName || user?.nickname || user?.email || 'Client';

    return {
      projectName: (aiStructured.title || aiStructured.summary || 'AI project consultation').slice(0, 180),
      clientName,
      region: aiStructured.locationPrimary || userLocation?.primary || 'Hong Kong',
      notes: (notes || baseSummary || 'AI-assisted project consultation request').slice(0, 5000),
      tradesRequired: selectedTrades,
      userPrompt: (initialAiPrompt || aiPromptHistory[0] || '').slice(0, 2000),
      projectScale: aiStructured.projectScale || undefined,
      isEmergency: ['high', 'critical'].includes(String(aiStructured.safetyAssessment?.riskLevel || '').toLowerCase()),
      onlySelectedProfessionalsCanBid: true,
      ...(aiStructured.intakeId ? { aiIntakeId: aiStructured.intakeId } : {}),
    };
  }, [aiStructured, activeTrades, user, userLocation, initialAiPrompt, aiPromptHistory]);

  const persistTempAssistDraft = useCallback(() => {
    if (typeof window === "undefined" || !aiStructured) return;
    const payload = buildAiAssistProjectPayload();
    if (!payload) return;
    const tempClientId = `temp_client_${Date.now().toString(36)}`;
    const tempDraft = {
      tempClientId,
      createdAt: new Date().toISOString(),
      source: "ai-search",
      payload,
    };

    // Quota-safe: sessionStorage has ~5MB limit; AI draft with accumulated scope may approach it
    writeStorageSafe(AI_ASSIST_DRAFT_STORAGE_KEY, JSON.stringify(tempDraft));
  }, [aiStructured, buildAiAssistProjectPayload]);

  // ── sessionStorage: just clear the temp assist draft on mount ─
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { sessionStorage.removeItem("aiPendingAssistDraft"); } catch {}
  }, []);

  // ── Quota-safe write for the temp assist draft only ─────────
  function writeStorageSafe(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        // Clear old temp drafts (never touch createProjectDraft / projectDescription — those are the wizard handoff keys)
        try { sessionStorage.removeItem("aiPendingAssistDraft"); } catch {}
        try { sessionStorage.removeItem("aiWizardHandoffPayload"); } catch {}
        try { sessionStorage.removeItem("aiAssistPayload_temp"); } catch {}
        try {
          sessionStorage.setItem(key, value);
        } catch {
          // Still full — store minimal marker so the flow doesn't crash
          try { sessionStorage.setItem(key, JSON.stringify({ _truncated: true })); } catch {}
        }
      }
    }
  }

  const persistAiWizardHandoffForAuth = useCallback(() => {
    if (!aiStructured) return false;

    const selectedTrades = activeTrades.length > 0 ? activeTrades : aiStructured.trades;
    const assumptions = (aiStructured.assumptions || [])
      .map((item) => (item || '').trim())
      .filter((item) => item.length > 0);
    const baseSummary = (
      aiStructured.scope ||
      aiStructured.summary ||
      aiConversationalText ||
      initialAiPrompt ||
      ''
    ).trim();
    const notes = [
      baseSummary ? `Summary:\n${baseSummary}` : '',
      assumptions.length > 0 ? `Assumptions:\n${assumptions.map((item) => `- ${item}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    const location = aiStructured.locationPrimary
      ? {
          primary: aiStructured.locationPrimary,
          secondary: aiStructured.locationSecondary || undefined,
        }
      : userLocation;

    const resolvedRegion = [location.secondary, location.primary]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join(', ');

    const followUpQuestions = sanitizeFollowUpQuestions(Array.from(
      new Set([
        ...normalizeQuestionList(aiStructured.nextQuestions),
        ...extractFollowUpQuestionsFromOutput(aiOutput),
      ]),
    ));

    const aiDraft = {
      initialData: {
        projectName: (aiStructured.title || aiStructured.summary || initialAiPrompt || 'AI project').slice(0, 180),
        notes: (notes || baseSummary || initialAiPrompt || '').slice(0, 5000),
        projectScale: aiStructured.projectScale || undefined,
        tradesRequired: selectedTrades,
        region: resolvedRegion,
        location,
        photoUrls: initialAiImageUrls,
        isEmergency: Boolean(
          aiStructured.safetyAssessment?.shouldEscalateEmergency ||
          aiStructured.safetyAssessment?.isDangerous ||
          ['high', 'critical'].includes(String(aiStructured.safetyAssessment?.riskLevel || '').toLowerCase()),
        ),
      },
      ...(aiStructured.intakeId ? { aiIntakeId: aiStructured.intakeId } : {}),
      followUpQuestions,
    };

    writeCreateProjectDraftSafely(aiDraft);
    setCreateProjectDraftHandoff(aiDraft);

    const projectDescriptionPayload = {
      title: aiDraft.initialData.projectName || '',
      description: aiDraft.initialData.notes || '',
      projectScale: aiDraft.initialData.projectScale,
      isEmergency: Boolean(aiDraft.initialData.isEmergency),
      profession: aiDraft.initialData.tradesRequired?.[0],
      location: aiDraft.initialData.location,
      tradesRequired: aiDraft.initialData.tradesRequired || [],
      followUpQuestions,
      safetyNotes: [
        ...(Array.isArray(aiStructured.safetyAssessment?.concerns)
          ? aiStructured.safetyAssessment.concerns.filter(Boolean) : []),
        ...(Array.isArray(aiStructured.safetyAssessment?.temporaryMitigations)
          ? aiStructured.safetyAssessment.temporaryMitigations.filter(Boolean) : []),
        ...(typeof aiStructured.safetyAssessment?.disclaimer === 'string' && aiStructured.safetyAssessment.disclaimer.trim()
          ? [aiStructured.safetyAssessment.disclaimer.trim()] : []),
      ],
      riskNotes: Array.isArray(aiStructured.risks) ? aiStructured.risks.filter(Boolean) : [],
      riskLevel: aiStructured.safetyAssessment?.riskLevel ?? null,
    };

    console.log('[PERSIST-HANDOFF] Storing AI wizard handoff:', {
      projectName: aiDraft.initialData.projectName,
      aiStructuredTitle: aiStructured?.title,
      nextQuestions: aiStructured?.nextQuestions,
      mergedFollowUpQuestions: followUpQuestions,
      payload: projectDescriptionPayload,
    });

    setProjectDescriptionHandoff(projectDescriptionPayload);
    try {
      sessionStorage.setItem('projectDescription', JSON.stringify(projectDescriptionPayload));
    } catch {
      // Ignore storage failures; createProjectDraft is primary handoff.
    }

    return true;
  }, [aiStructured, activeTrades, aiConversationalText, initialAiPrompt, initialAiImageUrls, userLocation, aiOutput]);

  const [pageExiting, setPageExiting] = useState(false);

  const handleOpenWizardRoute = useCallback((mode: 'classic' | 'ai') => {
    if (!aiStructured) return;
    const persisted = persistAiWizardHandoffForAuth();
    if (!persisted) return;
    persistTempAssistDraft();
    // Cross-fade: exit current page, then navigate
    setPageExiting(true);
    setTimeout(() => {
      router.push(`/create-project/wizard?wizard=${mode}`);
    }, 400);
  }, [aiStructured, persistAiWizardHandoffForAuth, persistTempAssistDraft, router]);

  const handleContinueToMatching = useCallback(() => {
    handleOpenWizardRoute('classic');
  }, [handleOpenWizardRoute]);

  const handleStartAiWizard = useCallback(() => {
    handleOpenWizardRoute('ai');
  }, [handleOpenWizardRoute]);

  const handleGuestJoin = useCallback(() => {
    persistAiWizardHandoffForAuth();
    try {
      sessionStorage.setItem('postLoginRedirect', '/create-project/wizard?wizard=ai');
    } catch {
      // Ignore storage failures
    }
    window.location.href = '/get-started?role=client';
  }, [persistAiWizardHandoffForAuth]);

  const handleGuestLogin = useCallback(() => {
    persistAiWizardHandoffForAuth();
    try {
      sessionStorage.setItem('postLoginRedirect', '/create-project/wizard?wizard=ai');
    } catch {
      // Ignore storage failures
    }
    openLoginModal();
  }, [openLoginModal, persistAiWizardHandoffForAuth]);

  const submitAssistFromGuest = useCallback(async (assistConfig: AssistRequestModalSubmit) => {
    if (!aiStructured) {
      throw new Error('Unable to prepare project details from AI response.');
    }
    const safeName = leadName.trim();
    const safeEmail = leadEmail.trim();
    const safeMobile = leadMobile.trim();
    if (!safeName || (!safeEmail && !safeMobile)) {
      throw new Error('Please provide your name and either email or mobile.');
    }

    const projectPayload = buildAiAssistProjectPayload();
    if (!projectPayload) {
      throw new Error('Unable to prepare project details from AI response.');
    }

    setAssistError(null);
    setAssistSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/assist-requests/ai-consultation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead: {
            name: safeName,
            email: safeEmail || undefined,
            mobile: safeMobile || undefined,
          },
          project: {
            projectName: projectPayload.projectName,
            region: projectPayload.region,
            notes: projectPayload.notes,
            tradesRequired: projectPayload.tradesRequired,
            userPrompt: projectPayload.userPrompt,
            aiIntakeId: aiStructured.intakeId || undefined,
            projectScale: aiStructured.projectScale || undefined,
            isEmergency: projectPayload.isEmergency,
          },
          assist: {
            notes: assistConfig.notes,
            contactMethod: assistConfig.contactMethod,
            requestedCallAt: assistConfig.requestedCallAt,
            requestedCallTimezone: assistConfig.requestedCallTimezone,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: 'Failed to book consultation call' }));
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      const data = await response.json().catch(() => ({}));
      setAiRoundNotice('Consultation request submitted. Sarah will follow up shortly.');
      return { caseNumber: typeof data?.caseNumber === 'string' ? data.caseNumber : undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to book consultation call';
      setAssistError(message);
      throw error;
    } finally {
      setAssistSubmitting(false);
    }
  }, [aiStructured, leadName, leadEmail, leadMobile, buildAiAssistProjectPayload]);

  const submitAssistFromAi = useCallback(async (assistConfig: AssistRequestModalSubmit) => {
    if (!accessToken || !user || !aiStructured) {
      throw new Error('Please log in before booking a consultation call.');
    }
    const projectPayload = buildAiAssistProjectPayload();
    if (!projectPayload) {
      throw new Error('Unable to prepare project details from AI response.');
    }

    setAssistError(null);
    setAssistSubmitting(true);
    try {
      const createProjectRes = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(projectPayload),
      });

      if (!createProjectRes.ok) {
        const data = await createProjectRes.json().catch(() => ({ message: 'Failed to create consultation project' }));
        throw new Error(data.message || `Server error: ${createProjectRes.status}`);
      }

      const project = await createProjectRes.json();
      if (!project?.id) {
        throw new Error('Project creation succeeded but no project ID was returned.');
      }

      const assistRes = await fetch(`${API_BASE_URL}/assist-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          userId: user.id,
          raisedBy: 'client',
          clientName: projectPayload.clientName,
          projectName: projectPayload.projectName,
          notes: assistConfig.notes,
          contactMethod: assistConfig.contactMethod,
          requestedCallAt: assistConfig.requestedCallAt,
          requestedCallTimezone: assistConfig.requestedCallTimezone,
          bookingChannel: 'ai_logged_in',
          leadLifecycleAtBooking: 'active',
          consultationDurationMin: 30,
          contactEmailSnapshot: user.email,
        }),
      });

      if (!assistRes.ok) {
        const data = await assistRes.json().catch(() => ({ message: 'Failed to request assistance' }));
        throw new Error(data.message || `Server error: ${assistRes.status}`);
      }

      try {
        sessionStorage.removeItem(AI_ASSIST_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage failures
      }

      setShowAssistModal(false);
      setAiRoundNotice(
        assistConfig.contactMethod === 'call'
          ? 'Consultation project created and 30-minute call request submitted.'
          : 'Consultation project created and assistance request submitted.',
      );
      router.push(`/projects/${project.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to book consultation call';
      setAssistError(message);
      throw error;
    } finally {
      setAssistSubmitting(false);
    }
  }, [accessToken, user, aiStructured, buildAiAssistProjectPayload, router]);

  const handleChatNowFromAssist = useCallback((payload: { notes: string; projectName?: string }) => {
    const projectPayload = buildAiAssistProjectPayload();
    const projectTitle = payload.projectName || projectPayload?.projectName || aiStructured?.title || 'AI consultation project';
    const rawPrompt = (initialAiPrompt || aiPromptHistory[0] || '').trim();
    const prompt = rawPrompt || payload.notes.trim();
    const aiResponseSource = (aiConversationalText || aiOutput || '').trim();
    const aiFirstParagraph = aiResponseSource
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .find(Boolean)
      || aiResponseSource.split('\n').map((part) => part.trim()).find(Boolean)
      || '';
    const cardSummary = [
      'MIMO was asked...',
      prompt,
      aiFirstParagraph ? `AI response: ${aiFirstParagraph}` : '',
    ].filter(Boolean).join('\n\n');

    const chatCardMessage = buildStructuredChatEventMessage({
      type: 'generic',
      icon: '💬',
      title: 'General enquiry',
      summary: cardSummary,
    });

    window.dispatchEvent(
      new CustomEvent('foh-open-chat', {
        detail: {
          context: 'project_creation',
          projectName: projectTitle,
          initialMessage: chatCardMessage,
          autoSendInitialMessage: true,
        },
      }),
    );

    setShowAssistModal(false);
  }, [buildAiAssistProjectPayload, aiStructured, initialAiPrompt, aiPromptHistory, aiConversationalText, aiOutput]);

  useEffect(() => {
    const hasReadyAiResponse = Boolean(!aiLoading && !aiError && aiOutput && aiStructured && aiConversationalText);
    if (!isLoggedIn || !accessToken || !hasReadyAiResponse || !aiStructured) return;
    try {
      const raw = sessionStorage.getItem(AI_ASSIST_DRAFT_STORAGE_KEY);
      if (!raw) return;
      setShowAssistModal(true);
    } catch {
      // Ignore storage failures
    }
  }, [isLoggedIn, accessToken, aiLoading, aiError, aiOutput, aiStructured, aiConversationalText]);

  const createAiSessionId = useCallback(() => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  ), []);

  const assignNewAiSessionId = useCallback(() => {
    const generated = createAiSessionId();
    try {
      sessionStorage.setItem(AI_SESSION_STORAGE_KEY, generated);
    } catch {
      // sessionStorage may be unavailable in strict browser modes
    }
    setAiSessionId(generated);
  }, [createAiSessionId]);

  const fetchVisionQuota = async (options?: { force?: boolean }) => {
    if (!aiSessionId) {
      console.log('[fetchVisionQuota] Skipping: no aiSessionId');
      return;
    }
    if (!visionQuotaScopeKey) {
      console.log('[fetchVisionQuota] Skipping: no quota scope key');
      return;
    }
    if (!options?.force && lastVisionQuotaFetchKeyRef.current === visionQuotaScopeKey) {
      return;
    }
    lastVisionQuotaFetchKeyRef.current = visionQuotaScopeKey;
    console.log('[fetchVisionQuota] Starting fetch with sessionId:', aiSessionId);
    setVisionQuotaLoading(true);
    setVisionQuotaError(null);
    try {
      const params = new URLSearchParams();
      params.set('sessionId', aiSessionId);
      const url = `${API_BASE_URL}/ai/sandbox/vision/quota?${params.toString()}`;
      console.log('[fetchVisionQuota] Fetching from:', url);
      const response = await fetch(url, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      console.log('[fetchVisionQuota] Response status:', response.status);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || `Quota check failed (${response.status})`);
      }
      const payload = await response.json();
      console.log('[fetchVisionQuota] Received payload:', payload);
      setVisionQuota({
        actor: payload?.actor === 'client' ? 'client' : 'visitor',
        maxImagesPerPrompt: typeof payload?.maxImagesPerPrompt === 'number' ? payload.maxImagesPerPrompt : 1,
        maxImagesPerDay: typeof payload?.maxImagesPerDay === 'number' ? payload.maxImagesPerDay : 3,
        usedToday: typeof payload?.usedToday === 'number' ? payload.usedToday : 0,
        remainingToday: typeof payload?.remainingToday === 'number' ? payload.remainingToday : 0,
        resetAt: typeof payload?.resetAt === 'string' ? payload.resetAt : '',
        canUseVision: Boolean(payload?.canUseVision),
      });
    } catch (error) {
      lastVisionQuotaFetchKeyRef.current = null;
      console.error('[fetchVisionQuota] Error:', error);
      setVisionQuota(null);
      setVisionQuotaError((error as Error).message || 'Failed to load image quota');
    } finally {
      setVisionQuotaLoading(false);
    }
  };

  // Track previous login state to detect login events
  const prevLoggedIn = useRef<boolean | undefined>(undefined);

  // After login, check for a pending post-login redirect
  useEffect(() => {
    if (prevLoggedIn.current === false && isLoggedIn === true) {
      try {
        const redirect = sessionStorage.getItem('postLoginRedirect');
        if (redirect) {
          sessionStorage.removeItem('postLoginRedirect');
          router.push(redirect);
        }
      } catch {
        // sessionStorage not available
      }
    }
    prevLoggedIn.current = isLoggedIn;
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(AI_KEEP_CONVERSATION_PREF_KEY);
      if (isAdminTester) {
        // Admin: respect stored preference
        setKeepConversationOnRefresh(stored !== '0');
      } else {
        // Non-admin: always reset on refresh
        setKeepConversationOnRefresh(false);
      }
    } catch {
      setKeepConversationOnRefresh(isAdminTester);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        AI_KEEP_CONVERSATION_PREF_KEY,
        keepConversationOnRefresh ? '1' : '0',
      );
    } catch {
      // Ignore storage failures
    }
  }, [keepConversationOnRefresh]);

  useEffect(() => {
    try {
      // If resetAiSession is true (e.g., on home page), clear all AI state and start fresh
      if (resetAiSession) {
        clearPendingAssistDraft();
        clearAiClientState();
        // Don't clear AI response state when we have initial images — the photo
        // auto-submit effect is already processing and would get wiped.
        if (!initialImages?.length) {
          clearAiResponseState();
        }
        setIntent(null);
        setMatchCount(null);
      }
      const existing = sessionStorage.getItem(AI_SESSION_STORAGE_KEY);
      if (existing && !resetAiSession && keepConversationOnRefresh) { setAiSessionId(existing); return; }
      assignNewAiSessionId();
    } catch {
      setAiSessionId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignNewAiSessionId, clearPendingAssistDraft, keepConversationOnRefresh, resetAiSession]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClearAiState = () => {
      clearAiResponseState();
      assignNewAiSessionId();
    };

    window.addEventListener(AI_STATE_CLEAR_EVENT, handleClearAiState);
    return () => window.removeEventListener(AI_STATE_CLEAR_EVENT, handleClearAiState);
  }, [assignNewAiSessionId]);

  const checkSandboxHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/ai/sandbox/health`);
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      const payload: { ok: boolean; status: string } = await response.json();
      setHealthStatus({ ok: payload.ok, status: payload.status });
    } catch (error) {
      setHealthStatus(null);
      setHealthError((error as Error).message || 'Sandbox health check failed');
    } finally {
      setHealthLoading(false);
    }
  };

  const checkVisionAccess = async () => {
    setVisionLoading(true);
    setVisionError(null);
    setVisionResult(null);
    try {
      if (!accessToken) {
        throw new Error('Admin auth token missing. Please login again.');
      }
      const response = await fetch(`${API_BASE_URL}/ai/sandbox/vision/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: visionProvider,
          model: visionModel.trim() || (visionProvider === 'qwen' ? 'qwen-vl-plus-latest' : 'deepseek-v4-pro'),
          imageUrl: visionImageUrl.trim(),
        }),
      });
      const payload = await response.json();
      setVisionResult({
        ok: Boolean(payload?.ok),
        provider:
          payload?.provider === 'qwen'
            ? 'qwen'
            : payload?.provider === 'deepseek'
              ? 'deepseek'
              : visionProvider,
        statusCode: typeof payload?.statusCode === 'number' ? payload.statusCode : undefined,
        requestedModel: typeof payload?.requestedModel === 'string' ? payload.requestedModel : undefined,
        model: typeof payload?.model === 'string' ? payload.model : undefined,
        durationMs: typeof payload?.durationMs === 'number' ? payload.durationMs : undefined,
        contentPreview: typeof payload?.contentPreview === 'string' ? payload.contentPreview : null,
        providerError: typeof payload?.providerError === 'string' ? payload.providerError : null,
        formatUsed: typeof payload?.formatUsed === 'string' ? payload.formatUsed : null,
        inlineImagePrepared: typeof payload?.inlineImagePrepared === 'boolean' ? payload.inlineImagePrepared : undefined,
        inlineImageError: typeof payload?.inlineImageError === 'string' ? payload.inlineImageError : null,
        attempts: Array.isArray(payload?.attempts)
          ? payload.attempts
              .filter((item: unknown): item is { format: string; statusCode: number; providerError: string } => {
                if (!item || typeof item !== 'object') return false;
                const row = item as Record<string, unknown>;
                return typeof row.format === 'string' && typeof row.statusCode === 'number' && typeof row.providerError === 'string';
              })
          : [],
        message: typeof payload?.message === 'string' ? payload.message : undefined,
      });
      if (!response.ok) {
        setVisionError(payload?.message || `Vision check failed (${response.status})`);
      }
    } catch (error) {
      setVisionError((error as Error).message || 'Vision check failed');
    } finally {
      setVisionLoading(false);
    }
  };

  // Fetch professional count after AI extraction (all users)
  useEffect(() => {
    if (searchMode !== 'ai' || !aiStructured) {
      setAiMatchCount(null);
      setAiFullCoverageCompanyCount(0);
      setAiSpecialistCount(0);
      return;
    }
    let cancelled = false;
    const fetchCount = async () => {
      setAiCountLoading(true);
      try {
        const params = new URLSearchParams();
        const tradesForCount = activeTrades.length > 0 ? activeTrades : aiStructured.trades;
        if (tradesForCount.length > 0) params.set('trades', tradesForCount.join(','));
        if (aiStructured.locationPrimary) params.set('location', aiStructured.locationPrimary);
        const res = await fetch(`${API_BASE_URL}/ai/professionals/count?${params.toString()}`);
        if (!res.ok) throw new Error('count fetch failed');
        const data: { count: number; fullCoverageCompanyCount?: number; specialistCount?: number } = await res.json();
        if (!cancelled) {
          setAiMatchCount(data.count);
          setAiFullCoverageCompanyCount(data.fullCoverageCompanyCount ?? 0);
          setAiSpecialistCount(data.specialistCount ?? data.count);
        }
      } catch {
        if (!cancelled) {
          setAiMatchCount(null);
          setAiFullCoverageCompanyCount(0);
          setAiSpecialistCount(0);
        }
      } finally {
        if (!cancelled) setAiCountLoading(false);
      }
    };
    fetchCount();
    return () => { cancelled = true; };
  }, [aiStructured, activeTrades, searchMode]);

  // Fetch professional count for legacy intent searches
  useEffect(() => {
    if (searchMode !== 'legacy' || !intent || intent.action !== 'find-professional') {
      setMatchCount(null);
      return;
    }
    let cancelled = false;
    const fetchCount = async () => {
      setCountLoading(true);
      try {
        const params = new URLSearchParams();
        if (intent.metadata.professionType) params.set('trade', intent.metadata.professionType);
        if (intent.metadata.location) params.set('location', intent.metadata.location);
        const res = await fetch(`${API_BASE_URL}/professionals/public/count?${params.toString()}`);
        if (!res.ok) throw new Error('count fetch failed');
        const data: { count: number } = await res.json();
        if (!cancelled) setMatchCount(data.count);
      } catch {
        if (!cancelled) setMatchCount(null);
      } finally {
        if (!cancelled) setCountLoading(false);
      }
    };
    fetchCount();
    return () => { cancelled = true; };
  }, [intent, searchMode]);

  useEffect(() => {
    if (!deepSeekSandboxEnabled || isAdminTester || !qwenVisionEnabled) return;
    fetchVisionQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionQuotaScopeKey, deepSeekSandboxEnabled, isAdminTester]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[SearchFlow] Render state:', { deepSeekSandboxEnabled, isAdminTester, visionQuotaLoading, visionQuotaError, visionQuota });
    }
  }, [visionQuota, visionQuotaLoading, visionQuotaError, deepSeekSandboxEnabled, isAdminTester]);

  const uploadPromptImages = async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const response = await fetch(`${API_BASE_URL}/uploads`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || `Image upload failed (${response.status})`);
    }

    if (!Array.isArray(payload?.urls)) {
      throw new Error('Image upload failed: invalid response');
    }

    return payload.urls.filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0);
  };

  const runSandbox = async (query: string, imageUrls: string[] = []) => {
    const threadIntakeId = aiStructured?.intakeId ?? null;

    try {
      const mode = isAdminTester ? 'structured' : 'conversational';
      const isLoggedInAtRequest = isLoggedIn;
      const apiPath = isAdminTester
        ? '/ai/sandbox/requirements'
        : '/ai/sandbox/requirements/conversational';
      const response = await fetch(`${API_BASE_URL}${apiPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          isAdminTester
            ? { prompt: query.trim(), sessionId: aiSessionId, intakeId: threadIntakeId, mode: 'structured', imageUrls, preferredLanguage, sourceMode }
            : { prompt: query.trim(), sessionId: aiSessionId, intakeId: threadIntakeId, imageUrls, preferredLanguage, sourceMode },
        ),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || `Sandbox request failed (${response.status})`);
      }

      const payload: {
        intakeId: string | null;
        output: string;
        model: string;
        durationMs: number;
        conversationalText?: string | null;
        usage?: { totalTokens?: number | null };
        contractDocumentation?: {
          nextQuestions?: string[];
          followUpQuestions?: string[];
          missingInfo?: string[];
        } | null;
        parsedOutput?: {
          projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null;
          title?: string | null;
          summary?: string | null;
          scope?: string | null;
          trades?: string[];
          location?: { primary?: string | null; secondary?: string | null; tertiary?: string | null; confidence?: number };
          project?: {
            propertyType?: string | null;
            scopeText?: string | null;
            tradesRequired?: string[];
            projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null;
            projectScaleSuggested?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3' | null;
          };
          size?: { value?: number | null; unit?: string | null; rawText?: string | null };
          budget?: { currency?: string | null; min?: number | null; max?: number | null; rawText?: string | null; confidence?: number };
          timeline?: { durationText?: string | null; startText?: string | null };
          keyFacts?: string[];
          missingInfo?: string[];
          nextQuestions?: string[];
          followUpQuestions?: string[];
          assumptions?: string[];
          risks?: string[];
          safetyAssessment?: {
            riskLevel?: string;
            isDangerous?: boolean;
            concerns?: string[];
            temporaryMitigations?: string[];
            shouldEscalateEmergency?: boolean;
            emergencyReason?: string | null;
            disclaimer?: string | null;
          };
          overallConfidence?: number | null;
          coveredTopics?: string[];
        } | null;
      } = await response.json();

      setAiOutput(payload.output || '');
      setAiMeta({ model: payload.model, durationMs: payload.durationMs, totalTokens: payload.usage?.totalTokens ?? null });
      if (payload.conversationalText) {
        setAiConversationalText(payload.conversationalText);
      }

      setAiDebug({
        apiPath,
        modeRequested: mode,
        isLoggedInAtRequest,
        responseHasConversationalText: Boolean(payload.conversationalText),
        parsedOutputHasConversationalText: Boolean(
          payload.parsedOutput &&
            typeof payload.parsedOutput === 'object' &&
            !Array.isArray(payload.parsedOutput) &&
            typeof (payload.parsedOutput as Record<string, unknown>).conversationalText === 'string' &&
            ((payload.parsedOutput as Record<string, unknown>).conversationalText as string).trim().length > 0,
        ),
        conversationalTextLength: typeof payload.conversationalText === 'string' ? payload.conversationalText.length : 0,
      });

      const p = payload.parsedOutput;
      const normalizeQuestionList = (value: unknown): string[] =>
        Array.isArray(value)
          ? value
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
          : [];

      let rawOutputQuestions: string[] = [];
      if (typeof payload.output === 'string' && payload.output.trim().startsWith('{')) {
        try {
          const rawParsed = JSON.parse(payload.output) as Record<string, unknown>;
          const rawContract =
            rawParsed.contractDocumentation &&
            typeof rawParsed.contractDocumentation === 'object' &&
            !Array.isArray(rawParsed.contractDocumentation)
              ? (rawParsed.contractDocumentation as Record<string, unknown>)
              : null;

          rawOutputQuestions = Array.from(
            new Set([
              ...normalizeQuestionList(rawParsed.nextQuestions),
              ...normalizeQuestionList(rawParsed.followUpQuestions),
              ...normalizeQuestionList(rawParsed.missingInfo),
              ...normalizeQuestionList(rawContract?.nextQuestions),
              ...normalizeQuestionList(rawContract?.followUpQuestions),
              ...normalizeQuestionList(rawContract?.missingInfo),
            ]),
          );
        } catch {
          rawOutputQuestions = [];
        }
      }

      const inferredTradesFromText = matchMultipleServices(
        [
          p?.title,
          p?.summary,
          p?.scope,
          p?.project?.scopeText,
          payload.conversationalText,
          payload.output,
        ]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .join(' ')
          .toLowerCase(),
      );
      const projectTradesRequired =
        p?.project && typeof p.project === 'object' && 'tradesRequired' in p.project
          ? (p.project as { tradesRequired?: string[] }).tradesRequired
          : [];
      const parsedTrades = normalizeTradeList(
        p?.trades,
        p?.trades && p.trades.length > 0 ? [] : inferredTradesFromText,
        projectTradesRequired,
      );
      const projectScaleFromProject =
        p?.project &&
        typeof p.project === 'object' &&
        (p.project.projectScale === 'SCALE_1' ||
          p.project.projectScale === 'SCALE_2' ||
          p.project.projectScale === 'SCALE_3')
          ? p.project.projectScale
          : null;
      const structuredFollowUpQuestions = sanitizeFollowUpQuestions(Array.from(
        new Set(
          [
            ...normalizeQuestionList(p?.nextQuestions),
            ...normalizeQuestionList(p?.followUpQuestions),
            ...normalizeQuestionList(p?.missingInfo),
            ...normalizeQuestionList(payload.contractDocumentation?.nextQuestions),
            ...normalizeQuestionList(payload.contractDocumentation?.followUpQuestions),
            ...normalizeQuestionList(payload.contractDocumentation?.missingInfo),
            ...rawOutputQuestions,
          ]
            .filter((item) => item.length > 0),
        ),
      ));
      const fallbackQuestionSentences = extractQuestionSentences(payload.conversationalText || payload.output, 4);
      const normalizedFollowUpQuestions =
        structuredFollowUpQuestions.length > 0
          ? structuredFollowUpQuestions
          : fallbackQuestionSentences;
      setAiStructured({
        intakeId: payload.intakeId ?? null,
        projectScale:
          p?.projectScale === 'SCALE_1' || p?.projectScale === 'SCALE_2' || p?.projectScale === 'SCALE_3'
            ? p.projectScale
            : projectScaleFromProject,
        title: p?.title ?? null,
        trades: parsedTrades,
        locationPrimary: p?.location?.primary ?? null,
        locationSecondary: p?.location?.secondary ?? null,
        summary: p?.summary ?? null,
        scope: p?.scope ?? p?.project?.scopeText ?? null,
        propertyType: p?.project?.propertyType ?? null,
        size: p?.size ? { value: p.size.value ?? null, unit: p.size.unit ?? null, rawText: p.size.rawText ?? null } : null,
        budget: p?.budget ? {
          currency: p.budget.currency ?? null,
          min: p.budget.min ?? null,
          max: p.budget.max ?? null,
          rawText: p.budget.rawText ?? null,
          confidence: p.budget.confidence ?? 0,
        } : null,
        timeline: p?.timeline ? { durationText: p.timeline.durationText ?? null, startText: p.timeline.startText ?? null } : null,
        keyFacts: p?.keyFacts ?? [],
        nextQuestions: normalizedFollowUpQuestions,
        assumptions: Array.isArray(p?.assumptions) ? p.assumptions.filter((item): item is string => typeof item === 'string') : [],
        risks: Array.isArray(p?.risks) ? p.risks.filter((item): item is string => typeof item === 'string') : [],
        safetyAssessment: p?.safetyAssessment ? {
          riskLevel: p.safetyAssessment.riskLevel ?? 'none',
          isDangerous: p.safetyAssessment.isDangerous ?? false,
          concerns: Array.isArray(p.safetyAssessment.concerns) ? p.safetyAssessment.concerns.filter((item): item is string => typeof item === 'string') : [],
          temporaryMitigations: Array.isArray(p.safetyAssessment.temporaryMitigations) ? p.safetyAssessment.temporaryMitigations.filter((item): item is string => typeof item === 'string') : [],
          shouldEscalateEmergency: p.safetyAssessment.shouldEscalateEmergency ?? false,
          emergencyReason: p.safetyAssessment.emergencyReason ?? null,
          disclaimer: p.safetyAssessment.disclaimer ?? null,
        } : null,
        overallConfidence: p?.overallConfidence ?? null,
        coveredTopics: Array.isArray(p?.coveredTopics) ? p.coveredTopics.filter((item): item is string => typeof item === 'string') : [],
      });
      setActiveTrades(parsedTrades);

      setAiRoundCount((current) => Math.min(current + 1, MAX_AI_ROUNDS));
      if (qwenVisionEnabled && imageUrls.length > 0) {
        setPromptImages([]);
        setPromptUploaderClearKey((key) => key + 1);
        fetchVisionQuota({ force: true });
      }

    } catch (error) {
      setAiError((error as Error).message || 'DeepSeek sandbox is unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (searchMode === 'ai' && deepSeekSandboxEnabled) {
      if (aiRoundCount >= MAX_AI_ROUNDS) {
        setAiRoundNotice('You can make one follow-up tweak only. Clear and start again for a new request.');
        return;
      }

      // Show thinking panel immediately on submit
      clearPendingAssistDraft();
      setShowAssistModal(false);
      setAiLoading(true);
      setAiError(null);
      setAiOutput(null);
      setAiMeta(null);
      setAiStructured(null);
      setActiveTrades([]);
      setAiConversationalText(null);
      setAiDebug(null);
      setIsConversationSequenceComplete(false);
      setAiRoundNotice(null);
      hasClearedForgottenPromptRef.current = false;

      if (!isAdminTester && promptImages.length > 0) {
        // Only enforce quota when Qwen vision is active
        if (qwenVisionEnabled) {
          const maxPerPrompt = visionQuota?.maxImagesPerPrompt ?? promptImageLimit;
          const remainingToday = visionQuota?.remainingToday ?? maxPerPrompt;
          if (promptImages.length > maxPerPrompt) {
            setAiLoading(false);
            setAiError(`You can attach up to ${maxPerPrompt} image${maxPerPrompt > 1 ? 's' : ''} per prompt.`);
            return;
          }
          if (promptImages.length > remainingToday) {
            setAiLoading(false);
            setAiError(`Daily image quota exceeded. ${remainingToday} image${remainingToday === 1 ? '' : 's'} remaining today.`);
            return;
          }
        }
      }

      let imageUrls: string[] = [];
      if (!isAdminTester && promptImages.length > 0) {
        try {
          imageUrls = await uploadPromptImages(promptImages);
        } catch (error) {
          setAiLoading(false);
          setAiError((error as Error).message || 'Failed to upload images');
          return;
        }
      }
      setIntent(null);
      setMatchCount(null);
      if (aiRoundCount === 0) {
        setInitialAiPrompt(trimmed);
        setAiPromptHistory([trimmed]);
        setInitialAiImageUrls(imageUrls);
      } else {
        setAiPromptHistory((current) => [...current, trimmed]);
      }
      runSandbox(trimmed, qwenVisionEnabled ? imageUrls : []);
      return;
    }
    setAiOutput(null);
    setAiError(null);
    setAiMeta(null);
    const result = matchIntent(trimmed);
    setMatchCount(null);
    setIntent(result);
  };

  const handleClearSearch = () => {
    clearPendingAssistDraft();
    clearAiClientState();
    clearAiResponseState();
    setIntent(null);
    setMatchCount(null);
  };

  const handleResetConversation = () => {
    clearPendingAssistDraft();
    clearAiClientState();
    clearAiResponseState();
    setIntent(null);
    setMatchCount(null);
    setSearchBoxClearKey((k) => k + 1);
    assignNewAiSessionId();
    setAiRoundNotice('Conversation reset. Your next prompt will start fresh.');
  };

  const handleSequenceStateChange = useCallback((complete: boolean) => {
    setIsConversationSequenceComplete(complete);
    if (aiRoundCount !== 1 || !complete || hasClearedForgottenPromptRef.current) return;
    hasClearedForgottenPromptRef.current = true;
    setSearchBoxClearKey((k) => k + 1);
  }, [aiRoundCount]);

  const hasAiResponse = Boolean(!aiLoading && !aiError && aiOutput && aiStructured && aiConversationalText);

  // ── Auto-redirect logged-in users to wizard when AI response is complete ──
  const handleStartAiWizardRef = useRef(handleStartAiWizard);
  handleStartAiWizardRef.current = handleStartAiWizard;

  useEffect(() => {
    if (!hasAiResponse || !isConversationSequenceComplete || isLoggedIn !== true) {
      setAutoRedirectCountdown(null);
      return;
    }
    setAutoRedirectCountdown(4);
    const interval = setInterval(() => {
      setAutoRedirectCountdown((c) => {
        if (c === null || c <= 1) {
          clearInterval(interval);
          if (c === 1) handleStartAiWizardRef.current();
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasAiResponse, isConversationSequenceComplete, isLoggedIn]);

  const showFollowUpComposer = ENABLE_FOLLOW_UP_COMPOSER && hasAiResponse && aiRoundCount === 1 && isConversationSequenceComplete;
  const showPromptComposer = !deepSeekSandboxEnabled
    ? true
    : aiLoading
      ? false
      : aiRoundCount === 0 || showFollowUpComposer;
  const showPromptUploader = aiRoundCount === 0;
  const displayedTrades = activeTrades.length > 0 ? activeTrades : (aiStructured?.trades ?? []);

  const handleRemoveTrade = (tradeToRemove: string) => {
    setActiveTrades((current) => {
      if (current.length <= 1) return current;
      return current.filter((trade) => trade !== tradeToRemove);
    });
  };


  return (
    <div className={`transition-opacity duration-500 ${pageExiting ? 'opacity-0' : 'opacity-100'}`}>
    <div className="space-y-3">
      {!isAdminTester && deepSeekSandboxEnabled && (
        <div className="space-y-3">
          {aiRoundNotice && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{aiRoundNotice}</p>
          )}
          {aiLoading && <ThinkingIndicator />}
          {!aiLoading && aiError && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{aiError}</p>}

          {hasAiResponse && aiStructured && aiConversationalText && (
            <div className="space-y-3 pt-1">
              {initialAiPrompt && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You asked...</p>
                  <div className="mt-1 space-y-1 text-sm text-slate-800">
                    {(aiPromptHistory.length > 0 ? aiPromptHistory : [initialAiPrompt]).map((prompt, index) => (
                      <p key={`asked-prompt-${index}`}>
                        {index === 0 ? prompt : `Update: ${prompt}`}
                      </p>
                    ))}
                  </div>
                  {initialAiImageUrls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">...and you sent these images</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {initialAiImageUrls.map((imageUrl, index) => (
                          <Image
                            key={`initial-ai-image-${index}`}
                            src={imageUrl}
                            alt={`Prompt image ${index + 1}`}
                            width={64}
                            height={64}
                            className="h-16 w-16 flex-none rounded-md border border-slate-200 object-cover"
                            unoptimized
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <AiConversationalView
                trades={displayedTrades}
                onSequenceStateChange={handleSequenceStateChange}
                onRemoveTrade={handleRemoveTrade}
              />
            </div>
          )}
        </div>
      )}

      <div className={`mt-5 origin-top transition-all duration-[900ms] ${showPromptComposer ? 'max-h-[720px] scale-y-100 opacity-100' : 'pointer-events-none max-h-0 scale-y-95 opacity-0'} overflow-hidden`}>
        <SearchBox
          onSubmit={handleSearch}
          autoFocus={autoFocusPrompt || !!initialPrompt || !!initialImages?.length}
          onClear={handleClearSearch}
          submitLabel={showFollowUpComposer ? t('updateMimo') : t('askMimo')}
          clearKey={searchBoxClearKey}
          onHelpClick={() => setShowHelp(true)}
          onImagePaste={(files) => setPromptImages((prev) => [...prev, ...files])}
          onCharCountChange={setPromptCharCount}
          voiceLang={preferredLanguage === 'zh-CN' ? 'zh-CN' : preferredLanguage === 'zh-HK' ? 'yue-Hant-HK' : 'en-HK'}
          initialQuery={initialPrompt}
          imageActions={
            (false as boolean) && visionQuota ? (
              <ChatImageUploader
                onFilesSelected={setPromptImages}
                maxImages={promptImageLimit}
                disabled={aiLoading || !visionQuota.canUseVision}
                isUploading={aiLoading && promptImages.length > 0}
                uploadingCount={promptImages.length}
                clearKey={promptUploaderClearKey}
                compact
              />
            ) : undefined
          }
        />

        {visionQuota && false ? (
          <div className="mt-1 flex items-center justify-between px-1">
            <div>
              {!visionQuotaLoading && (
                <p className="text-[10px] text-slate-400">
                  Images: {visionQuota!.remainingToday}/{visionQuota!.maxImagesPerDay} remaining ({visionQuota!.maxImagesPerPrompt}/prompt)
                </p>
              )}
            </div>
            <p className="text-[10px] text-slate-400">{promptCharCount}/5000</p>
          </div>
        ) : null}

        {isAdminTester && deepSeekSandboxEnabled && searchMode === 'ai' && !hasAiResponse && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={keepConversationOnRefresh}
                onChange={(e) => {
                  const nextValue = e.target.checked;
                  setKeepConversationOnRefresh(nextValue);
                  if (!nextValue) {
                    handleResetConversation();
                  }
                }}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Keep conversation on refresh
            </label>
            <button
              type="button"
              onClick={handleResetConversation}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Reset conversation
            </button>
          </div>
        )}
      </div>

      {hasAiResponse && (
        <div id="ai-path-fork" className={`border-t border-emerald-100 pt-2 transition-all duration-700 ease-out ${isConversationSequenceComplete ? 'translate-y-0 opacity-100 delay-300' : 'pointer-events-none translate-y-2 opacity-0'}`}>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-5 shadow-sm">
            {isLoggedIn === true ? (
              <>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-900">
                    {autoRedirectCountdown !== null && autoRedirectCountdown > 0
                      ? `Taking you to project setup in ${autoRedirectCountdown}...`
                      : 'Ready to continue?'}
                  </p>
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoRedirectCountdown(null);
                      handleStartAiWizard();
                    }}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:bg-emerald-700 hover:shadow-lg"
                  >
                    {autoRedirectCountdown !== null && autoRedirectCountdown > 0 ? 'Go now' : 'Continue with MIMO'}
                  </button>
                </div>

                {autoRedirectCountdown !== null && autoRedirectCountdown > 0 && (
                  <div className="mt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setAutoRedirectCountdown(null)}
                      className="text-xs text-slate-400 underline hover:text-slate-600"
                    >
                      Cancel auto-redirect
                    </button>
                  </div>
                )}

              </>
            ) : (
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-900">Let&apos;s start</p>
                <div className="mt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleGuestJoin}
                    className="flex-1 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:bg-emerald-700"
                  >
                    New user
                  </button>
                  <button
                    type="button"
                    onClick={handleGuestLogin}
                    className="flex-1 rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:bg-emerald-700"
                  >
                    Existing user
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {hasAiResponse && isConversationSequenceComplete && displayedTrades.length > 0 && (
        <div className="mt-3 space-y-2 text-center text-sm text-slate-500">
          {(() => {
            if (aiMatchCount === null || aiCountLoading) return null;
            const tradesLabel = displayedTrades.length === 1 ? displayedTrades[0] : 'project team members';
            if (aiMatchCount === 0) {
              return <p>MIMO will widen the search to find the right {tradesLabel.toLowerCase()} support across Hong Kong.</p>;
            }
            if (displayedTrades.length > 1) {
              return aiFullCoverageCompanyCount > 0
                ? <p>MIMO has {aiFullCoverageCompanyCount.toLocaleString()} pros in Hong Kong that can handle all required trades, plus {aiSpecialistCount.toLocaleString()} specialists across individual services.</p>
                : <p>MIMO has {aiSpecialistCount.toLocaleString()} professionals across the required services in Hong Kong.</p>;
            }
            return <p>MIMO has {aiMatchCount.toLocaleString()} {tradesLabel} in Hong Kong ready to help.</p>;
          })()}
          <p>Need help? Chat with Sarah at any time — she is just over to the right, or ask her to book a free consultation.</p>
        </div>
      )}

      <AssistRequestModal
        key={showAssistModal ? `${aiStructured?.title || 'ai-assist'}-${aiStructured?.summary || ''}` : 'ai-assist-closed'}
        isOpen={showAssistModal}
        onClose={() => {
          if (assistSubmitting) return;
          setShowAssistModal(false);
        }}
        onSubmit={isLoggedIn === true ? submitAssistFromAi : submitAssistFromGuest}
        isSubmitting={assistSubmitting}
        error={assistError}
        context="pre-project"
        submitPrefix="Book consultation"
        initialNotes={(aiStructured?.scope || aiStructured?.summary || initialAiPrompt || '').slice(0, 1200)}
        projectName={aiStructured?.title || 'AI consultation project'}
        disableWhatsapp={isLoggedIn === true ? !user?.mobile : !leadMobile.trim()}
        onChatNow={handleChatNowFromAssist}
      />

      {(() => { const _panel = !isAdminTester ? null : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-slate-700 space-y-2">
          {/* Mode toggle */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">Mode</span>
            <div className="inline-flex rounded-md border border-emerald-300 bg-white p-0.5">
              <button type="button" onClick={() => setSearchMode('legacy')} className={`px-2 py-1 text-[11px] font-semibold rounded ${searchMode === 'legacy' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                Not AI (Legacy)
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('ai')}
                disabled={!deepSeekSandboxEnabled}
                className={`px-2 py-1 text-[11px] font-semibold rounded ${searchMode === 'ai' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'} ${!deepSeekSandboxEnabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                AI (DeepSeek)
              </button>
            </div>
          </div>

          {!deepSeekSandboxEnabled && (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Conversational sandbox is disabled by environment flag. Vision account test remains available below.
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-emerald-700">DeepSeek sandbox preview (test mode)</p>
            <button type="button" onClick={checkSandboxHealth} disabled={healthLoading} className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-50">
              {healthLoading ? 'Checking...' : 'Check AI health'}
            </button>
          </div>

          <div className="rounded-md border border-emerald-200 bg-white p-2 space-y-2">
            <p className="font-semibold text-slate-700">Vision model access test</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Provider</span>
                <select
                  value={visionProvider}
                  onChange={(e) => {
                    const next = e.target.value === 'qwen' ? 'qwen' : 'deepseek';
                    setVisionProvider(next);
                    setVisionModel(next === 'qwen' ? 'qwen-vl-plus-latest' : 'deepseek-v4-pro');
                  }}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="qwen">Qwen (Alibaba Cloud)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">Model</span>
                <input
                  type="text"
                  value={visionModel}
                  onChange={(e) => setVisionModel(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                  placeholder={visionProvider === 'qwen' ? 'qwen-vl-plus-latest' : 'deepseek-v4-pro'}
                />
              </label>
              <label className="space-y-1 sm:col-span-1">
                <span className="text-[11px] font-semibold text-slate-600">Image URL</span>
                <input
                  type="url"
                  value={visionImageUrl}
                  onChange={(e) => setVisionImageUrl(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                  placeholder="https://example.com/test.jpg"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={checkVisionAccess}
                disabled={visionLoading}
                className="rounded border border-emerald-300 bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {visionLoading ? 'Checking vision...' : 'Check vision access'}
              </button>
              <span className="text-[11px] text-slate-500">
                {visionProvider === 'qwen'
                  ? 'Try qwen-vl-plus-latest or qwen-vl-max-latest'
                  : 'Try deepseek-v4-pro or deepseek-v4-flash'}
              </span>
            </div>
            {visionError && <p className="text-[11px] text-rose-600">{visionError}</p>}
            {visionResult && (
              <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700 space-y-1">
                <p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${visionResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {visionResult.ok ? 'Vision access confirmed' : 'Vision check failed'}
                  </span>
                </p>
                {visionResult.provider && <p>provider: {visionResult.provider}</p>}
                {visionResult.requestedModel && <p>requestedModel: {visionResult.requestedModel}</p>}
                {visionResult.model && <p>model: {visionResult.model}</p>}
                {typeof visionResult.statusCode === 'number' && <p>statusCode: {visionResult.statusCode}</p>}
                {typeof visionResult.durationMs === 'number' && <p>durationMs: {visionResult.durationMs}</p>}
                {visionResult.message && <p>message: {visionResult.message}</p>}
                {visionResult.providerError && <p>providerError: {visionResult.providerError}</p>}
                {visionResult.formatUsed && <p>formatUsed: {visionResult.formatUsed}</p>}
                {typeof visionResult.inlineImagePrepared === 'boolean' && <p>inlineImagePrepared: {String(visionResult.inlineImagePrepared)}</p>}
                {visionResult.inlineImageError && <p>inlineImageError: {visionResult.inlineImageError}</p>}
                {!!visionResult.attempts?.length && (
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-600">attempts:</p>
                    {visionResult.attempts.map((attempt, index) => (
                      <p key={`attempt-${index}`}>
                        {`${index + 1}. ${attempt.format} -> ${attempt.statusCode} (${attempt.providerError})`}
                      </p>
                    ))}
                  </div>
                )}
                {visionResult.contentPreview && <p className="line-clamp-3">preview: {visionResult.contentPreview}</p>}
              </div>
            )}
          </div>

          {healthStatus && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${healthStatus.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {healthStatus.ok ? 'Configured' : 'Missing API key'}
              </span>
              <span className="text-slate-500">status: {healthStatus.status}</span>
            </div>
          )}

          {healthError && <p className="text-rose-600">{healthError}</p>}
          {aiLoading && <ThinkingIndicator />}
          {!aiLoading && aiError && <p className="text-rose-600">{aiError}</p>}

          {aiDebug && isAdminTester && (
            <div className="rounded-md border border-slate-300 bg-white p-2 text-[11px] text-slate-700">
              <p className="font-semibold text-slate-800">AI Debug</p>
              <p>isLoggedIn at request: {String(aiDebug.isLoggedInAtRequest)}</p>
              <p>API path: {aiDebug.apiPath}</p>
              <p>mode sent to API: {aiDebug.modeRequested ?? 'n/a'}</p>
              <p>response has conversationalText: {String(aiDebug.responseHasConversationalText)}</p>
              <p>parsedOutput has conversationalText: {String(aiDebug.parsedOutputHasConversationalText)}</p>
              <p>conversationalText length: {aiDebug.conversationalTextLength}</p>
              <p>rendering conversational branch: {String(isLoggedIn !== true && !!aiConversationalText)}</p>
            </div>
          )}

          {!aiLoading && !aiError && aiOutput && aiStructured && (
            <>
              {/* Admin/testing structured view */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">Results</span>
                <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
                  <button type="button" onClick={() => setAiViewMode('human')} className={`px-2 py-0.5 text-[11px] font-semibold rounded transition ${aiViewMode === 'human' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    📋 Summary
                  </button>
                  <button type="button" onClick={() => setAiViewMode('json')} className={`px-2 py-0.5 text-[11px] font-semibold rounded transition ${aiViewMode === 'json' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {'{ }'} JSON
                  </button>
                </div>
              </div>

              {/* Human view */}
              {aiViewMode === 'human' && (
                <AiHumanView
                  s={aiStructured}
                  matchCount={aiMatchCount}
                  matchLoading={aiCountLoading}
                  isLoggedIn={isLoggedIn}
                />
              )}

              {/* JSON view */}
              {aiViewMode === 'json' && (
                <>
                  <pre className="whitespace-pre-wrap break-words text-slate-700 text-[11px]">{aiOutput}</pre>
                  {aiMeta && (
                    <p className="text-slate-500">
                      model: {aiMeta.model} · duration: {aiMeta.durationMs}ms · tokens: {aiMeta.totalTokens ?? 'n/a'}
                    </p>
                  )}
                </>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-emerald-100">
                {isLoggedIn === true && (
                  <button
                    type="button"
                    onClick={handleContinueToMatching}
                    className="flex-1 min-w-[140px] rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Continue to Matching
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ); return portalEl ? createPortal(_panel, portalEl) : _panel; })()} 

      <IntentModal
        intent={intent}
        onClose={() => setIntent(null)}
        matchCount={matchCount}
        countLoading={countLoading}
        isLoggedIn={isLoggedIn}
        openJoinModal={openJoinModal}
      />
      <SearchHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
    </div>
  );
}
