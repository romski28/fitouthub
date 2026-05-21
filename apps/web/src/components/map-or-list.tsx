'use client';

import { ReactNode, useEffect, useState } from 'react';

type ViewMode = 'map' | 'list';

type Props = {
  storageKey: string;
  label?: string;
  helperText?: string;
  headerInline?: boolean;
  mapLabel?: string;
  listLabel?: string;
  defaultMode?: ViewMode;
  /** @deprecated use mapPanelClassName / listPanelClassName */
  panelClassName?: string;
  mapPanelClassName?: string;
  listPanelClassName?: string;
  toggleGroupClassName?: string;
  toggleButtonClassName?: string;
  activeToggleButtonClassName?: string;
  inactiveToggleButtonClassName?: string;
  map: ReactNode;
  list: ReactNode;
};

export function MapOrList({
  storageKey,
  label = 'Choose input mode',
  helperText,
  headerInline = false,
  mapLabel = 'Map',
  listLabel = 'Words',
  defaultMode = 'map',
  panelClassName,
  mapPanelClassName,
  listPanelClassName,
  toggleGroupClassName,
  toggleButtonClassName,
  activeToggleButtonClassName,
  inactiveToggleButtonClassName,
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
  const toggleGroupClasses = toggleGroupClassName ?? 'grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1';
  const toggleButtons = (
    <div className={toggleGroupClasses}>
      <button
        type="button"
        onClick={() => handleModeChange('map')}
        aria-pressed={activeMode === 'map'}
        className={`${toggleButtonClassName ?? 'w-full rounded-md px-3 py-1.5 text-xs font-semibold transition'} ${
          activeMode === 'map'
            ? (activeToggleButtonClassName ?? 'bg-orange-600 text-amber-50 shadow-md')
            : (inactiveToggleButtonClassName ?? 'bg-slate-400 text-amber-50 hover:bg-slate-500')
        }`}
      >
        {mapLabel}
      </button>
      <button
        type="button"
        onClick={() => handleModeChange('list')}
        aria-pressed={activeMode === 'list'}
        className={`${toggleButtonClassName ?? 'w-full rounded-md px-3 py-1.5 text-xs font-semibold transition'} ${
          activeMode === 'list'
            ? (activeToggleButtonClassName ?? 'bg-orange-600 text-amber-50 shadow-md')
            : (inactiveToggleButtonClassName ?? 'bg-slate-400 text-amber-50 hover:bg-slate-500')
        }`}
      >
        {listLabel}
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className={headerInline ? 'flex flex-wrap items-start justify-between gap-2' : undefined}>
          <div>
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
          </div>
          {headerInline ? toggleButtons : null}
        </div>
        {!headerInline ? toggleButtons : null}
      </div>

      <div className={activeMode === 'map' ? (mapPanelClassName ?? panelClassName) : (listPanelClassName ?? panelClassName)}>
        {activeMode === 'map' ? map : list}
      </div>
    </div>
  );
}
