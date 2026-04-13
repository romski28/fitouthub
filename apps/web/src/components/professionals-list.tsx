'use client';

import { useEffect, useMemo, useState, memo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ProfessionalDetailsModal } from '@/components/professional-details-modal';
import { CanonicalLocation } from '@/components/location-select';
import { searchLocations } from '@/lib/location-search';
import { SERVICE_TO_PROFESSION, matchServiceToProfession } from '@/lib/service-matcher';
import { matchLocation } from '@/lib/location-matcher';
import { Professional } from '@/lib/types';
import { HkZoneMap } from '@/components/hk-zone-map';
import { ProjectShareModal } from '@/components/project-share-modal';
import { useAuth } from '@/context/auth-context';
import { BackToTop } from '@/components/back-to-top';
import type { ProjectFormData } from '@/components/project-form';
import { writeCreateProjectDraftSafely } from '@/lib/draft-storage';
import {
  getCreateProjectDraftHandoff,
  getProjectDescriptionHandoff,
  setCreateProjectDraftHandoff,
  setProjectDescriptionHandoff,
} from '@/lib/create-project-handoff';

const normalizeUniqueList = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
};

const splitCsvUnique = (value?: string | null) =>
  normalizeUniqueList((value || '').split(',').map((part) => part.trim()));

const DISTRICT_TO_ZONE: Record<string, string> = {
  'central and western': 'HKI',
  'wan chai': 'HKI',
  'eastern': 'HKI',
  'southern': 'HKI',
  'yau tsim mong': 'KLN',
  'sham shui po': 'KLN',
  'kowloon city': 'KLN',
  'wong tai sin': 'KLN',
  'kwun tong': 'KLN',
  'sai kung': 'NTE',
  'sha tin': 'NTE',
  'tai po': 'NTE',
  'north': 'NTE',
  'tuen mun': 'NTW',
  'yuen long': 'NTW',
  'tsuen wan': 'NTW',
  'kwai tsing': 'NTW',
  'islands district': 'ISL',
  'islands': 'ISL',
};

const deriveHighlightedZones = (pro: Professional): string[] => {
  const normalizedCodes = new Set<string>();

  for (const item of pro.regionCoverage || []) {
    const code = item?.zone?.code?.toUpperCase();
    if (code) normalizedCodes.add(code);
  }

  if (normalizedCodes.size > 0) {
    return Array.from(normalizedCodes);
  }

  const primary = (pro.locationPrimary || '').trim().toLowerCase();
  if (primary === 'hong kong island' || primary === 'hki') normalizedCodes.add('HKI');
  if (primary === 'kowloon' || primary === 'kln') normalizedCodes.add('KLN');
  if (primary === 'islands district' || primary === 'islands' || primary === 'isl') normalizedCodes.add('ISL');
  if (primary === 'new territories' || primary === 'nt') {
    normalizedCodes.add('NTE');
    normalizedCodes.add('NTW');
  }

  const secondary = (pro.locationSecondary || '').trim().toLowerCase();
  const mappedSecondary = DISTRICT_TO_ZONE[secondary];
  if (mappedSecondary) normalizedCodes.add(mappedSecondary);

  return Array.from(normalizedCodes);
};

