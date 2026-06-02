
// Wrap search params usage in Suspense to satisfy Next.js requirements
'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Professional } from '../../lib/types';
import ProfessionalsList from '@/components/professionals-list';
import { ProtectedPageOverlay } from '@/components/protected-page-overlay';
import { professionals as fallbackProfessionals } from '@/data/professionals';
import type { CanonicalLocation } from '@/components/location-select';
import { API_BASE_URL } from '@/config/api';
import { useSearchParams } from 'next/navigation';
import { matchLocation } from '@/lib/location-matcher';
import type { ProjectFormData } from '@/components/project-form';
import { EmergencySummaryScreen } from '@/components/emergency-summary-screen';
import { resolveMediaAssetUrl } from '@/lib/media-assets';
import { readEmergencyPhotoUrls } from '@/lib/emergency-photos';
import { type EmergencyAiBrief, normalizeEmergencyAiBrief } from '@/lib/emergency-ai';

const PROJECT_SELECTABLE_TYPES = new Set<Professional['professionType']>(['contractor', 'company']);

function filterProjectSelectableProfessionals(list: Professional[]): Professional[] {
  return list.filter((professional) => PROJECT_SELECTABLE_TYPES.has(professional.professionType));
}

function extractPhotoUrls(notes?: string): string[] {
  if (!notes) return [];
  const matches = notes.match(/(https?:\/\/[^\s,;\)]+|\/api?\/uploads\/[^\s,;\)]+)/gi) || [];
  return matches
    .filter((url) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return lower.includes("/uploads/") ||
             lower.endsWith(".jpg") ||
             lower.endsWith(".jpeg") ||
             lower.endsWith(".png") ||
             lower.endsWith(".webp") ||
             lower.endsWith(".gif");
    })
    .map((url) => url.trim());
}

