'use client';

import { ReactNode, useEffect, useState } from 'react';

type ViewMode = 'map' | 'list';

type Props = {
  storageKey: string;
  label?: string;
  helperText?: string;
  mapLabel?: string;
  listLabel?: string;
  defaultMode?: ViewMode;
  map: ReactNode;
  list: ReactNode;
};

export function MapOrList({
  storageKey,
  label = 'Choose input mode',
  helperText,
  mapLabel = 'Graphic',
  listLabel = 'Text list',
  defaultMode = 'map',
  map,
  list,
}: Props) {
  const [mode, setMode] = useState<ViewMode>(defaultMode);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'map' || stored === 'list') {
        setMode(stored);
      }
    } catch {
      // no-op
    } finally {
      setHydrated(true);
    }
  }, [storageKey]);

  const handleModeChange = (nextMode: ViewMode) => {
    setMode(nextMode);
    try {
      window.localStorage.setItem(storageKey, nextMode);
    } catch {
      // no-op
    }
  };

  const activeMode = hydrated ? mode : defaultMode;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
        </div>
        <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => handleModeChange('map')}
            aria-pressed={activeMode === 'map'}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeMode === 'map' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {mapLabel}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('list')}
            aria-pressed={activeMode === 'list'}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              activeMode === 'list' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {listLabel}
          </button>
        </div>
      </div>

      <div>{activeMode === 'map' ? map : list}</div>
    </div>
  );
}
