'use client';

import { useMemo, useState, memo } from 'react';
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
              {pro.fullName || pro.businessName || 'Professional'}
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
                <span className="font-semibold">Email:</span>
                <span className="text-slate-600 break-all">{pro.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="font-semibold">Phone:</span>
                <span className="text-slate-600">{pro.phone}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span className="text-slate-600">Contact details available after match.</span>
            </div>
          )}
        </div>

        {/* Trades/Supplies */}
        {(pro.primaryTrade || (pro.tradesOffered && pro.tradesOffered.length > 0) || (pro.suppliesOffered && pro.suppliesOffered.length > 0)) && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              {pro.professionType === 'contractor' && 'Trade'}
              {pro.professionType === 'company' && 'Trades Offered'}
              {pro.professionType === 'reseller' && 'Supplies'}
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
                  +{(pro.tradesOffered?.length ?? 0) + (pro.suppliesOffered?.length ?? 0) - 2} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Service Areas */}
        {serviceAreas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Areas Served</p>
            <div className="flex flex-wrap gap-1.5">
              {serviceAreas.slice(0, 4).map((area, index) => (
                <span key={`area-${index}`} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {area}
                </span>
              ))}
              {serviceAreas.length > 4 && (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  +{serviceAreas.length - 4} more
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
            View details
          </button>
          <button
            type="button"
            onClick={() => onToggle(pro)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${isSelected ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}
          >
            {isSelected ? 'Selected' : 'Ask for help'}
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
}

export default function ProfessionalsList({ professionals, initialLocation, projectId, initialSearchTerm, initialProjectData }: Props) {
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
  console.log('[ProfessionalsList] Pre-population:', {
    projectId,
    initialSearchTerm,
    initialLocation,
    baseLoc,
    initialLocationDisplay,
    initialSearch
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      const areas = serviceAreasRaw.map((s) => s.trim().toLowerCase());

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
  }, [professionals, searchTerm, professionHint, loc]);

  const filtered = useMemo(() => {
    if (filteredBase.length >= 3 || (!loc.primary && !loc.secondary && !loc.tertiary)) return filteredBase;
    // Widen scope: ignore location filter when fewer than 3 results
    const widened = professionals.slice().sort((a, b) => {
      const ra = typeof a.rating === 'number' ? a.rating : 0;
      const rb = typeof b.rating === 'number' ? b.rating : 0;
      if (rb !== ra) return rb - ra;
      const na = (a.fullName || a.businessName || '').toLowerCase();
      const nb = (b.fullName || b.businessName || '').toLowerCase();
      return na.localeCompare(nb);
    });
    return widened;
  }, [filteredBase, professionals, loc.primary, loc.secondary, loc.tertiary]);

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

  const openDetails = (pro: Professional) => {
    setDetailsPro(pro);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Professional or Trade</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. John Smith, plumber, AC servicing"
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
                  aria-label="Clear search"
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
            <label className="text-xs font-medium text-slate-600">Location</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Hong Kong, Central"
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
                  aria-label="Clear location"
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
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No matching professionals.
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
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="fixed top-20 right-6 z-40 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 transition animate-pulse-slow px-4 py-3"
          aria-label="Share your project"
        >
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-xs font-semibold leading-tight">
              {selectedIds.size === 1 ? 'Invite 1 Professional' : `Invite ${selectedIds.size} Professionals`}
            </span>
            {selectedIds.size < 3 && (
              <span className="text-[9px] text-indigo-200 mt-0.5">
                We recommend at least 3
              </span>
            )}
          </div>
        </button>
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
        initialData={(() => {
          const needle = (searchTerm || '').trim();
          const mapped = needle ? matchServiceToProfession(needle) : (professionHint || '');
          const mainTrade = (mapped || needle || '').trim();
          const locationLabel = [loc.primary, loc.secondary, loc.tertiary].filter(Boolean).join(', ');
          const defaultTitle = (() => {
            if (mainTrade && locationLabel) return `${mainTrade} in ${locationLabel}`;
            if (mainTrade) return mainTrade;
            if (locationLabel) return `Service Request in ${locationLabel}`;
            return 'Service Request';
          })();
          const prefill = initialProjectData || {};
          return {
            projectName: prefill.projectName || defaultTitle,
            location: prefill.location || loc,
            tradesRequired: (prefill.tradesRequired && prefill.tradesRequired.length > 0)
              ? prefill.tradesRequired
              : (mainTrade ? [mainTrade] : []),
            notes: prefill.notes,
            photoUrls: prefill.photoUrls,
          };
        })()}
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