function stripPhotoSection(notes?: string): string {
  if (!notes) return "";
  return notes
    .split(/\r?\n/)
    .map((line) => (line.trim().toLowerCase().startsWith("photos:") ? "" : line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toAbsolute(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  const base = API_BASE_URL.replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
}

function buildEmergencyAiPrompt(trade: string, location: string, notes: string): string {
  const sections = [
    'This is an emergency property repair request in Hong Kong.',
    trade ? `Trade needed: ${trade}.` : '',
    location ? `Location: ${location}.` : '',
    notes ? `Problem description: ${notes}` : '',
    'Generate a short project title and identify any safety risks or immediate temporary mitigations if relevant.',
  ];

  return sections.filter(Boolean).join('\n');
}

function formatEmergencyWarnings(parsedOutput: unknown): string | undefined {
  if (!parsedOutput || typeof parsedOutput !== 'object' || Array.isArray(parsedOutput)) return undefined;

  const source = parsedOutput as {
    risks?: string[];
    safetyAssessment?: {
      riskLevel?: string;
      emergencyReason?: string | null;
      concerns?: string[];
      temporaryMitigations?: string[];
      disclaimer?: string | null;
    };
  };

  const lines: string[] = [];
  const safety = source.safetyAssessment;
  if (safety?.riskLevel && safety.riskLevel !== 'none') {
    lines.push(`Risk: ${safety.riskLevel}`);
  }
  if (safety?.emergencyReason) {
    lines.push(safety.emergencyReason);
  }
  if (Array.isArray(safety?.concerns)) {
    lines.push(...safety.concerns.filter(Boolean));
  }
  if (Array.isArray(source.risks)) {
    lines.push(...source.risks.filter(Boolean));
  }
  if (Array.isArray(safety?.temporaryMitigations) && safety.temporaryMitigations.length > 0) {
    lines.push(`Immediate steps: ${safety.temporaryMitigations.filter(Boolean).join('; ')}`);
  }
  if (safety?.disclaimer) {
    lines.push(safety.disclaimer);
  }

  const unique = Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
  return unique.length > 0 ? unique.join('\n') : undefined;
}

function ProfessionalsPageInner() {
  const t = useTranslations('professionalsPage');
  const { isLoggedIn, userLocation, accessToken } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;
  const tradeParam = searchParams.get('trade') || undefined;
  const tradesParam = searchParams.get('trades') || undefined;
  const locationParam = searchParams.get('location') || undefined;
  const aiTitleParam = searchParams.get('aiTitle') || undefined;
  const aiScopeParam = searchParams.get('aiScope') || undefined;
  const aiScaleParam = searchParams.get('aiScale') || undefined;
  const aiEmergencyParam = searchParams.get('aiEmergency') || undefined;
  const sourceParam = searchParams.get('source') || undefined;
  const askRegion = searchParams.get('askRegion') === '1';
  const emergencySource = searchParams.get('source') === 'emergency';
  const emergencyOnly = searchParams.get('emergencyOnly') === 'true';
  const emergencyTradeParam = searchParams.get('trade') || undefined;
  const emergencyLocationParam = searchParams.get('location') || undefined;
  const emergencyPhotoKey = searchParams.get('photoKey');
  const [projectRegion, setProjectRegion] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [projectPrefill, setProjectPrefill] = useState<Partial<ProjectFormData>>({});

  // Emergency selection state — only active when source=emergency
  const [selectedEmergencyPros, setSelectedEmergencyPros] = useState<Professional[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const emergencyNotesParam = searchParams.get('notes') || '';
  const [emergencyPhotoUrls, setEmergencyPhotoUrls] = useState<string[]>([]);
  const emergencyAiTitle = searchParams.get('aiTitle') || '';
  const emergencyAiWarnings = searchParams.get('aiWarnings') || '';
  const [emergencyAiTitleState, setEmergencyAiTitleState] = useState(emergencyAiTitle);
  const [emergencyAiWarningsState, setEmergencyAiWarningsState] = useState(emergencyAiWarnings);
  const [emergencyAiIntakeId, setEmergencyAiIntakeId] = useState<string | undefined>(undefined);
  const [emergencyAiBrief, setEmergencyAiBrief] = useState<EmergencyAiBrief | null>(null);
  const [emergencyAiLoading, setEmergencyAiLoading] = useState(false);
  const [emergencyAiReady, setEmergencyAiReady] = useState(false);
  const [emergencyAiError, setEmergencyAiError] = useState<string | null>(null);
  const emergencyAiAttemptedPromptRef = useRef<string | null>(null);

  const toggleEmergencySelection = (pro: Professional) => {
    setSelectedEmergencyPros((prev) =>
      prev.some((p) => p.id === pro.id)
        ? prev.filter((p) => p.id !== pro.id)
        : [...prev, pro]
    );
  };
  const requestedTradesFromQuery = useMemo(
    () =>
      (tradesParam || '')
        .split(',')
        .map((trade) => trade.trim())
        .filter(Boolean),
    [tradesParam],
  );

  const emergencyAiPrompt = useMemo(
    () => buildEmergencyAiPrompt(emergencyTradeParam || '', emergencyLocationParam || '', emergencyNotesParam.trim()),
    [emergencyLocationParam, emergencyNotesParam, emergencyTradeParam],
  );

  useEffect(() => {
    setEmergencyAiTitleState(emergencyAiTitle);
    setEmergencyAiWarningsState(emergencyAiWarnings);
    setEmergencyAiIntakeId(undefined);
    setEmergencyAiBrief(null);
    setEmergencyAiReady(Boolean(emergencyAiTitle || emergencyAiWarnings));
    setEmergencyAiError(null);
    emergencyAiAttemptedPromptRef.current = null;
  }, [emergencyAiTitle, emergencyAiWarnings, emergencyAiPrompt]);

  useEffect(() => {
    if (!emergencySource) return;
    if (!emergencyNotesParam.trim()) return;
    if (emergencyAiTitleState || emergencyAiWarningsState || emergencyAiLoading) return;
    if (emergencyAiAttemptedPromptRef.current === emergencyAiPrompt) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);

    const runEmergencyAi = async () => {
      emergencyAiAttemptedPromptRef.current = emergencyAiPrompt;
      setEmergencyAiLoading(true);
      setEmergencyAiError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/ai/sandbox/requirements`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            prompt: emergencyAiPrompt,
            mode: 'structured',
          }),
        });

        if (!response.ok) {
          if (!cancelled) {
            setEmergencyAiError(`AI request failed (${response.status}).`);
          }
          return;
        }

        const payload: {
          intakeId?: string | null;
          parsedOutput?: unknown;
        } = await response.json();

        if (cancelled) return;

        setEmergencyAiIntakeId(payload.intakeId || undefined);
        const normalizedBrief = normalizeEmergencyAiBrief(payload.parsedOutput, emergencyTradeParam);
        setEmergencyAiBrief(normalizedBrief);
        if (payload.intakeId) {
          setEmergencyAiReady(true);
        }
        if (normalizedBrief?.title) {
          setEmergencyAiTitleState(normalizedBrief.title);
        }

        const warnings = formatEmergencyWarnings(payload.parsedOutput);
        if (warnings) {
          setEmergencyAiWarningsState(warnings);
        }
        setEmergencyAiReady(true);
      } catch (error) {
        if (!cancelled) {
          setEmergencyAiError(
            error instanceof Error && error.name === 'AbortError'
              ? 'AI response timed out. You can still continue without it.'
              : 'AI guidance unavailable. You can still continue without it.',
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setEmergencyAiLoading(false);
        }
      }
    };

    runEmergencyAi();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, emergencyAiPrompt, emergencyAiTitleState, emergencyAiWarningsState, emergencyNotesParam, emergencySource]);

  useEffect(() => {
    if (!emergencyPhotoKey) {
      setEmergencyPhotoUrls([]);
      return;
    }
    setEmergencyPhotoUrls(readEmergencyPhotoUrls(emergencyPhotoKey));
  }, [emergencyPhotoKey]);

  useEffect(() => {
    const fetchProfessionals = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/professionals`, {
          next: { revalidate: 60 }, // Cache for 60 seconds
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text().then((text) => {
              throw new Error(`Expected JSON, got: ${text.slice(0, 120)}`);
            });

        const data = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { data?: Professional[] }).data)
            ? (payload as { data: Professional[] }).data
            : [];

        console.log('API Response - first professional:', data[0]);
        const source = data.length ? data : fallbackProfessionals;
        setProfessionals(filterProjectSelectableProfessionals(source));
      } catch (error) {
        console.error('Failed to fetch professionals:', error);
        // Show a sensible fallback instead of crashing on invalid JSON responses
        setProfessionals(filterProjectSelectableProfessionals(fallbackProfessionals));
      } finally {
        setLoading(false);
      }
    };

    if (isLoggedIn) {
      fetchProfessionals();
    } else if (isLoggedIn === false) {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // If arriving from a project, fetch it to pre-populate filters
  useEffect(() => {
    const loadProject = async () => {
      if (!projectId || !isLoggedIn) return;
      console.log('[ProfessionalsPage] Loading project:', projectId);
      try {
        const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}`);
        if (!res.ok) {
          console.warn('[ProfessionalsPage] Project fetch failed:', res.status);
          return;
        }
        const p = await res.json();
        const region = typeof p?.region === 'string' ? p.region : undefined;
        // Use all trades from tradesRequired array, fallback to projectName for old data
        let name: string | undefined;
        if (Array.isArray(p?.tradesRequired) && p.tradesRequired.length > 0) {
          name = p.tradesRequired[0];
        } else if (typeof p?.projectName === 'string') {
          name = p.projectName;
        }
        const photoUrls = extractPhotoUrls(p?.notes || undefined).map(toAbsolute);
        const cleanedNotes = stripPhotoSection(p?.notes || undefined);
        const matchedLocation = region ? matchLocation(region) : null;
        console.log('[ProfessionalsPage] Project data:', { region, name, tradesRequired: p?.tradesRequired, project: p });
        setProjectRegion(region);
        setProjectName(name);
        setProjectPrefill({
          projectName: typeof p?.projectName === 'string' ? p.projectName : name,
          tradesRequired: Array.isArray(p?.tradesRequired) && p.tradesRequired.length > 0 ? p.tradesRequired : [],
          location: matchedLocation ? { primary: matchedLocation.primary, secondary: matchedLocation.secondary, tertiary: matchedLocation.tertiary } : undefined,
          notes: cleanedNotes,
          photoUrls,
        });
      } catch (err) {
        console.error('[ProfessionalsPage] Project fetch error:', err);
      }
    };
    loadProject();
  }, [projectId, isLoggedIn]);

  // Prefer user default location; fallback to intentData (handled in ProfessionalsList)
  const defaultLocation: CanonicalLocation = useMemo(() => {
    if (projectRegion) {
      const ml = matchLocation(projectRegion);
      console.log('[ProfessionalsPage] matchLocation result:', { projectRegion, ml });
      if (ml) return { primary: ml.primary, secondary: ml.secondary, tertiary: ml.tertiary } as CanonicalLocation;
    }

    if (locationParam) {
      const matched = matchLocation(locationParam);
      if (matched) {
        return {
          primary: matched.primary,
          secondary: matched.secondary,
          tertiary: matched.tertiary,
        } as CanonicalLocation;
      }

      return { primary: locationParam } as CanonicalLocation;
    }

    return userLocation;
  }, [projectRegion, locationParam, userLocation]);

  const hasDefaultLocation = Boolean(
    defaultLocation?.primary || defaultLocation?.secondary || defaultLocation?.tertiary,
  );
  const shouldShowRegionNotice = askRegion && !hasDefaultLocation;

  const aiPrefill = useMemo<Partial<ProjectFormData>>(() => {
    if (!aiTitleParam && !aiScopeParam && !aiScaleParam && !aiEmergencyParam) return {};
    const normalizedScale =
      aiScaleParam === 'SCALE_1' || aiScaleParam === 'SCALE_2' || aiScaleParam === 'SCALE_3'
        ? aiScaleParam
        : undefined;
    return {
      projectName: aiTitleParam,
      notes: aiScopeParam,
      projectScale: normalizedScale,
      isEmergency: aiEmergencyParam === '1',
    };
  }, [aiTitleParam, aiScopeParam, aiScaleParam, aiEmergencyParam]);

  const mergedPrefill = useMemo<Partial<ProjectFormData>>(
    () => ({
      ...aiPrefill,
      ...projectPrefill,
    }),
    [aiPrefill, projectPrefill],
  );

  const initialRequiredTrades = useMemo(() => {
    if (requestedTradesFromQuery.length > 0) return requestedTradesFromQuery;
    const prefillTrades = mergedPrefill.tradesRequired || [];
    return prefillTrades.filter((trade): trade is string => Boolean(trade && trade.trim()));
  }, [requestedTradesFromQuery, mergedPrefill.tradesRequired]);

  if (typeof window !== 'undefined') {
    console.log('[ProfessionalsPage] Multi-trade context:', {
      tradesParam,
      requestedTradesFromQuery,
      initialRequiredTrades,
      mergedPrefillTrades: mergedPrefill.tradesRequired,
    });
  }

  // Filter professionals based on emergency mode
  const filteredProfessionals = useMemo(() => {
    let result = professionals;
    if (emergencySource) {
      result = result.filter((pro) => pro.emergencyCalloutAvailable === true);
    }
    if (emergencySource && emergencyTradeParam) {
      result = result.filter((pro) => {
        const trades = [pro.primaryTrade, ...(pro.tradesOffered || [])];
        return trades.some((t) => t && t.toLowerCase() === emergencyTradeParam.toLowerCase());
      });
    }
    if (emergencySource && emergencyLocationParam) {
      result = result.filter((pro) => {
        if (!emergencyLocationParam) return true;
        const matched = matchLocation(emergencyLocationParam);
        if (!matched) return false;
        // Check if professional covers any of the requested locations
        return [pro.locationPrimary, pro.locationSecondary, pro.locationTertiary].some(
          (loc) => loc && (
            loc === matched.primary ||
            loc === matched.secondary ||
            loc === matched.tertiary
          )
        );
      });
    }
    return result;
  }, [professionals, emergencySource, emergencyOnly, emergencyTradeParam, emergencyLocationParam]);

    const isMatchedContext = Boolean(
    projectId ||
      tradeParam ||
      tradesParam ||
      locationParam ||
      aiTitleParam ||
      aiScopeParam ||
        aiScaleParam ||
        aiEmergencyParam ||
        initialRequiredTrades.length > 0,
  );

  console.log('[ProfessionalsPage] Final state:', { userLocation, projectRegion, locationParam, projectName, defaultLocation });

  return (
    <div className={`space-y-6 pt-4 ${emergencySource ? 'pb-28' : 'pb-8'}`}>
      {/* Protected page overlay */}
      <ProtectedPageOverlay
        onJoinClick={openJoinModal}
        onLoginClick={openLoginModal}
      />

          {/* Emergency context banner — only shown for emergency route */}
          {emergencySource && (
            <section className="relative -mx-6 px-6">
              <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/45 bg-[#F5EEDE]/95 px-5 py-4 shadow-sm backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">🚨</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#DC143C] uppercase tracking-widest mb-0.5">Emergency Request</p>
                    <p className="text-sm text-slate-800">
                      Select one or more professionals below, then tap <strong>Send invites</strong>. They will be notified immediately and asked to respond within <strong>1 hour</strong>.
                    </p>
                    {emergencyTradeParam && (
                      <p className="mt-1 text-xs text-slate-600">Trade: <span className="font-semibold">{emergencyTradeParam}</span></p>
                    )}
                    {emergencyPhotoUrls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-slate-600">Attached photos: <span className="font-semibold">{emergencyPhotoUrls.length}</span></p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {emergencyPhotoUrls.map((url) => (
                            <div key={url} className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <img src={resolveMediaAssetUrl(url)} alt="Emergency issue" className="h-full w-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {emergencyNotesParam.trim() && (
                      <div className="mt-2 space-y-2">
                        {emergencyAiLoading && (
                          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                            <span className="flex items-end gap-1" aria-hidden="true">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
                            </span>
                            <span>Mimo is generating title and safety guidance...</span>
                          </div>
                        )}

                        {!emergencyAiLoading && emergencyAiReady && (emergencyAiTitleState || emergencyAiWarningsState || emergencyAiIntakeId) && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <p className="font-semibold uppercase tracking-wide text-emerald-700">AI brief ready</p>
                          </div>
                        )}

                        {!emergencyAiLoading && emergencyAiError && (
                          <p className="text-xs text-amber-700">{emergencyAiError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Compact Hero Section — hidden on emergency route to keep focus on professionals */}
          {!emergencySource && (
          <section className="relative -mx-6 px-6">
            <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/45 bg-[#F5EEDE]/90 py-12">
              <div className="px-4 sm:px-6 lg:px-12">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    {t('hero.tagline')}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">
                    {isMatchedContext ? 'Matched professionals' : t('hero.title')}
                  </h1>
                  <p className="max-w-2xl text-sm text-slate-600">
                    {isMatchedContext
                      ? 'A curated shortlist from the wider professional network based on your project context.'
                      : t('hero.description')}
                  </p>
                </div>
              </div>
            </div>
          </section>
          )}

          {shouldShowRegionNotice && (
            <section className="relative -mx-6 px-6">
              <div className="mx-auto max-w-6xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 px-4 py-3 text-sm text-slate-700">
                We couldn&apos;t confirm your area. Please set the location filter to find better matches.
              </div>
            </section>
          )}

          {!emergencySource && aiEmergencyParam === '1' && (
            <section className="relative -mx-6 px-6">
              <div className="mx-auto max-w-6xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-slate-800">
                <span className="font-bold">If this is an emergency,</span> pick a professional with <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">24/7 Emergency</span> availability &mdash; they may be able to reach you quicker, although an emergency call-out will be more expensive.
              </div>
            </section>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-4 shadow-sm animate-pulse">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-5 w-32 rounded bg-slate-300/70"></div>
                    <div className="h-6 w-20 rounded-full bg-slate-300/70"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-48 rounded bg-slate-300/70"></div>
                    <div className="h-4 w-64 rounded bg-slate-300/70"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : professionals.length === 0 ? (
            <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 text-sm text-slate-600">
              {t('states.empty')}
            </div>
          ) : emergencySource ? (
            /* Emergency mode: simple tap-to-select card list, no project form */
            <div className="space-y-3">
              {filteredProfessionals.length === 0 ? (
                <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 text-sm text-slate-600">
                  No professionals found matching this trade and area. Try broadening the location.
                </div>
              ) : filteredProfessionals.map((pro) => {
                const isSelected = selectedEmergencyPros.some((p) => p.id === pro.id);
                return (
                  <button
                    key={pro.id}
                    type="button"
                    onClick={() => toggleEmergencySelection(pro)}
                    className={`w-full text-left rounded-2xl border-2 px-5 py-4 shadow-sm transition-all bg-[#F5EEDE]/90 ${
                      isSelected
                        ? 'border-emerald-400 ring-2 ring-emerald-300/60 bg-emerald-50/80'
                        : 'border-white/60 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-600">
                        {(pro.businessName || pro.fullName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {pro.businessName || pro.fullName || 'Professional'}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          {pro.primaryTrade}{pro.locationPrimary ? ` · ${pro.locationPrimary}` : ''}
                        </p>
                        {pro.emergencyCalloutAvailable && (
                          <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            24/7 Emergency
                          </span>
                        )}
                      </div>
                      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <ProfessionalsList
              professionals={emergencySource ? filteredProfessionals : professionals}
              initialLocation={defaultLocation}
              projectId={projectId}
              initialSearchTerm={tradeParam || initialRequiredTrades[0] || projectName}
              initialRequiredTrades={initialRequiredTrades}
              initialProjectData={mergedPrefill}
              requireLocation={shouldShowRegionNotice}
              defaultFiltersOpen={sourceParam !== 'ai-wizard'}
            />
          )}

        {/* Sticky emergency action bar — only shown when 1+ selected */}
        {emergencySource && selectedEmergencyPros.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-[#F5EEDE]/90 px-4 py-3 backdrop-blur-sm">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <p className="flex-1 text-sm font-semibold text-slate-800">
                {selectedEmergencyPros.length} professional{selectedEmergencyPros.length !== 1 ? 's' : ''} selected
              </p>
              <button
                onClick={() => setSelectedEmergencyPros([])}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
              <button
                onClick={() => setShowSummary(true)}
                className="rounded-full bg-[#DC143C] px-5 py-2 text-sm font-bold text-white shadow transition hover:bg-[#b01030]"
              >
                Send invites
              </button>
            </div>
          </div>
        )}

        {/* Emergency summary confirmation screen */}
        <EmergencySummaryScreen
          isOpen={showSummary}
          onBack={() => setShowSummary(false)}
          selectedProfessionals={selectedEmergencyPros}
          emergencyContext={{
            trade: emergencyTradeParam || '',
            location: emergencyLocationParam || '',
            notes: emergencyNotesParam,
            photoUrls: emergencyPhotoUrls,
            photoStorageKey: emergencyPhotoKey || undefined,
            aiTitle: emergencyAiTitleState || undefined,
            aiWarnings: emergencyAiWarningsState || undefined,
            aiIntakeId: emergencyAiIntakeId,
            aiBrief: emergencyAiBrief || undefined,
            aiPrompt: emergencyAiPrompt,
          }}
        />
    </div>
  );
}

export default function ProfessionalsPage() {
  const t = useTranslations('professionalsPage');
  return (
    <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{t('states.loading')}</div>}>
      <ProfessionalsPageInner />
    </Suspense>
  );
}