const ProfessionalCard = memo(({
  pro,
  onToggle,
  onViewDetails,
  onCompare,
  isSelected,
  isCompared,
  isAdmin,
  disableSelection,
  showSelectionAction,
}: {
  pro: Professional;
  onToggle: (pro: Professional) => void;
  onViewDetails: (pro: Professional) => void;
  onCompare: (pro: Professional) => void;
  isSelected: boolean;
  isCompared: boolean;
  isAdmin: boolean;
  disableSelection: boolean;
  showSelectionAction: boolean;
}) => {
  const t = useTranslations('professionalsPage.list');
  const roleIcon = pro.professionType === 'company' ? '🏢' : pro.professionType === 'reseller' ? '📦' : '👷';
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [showAllAreas, setShowAllAreas] = useState(false);
  const serviceAreas = useMemo(() => splitCsvUnique(pro.serviceArea), [pro.serviceArea]);
  const tradeBadges = useMemo(() => {
    if (pro.professionType === 'reseller') {
      return normalizeUniqueList([pro.primaryTrade, ...(pro.suppliesOffered || [])]);
    }
    return normalizeUniqueList([pro.primaryTrade, ...(pro.tradesOffered || [])]);
  }, [pro.primaryTrade, pro.tradesOffered, pro.suppliesOffered, pro.professionType]);

  const visibleAreas = showAllAreas ? serviceAreas : serviceAreas.slice(0, 3);
  const hiddenAreasCount = Math.max(0, serviceAreas.length - visibleAreas.length);
  const visibleTrades = showAllTrades ? tradeBadges : tradeBadges.slice(0, 3);
  const hiddenTradesCount = Math.max(0, tradeBadges.length - visibleTrades.length);
  const refCount = pro.referenceProjects?.length || 0;
  const photoCount = pro.profileImages?.length || 0;
  const highlightedZones = useMemo(() => deriveHighlightedZones(pro), [pro]);

  const accentColor = isSelected
    ? 'border-emerald-400 ring-2 ring-emerald-200'
    : isCompared
      ? 'border-indigo-300 ring-2 ring-indigo-100'
      : 'border-slate-200';

  return (
    <div className={`browse-card ${accentColor}`}>
      <div className="browse-card-header">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-base" aria-hidden="true">{roleIcon}</span>
              <h3 className="truncate text-sm font-bold text-white">
                {pro.fullName || pro.businessName || t('fallbackProfessional')}
              </h3>
            </div>
            {pro.businessName && pro.fullName && pro.businessName !== pro.fullName && (
              <p className="ml-6 truncate text-[11px] text-slate-300">{pro.businessName}</p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-white/40">
            {pro.rating.toFixed(1)}★
          </span>
        </div>
      </div>

      <div className="browse-card-body">
        {/* Trades (aggregated) */}
        {tradeBadges.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Trades</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleTrades.map((trade) => (
                  <span key={`${pro.id}-trade-${trade}`} className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {trade}
                  </span>
                ))}
                {hiddenTradesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTrades(true)}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    +{hiddenTradesCount} more
                  </button>
                )}
                {showAllTrades && tradeBadges.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTrades(false)}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Areas covered (deduplicated) */}
          {serviceAreas.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Areas covered</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleAreas.map((area) => (
                  <span key={`${pro.id}-area-${area}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                    {area}
                  </span>
                ))}
                {hiddenAreasCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAreas(true)}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    +{hiddenAreasCount} more
                  </button>
                )}
                {showAllAreas && serviceAreas.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAreas(false)}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}

          {highlightedZones.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Coverage map</p>
              <HkZoneMap highlightedCodes={highlightedZones} compact />
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            {refCount > 0 && <span>📁 {refCount} refs</span>}
            {photoCount > 0 && <span>🖼 {photoCount} photos</span>}
            {pro.emergencyCalloutAvailable && (
              <span className="font-semibold text-rose-500">⚡ Emergency</span>
            )}
            {isAdmin && (
              <span className="ml-auto truncate text-slate-400">{pro.email}</span>
            )}
          </div>

        {/* Actions — all buttons share the same height via browse-card-button-sm */}
        <div className="mt-auto flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => onViewDetails(pro)}
            className="browse-card-button-sm browse-card-button-secondary flex-1 whitespace-nowrap"
          >
            {t('viewDetails')}
          </button>
          <button
            type="button"
            onClick={() => onCompare(pro)}
            title={isCompared ? 'Remove from comparison' : 'Add to comparison'}
            className={`browse-card-button-sm shrink-0 ${
              isCompared
                ? 'border border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {isCompared ? '✓ Comparing' : '⊕ Compare'}
          </button>
          {showSelectionAction && (
            <button
              type="button"
              onClick={() => onToggle(pro)}
              disabled={disableSelection}
              className={`browse-card-button-sm shrink-0 ${
                isSelected
                  ? 'browse-card-button-success'
                  : 'browse-card-button-success-outline'
              }`}
            >
              {isSelected ? '✓ Selected' : t('askForHelp')}
            </button>
          )}
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
  const hasProjectDefinition = Boolean(
    projectId ||
    initialProjectData?.projectName?.trim() ||
    initialProjectData?.notes?.trim() ||
    (initialProjectData?.tradesRequired && initialProjectData.tradesRequired.length > 0)
  );
  const canInviteProfessionals = hasProjectDefinition;

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

  const [regionExpanded, setRegionExpanded] = useState(false);
  // Reset expansion whenever the location filter itself changes
  useEffect(() => { setRegionExpanded(false); }, [loc.primary, loc.secondary, loc.tertiary]);

  const filtered = useMemo(() => {
    const hasLocation = Boolean(loc.primary || loc.secondary || loc.tertiary);
    const hasExplicitRating = minRating > 0;

    // If the user explicitly expanded to all regions, return trade+rating without location
    if (regionExpanded && hasLocation) {
      const needle = searchTerm.trim().toLowerCase();
      const mappedProfession = needle ? matchServiceToProfession(needle) : null;
      const effectiveProfession = (mappedProfession || professionHint || '').toLowerCase() || undefined;
      return professionals
        .filter((pro) => {
          const haystacks = [
            pro.professionType, pro.fullName, pro.businessName, pro.primaryTrade,
            ...(pro.tradesOffered ?? []), ...(pro.suppliesOffered ?? []),
          ].filter(Boolean).map((s) => s!.toString().toLowerCase());
          const textMatch = needle ? haystacks.some((s) => s.includes(needle)) : false;
          const professionMatch = effectiveProfession ? haystacks.some((s) => s.includes(effectiveProfession)) : false;
          const bySearch = needle || effectiveProfession ? textMatch || professionMatch || (!needle && professionMatch) : true;
          if (!bySearch) return false;
          return minRating === 0 || (typeof pro.rating === 'number' && pro.rating >= minRating);
        })
        .sort((a, b) => {
          const ra = typeof a.rating === 'number' ? a.rating : 0;
          const rb = typeof b.rating === 'number' ? b.rating : 0;
          if (rb !== ra) return rb - ra;
          return (a.fullName || a.businessName || '').toLowerCase().localeCompare((b.fullName || b.businessName || '').toLowerCase());
        });
    }

    // Only widen when: no location is set, OR fewer than 3 results AND no explicit rating is applied.
    // Never drop location when the user has chosen a specific rating — that would silently ignore one of their filters.
    if (filteredBase.length >= 3 || !hasLocation || hasExplicitRating) return filteredBase;

    // Widen scope: relax location when fewer than 3 results and no explicit rating, preserving trade/search intent.
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
        return bySearch;
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
  }, [filteredBase, professionals, loc.primary, loc.secondary, loc.tertiary, searchTerm, professionHint, minRating, regionExpanded]);

  // Narrowly-scoped count: how many matched with location+trade+rating (before any widening)
  const filteredBaseCount = filteredBase.length;
  const locationIsActive = Boolean(loc.primary || loc.secondary || loc.tertiary);
  // Show expand nudge when a region is active, not yet expanded, and local results are thin (≤2)
  const canShowExpand = locationIsActive && !regionExpanded && filteredBaseCount <= 2;

  const maxSelect = Math.min(3, filtered.length);
  // Always start with empty selection - no persistence
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Separate compare set — up to 3 professionals for side-by-side comparison
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const locationSelected = Boolean(loc.primary || loc.secondary || loc.tertiary);
  const blockInviteForMissingLocation = requireLocation && !locationSelected;

  // Preselect first N (recommendation) - only if coming from home page with intent
  useMemo(() => {
    // Drop selections that no longer exist in the filtered list
    const currentIds = new Set(filtered.map((p) => p.id));
    const next = new Set<string>();
    selectedIds.forEach((id) => { if (currentIds.has(id)) next.add(id); });
    
    // If coming from home page (intentData), auto-preselect first N if none selected
    const hasRequiredLocation = !requireLocation || Boolean(loc.primary || loc.secondary || loc.tertiary);
    if (next.size === 0 && filtered.length > 0 && initialFromIntent.profession && hasRequiredLocation && canInviteProfessionals) {
      for (let i = 0; i < Math.min(3, filtered.length); i++) {
        next.add(filtered[i].id);
      }
    }
    
    if (Array.from(next).sort().join(',') !== Array.from(selectedIds).sort().join(',')) {
      setSelectedIds(next);
    }
  }, [filtered, initialFromIntent.profession, requireLocation, loc.primary, loc.secondary, loc.tertiary, canInviteProfessionals]);

  useEffect(() => {
    if (!canInviteProfessionals && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [canInviteProfessionals, selectedIds]);

  const toggleSelection = (pro: Professional) => {
    if (!canInviteProfessionals || blockInviteForMissingLocation) return;

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

  const toggleCompare = (pro: Professional) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(pro.id)) {
        next.delete(pro.id);
        return next;
      }
      if (next.size >= 3) {
        // Evict the oldest comparison to make room
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
      isEmergency: prefill.isEmergency,
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

    const handoffDebug =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('debugFlow') === '1' ||
        window.localStorage.getItem('fh_debug_handoff') === '1');

    let existingDraft: {
      initialData?: Partial<ProjectFormData>;
      aiIntakeId?: string;
    } | null = null;
    let existingProjectDescription: {
      title?: string;
      description?: string;
      isEmergency?: boolean;
      tradesRequired?: string[];
      location?: CanonicalLocation;
    } | null = null;
    try {
      const rawDraft = sessionStorage.getItem('createProjectDraft');
      if (rawDraft) {
        existingDraft = JSON.parse(rawDraft) as {
          initialData?: Partial<ProjectFormData>;
          aiIntakeId?: string;
        };
      }

      const rawDescription = sessionStorage.getItem('projectDescription');
      if (rawDescription) {
        existingProjectDescription = JSON.parse(rawDescription) as {
          title?: string;
          description?: string;
          isEmergency?: boolean;
          tradesRequired?: string[];
          location?: CanonicalLocation;
        };
      }
    } catch {
      existingDraft = null;
      existingProjectDescription = null;
    }

    const memoryDraft = getCreateProjectDraftHandoff();
    const memoryProjectDescription = getProjectDescriptionHandoff();

    const mergedInitialData: Partial<ProjectFormData> = {
      ...(memoryDraft?.initialData || existingDraft?.initialData || {}),
      ...shareInitialData,
      projectName:
        memoryProjectDescription?.title ||
        existingProjectDescription?.title ||
        memoryDraft?.initialData?.projectName ||
        existingDraft?.initialData?.projectName ||
        shareInitialData.projectName ||
        '',
      notes:
        memoryProjectDescription?.description ||
        existingProjectDescription?.description ||
        memoryDraft?.initialData?.notes ||
        existingDraft?.initialData?.notes ||
        shareInitialData.notes ||
        initialFromIntent.description ||
        '',
      isEmergency:
        memoryProjectDescription?.isEmergency ??
        existingProjectDescription?.isEmergency ??
        memoryDraft?.initialData?.isEmergency ??
        existingDraft?.initialData?.isEmergency ??
        shareInitialData.isEmergency,
      aiFrom: shareInitialData.aiFrom || memoryDraft?.initialData?.aiFrom || existingDraft?.initialData?.aiFrom,
    };

    if (handoffDebug) {
      console.info('[AI-HANDOFF][professionals-list] merged initial data', {
        sourceDraft: {
          projectName: existingDraft?.initialData?.projectName,
          notesLength: (existingDraft?.initialData?.notes || '').length,
          isEmergency: existingDraft?.initialData?.isEmergency,
        },
        sourceProjectDescription: {
          title: existingProjectDescription?.title,
          descriptionLength: (existingProjectDescription?.description || '').length,
          isEmergency: existingProjectDescription?.isEmergency,
        },
        sourceShareInitial: {
          projectName: shareInitialData.projectName,
          notesLength: (shareInitialData.notes || '').length,
          isEmergency: shareInitialData.isEmergency,
        },
        resolved: {
          projectName: mergedInitialData.projectName,
          notesLength: (mergedInitialData.notes || '').length,
          isEmergency: mergedInitialData.isEmergency,
        },
      });
    }

    try {
      sessionStorage.setItem(
        'projectDescription',
        JSON.stringify({
          title: mergedInitialData.projectName || '',
          description: mergedInitialData.notes || '',
          isEmergency: Boolean(mergedInitialData.isEmergency),
          profession: mergedInitialData.tradesRequired?.[0],
          location: mergedInitialData.location,
          tradesRequired: mergedInitialData.tradesRequired || [],
        }),
      );
    } catch {
      console.warn('[professionals-list] Unable to persist projectDescription due to storage limits.');
    }

    setProjectDescriptionHandoff({
      title: mergedInitialData.projectName || '',
      description: mergedInitialData.notes || '',
      isEmergency: Boolean(mergedInitialData.isEmergency),
      profession: mergedInitialData.tradesRequired?.[0],
      location: mergedInitialData.location,
      tradesRequired: mergedInitialData.tradesRequired || [],
    });

    const selectedProfessionalsForDraft = selectedProfessionals.map((professional) => ({
      id: professional.id,
      professionType: professional.professionType,
      email: professional.email || '',
      phone: professional.phone || '',
      status: professional.status || 'approved',
      rating: Number.isFinite(professional.rating) ? professional.rating : 0,
      fullName: professional.fullName ?? null,
      businessName: professional.businessName ?? null,
    }));

    const saved = writeCreateProjectDraftSafely({
      initialData: mergedInitialData,
      selectedProfessionals: selectedProfessionalsForDraft,
      ...(memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId
        ? { aiIntakeId: memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId }
        : {}),
    });

    setCreateProjectDraftHandoff({
      initialData: mergedInitialData,
      selectedProfessionals: selectedProfessionalsForDraft,
      ...(memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId
        ? { aiIntakeId: memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId }
        : {}),
    });

    if (!saved) {
      console.warn('[professionals-list] Unable to persist full createProjectDraft due to storage limits.');
    }

    router.push('/create-project');
  };

  const openDetails = (pro: Professional) => {
    setDetailsPro(pro);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-3 py-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3">
          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-white">{t('filters.professionalOrTrade')}</label>
            <div className="relative">
              <input
                type="text"
                placeholder={t('filters.professionalOrTradePlaceholder')}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowSuggestions(suggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
                className="w-full rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 pr-8 text-sm"
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
            <label className="text-xs font-medium text-white">{t('filters.location')}</label>
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
                className="w-full rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 pr-8 text-sm"
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
            <label className="text-xs font-medium text-white">{t('filters.rating')}</label>
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white/95 px-2.5 py-1.5 text-sm"
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

      {blockInviteForMissingLocation && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Please choose your project location first. We can&apos;t continue to professional selection without a location.
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {t('states.empty')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" suppressHydrationWarning>
          {filtered.map((pro) => (
            <ProfessionalCard
              key={pro.id}
              isSelected={selectedIds.has(pro.id)}
              isCompared={compareIds.has(pro.id)}
              pro={pro}
              onToggle={toggleSelection}
              onViewDetails={openDetails}
              onCompare={toggleCompare}
              isAdmin={isAdmin}
              disableSelection={blockInviteForMissingLocation}
              showSelectionAction={canInviteProfessionals}
            />
          ))}
        </div>
      )}

      {/* Region expansion nudge — shown when local results are thin (≤2) */}
      {canShowExpand && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">
            {filteredBaseCount === 0
              ? 'No professionals found in your selected area.'
              : `Only ${filteredBaseCount} professional${filteredBaseCount === 1 ? '' : 's'} found in your selected area.`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Expanding the search can surface professionals from other regions who may be available to travel.
          </p>
          <button
            type="button"
            onClick={() => setRegionExpanded(true)}
            className="browse-card-button browse-card-button-primary mt-4"
          >
            Show professionals from all areas
          </button>
          <p className="mt-2 text-[11px] text-slate-400 italic">✦ Smart region expansion coming soon — results will automatically include nearby areas</p>
        </div>
      )}

      {/* Banner shown while region is expanded */}
      {regionExpanded && locationIsActive && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="text-amber-800">
            <span className="font-semibold">Showing all areas.</span> Results are no longer filtered by your selected region.
          </p>
          <button
            type="button"
            onClick={() => setRegionExpanded(false)}
            className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            Back to local results
          </button>
        </div>
      )}

      {canInviteProfessionals && selectedIds.size > 0 ? (
        <div className="fixed top-20 right-6 z-40 flex flex-col items-end gap-2">
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
        onSelect={canInviteProfessionals ? (pro) => toggleSelection(pro) : undefined}
        isSelected={detailsPro ? selectedIds.has(detailsPro.id) : false}
      />

      {/* Comparison tray — sticky bottom bar when ≥1 professional is being compared */}
      {compareIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-indigo-200 bg-indigo-600 px-4 py-3 shadow-2xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-white shrink-0">Comparing:</span>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {Array.from(compareIds).map((id) => {
                  const pro = filtered.find((p) => p.id === id);
                  if (!pro) return null;
                  return (
                    <span key={id} className="flex items-center gap-1 rounded-full bg-indigo-500 pl-2.5 pr-1 py-0.5 text-[11px] font-semibold text-white">
                      {pro.fullName || pro.businessName || 'Professional'}
                      <button
                        type="button"
                        onClick={() => toggleCompare(pro)}
                        className="rounded-full p-0.5 hover:bg-indigo-400"
                        aria-label={`Remove ${pro.fullName || pro.businessName} from comparison`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCompareIds(new Set())}
                className="rounded-lg border border-indigo-400 px-3 py-1.5 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowCompare(true)}
                disabled={compareIds.size < 2}
                className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Compare {compareIds.size >= 2 ? `${compareIds.size}` : '(need ≥2)'} professionals →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison overlay */}
      {showCompare && (
        <ComparisonOverlay
          professionals={filtered.filter((p) => compareIds.has(p.id))}
          selectedIds={selectedIds}
          onToggle={toggleSelection}
          canSelectForInvite={canInviteProfessionals}
          onClose={() => setShowCompare(false)}
        />
      )}
      
      {/* Back to top button - behind the share project button */}
      <BackToTop zIndex={30} />
    </div>
  );
}

function ComparisonOverlay({
  professionals,
  selectedIds,
  onToggle,
  canSelectForInvite,
  onClose,
}: {
  professionals: Professional[];
  selectedIds: Set<string>;
  onToggle: (pro: Professional) => void;
  canSelectForInvite: boolean;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; value: (pro: Professional) => string }> = [
    {
      label: 'Rating',
      value: (pro) =>
        typeof pro.rating === 'number' && Number.isFinite(pro.rating)
          ? `${pro.rating.toFixed(1)}★`
          : '—',
    },
    { label: 'Type', value: (pro) => pro.professionType || '—' },
    { label: 'Trade Focus', value: (pro) => pro.primaryTrade || '—' },
    {
      label: 'Coverage',
      value: (pro) => {
        const zoneCodes = [
          ...new Set(
            (pro.regionCoverage || [])
              .map((c) => c?.zone?.label)
              .filter(Boolean) as string[]
          ),
        ];
        if (zoneCodes.length > 0) return zoneCodes.join(', ');
        return (
          (pro.serviceArea || '')
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(', ') || '—'
        );
      },
    },
    {
      label: 'References',
      value: (pro) => String(pro.referenceProjects?.length || 0),
    },
    {
      label: 'Portfolio Photos',
      value: (pro) => String(pro.profileImages?.length || 0),
    },
    {
      label: 'Emergency',
      value: (pro) => (pro.emergencyCalloutAvailable ? 'Available' : 'Standard'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative mx-4 w-full max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Comparison</p>
            <h3 className="text-lg font-bold text-white">Compare professionals side by side</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-500 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `220px repeat(${professionals.length}, minmax(220px, 1fr))` }}>
            <div className="sticky left-0 z-10 rounded-lg bg-slate-100 p-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Name
            </div>
            {professionals.map((pro, columnIndex) => (
              <div key={pro.id} className={`rounded-lg border border-slate-200 p-3 ${columnIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 line-clamp-2">
                    {pro.fullName || pro.businessName || 'Professional'}
                  </p>
                  {canSelectForInvite && selectedIds.has(pro.id) ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Selected
                    </span>
                  ) : null}
                </div>
                {canSelectForInvite ? (
                  <button
                    type="button"
                    onClick={() => onToggle(pro)}
                    className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      selectedIds.has(pro.id)
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {selectedIds.has(pro.id) ? '✓ Selected for Invite' : 'Select for Invite'}
                  </button>
                ) : null}
              </div>
            ))}

            {rows.map((row) => (
              <Fragment key={row.label}>
                <div className="sticky left-0 z-10 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  {row.label}
                </div>
                {professionals.map((pro, columnIndex) => (
                  <div
                    key={`${pro.id}-${row.label}`}
                    className={`rounded-lg border border-slate-100 p-3 text-sm text-slate-700 ${columnIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    {row.value(pro)}
                  </div>
                ))}
              </Fragment>
            ))}

            {/* Zone map row */}
            <Fragment key="zone-map">
              <div className="sticky left-0 z-10 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                Zone Map
              </div>
              {professionals.map((pro, columnIndex) => (
                <div
                  key={`${pro.id}-zone-map`}
                  className={`rounded-lg border border-slate-100 p-3 ${columnIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <HkZoneMap highlightedCodes={deriveHighlightedZones(pro)} compact />
                </div>
              ))}
            </Fragment>
          </div>
        </div>
      </div>
    </div>
  );
}
