
// Wrap search params usage in Suspense to satisfy Next.js requirements
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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

function ProfessionalsPageInner() {
  const t = useTranslations('professionalsPage');
  const { isLoggedIn, userLocation } = useAuth();
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
  const [projectRegion, setProjectRegion] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [projectPrefill, setProjectPrefill] = useState<Partial<ProjectFormData>>({});
  const requestedTradesFromQuery = useMemo(
    () =>
      (tradesParam || '')
        .split(',')
        .map((trade) => trade.trim())
        .filter(Boolean),
    [tradesParam],
  );

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
    <>
      {/* Protected page overlay */}
      <ProtectedPageOverlay
        onJoinClick={openJoinModal}
        onLoginClick={openLoginModal}
      />

      <div className="relative isolate">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div className="h-full w-full bg-[url('/assets/images/hero-homepage-empty.webp')] bg-cover bg-center bg-no-repeat" />
          <div className="absolute inset-0 bg-[#1a1a1a]/44" />
        </div>

        <div className="space-y-6 pb-8 pt-4">
          {/* Compact Hero Section */}
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

          {shouldShowRegionNotice && (
            <section className="relative -mx-6 px-6">
              <div className="mx-auto max-w-6xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 px-4 py-3 text-sm text-slate-700">
                We couldn&apos;t confirm your area. Please set the location filter to find better matches.
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
          ) : (
            <ProfessionalsList
              professionals={professionals}
              initialLocation={defaultLocation}
              projectId={projectId}
              initialSearchTerm={tradeParam || initialRequiredTrades[0] || projectName}
              initialRequiredTrades={initialRequiredTrades}
              initialProjectData={mergedPrefill}
              requireLocation={shouldShowRegionNotice}
              defaultFiltersOpen={sourceParam !== 'ai-wizard'}
            />
          )}
        </div>
      </div>
    </>
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
