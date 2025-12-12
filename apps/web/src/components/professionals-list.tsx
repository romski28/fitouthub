'use client';

import { useMemo, useState } from 'react';
import LocationSelect, { CanonicalLocation } from '@/components/location-select';
import { matchLocation } from '@/lib/location-matcher';
import { Professional } from '@/lib/types';

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

interface Props {
  professionals: Professional[];
}

export default function ProfessionalsList({ professionals }: Props) {
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

  const [professionFilter, setProfessionFilter] = useState<string | undefined>(initialFromIntent.profession);
  const [loc, setLoc] = useState<CanonicalLocation>(initialFromIntent.loc);

  const filtered = useMemo(() => {
    return professionals.filter((pro) => {
      const byProfession = professionFilter ? pro.professionType?.toLowerCase() === professionFilter.toLowerCase() : true;
      const serviceAreas = (pro.serviceArea ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      // If tertiary selected, match by tertiary string; else use secondary; else primary
      const target = loc.tertiary?.toLowerCase() || loc.secondary?.toLowerCase() || loc.primary?.toLowerCase();
      const byLocation = target ? serviceAreas.some((s) => s.includes(target)) : true;

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
              value={professionFilter ?? ''}
              onChange={(e) => setProfessionFilter(e.target.value || undefined)}
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
          {filtered.map((pro) => {
            const serviceAreas = (pro.serviceArea ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

            return (
              <div key={pro.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

                {serviceAreas.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                    {serviceAreas.map((area) => (
                      <span key={area} className="rounded border border-slate-200 px-2 py-1">
                        {area}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
