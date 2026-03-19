'use client';

import { useEffect, useMemo, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ProfessionalDetailsModal } from '@/components/professional-details-modal';
import { CanonicalLocation } from '@/components/location-select';
import { searchLocations } from '@/lib/location-search';
import { SERVICE_TO_PROFESSION, matchServiceToProfession } from '@/lib/service-matcher';
import { matchLocation } from '@/lib/location-matcher';
import { Professional } from '@/lib/types';
import { ProjectShareModal } from '@/components/project-share-modal';
import { useAuth } from '@/context/auth-context';
import { BackToTop } from '@/components/back-to-top';
import type { ProjectFormData } from '@/components/project-form';

const Pill = memo(({ label }: { label: string }) => {
  return (
    <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
      {label}
    </span>
  );
});
Pill.displayName = 'Pill';

const ProfessionalCard = memo(({ pro, onToggle, onViewDetails, isSelected, isAdmin }: { pro: Professional; onToggle: (pro: Professional) => void; onViewDetails: (pro: Professional) => void; isSelected: boolean; isAdmin: boolean }) => {
  const t = useTranslations('professionalsPage.list');
  const serviceAreas = useMemo(() => 
    (pro.serviceArea ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    [pro.serviceArea]
  );

  return (
    <div className={`group rounded-xl border ${isSelected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'} bg-white shadow-sm overflow-hidden transition hover:-translate-y-1 hover:shadow-md`}>
      {/* Card Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">
              {pro.fullName || pro.businessName || t('fallbackProfessional')}
            </h3>
            <p className="text-xs font-semibold text-emerald-400 mt-1 uppercase tracking-wide">{pro.professionType}</p>
          </div>
          <div className="flex items-center gap-2">
            <Pill label={`${pro.rating.toFixed(1)}★`} />
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
          {isAdmin ? (
            <>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="font-semibold">{t('labels.email')}</span>
                <span className="text-slate-600 break-all">{pro.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="font-semibold">{t('labels.phone')}</span>
                <span className="text-slate-600">{pro.phone}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span className="text-slate-600">{t('contactAfterMatch')}</span>
            </div>
          )}
        </div>

        {/* Trades/Supplies */}
        {(pro.primaryTrade || (pro.tradesOffered && pro.tradesOffered.length > 0) || (pro.suppliesOffered && pro.suppliesOffered.length > 0)) && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              {pro.professionType === 'contractor' && t('tradeLabels.trade')}
              {pro.professionType === 'company' && t('tradeLabels.tradesOffered')}
              {pro.professionType === 'reseller' && t('tradeLabels.supplies')}
            </p>
            <div className="flex flex-wrap gap-2">
              {pro.primaryTrade && (
                <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  {pro.primaryTrade}
                </span>
              )}
              {pro.tradesOffered?.slice(0, 2).map((trade, index) => (
                <span key={`trade-${index}`} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  {trade}
                </span>
              ))}
              {pro.suppliesOffered?.slice(0, 2).map((supply, index) => (
                <span key={`supply-${index}`} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  {supply}
                </span>
              ))}
              {(pro.tradesOffered && pro.tradesOffered.length > 2 || pro.suppliesOffered && pro.suppliesOffered.length > 2) && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {t('moreCount', { count: (pro.tradesOffered?.length ?? 0) + (pro.suppliesOffered?.length ?? 0) - 2 })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Service Areas */}
        {serviceAreas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">{t('areasServed')}</p>
            <div className="flex flex-wrap gap-1.5">
              {serviceAreas.slice(0, 4).map((area, index) => (
                <span key={`area-${index}`} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {area}
                </span>
              ))}
              {serviceAreas.length > 4 && (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {t('moreCount', { count: serviceAreas.length - 4 })}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onViewDetails(pro)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            {t('viewDetails')}
          </button>
          <button
            type="button"
            onClick={() => onToggle(pro)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${isSelected ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}
          >
            {isSelected ? t('selected') : t('askForHelp')}
          </button>
        </div>
      </div>
    </div>
    );
  });
ProfessionalCard.displayName = 'ProfessionalCard';

interface Props {
  professionals: Professional[];
  initialLocation?: CanonicalLocation;
  projectId?: string;
  initialSearchTerm?: string;
  initialProjectData?: Partial<ProjectFormData>;
  requireLocation?: boolean;
}

export default function ProfessionalsList({ professionals, initialLocation, projectId, initialSearchTerm, initialProjectData, requireLocation = false }: Props) {
  const t = useTranslations('professionalsPage.list');
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  // Initialize from intentData synchronously to avoid effect-based setState
  const initialFromIntent = (() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('intentData') : null;
      if (!raw) return { profession: undefined as string | undefined, loc: {} as CanonicalLocation, description: undefined as string | undefined };
      const data = JSON.parse(raw);
      const profession = typeof data?.professionType === 'string' ? data.professionType : undefined;
      const description = typeof data?.description === 'string' ? data.description : undefined;
      const locationSource = typeof data?.location === 'string' ? data.location : description;
      const ml = locationSource ? matchLocation(locationSource) : null;
      const loc = ml ? { primary: ml.primary, secondary: ml.secondary, tertiary: ml.tertiary } : ({} as CanonicalLocation);
      sessionStorage.removeItem('intentData');
      return { profession, loc, description };
    } catch {
      return { profession: undefined as string | undefined, loc: {} as CanonicalLocation, description: undefined as string | undefined };
    }
  })();

  const hasInitialLocation = initialLocation && (initialLocation.primary || initialLocation.secondary || initialLocation.tertiary);
  const hasIntentLocation = initialFromIntent.loc.primary || initialFromIntent.loc.secondary || initialFromIntent.loc.tertiary;

  // Prefer intent-derived location to align with pattern-matched queries
  const baseLoc = hasIntentLocation
    ? initialFromIntent.loc
    : hasInitialLocation
      ? initialLocation
      : ({} as CanonicalLocation);

  const initialSearch = (initialSearchTerm || initialFromIntent.description || initialFromIntent.profession || '').trim();
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [professionHint] = useState<string | undefined>(initialFromIntent.profession);
  const [loc, setLoc] = useState<CanonicalLocation>(baseLoc);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ primary?: string; secondary?: string; tertiary?: string; display: string }>>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  
  // Initialize locationDisplay from baseLoc - use only tertiary (most specific) for best filter results
  // The filter will naturally radiate outward from tertiary -> secondary -> primary
  const initialLocationDisplay = baseLoc.tertiary || baseLoc.secondary || baseLoc.primary || '';
  const [locationDisplay, setLocationDisplay] = useState<string>(initialLocationDisplay);

  // Debug: log pre-population values
    const [minRating, setMinRating] = useState<number>(0);

  console.log('[ProfessionalsList] Pre-population:', {
    projectId,
    initialSearchTerm,
    initialLocation,
    baseLoc,
    initialLocationDisplay,
    initialSearch
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const hasSelectedLocation = Boolean(loc.primary || loc.secondary || loc.tertiary);
    const hasIncomingLocation = Boolean(
      initialLocation?.primary || initialLocation?.secondary || initialLocation?.tertiary,
    );

    if (hasSelectedLocation || !hasIncomingLocation) return;

    setLoc(initialLocation as CanonicalLocation);
    setLocationDisplay(
      initialLocation?.tertiary || initialLocation?.secondary || initialLocation?.primary || '',
    );
  }, [
    initialLocation?.primary,
    initialLocation?.secondary,
    initialLocation?.tertiary,
    loc.primary,
    loc.secondary,
    loc.tertiary,
  ]);

  const suggestionPool = useMemo(() => {
    const pool = new Set<string>();
    professionals.forEach((pro) => {
      if (pro.professionType) pool.add(pro.professionType);
      if (pro.primaryTrade) pool.add(pro.primaryTrade);
      (pro.tradesOffered ?? []).forEach((trade) => pool.add(trade));
      (pro.suppliesOffered ?? []).forEach((supply) => pool.add(supply));
    });
    Object.keys(SERVICE_TO_PROFESSION).forEach((service) => pool.add(service));
    return Array.from(pool).sort();
  }, [professionals]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    const trimmed = value.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const lower = trimmed.toLowerCase();
    const matches = suggestionPool
      .filter((s) => s.toLowerCase().includes(lower))
      .slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  };

  const handleSuggestionSelect = (value: string) => {
    setSearchTerm(value);
    setShowSuggestions(false);
  };

  const handleLocationSearch = (value: string) => {
    setLocationSearch(value);
    if (!value.trim()) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }
    const results = searchLocations(value, 6);
    setLocationSuggestions(results);
    setShowLocationSuggestions(results.length > 0);
  };

  const handleLocationSelect = (result: { primary?: string; secondary?: string; tertiary?: string; display: string }) => {
    setLoc(result as CanonicalLocation);
    setLocationSearch('');
    setLocationDisplay(result.display);
    setShowLocationSuggestions(false);
  };

  const filteredBase = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const mappedProfession = needle ? matchServiceToProfession(needle) : null;
    const effectiveProfession = (mappedProfession || professionHint || '').toLowerCase() || undefined;

    const items = professionals.filter((pro) => {
      const haystacks = [
        pro.professionType,
        pro.fullName,
        pro.businessName,
        pro.primaryTrade,
        ...(pro.tradesOffered ?? []),
        ...(pro.suppliesOffered ?? []),
      ]
        .filter(Boolean)
        .map((s) => s!.toString().toLowerCase());

      const textMatch = needle ? haystacks.some((s) => s.includes(needle)) : false;
      const professionMatch = effectiveProfession
        ? haystacks.some((s) => s.includes(effectiveProfession))
        : false;

      const bySearch = needle || effectiveProfession ? textMatch || professionMatch || (!needle && professionMatch) : true;
      if (!bySearch) return false;

      const byRating = minRating === 0 || (typeof pro.rating === 'number' && pro.rating >= minRating);
      if (!byRating) return false;

      // If no location filter is set, show based on search only
      if (!loc.primary && !loc.secondary && !loc.tertiary) {
        return true;
      }

      // Build list of professional's service areas from both serviceArea string and location fields
      const serviceAreasRaw = Array.isArray(pro.serviceArea)
        ? pro.serviceArea
        : typeof pro.serviceArea === 'string'
          ? pro.serviceArea.split(',')
          : [];
      const serviceAreas = serviceAreasRaw
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      // Also include structured location fields
      const locationFields = [pro.locationPrimary, pro.locationSecondary, pro.locationTertiary]
        .filter(Boolean)
        .map((l) => l!.toLowerCase());

      const allAreas = [...serviceAreas, ...locationFields];

      // If professional has no service area, include them (they serve all areas)
      if (allAreas.length === 0) {
        return true;
      }

      // Check if any of the selected location parts match any service area
      const locationParts = [loc.primary, loc.secondary, loc.tertiary]
        .filter(Boolean)
        .map((l) => l!.toLowerCase());
      const byLocation = locationParts.length === 0 || locationParts.some((locPart) =>
        allAreas.some((area) => area.includes(locPart) || locPart.includes(area))
      );

      return byLocation;
    });

    const targetParts = [loc.tertiary, loc.secondary, loc.primary]
      .filter(Boolean)
      .map((t) => t!.toLowerCase());

    const scoreFor = (pro: Professional) => {
      const serviceAreasRaw = Array.isArray(pro.serviceArea)
        ? pro.serviceArea
        : typeof pro.serviceArea === 'string'
          ? pro.serviceArea.split(',')
          : [];
      const areas = [
        ...serviceAreasRaw.map((s) => s.trim().toLowerCase()),
        ...(pro.locationPrimary ? [pro.locationPrimary.toLowerCase()] : []),
        ...(pro.locationSecondary ? [pro.locationSecondary.toLowerCase()] : []),
        ...(pro.locationTertiary ? [pro.locationTertiary.toLowerCase()] : []),
      ].filter(Boolean);

      if (areas.length === 0) return -1;

      const equals = (a: string, b: string) => a === b;
      const loose = (a: string, b: string) => a.includes(b) || b.includes(a);

      let score = 0;
      if (targetParts[0]) {
        const t = targetParts[0]!;
        if (areas.some((a) => equals(a, t))) score += 100;
        else if (areas.some((a) => loose(a, t))) score += 60;
      }
      if (targetParts[1]) {
        const s = targetParts[1]!;
        if (areas.some((a) => equals(a, s))) score += 50;
        else if (areas.some((a) => loose(a, s))) score += 30;
      }
      if (targetParts[2]) {
        const p = targetParts[2]!;
        if (areas.some((a) => equals(a, p))) score += 10;
        else if (areas.some((a) => loose(a, p))) score += 5;
      }
      return score;
    };

    const sorted = items.slice().sort((a, b) => {
      const sa = scoreFor(a);
      const sb = scoreFor(b);
      if (sb !== sa) return sb - sa;
      const ra = typeof a.rating === 'number' ? a.rating : 0;
      const rb = typeof b.rating === 'number' ? b.rating : 0;
      if (rb !== ra) return rb - ra;
      const na = (a.fullName || a.businessName || '').toLowerCase();
      const nb = (b.fullName || b.businessName || '').toLowerCase();
      return na.localeCompare(nb);
    });

    return sorted;
  }, [professionals, searchTerm, professionHint, loc, minRating]);

  const filtered = useMemo(() => {
    if (filteredBase.length >= 3 || (!loc.primary && !loc.secondary && !loc.tertiary)) return filteredBase;
    // Widen scope: ignore location filter when fewer than 3 results, but preserve trade/search/rating intent
    const needle = searchTerm.trim().toLowerCase();
    const mappedProfession = needle ? matchServiceToProfession(needle) : null;
    const effectiveProfession = (mappedProfession || professionHint || '').toLowerCase() || undefined;

    const widened = professionals
      .filter((pro) => {
        const haystacks = [
          pro.professionType,
          pro.fullName,
          pro.businessName,
          pro.primaryTrade,
          ...(pro.tradesOffered ?? []),
          ...(pro.suppliesOffered ?? []),
        ]
          .filter(Boolean)
          .map((s) => s!.toString().toLowerCase());

        const textMatch = needle ? haystacks.some((s) => s.includes(needle)) : false;
        const professionMatch = effectiveProfession
          ? haystacks.some((s) => s.includes(effectiveProfession))
          : false;

        const bySearch = needle || effectiveProfession
          ? textMatch || professionMatch || (!needle && professionMatch)
          : true;
        if (!bySearch) return false;

        const byRating = minRating === 0 || (typeof pro.rating === 'number' && pro.rating >= minRating);
        return byRating;
      })
      .sort((a, b) => {
      const ra = typeof a.rating === 'number' ? a.rating : 0;
      const rb = typeof b.rating === 'number' ? b.rating : 0;
      if (rb !== ra) return rb - ra;
      const na = (a.fullName || a.businessName || '').toLowerCase();
      const nb = (b.fullName || b.businessName || '').toLowerCase();
      return na.localeCompare(nb);
    });
    return widened;
  }, [filteredBase, professionals, loc.primary, loc.secondary, loc.tertiary, searchTerm, professionHint, minRating]);

  const maxSelect = Math.min(3, filtered.length);
  // Always start with empty selection - no persistence
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Preselect first N (recommendation) - only if coming from home page with intent
  useMemo(() => {
    // Drop selections that no longer exist in the filtered list
    const currentIds = new Set(filtered.map((p) => p.id));
    const next = new Set<string>();
    selectedIds.forEach((id) => { if (currentIds.has(id)) next.add(id); });
    
    // If coming from home page (intentData), auto-preselect first N if none selected
    if (next.size === 0 && filtered.length > 0 && initialFromIntent.profession) {
      for (let i = 0; i < Math.min(3, filtered.length); i++) {
        next.add(filtered[i].id);
      }
    }
    
    if (Array.from(next).sort().join(',') !== Array.from(selectedIds).sort().join(',')) {
      setSelectedIds(next);
    }
  }, [filtered, initialFromIntent.profession]);

  const toggleSelection = (pro: Professional) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pro.id)) {
        next.delete(pro.id);
        return next;
      }
      if (next.size >= maxSelect) {
        // replace: allow selecting another by removing the earliest selected
        const first = next.values().next().value as string | undefined;
        if (first) next.delete(first);
      }
      next.add(pro.id);
      return next;
    });
  };

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPro, setDetailsPro] = useState<Professional | null>(null);

  const shareInitialData = useMemo<Partial<ProjectFormData>>(() => {
    const needle = (searchTerm || '').trim();
    const mapped = needle ? matchServiceToProfession(needle) : (professionHint || '');
    const mainTrade = (mapped || needle || '').trim();
    const locationLabel = [loc.primary, loc.secondary, loc.tertiary].filter(Boolean).join(', ');
    const defaultTitle = (() => {
      if (mainTrade && locationLabel) return t('defaults.tradeInLocation', { trade: mainTrade, location: locationLabel });
      if (mainTrade) return mainTrade;
      if (locationLabel) return t('defaults.serviceRequestInLocation', { location: locationLabel });
      return t('defaults.serviceRequest');
    })();
    const prefill = initialProjectData || {};

    return {
      projectName: prefill.projectName || defaultTitle,
      location: prefill.location || loc,
      tradesRequired: (prefill.tradesRequired && prefill.tradesRequired.length > 0)
        ? prefill.tradesRequired
        : (mainTrade ? [mainTrade] : []),
      notes: prefill.notes || initialFromIntent.description || '',
      photoUrls: prefill.photoUrls,
      onlySelectedProfessionalsCanBid: prefill.onlySelectedProfessionalsCanBid ?? true,
    };
  }, [initialFromIntent.description, initialProjectData, loc, professionHint, searchTerm, t]);

  const handleInviteSelected = () => {
    if (requireLocation && !loc.primary && !loc.secondary && !loc.tertiary) {
      return;
    }

    if (projectId) {
      setIsModalOpen(true);
      return;
    }

    const selectedProfessionals = filtered.filter((p) => selectedIds.has(p.id));
    if (selectedProfessionals.length === 0) return;

    let existingDraft: {
      initialData?: Partial<ProjectFormData>;
      aiIntakeId?: string;
    } | null = null;
    try {
      const rawDraft = sessionStorage.getItem('createProjectDraft');
      if (rawDraft) {
        existingDraft = JSON.parse(rawDraft) as {
          initialData?: Partial<ProjectFormData>;
          aiIntakeId?: string;
        };
      }
    } catch {
      existingDraft = null;
    }

    const mergedInitialData: Partial<ProjectFormData> = {
      ...(existingDraft?.initialData || {}),
      ...shareInitialData,
      projectName:
        existingDraft?.initialData?.projectName ||
        shareInitialData.projectName ||
        '',
      notes:
        existingDraft?.initialData?.notes ||
        shareInitialData.notes ||
        initialFromIntent.description ||
        '',
      aiFrom: shareInitialData.aiFrom || existingDraft?.initialData?.aiFrom,
    };

    sessionStorage.setItem(
      'projectDescription',
      JSON.stringify({
        description: mergedInitialData.notes || '',
        profession: mergedInitialData.tradesRequired?.[0],
        location: mergedInitialData.location,
        tradesRequired: mergedInitialData.tradesRequired || [],
      }),
    );

    sessionStorage.setItem(
      'createProjectDraft',
      JSON.stringify({
        initialData: mergedInitialData,
        selectedProfessionals,
        ...(existingDraft?.aiIntakeId ? { aiIntakeId: existingDraft.aiIntakeId } : {}),
      }),
    );

    router.push('/create-project');
  };

  const openDetails = (pro: Professional) => {
    setDetailsPro(pro);
    setDetailsOpen(true);
  };

  const locationSelected = Boolean(loc.primary || loc.secondary || loc.tertiary);
  const blockInviteForMissingLocation = requireLocation && !locationSelected;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3">
          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">{t('filters.professionalOrTrade')}</label>
            <div className="relative">
              <input
                type="text"
                placeholder={t('filters.professionalOrTradePlaceholder')}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowSuggestions(suggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm pr-8"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  aria-label={t('filters.clearSearchAria')}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {showSuggestions && suggestions.length > 0 ? (
              <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSuggestionSelect(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">{t('filters.location')}</label>
            <div className="relative">
              <input
                type="text"
                placeholder={t('filters.locationPlaceholder')}
                value={locationDisplay || locationSearch}
                onChange={(e) => {
                  setLocationDisplay('');
                  handleLocationSearch(e.target.value);
                }}
                onFocus={() => {
                  // Don't clear locationDisplay on focus - only when user starts typing
                  // Show suggestions only if there's an active search
                  if (locationSearch) setShowLocationSuggestions(locationSuggestions.length > 0);
                }}
                onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 100)}
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm pr-8"
              />
              {(locationSearch || locationDisplay || loc.primary || loc.secondary || loc.tertiary) && (
                <button
                  type="button"
                  onClick={() => {
                    handleLocationSearch('');
                    setLocationDisplay('');
                    setLoc({});
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  aria-label={t('filters.clearLocationAria')}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {showLocationSuggestions && locationSuggestions.length > 0 ? (
              <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {locationSuggestions.map((result, idx) => (
                  <button
                    key={`${idx}-${result.primary}-${result.secondary}-${result.tertiary}`}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleLocationSelect(result)}
                  >
                    <div className="font-medium text-sm">{result.display}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">{t('filters.rating')}</label>
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white"
            >
              <option value={0}>{t('filters.anyRating')}</option>
              <option value={4.5}>{t('filters.rating45')}</option>
              <option value={4}>{t('filters.rating4')}</option>
              <option value={3.5}>{t('filters.rating35')}</option>
              <option value={3}>{t('filters.rating3')}</option>
              <option value={2}>{t('filters.rating2')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {t('states.empty')}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" suppressHydrationWarning>
          {filtered.map((pro) => (
            <ProfessionalCard
              key={pro.id}
              isSelected={selectedIds.has(pro.id)}
              pro={pro}
              onToggle={toggleSelection}
              onViewDetails={openDetails}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {selectedIds.size > 0 ? (
        <div className="fixed top-20 right-6 z-40 flex flex-col items-end gap-2">
          {blockInviteForMissingLocation && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm max-w-[220px]">
              Please set location before continuing.
            </div>
          )}
          <button
            type="button"
            onClick={handleInviteSelected}
            disabled={blockInviteForMissingLocation}
            className="rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition animate-pulse-slow px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t('actions.shareProjectAria')}
          >
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-xs font-semibold leading-tight">
                {selectedIds.size === 1 ? t('actions.inviteOne') : t('actions.inviteMany', { count: selectedIds.size })}
              </span>
              {selectedIds.size < 3 && (
                <span className="text-[9px] text-indigo-200 mt-0.5">
                  {t('actions.recommendAtLeastThree')}
                </span>
              )}
            </div>
          </button>
        </div>
      ) : null}

      <ProjectShareModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          // Clear selections after sending emails
          setSelectedIds(new Set());
        }}
        professionals={filtered.filter((p) => selectedIds.has(p.id))}
        projectId={projectId}
        initialData={shareInitialData}
      />

      <ProfessionalDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        professional={detailsPro}
      />
      
      {/* Back to top button - behind the share project button */}
      <BackToTop zIndex={30} />
    </div>
  );
}
