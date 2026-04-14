'use client';

import { HK_ZONE_CODES, ZONE_LABEL_EN_BY_ZONE_CODE, ZONE_LABEL_ZH_BY_ZONE_CODE, type HkZoneCode } from '@/lib/hk-districts';

type Props = {
  selectedZoneCodes: HkZoneCode[];
  onChange: (codes: HkZoneCode[]) => void;
};

export function HkZoneList({ selectedZoneCodes, onChange }: Props) {
  const selected = new Set(selectedZoneCodes);

  const handleToggle = (zoneCode: HkZoneCode) => {
    const next = new Set(selectedZoneCodes);
    if (next.has(zoneCode)) next.delete(zoneCode);
    else next.add(zoneCode);
    onChange(HK_ZONE_CODES.filter((code) => next.has(code)));
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      {HK_ZONE_CODES.map((zoneCode) => {
        const checked = selected.has(zoneCode);
        return (
          <label key={zoneCode} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => handleToggle(zoneCode)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="font-medium">{ZONE_LABEL_EN_BY_ZONE_CODE[zoneCode]}</span>
            <span className="text-slate-500">· {ZONE_LABEL_ZH_BY_ZONE_CODE[zoneCode]}</span>
          </label>
        );
      })}
    </div>
  );
}
