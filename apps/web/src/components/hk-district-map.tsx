'use client';

import { useMemo, useState } from 'react';
import { HK_DISTRICTS, HK_DISTRICT_VIEWBOX, getDistrictNameZh, sortAreaCodes } from '@/lib/hk-districts';

type Props = {
  selectedAreaCodes?: string[];
  onChange?: (codes: string[]) => void;
  selectionMode?: 'single' | 'multiple';
  disabled?: boolean;
  compact?: boolean;
};

export function HkDistrictMap({
  selectedAreaCodes = [],
  onChange,
  selectionMode = 'multiple',
  disabled = false,
  compact = false,
}: Props) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const selectedSet = useMemo(() => new Set(sortAreaCodes(selectedAreaCodes)), [selectedAreaCodes]);
  const hoveredDistrict = HK_DISTRICTS.find((district) => district.areaCode === hoveredCode) || null;

  const toggleAreaCode = (areaCode: string) => {
    if (disabled || !onChange) return;

    if (selectionMode === 'single') {
      onChange(selectedSet.has(areaCode) ? [] : [areaCode]);
      return;
    }

    const next = new Set(selectedSet);
    if (next.has(areaCode)) next.delete(areaCode);
    else next.add(areaCode);
    onChange(sortAreaCodes(Array.from(next)));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <svg
        viewBox={HK_DISTRICT_VIEWBOX}
        className="w-full h-auto max-h-[min(45vh,_400px)]"
        role="img"
        aria-label="Hong Kong district map selector"
      >
        <rect x="0" y="0" width="1000" height="733" rx="14" className="fill-white" />
        {HK_DISTRICTS.map((district) => {
          const isSelected = selectedSet.has(district.areaCode);
          const isHovered = hoveredCode === district.areaCode;
          return (
            <path
              key={district.areaCode}
              d={district.path}
              tabIndex={disabled ? -1 : 0}
              role={disabled ? undefined : 'button'}
              aria-label={`${district.name}${isSelected ? ' selected' : ''}`}
              aria-pressed={disabled ? undefined : isSelected}
              onClick={() => toggleAreaCode(district.areaCode)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleAreaCode(district.areaCode);
                }
              }}
              onMouseEnter={() => setHoveredCode(district.areaCode)}
              onMouseLeave={() => setHoveredCode((prev) => (prev === district.areaCode ? null : prev))}
              className={disabled ? 'fill-slate-200 stroke-slate-400' : isSelected ? 'cursor-pointer fill-emerald-500 stroke-emerald-700' : isHovered ? 'cursor-pointer fill-emerald-100 stroke-emerald-500' : 'cursor-pointer fill-slate-200 stroke-slate-400'}
              strokeWidth={1.5}
            >
              <title>{`${district.name} · ${getDistrictNameZh(district.areaCode)}`}</title>
            </path>
          );
        })}
      </svg>

      {!compact && (
        <div className="mt-2 flex min-h-5 items-center justify-between gap-3 text-xs text-slate-600">
          <span>
            {hoveredDistrict
              ? `${hoveredDistrict.name} · ${getDistrictNameZh(hoveredDistrict.areaCode)}`
              : selectionMode === 'single'
                ? 'Click a district to set the project location'
                : 'Click districts to set coverage'}
          </span>
          <span className="font-medium text-slate-500">{selectedSet.size} selected</span>
        </div>
      )}
    </div>
  );
}
