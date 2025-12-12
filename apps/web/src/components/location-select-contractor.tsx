'use client';

import { useState, useMemo } from 'react';
import { getSecondariesForPrimary, getUniquePrimaries } from '@/lib/location-search';

export interface ContractorLocationSelection {
  primary: string;
  secondary: string;
}

interface LocationSelectContractorProps {
  value?: ContractorLocationSelection[];
  onChange?: (selections: ContractorLocationSelection[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Location selector for contractors/companies
 * Multi-select buttons for primary + secondary only (no tertiary)
 * Returns array of {primary, secondary} pairs
 */
export function LocationSelectContractor({
  value = [],
  onChange,
  disabled = false,
  className = '',
}: LocationSelectContractorProps) {
  // Build data structure on init (no useEffect cascade)
  const { primaries, secondariesMap } = useMemo(() => {
    const uniquePrimaries = getUniquePrimaries();
    const secondariesMapLocal = new Map<string, string[]>();
    for (const primary of uniquePrimaries) {
      secondariesMapLocal.set(primary, getSecondariesForPrimary(primary));
    }
    return { primaries: uniquePrimaries, secondariesMap: secondariesMapLocal };
  }, []);

  // Initialize selected state from props (using useMemo to avoid cascading renders)
  const { initialPrimaries, initialSecondaries } = useMemo(() => {
    const initPrimaries = new Set<string>();
    const initSecondaries = new Map<string, Set<string>>();

    for (const sel of value) {
      initPrimaries.add(sel.primary);
      if (!initSecondaries.has(sel.primary)) {
        initSecondaries.set(sel.primary, new Set());
      }
      initSecondaries.get(sel.primary)!.add(sel.secondary);
    }

    return { initialPrimaries: initPrimaries, initialSecondaries: initSecondaries };
  }, [value]);

  const [selectedPrimaries, setSelectedPrimaries] = useState<Set<string>>(initialPrimaries);
  const [selectedSecondaries, setSelectedSecondaries] = useState<Map<string, Set<string>>>(initialSecondaries);

  const togglePrimary = (primary: string) => {
    if (disabled) return;

    const newPrimaries = new Set(selectedPrimaries);
    const newSecondaries = new Map(selectedSecondaries);

    if (newPrimaries.has(primary)) {
      // Deselect primary and all its secondaries
      newPrimaries.delete(primary);
      newSecondaries.delete(primary);
    } else {
      // Select primary
      newPrimaries.add(primary);
      newSecondaries.set(primary, new Set());
    }

    setSelectedPrimaries(newPrimaries);
    setSelectedSecondaries(newSecondaries);
    emitChange(newPrimaries, newSecondaries);
  };

  const toggleSecondary = (primary: string, secondary: string) => {
    if (disabled || !selectedPrimaries.has(primary)) return;

    const newSecondaries = new Map(selectedSecondaries);
    if (!newSecondaries.has(primary)) {
      newSecondaries.set(primary, new Set());
    }

    const secondarySet = newSecondaries.get(primary)!;
    if (secondarySet.has(secondary)) {
      secondarySet.delete(secondary);
    } else {
      secondarySet.add(secondary);
    }

    setSelectedSecondaries(newSecondaries);
    emitChange(selectedPrimaries, newSecondaries);
  };

  const emitChange = (prim: Set<string>, sec: Map<string, Set<string>>) => {
    const result: ContractorLocationSelection[] = [];
    for (const primary of prim) {
      const secondarySet = sec.get(primary) || new Set();
      if (secondarySet.size === 0) {
        // If no secondaries selected, add primary-only entry
        result.push({ primary, secondary: '' });
      } else {
        for (const secondary of secondarySet) {
          result.push({ primary, secondary });
        }
      }
    }
    onChange?.(result);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Service Regions (Required)</label>
        <div className="flex flex-wrap gap-2">
          {primaries.map((primary) => (
            <button
              key={primary}
              type="button"
              onClick={() => togglePrimary(primary)}
              disabled={disabled}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedPrimaries.has(primary)
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-100 text-gray-700 hover:bg-slate-200'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {primary}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary selections for each selected primary */}
      {Array.from(selectedPrimaries).map((primary) => (
        <div key={`sec-${primary}`}>
          <label className="block text-sm font-medium text-gray-700 mb-2">Districts in {primary}</label>
          <div className="flex flex-wrap gap-2 pl-4 border-l-4 border-emerald-200">
            {(secondariesMap.get(primary) || []).map((secondary: string) => (
              <button
                key={`${primary}-${secondary}`}
                type="button"
                onClick={() => toggleSecondary(primary, secondary)}
                disabled={disabled}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  selectedSecondaries.get(primary)?.has(secondary)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {secondary}
              </button>
            ))}
          </div>
        </div>
      ))}

      {selectedPrimaries.size === 0 && (
        <p className="text-sm text-gray-500 italic">Select at least one region above</p>
      )}
    </div>
  );
}
