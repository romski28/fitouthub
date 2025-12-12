'use client';

import { useMemo, useState, useEffect, memo } from 'react';
import LocationSelect, { CanonicalLocation } from '@/components/location-select';
import { matchLocation } from '@/lib/location-matcher';
import { Professional } from '@/lib/types';

const Pill = memo(({ label }: { label: string }) => {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
});
Pill.displayName = 'Pill';

const ProfessionalCard = memo(({ pro }: { pro: Professional }) => {
  const serviceAreas = useMemo(() => 
    (pro.serviceArea ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    [pro.serviceArea]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900">
            {pro.fullName || pro.businessName || 'Professional'}
          </div>
          <div className="text-xs text-slate-600">{pro.professionType}</div>
        </div>
        <Pill label={pro.professionType} />
        <Pill label={pro.status} />
        <Pill label={`${pro.rating.toFixed(1)}★`} />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span className="font-semibold">Email:</span>
          <span className="text-slate-600">{pro.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span className="font-semibold">Phone:</span>
          <span className="text-slate-600">{pro.phone}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span className="font-semibold">Status:</span>
          <span className="text-slate-600 capitalize">{pro.status}</span>
        </div>
      </div>

      {/* Trades/Supplies */}
      {(pro.primaryTrade || (pro.tradesOffered && pro.tradesOffered.length > 0) || (pro.suppliesOffered && pro.suppliesOffered.length > 0)) && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-700 mb-2">
            {pro.professionType === 'contractor' && 'Trade:'}
            {pro.professionType === 'company' && 'Trades Offered:'}
            {pro.professionType === 'reseller' && 'Supplies:'}
          </div>
          <div className="flex flex-wrap gap-2">
            {pro.primaryTrade && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                {pro.primaryTrade}
              </span>
            )}
            {pro.tradesOffered?.map((trade) => (
              <span key={trade} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                {trade}
              </span>
            ))}
            {pro.suppliesOffered?.map((supply) => (
              <span key={supply} className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                {supply}
              </span>
            ))}
          </div>
        </div>
      )}

      {serviceAreas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
          {serviceAreas.map((area) => (
            <span key={area} className="rounded border border-slate-200 px-2 py-1">
              {area}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
ProfessionalCard.displayName = 'ProfessionalCard';

interface Props {
  professionals: Professional[];
  initialLocation?: CanonicalLocation;
}

export default function ProfessionalsList({ professionals, initialLocation }: Props) {
  // Initialize from intentData synchronously to avoid effect-based setState
  const initialFromIntent = (() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('intentData') : null;
      if (!raw) return { profession: undefined as string | undefined, loc: {} as CanonicalLocation };
      const data = JSON.parse(raw);
      const profession = typeof data?.professionType === 'string' ? data.professionType : undefined;
      const ml = typeof data?.location === 'string' ? matchLocation(data.location) : null;
      const loc = ml ? { primary: ml.primary, secondary: ml.secondary, tertiary: ml.tertiary } : ({} as CanonicalLocation);
      sessionStorage.removeItem('intentData');
      return { profession, loc };
    } catch {
      return { profession: undefined as string | undefined, loc: {} as CanonicalLocation };
    }
  })();

  const baseLoc = initialLocation && (initialLocation.primary || initialLocation.secondary || initialLocation.tertiary)
    ? initialLocation
    : initialFromIntent.loc;

  const [professionFilter, setProfessionFilter] = useState<string | undefined>(initialFromIntent.profession);
  const [professionInput, setProfessionInput] = useState<string>(initialFromIntent.profession || '');
  const [loc, setLoc] = useState<CanonicalLocation>(baseLoc);

  // Debounce profession filter for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setProfessionFilter(professionInput || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [professionInput]);

  const filtered = useMemo(() => {
    return professionals.filter((pro) => {
      const byProfession = professionFilter ? pro.professionType?.toLowerCase() === professionFilter.toLowerCase() : true;
      
      // If no location filter is set, show all professionals
      if (!loc.primary && !loc.secondary && !loc.tertiary) {
        return byProfession;
      }

      const serviceAreas = (pro.serviceArea ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      // If professional has no service area, include them (they serve all areas)
      if (serviceAreas.length === 0) {
        return byProfession;
      }

      // Check if any of the selected location parts match any service area
      const locationParts = [loc.primary, loc.secondary, loc.tertiary].filter(Boolean).map((l) => l!.toLowerCase());
      const byLocation = locationParts.length === 0 || locationParts.some((locPart) => 
        serviceAreas.some((area) => area.includes(locPart) || locPart.includes(area))
      );

      return byProfession && byLocation;
    });
  }, [professionals, professionFilter, loc]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm text-slate-600">Profession</label>
            <input
              type="text"
              placeholder="e.g. plumber, electrician"
              value={professionInput}
              onChange={(e) => setProfessionInput(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2"
            />
          </div>

          <LocationSelect value={loc} onChange={setLoc} />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No matching professionals.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((pro) => (
            <ProfessionalCard key={pro.id} pro={pro} />
          ))}
        </div>
      )}
    </div>
  );
}
