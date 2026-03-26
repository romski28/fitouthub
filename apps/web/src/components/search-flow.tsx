'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { matchIntent, type IntentResult } from '@/lib/intent-matcher';
import SearchBox from '@/components/search-box';
import { SearchHelpModal } from '@/components/search-help-modal';
import { AiProjectBriefModal } from '@/components/ai-project-brief-modal';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { API_BASE_URL } from '@/config/api';
import { AI_STATE_CLEAR_EVENT } from '@/lib/client-session';
import { writeCreateProjectDraftSafely } from '@/lib/draft-storage';

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
}

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
  }, []);

  return (
    <div className="rounded-lg border border-emerald-200 bg-white/80 p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex items-end gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-emerald-800">AI is thinking...</p>
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
function AiHumanView({ s, matchCount, matchLoading, isLoggedIn, openJoinModal }: {
  s: AiStructured;
  matchCount: number | null;
  matchLoading: boolean;
  isLoggedIn: boolean | undefined;
  openJoinModal: () => void;
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
    <div className="rounded-lg border border-emerald-200 bg-white p-4 space-y-3 text-sm">
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

      {s.safetyAssessment && (s.safetyAssessment.isDangerous || s.safetyAssessment.concerns.length > 0) && (
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
      {isLoggedIn === false && countMsg && (
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

function IntentModal({ intent, onClose, matchCount, countLoading, isLoggedIn, openJoinModal }: IntentModalProps) {
  const router = useRouter();
  const t = useTranslations('home.searchFlow');
  const [isNavigating, setIsNavigating] = useState(false);

  if (!intent || intent.confidence === 0) return null;

  const isAnonProfFind = isLoggedIn === false && intent.action === 'find-professional';

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

export default function SearchFlow() {
  const deepSeekSandboxEnabled = process.env.NEXT_PUBLIC_ENABLE_DEEPSEEK_SANDBOX !== 'false';
  const t = useTranslations('home.searchFlow');
  const router = useRouter();
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'legacy' | 'ai'>('ai');
  const [aiViewMode, setAiViewMode] = useState<'human' | 'json'>('human');
  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{ model: string; durationMs: number; totalTokens: number | null } | null>(null);
  const [aiStructured, setAiStructured] = useState<AiStructured | null>(null);
  const [aiMatchCount, setAiMatchCount] = useState<number | null>(null);
  const [aiCountLoading, setAiCountLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<{ ok: boolean; status: string } | null>(null);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const { isLoggedIn, userLocation } = useAuth();
  const { openLoginModal, openJoinModal } = useAuthModalControl();

  const handleContinueToProfessionals = (payload: {
    title: string;
    summary: string;
    location: { primary?: string; secondary?: string; tertiary?: string };
    isEmergency: boolean;
    followUpAnswers: Array<{ question: string; answer: string }>;
  }) => {
    if (!aiStructured) return;

    const resolvedRegion = [payload.location.secondary, payload.location.primary]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join(', ');

    const aiDraft = {
      initialData: {
        projectName: payload.title || aiStructured.title || aiStructured.summary || '',
        notes: payload.summary || aiStructured.scope || aiStructured.summary || '',
        tradesRequired: aiStructured.trades || [],
        region: resolvedRegion,
        location: payload.location,
        isEmergency: payload.isEmergency,
        aiFrom: {
          assumptions: aiStructured.assumptions,
          risks: aiStructured.risks,
          safety: aiStructured.safetyAssessment,
        },
      },
      ...(aiStructured.intakeId ? { aiIntakeId: aiStructured.intakeId } : {}),
    };

    const saved = writeCreateProjectDraftSafely(aiDraft);
    if (!saved) {
      console.warn('[search-flow] Unable to persist full createProjectDraft due to storage limits.');
    }

    const params = new URLSearchParams();
    if (aiStructured.trades[0]) params.set('trade', aiStructured.trades[0]);
    if (payload.location.tertiary) params.set('location', payload.location.tertiary);
    else if (payload.location.secondary) params.set('location', payload.location.secondary);
    else if (payload.location.primary) params.set('location', payload.location.primary);
    else params.set('askRegion', '1');

    setShowBriefModal(false);
    router.push(`/professionals?${params.toString()}`);
  };

  const clearAiResponseState = () => {
    setAiLoading(false);
    setAiError(null);
    setAiOutput(null);
    setAiMeta(null);
    setAiStructured(null);
    setAiMatchCount(null);
    setAiCountLoading(false);
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
    try {
      const key = 'aiSandboxSessionId';
      const existing = sessionStorage.getItem(key);
      if (existing) { setAiSessionId(existing); return; }
      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, generated);
      setAiSessionId(generated);
    } catch {
      setAiSessionId(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleClearAiState = () => {
      setAiSessionId(null);
      clearAiResponseState();
    };

    window.addEventListener(AI_STATE_CLEAR_EVENT, handleClearAiState);
    return () => window.removeEventListener(AI_STATE_CLEAR_EVENT, handleClearAiState);
  }, []);

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

  // Fetch professional count for non-logged-in users after AI extraction
  useEffect(() => {
    if (isLoggedIn !== false || searchMode !== 'ai' || !aiStructured) {
      setAiMatchCount(null);
      return;
    }
    let cancelled = false;
    const fetchCount = async () => {
      setAiCountLoading(true);
      try {
        const params = new URLSearchParams();
        if (aiStructured.trades?.length > 0) params.set('trades', aiStructured.trades.join(','));
        if (aiStructured.locationPrimary) params.set('location', aiStructured.locationPrimary);
        const res = await fetch(`${API_BASE_URL}/ai/professionals/count?${params.toString()}`);
        if (!res.ok) throw new Error('count fetch failed');
        const data: { count: number } = await res.json();
        if (!cancelled) setAiMatchCount(data.count);
      } catch {
        if (!cancelled) setAiMatchCount(null);
      } finally {
        if (!cancelled) setAiCountLoading(false);
      }
    };
    fetchCount();
    return () => { cancelled = true; };
  }, [aiStructured, isLoggedIn, searchMode]);

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

  const runSandbox = async (query: string) => {
    setAiLoading(true);
    setAiError(null);
    setAiOutput(null);
    setAiMeta(null);
    setAiStructured(null);

    try {
      const response = await fetch(`${API_BASE_URL}/ai/sandbox/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: query.trim(), sessionId: aiSessionId }),
      });
      if (!response.ok) throw new Error(`Sandbox request failed (${response.status})`);

      const payload: {
        intakeId: string | null;
        output: string;
        model: string;
        durationMs: number;
        usage?: { totalTokens?: number | null };
        parsedOutput?: {
          title?: string | null;
          summary?: string | null;
          scope?: string | null;
          trades?: string[];
          location?: { primary?: string | null; secondary?: string | null; tertiary?: string | null; confidence?: number };
          project?: { propertyType?: string | null; scopeText?: string | null };
          size?: { value?: number | null; unit?: string | null; rawText?: string | null };
          budget?: { currency?: string | null; min?: number | null; max?: number | null; rawText?: string | null; confidence?: number };
          timeline?: { durationText?: string | null; startText?: string | null };
          keyFacts?: string[];
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
        } | null;
      } = await response.json();

      setAiOutput(payload.output || '');
      setAiMeta({ model: payload.model, durationMs: payload.durationMs, totalTokens: payload.usage?.totalTokens ?? null });

      const p = payload.parsedOutput;
      setAiStructured({
        intakeId: payload.intakeId ?? null,
        title: p?.title ?? null,
        trades: p?.trades ?? [],
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
        nextQuestions: p?.nextQuestions ?? p?.followUpQuestions ?? [],
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
      });

    } catch (error) {
      setAiError((error as Error).message || 'DeepSeek sandbox is unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (searchMode === 'ai' && deepSeekSandboxEnabled) {
      setIntent(null);
      setMatchCount(null);
      runSandbox(trimmed);
      return;
    }
    setAiOutput(null);
    setAiError(null);
    setAiMeta(null);
    const result = matchIntent(trimmed);
    setMatchCount(null);
    setIntent(result);
  };


  return (
    <div className="space-y-3">
      <div className="text-center space-y-2 mb-6">
        <p className="text-sm text-slate-600">
          Describe what you need in a few words.{' '}
          <button onClick={() => setShowHelp(true)} className="text-emerald-600 hover:text-emerald-700 font-semibold underline transition">
            We'll help you get started.
          </button>
        </p>
      </div>
      <SearchBox onSubmit={handleSearch} />

      {deepSeekSandboxEnabled && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-slate-700 space-y-2">
          {/* Mode toggle */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">Mode</span>
            <div className="inline-flex rounded-md border border-emerald-300 bg-white p-0.5">
              <button type="button" onClick={() => setSearchMode('legacy')} className={`px-2 py-1 text-[11px] font-semibold rounded ${searchMode === 'legacy' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                Not AI (Legacy)
              </button>
              <button type="button" onClick={() => setSearchMode('ai')} className={`px-2 py-1 text-[11px] font-semibold rounded ${searchMode === 'ai' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                AI (DeepSeek)
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-emerald-700">DeepSeek sandbox preview (test mode)</p>
            <button type="button" onClick={checkSandboxHealth} disabled={healthLoading} className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-50">
              {healthLoading ? 'Checking...' : 'Check AI health'}
            </button>
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

          {!aiLoading && !aiError && aiOutput && aiStructured && (
            <>
              {/* View toggle */}
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
                  openJoinModal={openJoinModal}
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
                {(isLoggedIn === true || isLoggedIn === undefined) && (
                  <button
                    type="button"
                    onClick={() => setShowBriefModal(true)}
                    className="flex-1 min-w-[140px] rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 transition"
                  >
                    Continue
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Auth nudge for non-logged-in users */}
      {isLoggedIn === false && (
        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            <button onClick={openLoginModal} className="text-emerald-600 hover:text-emerald-700 font-semibold bg-transparent border-none cursor-pointer p-0">Login</button>
            {' or '}
            <button onClick={openJoinModal} className="text-emerald-600 hover:text-emerald-700 font-semibold bg-transparent border-none cursor-pointer p-0">Join Now</button>
            {' for the best experience'}
          </p>
        </div>
      )}

      <IntentModal
        intent={intent}
        onClose={() => setIntent(null)}
        matchCount={matchCount}
        countLoading={countLoading}
        isLoggedIn={isLoggedIn}
        openJoinModal={openJoinModal}
      />
      <AiProjectBriefModal
        isOpen={showBriefModal && !!aiStructured}
        onClose={() => setShowBriefModal(false)}
        initialTitle={aiStructured?.title || aiStructured?.summary || ''}
        initialSummary={aiStructured?.summary || ''}
        initialScope={aiStructured?.scope || ''}
        initialAssumptions={aiStructured?.assumptions || []}
        initialLocation={
          aiStructured?.locationPrimary
            ? {
                primary: aiStructured.locationPrimary,
                secondary: aiStructured.locationSecondary || undefined,
              }
            : undefined
        }
        fallbackLocation={userLocation}
        initialEmergency={
          aiStructured?.safetyAssessment
            ? Boolean(
                aiStructured.safetyAssessment.shouldEscalateEmergency ||
                  aiStructured.safetyAssessment.isDangerous ||
                  (aiStructured.safetyAssessment.riskLevel || '').toLowerCase() === 'high' ||
                  (aiStructured.safetyAssessment.riskLevel || '').toLowerCase() === 'critical',
              )
            : undefined
        }
        followUpQuestions={aiStructured?.nextQuestions || []}
        onComplete={handleContinueToProfessionals}
      />
      <SearchHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
