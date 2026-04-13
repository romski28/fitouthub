'use client';

import { useMemo, useState } from 'react';

const ZONES = [
  {
    code: 'HKI',
    label: 'Hong Kong Island',
    labelZh: '香港島',
    path: 'M50 118 L96 100 L142 112 L136 148 L88 160 L54 148 Z',
  },
  {
    code: 'KLN',
    label: 'Kowloon',
    labelZh: '九龍',
    path: 'M96 84 L152 66 L192 82 L168 106 L116 110 Z',
  },
  {
    code: 'NTE',
    label: 'New Territories East',
    labelZh: '新界東',
    path: 'M156 36 L226 26 L276 58 L238 100 L178 94 L168 66 Z',
  },
  {
    code: 'NTW',
    label: 'New Territories West',
    labelZh: '新界西',
    path: 'M62 52 L122 34 L168 50 L154 84 L96 90 L60 72 Z',
  },
  {
    code: 'ISL',
    label: 'Islands',
    labelZh: '離島',
    path: 'M198 122 L250 114 L286 134 L260 164 L214 162 L190 144 Z',
  },
] as const;

type Props = {
  highlightedCodes?: string[];
  compact?: boolean;
};

export function HkZoneMap({ highlightedCodes = [], compact = false }: Props) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const active = useMemo(() => new Set(highlightedCodes.map((code) => code.toUpperCase())), [highlightedCodes]);
  const hoveredZone = ZONES.find((zone) => zone.code === hoveredCode) || null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <svg viewBox="0 0 320 200" className="h-28 w-full" role="img" aria-label="Hong Kong zone coverage map">
        <rect x="0" y="0" width="320" height="200" rx="14" className="fill-white" />
        {ZONES.map((zone) => {
          const isActive = active.has(zone.code);
          return (
            <path
              key={zone.code}
              d={zone.path}
              className={isActive ? 'cursor-default fill-emerald-500 stroke-emerald-700' : 'cursor-default fill-slate-200 stroke-slate-400'}
              strokeWidth={2}
              onMouseEnter={() => setHoveredCode(zone.code)}
              onMouseLeave={() => setHoveredCode((prev) => (prev === zone.code ? null : prev))}
            >
              <title>{`${zone.label} · ${zone.labelZh}`}</title>
            </path>
          );
        })}
      </svg>
      {!compact && (
        <p className="mt-1 text-[11px] text-slate-600">
          {hoveredZone
            ? `${hoveredZone.label} · ${hoveredZone.labelZh}`
            : 'Hover a zone to view label'}
        </p>
      )}
    </div>
  );
}
