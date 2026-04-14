'use client';

import { HK_DISTRICTS, getDistrictNameZh, getZoneLabelZh, sortAreaCodes } from '@/lib/hk-districts';

type Props = {
  selectedAreaCodes?: string[];
  onChange?: (codes: string[]) => void;
  selectionMode?: 'single' | 'multiple';
  disabled?: boolean;
};

export function HkDistrictList({
  selectedAreaCodes = [],
  onChange,
  selectionMode = 'multiple',
  disabled = false,
}: Props) {
  const selectedSet = new Set(sortAreaCodes(selectedAreaCodes));

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
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {HK_DISTRICTS.map((district) => {
        const isSelected = selectedSet.has(district.areaCode);
        return (
          <button
            key={district.areaCode}
            type="button"
            disabled={disabled}
            onClick={() => toggleAreaCode(district.areaCode)}
            aria-pressed={isSelected}
            title={`${district.zoneLabel} · ${getZoneLabelZh(district.zoneCode)}`}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
              isSelected
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="font-semibold">{district.name} · {getDistrictNameZh(district.areaCode)}</div>
          </button>
        );
      })}
    </div>
  );
}
