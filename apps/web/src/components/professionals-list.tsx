'use client';

import { useEffect, useMemo, useState, memo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ProfessionalDetailsModal } from '@/components/professional-details-modal';
import { CanonicalLocation } from '@/components/location-select';
import { searchLocations } from '@/lib/location-search';
import { SERVICE_TO_PROFESSION, matchServiceToProfession } from '@/lib/service-matcher';
import { matchLocation } from '@/lib/location-matcher';
import { Professional } from '@/lib/types';
import { HkZoneMap } from '@/components/hk-zone-map';
import { ProjectShareModal } from '@/components/project-share-modal';
import { useAuth } from '@/context/auth-context';
import { BackToTop } from '@/components/back-to-top';
import type { ProjectFormData } from '@/components/project-form';
import type { HkZoneCode } from '@/lib/hk-districts';
import { writeCreateProjectDraftSafely } from '@/lib/draft-storage';
import {
  getCreateProjectDraftHandoff,
  getProjectDescriptionHandoff,
  setCreateProjectDraftHandoff,
  setProjectDescriptionHandoff,
} from '@/lib/create-project-handoff';

const normalizeUniqueList = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
};

const isInteriorDesignTrade = (trade: string): boolean => {
  const normalized = trade.trim().toLowerCase();
  return /(interior\s*designer|interior\s*design|designer)/i.test(normalized);
};

const isMimoSurveyTrade = (trade: string): boolean => {
  const normalized = trade.trim().toLowerCase();
  return /(survey|surveying|measurement|measured\s*survey|site\s*survey)/i.test(normalized);
};

const splitCsvUnique = (value?: string | null) =>
  normalizeUniqueList((value || '').split(',').map((part) => part.trim()));

const DISTRICT_TO_ZONE: Record<string, string> = {
  'central and western': 'HKI',
  'wan chai': 'HKI',
  'eastern': 'HKI',
  'southern': 'HKI',
  'yau tsim mong': 'KLN',
  'sham shui po': 'KLN',
  'kowloon city': 'KLN',
  'wong tai sin': 'KLN',
  'kwun tong': 'KLN',
  'sai kung': 'NTE',
  'sha tin': 'NTE',
  'tai po': 'NTE',
  'north': 'NTE',
  'tuen mun': 'NTW',
  'yuen long': 'NTW',
  'tsuen wan': 'NTW',
  'kwai tsing': 'NTW',
  'islands district': 'ISL',
  'islands': 'ISL',
};

const ZONE_CODE_TO_LABEL: Record<string, string> = {
  HKI: 'Hong Kong Island',
  KLN: 'Kowloon',
  NTE: 'New Territories East',
  NTW: 'New Territories West',
  ISL: 'Islands',
};

const ZONE_EQUIVALENTS: Record<string, string[]> = {
  'hong kong island': ['hki'],
  hki: ['hong kong island'],
  kowloon: ['kln'],
  kln: ['kowloon'],
  'new territories east': ['nte', 'new territories'],
  nte: ['new territories east', 'new territories'],
  'new territories west': ['ntw', 'new territories'],
  ntw: ['new territories west', 'new territories'],
  islands: ['isl', 'islands district'],
  isl: ['islands', 'islands district'],
};

const addWithEquivalents = (tokens: Set<string>, value?: string) => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return;
  tokens.add(normalized);
  const extras = ZONE_EQUIVALENTS[normalized] || [];
  extras.forEach((extra) => tokens.add(extra));
};

const deriveHighlightedZones = (pro: Professional): string[] => {
  const normalizedCodes = new Set<string>();

  for (const item of pro.regionCoverage || []) {
    const code = item?.zone?.code?.toUpperCase();
    if (code) normalizedCodes.add(code);
  }

  if (normalizedCodes.size > 0) {
    return Array.from(normalizedCodes);
  }

  const primary = (pro.locationPrimary || '').trim().toLowerCase();
  if (primary === 'hong kong island' || primary === 'hki') normalizedCodes.add('HKI');
  if (primary === 'kowloon' || primary === 'kln') normalizedCodes.add('KLN');
  if (primary === 'islands district' || primary === 'islands' || primary === 'isl') normalizedCodes.add('ISL');
  if (primary === 'new territories' || primary === 'nt') {
    normalizedCodes.add('NTE');
    normalizedCodes.add('NTW');
  }

  const secondary = (pro.locationSecondary || '').trim().toLowerCase();
  const mappedSecondary = DISTRICT_TO_ZONE[secondary];
  if (mappedSecondary) normalizedCodes.add(mappedSecondary);

  return Array.from(normalizedCodes);
};

const getProfessionalCoverageTokens = (pro: Professional): string[] => {
  const tokens = new Set<string>();

  for (const coverage of pro.regionCoverage || []) {
    const areaName = coverage?.area?.name?.trim().toLowerCase();
    const areaCode = coverage?.area?.code?.trim().toLowerCase();
    const zoneLabel = coverage?.zone?.label?.trim().toLowerCase();
    const zoneCode = coverage?.zone?.code?.trim().toLowerCase();
    if (areaName) {
      tokens.add(areaName);
      const mappedZone = DISTRICT_TO_ZONE[areaName];
      if (mappedZone) {
        addWithEquivalents(tokens, mappedZone);
        addWithEquivalents(tokens, ZONE_CODE_TO_LABEL[mappedZone]);
      }
    }
    if (areaCode) tokens.add(areaCode);
    addWithEquivalents(tokens, zoneLabel);
    addWithEquivalents(tokens, zoneCode);
  }

  const serviceAreasRaw = Array.isArray(pro.serviceArea)
    ? pro.serviceArea
    : typeof pro.serviceArea === 'string'
      ? pro.serviceArea.split(',')
      : [];
  const serviceAreas = serviceAreasRaw
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const locationFields = [pro.locationPrimary, pro.locationSecondary, pro.locationTertiary]
    .filter(Boolean)
    .map((l) => l!.toLowerCase());

  locationFields.forEach((field) => {
    addWithEquivalents(tokens, field);
    const mappedZone = DISTRICT_TO_ZONE[field];
    if (mappedZone) {
      addWithEquivalents(tokens, mappedZone);
      addWithEquivalents(tokens, ZONE_CODE_TO_LABEL[mappedZone]);
    }
  });

  serviceAreas.forEach((area) => {
    addWithEquivalents(tokens, area);
    const mappedZone = DISTRICT_TO_ZONE[area];
    if (mappedZone) {
      addWithEquivalents(tokens, mappedZone);
      addWithEquivalents(tokens, ZONE_CODE_TO_LABEL[mappedZone]);
    }
  });

  return Array.from(tokens);
};

const getProfessionalTradeTokens = (pro: Professional): string[] => {
  const tradeTokens = normalizeUniqueList([
    pro.primaryTrade,
    ...(pro.tradesOffered || []),
    ...(pro.suppliesOffered || []),
    pro.professionType,
    pro.professionType === 'company' ? 'company' : null,
  ]);
  return tradeTokens.map((value) => value.toLowerCase());
};

type TradeAutoFilterMode = 'all' | `single:${string}`;

const getTradeCoverageMeta = (pro: Professional, requiredTradesLower: string[]) => {
  const tradeTokens = getProfessionalTradeTokens(pro);
  const isTeamCandidate = pro.professionType === 'company' || pro.professionType === 'contractor';

  if (requiredTradesLower.length === 0) {
    return { matchedCount: 0, coversAllRequiredTrades: false, isTeamCandidate };
  }

  const matchedCount = requiredTradesLower.filter((trade) =>
    tradeTokens.some((token) => token.includes(trade) || trade.includes(token)),
  ).length;

  return {
    matchedCount,
    coversAllRequiredTrades: matchedCount === requiredTradesLower.length,
    isTeamCandidate,
  };
};

const matchesTradeAutoFilterMode = (
  pro: Professional,
  requiredTradesLower: string[],
  _tradeAutoFilterMode: TradeAutoFilterMode,
) => {
  const tradeCoverage = getTradeCoverageMeta(pro, requiredTradesLower);
  if (requiredTradesLower.length === 0) return true;
  return tradeCoverage.matchedCount > 0;
};

const deriveRequestedTradesForProfessional = (
  pro: Professional,
  requiredTrades: string[],
  tradeAutoFilterMode: TradeAutoFilterMode,
) => {
  const normalizedRequiredTrades = normalizeUniqueList(requiredTrades);
  if (normalizedRequiredTrades.length === 0) return [] as string[];

  const tradeTokens = getProfessionalTradeTokens(pro);
  const matchedTrades = normalizedRequiredTrades.filter((trade) => {
    const tradeLower = trade.toLowerCase();
    return tradeTokens.some((token) => token.includes(tradeLower) || tradeLower.includes(token));
  });

  if (tradeAutoFilterMode.startsWith('single:')) {
    const selectedTradeLower = tradeAutoFilterMode.slice('single:'.length).trim().toLowerCase();
    const selectedTrade = matchedTrades.find((trade) => trade.toLowerCase() === selectedTradeLower);
    if (selectedTrade) return [selectedTrade];
  }

  if (matchedTrades.length > 0) return normalizeUniqueList(matchedTrades);
  if (normalizedRequiredTrades.length === 1) return [normalizedRequiredTrades[0]];
  return [] as string[];
};

const getTopLevelCoverageLabels = (pro: Professional): string[] => {
  const labels = new Set<string>();

  for (const coverage of pro.regionCoverage || []) {
    const zoneCode = coverage?.zone?.code?.trim().toUpperCase();
    const zoneLabel = coverage?.zone?.label?.trim();
    const areaName = coverage?.area?.name?.trim().toLowerCase();

    if (zoneLabel) {
      labels.add(zoneLabel);
      continue;
    }

    if (zoneCode && ZONE_CODE_TO_LABEL[zoneCode]) {
      labels.add(ZONE_CODE_TO_LABEL[zoneCode]);
      continue;
    }

    if (areaName) {
      const mapped = DISTRICT_TO_ZONE[areaName];
      if (mapped && ZONE_CODE_TO_LABEL[mapped]) {
        labels.add(ZONE_CODE_TO_LABEL[mapped]);
      }
    }
  }

  const fromServiceArea = splitCsvUnique(pro.serviceArea).map((item) => item.toLowerCase());
  fromServiceArea.forEach((item) => {
    if (ZONE_EQUIVALENTS[item]) {
      const key = item.toUpperCase();
      if (ZONE_CODE_TO_LABEL[key]) {
        labels.add(ZONE_CODE_TO_LABEL[key]);
      } else {
        const mapped = DISTRICT_TO_ZONE[item];
        if (mapped && ZONE_CODE_TO_LABEL[mapped]) {
          labels.add(ZONE_CODE_TO_LABEL[mapped]);
        } else if (item === 'new territories') {
          labels.add('New Territories East');
          labels.add('New Territories West');
        } else {
          labels.add(item.replace(/\b\w/g, (c) => c.toUpperCase()));
        }
      }
      return;
    }

    const mapped = DISTRICT_TO_ZONE[item];
    if (mapped && ZONE_CODE_TO_LABEL[mapped]) {
      labels.add(ZONE_CODE_TO_LABEL[mapped]);
    }
  });

  const primary = (pro.locationPrimary || '').trim().toLowerCase();
  if (primary) {
    if (primary === 'new territories') {
      labels.add('New Territories East');
      labels.add('New Territories West');
    } else if (ZONE_EQUIVALENTS[primary]) {
      const key = primary.toUpperCase();
      if (ZONE_CODE_TO_LABEL[key]) labels.add(ZONE_CODE_TO_LABEL[key]);
    }
  }

  return Array.from(labels);
};

const HK_ZONE_LABELS: Record<HkZoneCode, string> = {
  HKI: 'Hong Kong Island',
  KLN: 'Kowloon',
  NTE: 'New Territories East',
  NTW: 'New Territories West',
  ISL: 'Islands',
};

const HK_ZONE_CODES = Object.keys(HK_ZONE_LABELS) as HkZoneCode[];

const inferZoneCodeFromLocation = (location: CanonicalLocation): HkZoneCode | null => {
  const value = (location.tertiary || location.secondary || location.primary || '').trim().toLowerCase();
  if (!value) return null;

  const match = HK_ZONE_CODES.find((code) => {
    const label = HK_ZONE_LABELS[code].toLowerCase();
    return value === code.toLowerCase() || value === label;
  });

  return match || null;
};

const getMatchedTradesOnly = (pro: Professional, requiredTrades: string[]): string[] => {
  const requiredTradesLower = requiredTrades.map((trade) => trade.toLowerCase());
  const tradeTokens = getProfessionalTradeTokens(pro);

  return requiredTrades.filter((trade, index) => {
    const tradeLower = requiredTradesLower[index];
    return tradeTokens.some((token) => token.includes(tradeLower) || tradeLower.includes(token));
  });
};

const getProfessionalDisplayTrades = (pro: Professional): string[] => {
  if (pro.professionType === 'reseller') {
    return normalizeUniqueList([pro.primaryTrade, ...(pro.suppliesOffered || [])]);
  }
  return normalizeUniqueList([pro.primaryTrade, ...(pro.tradesOffered || [])]);
};

const isLocationMatch = (
  pro: Professional,
  locationParts: string[],
  selectedZoneCode: string | null,
): boolean => {
  if (locationParts.length === 0) return true;

  const zones = deriveHighlightedZones(pro);
  if (selectedZoneCode && zones.length > 0) {
    return zones.includes(selectedZoneCode);
  }

  const allAreas = getProfessionalCoverageTokens(pro);
  if (allAreas.length === 0) return true;

  return locationParts.some((locPart) =>
    allAreas.some((area) => area.includes(locPart) || locPart.includes(area)),
  );
};

// Returns 3 (trade+location+rating), 2 (trade + one of location/rating), or 1 (trade only).
// Trade is always assumed to match (callers already hard-filter on trade).
const getMatchStrength = (
  pro: Professional,
  locationParts: string[],
  selectedZoneCode: string | null,
  minRating: number,
): 3 | 2 | 1 => {
  const locMatch = isLocationMatch(pro, locationParts, selectedZoneCode);
  const ratingVal = typeof pro.rating === 'number' && Number.isFinite(pro.rating) ? pro.rating : 0;
  const ratingMatch = minRating === 0 || ratingVal >= minRating;
  return (1 + (locMatch ? 1 : 0) + (ratingMatch ? 1 : 0)) as 3 | 2 | 1;
};

const ProfessionalRowItem = memo(({
  pro,
  requiredTrades,
  locationParts,
  selectedZoneCode,
  minRating,
  isSelected,
  onToggle,
  onViewDetails,
  disableSelection,
  showSelectionAction,
  displayAllTrades,
}: {
  pro: Professional;
  requiredTrades: string[];
  locationParts: string[];
  selectedZoneCode: string | null;
  minRating: number;
  isSelected: boolean;
  onToggle: (pro: Professional) => void;
  onViewDetails: (pro: Professional) => void;
  disableSelection: boolean;
  showSelectionAction: boolean;
  displayAllTrades: boolean;
}) => {
  const t = useTranslations('professionalsPage.list');
  const roleIcon = pro.professionType === 'company' ? '🏢' : '👷';
  const visibleTrades = useMemo(
    () => (displayAllTrades ? getProfessionalDisplayTrades(pro) : getMatchedTradesOnly(pro, requiredTrades)),
    [displayAllTrades, pro, requiredTrades],
  );
  const locationMatches = useMemo(() => isLocationMatch(pro, locationParts, selectedZoneCode), [pro, locationParts, selectedZoneCode]);
  const ratingValue = typeof pro.rating === 'number' && Number.isFinite(pro.rating) ? pro.rating : 0;
  const ratingMatches = minRating === 0 || ratingValue >= minRating;
  const handleCardClick = () => {
    if (!showSelectionAction || disableSelection) return;
    onToggle(pro);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showSelectionAction || disableSelection) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle(pro);
    }
  };

  return (
    <div
      className={`rounded-lg transition ${
        isSelected
          ? 'border-2 border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-300/60'
          : 'border border-slate-200 bg-[#FCF8EE] hover:border-emerald-300'
      } ${showSelectionAction ? 'cursor-pointer' : ''}`}
      role={showSelectionAction ? 'button' : undefined}
      tabIndex={showSelectionAction ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-pressed={showSelectionAction ? isSelected : undefined}
    >
      {/* Mobile: Stacked layout */}
      <div className="flex flex-col gap-3 p-4 lg:hidden">
        {/* Part 1: Name + Note */}
        <div>
          <p className="truncate font-bold text-[#201C1A]">
            <span className="mr-1" aria-hidden="true">{roleIcon}</span>
            {pro.fullName || pro.businessName || t('fallbackProfessional')}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewDetails(pro);
            }}
            className="mt-1 text-xs italic text-[#201C1A] hover:underline"
          >
            Click for more...
          </button>
        </div>

        {/* Part 2: Matched Trades */}
        <div className="flex flex-wrap gap-2">
          {visibleTrades.length > 0 ? (
            visibleTrades.map((trade) => (
              <span key={`${pro.id}-trade-${trade}`} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-[#FCF8EE]">
                {trade}
              </span>
            ))
          ) : null}
        </div>

        {/* Part 3: Location */}
        <div>
          <span className={`inline-block rounded-none px-3 py-1 text-xs font-semibold ${locationMatches ? 'bg-emerald-600 text-[#FCF8EE]' : 'bg-[#7A7974] text-[#FCF8EE]'}`}>
            {locationMatches ? 'Is local' : 'Not local'}
          </span>
        </div>

        {/* Part 4: Star Rating */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={`${pro.id}-star-${star}`}
              className={`text-lg ${star <= Math.round(ratingValue) ? (ratingMatches ? 'text-emerald-600' : 'text-[#7A7974]') : 'text-[#7A7974]'}`}
            >
              ★
            </span>
          ))}
        </div>

        {/* Part 5: CTA Button */}
        {showSelectionAction && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(pro);
            }}
            disabled={disableSelection}
            className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
              isSelected
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-300 bg-white text-transparent hover:border-emerald-400'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={isSelected ? 'Deselect professional' : 'Select professional'}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        {!showSelectionAction && (
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-xs font-semibold transition whitespace-nowrap border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            I have a project for you
          </button>
        )}
      </div>

      {/* Desktop: Grid layout with proportional widths */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-3 p-4" style={{ gridTemplateColumns: '1fr 1.4fr 0.4fr 0.8fr 0.8fr' }}>
        {/* Part 1: Name + Note (25%) */}
        <div className="flex flex-col justify-center min-w-0">
          <p className="truncate font-bold text-[#201C1A]">
            <span className="mr-1" aria-hidden="true">{roleIcon}</span>
            {pro.fullName || pro.businessName || t('fallbackProfessional')}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewDetails(pro);
            }}
            className="mt-1 text-xs italic text-[#201C1A] hover:underline text-left"
          >
            Click for more...
          </button>
        </div>

        {/* Part 2: Matched Trades (35%) */}
        <div className="flex flex-wrap items-center gap-2 h-10">
          {visibleTrades.length > 0 ? (
            visibleTrades.map((trade) => (
              <span key={`${pro.id}-trade-${trade}`} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-[#FCF8EE] h-fit">
                {trade}
              </span>
            ))
          ) : null}
        </div>

        {/* Part 3: Location (10%) */}
        <div className="flex items-center h-10">
          <span className={`inline-flex items-center justify-center rounded-none px-2 py-1 text-xs font-semibold h-10 w-full ${locationMatches ? 'bg-emerald-600 text-[#FCF8EE]' : 'bg-[#7A7974] text-[#FCF8EE]'}`}>
            {locationMatches ? 'Is local' : 'Not local'}
          </span>
        </div>

        {/* Part 4: Star Rating (20%) */}
        <div className="flex items-center justify-center gap-0.5 h-10">
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={`${pro.id}-star-${star}`}
              className={`text-sm leading-none ${star <= Math.round(ratingValue) ? (ratingMatches ? 'text-emerald-600' : 'text-[#7A7974]') : 'text-[#7A7974]'}`}
            >
              ★
            </span>
          ))}
        </div>

        {/* Part 5: CTA Button (20%) */}
        {showSelectionAction && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(pro);
            }}
            disabled={disableSelection}
            className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
              isSelected
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-300 bg-white text-transparent hover:border-emerald-400'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={isSelected ? 'Deselect professional' : 'Select professional'}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        )}
        {!showSelectionAction && (
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-xs font-semibold transition whitespace-nowrap h-10 flex items-center justify-center border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            I have a project for you
          </button>
        )}
      </div>
    </div>
  );
});
ProfessionalRowItem.displayName = 'ProfessionalRowItem';

const ProfessionalCard = memo(({ 
  pro,
  onToggle,
  onViewDetails,
  onCompare,
  isSelected,
  isCompared,
  isAdmin,
  disableSelection,
  showSelectionAction,
}: {
  pro: Professional;
  onToggle: (pro: Professional) => void;
  onViewDetails: (pro: Professional) => void;
  onCompare: (pro: Professional) => void;
  isSelected: boolean;
  isCompared: boolean;
  isAdmin: boolean;
  disableSelection: boolean;
  showSelectionAction: boolean;
}) => {
  const t = useTranslations('professionalsPage.list');
  const roleIcon = pro.professionType === 'company' ? '🏢' : pro.professionType === 'reseller' ? '📦' : '👷';
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [showCoverageMap, setShowCoverageMap] = useState(false);
  const serviceAreas = useMemo(() => getTopLevelCoverageLabels(pro), [pro]);
  const tradeBadges = useMemo(() => {
    if (pro.professionType === 'reseller') {
      return normalizeUniqueList([pro.primaryTrade, ...(pro.suppliesOffered || [])]);
    }
    return normalizeUniqueList([pro.primaryTrade, ...(pro.tradesOffered || [])]);
  }, [pro.primaryTrade, pro.tradesOffered, pro.suppliesOffered, pro.professionType]);

  const visibleAreas = showAllAreas ? serviceAreas : serviceAreas.slice(0, 3);
  const hiddenAreasCount = Math.max(0, serviceAreas.length - visibleAreas.length);
  const visibleTrades = showAllTrades ? tradeBadges : tradeBadges.slice(0, 3);
  const hiddenTradesCount = Math.max(0, tradeBadges.length - visibleTrades.length);
  const refCount = pro.referenceProjects?.length || 0;
  const photoCount = pro.profileImages?.length || 0;
  const highlightedZones = useMemo(() => deriveHighlightedZones(pro), [pro]);

  const accentColor = isSelected
    ? 'border-emerald-400 ring-2 ring-emerald-300/70'
    : isCompared
      ? 'border-violet-400 ring-2 ring-violet-300/70'
      : 'border-slate-700';

  return (
    <div
      className={`browse-card ${accentColor} text-slate-100`}
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)' }}
    >
      <div
        className="browse-card-header"
        style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-base" aria-hidden="true">{roleIcon}</span>
              <h3 className="truncate text-sm font-bold text-white">
                {pro.fullName || pro.businessName || t('fallbackProfessional')}
              </h3>
            </div>
            {pro.businessName && pro.fullName && pro.businessName !== pro.fullName && (
              <p className="ml-6 truncate text-[11px] text-slate-200">{pro.businessName}</p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-white/40">
            {pro.rating.toFixed(1)}★
          </span>
        </div>
      </div>

      <div className="browse-card-body">
        {/* Trades (aggregated) */}
        {tradeBadges.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Trades</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleTrades.map((trade) => (
                  <span key={`${pro.id}-trade-${trade}`} className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {trade}
                  </span>
                ))}
                {hiddenTradesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTrades(true)}
                    className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-600"
                  >
                    +{hiddenTradesCount} more
                  </button>
                )}
                {showAllTrades && tradeBadges.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTrades(false)}
                    className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-600"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Areas covered (deduplicated) */}
          {serviceAreas.length > 0 && !showCoverageMap && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Areas covered</p>
                {highlightedZones.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCoverageMap(true)}
                    className="rounded-full border border-slate-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-700"
                  >
                    Show map
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleAreas.map((area) => (
                  <span key={`${pro.id}-area-${area}`} className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-medium text-white">
                    {area}
                  </span>
                ))}
                {hiddenAreasCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAreas(true)}
                    className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-600"
                  >
                    +{hiddenAreasCount} more
                  </button>
                )}
                {showAllAreas && serviceAreas.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllAreas(false)}
                    className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-600"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}

          {highlightedZones.length > 0 && showCoverageMap && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Coverage map</p>
                <button
                  type="button"
                  onClick={() => setShowCoverageMap(false)}
                  className="rounded-full border border-slate-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-700"
                >
                  Show areas
                </button>
              </div>
              <HkZoneMap highlightedCodes={highlightedZones} compact />
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-3 text-[11px] text-slate-300">
            {refCount > 0 && <span>📁 {refCount} refs</span>}
            {photoCount > 0 && <span>🖼 {photoCount} photos</span>}
            {pro.emergencyCalloutAvailable && (
              <span className="font-semibold text-rose-300">⚡ Emergency</span>
            )}
            {isAdmin && (
              <span className="ml-auto truncate text-slate-300">{pro.email}</span>
            )}
          </div>

        {/* Actions — equal-width buttons with consistent visual language */}
        <div className={`mt-auto grid gap-1.5 ${showSelectionAction ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button
            type="button"
            onClick={() => onViewDetails(pro)}
            className="browse-card-button-sm w-full border-2 border-sky-500 bg-sky-500 text-white hover:bg-sky-600"
          >
            Show More
          </button>
          <button
            type="button"
            onClick={() => onCompare(pro)}
            title={isCompared ? 'Remove from comparison' : 'Add to comparison (need 3+ for comparison)'}
            className={`browse-card-button-sm w-full border-2 ${
              isCompared
                ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
                : 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            {isCompared ? 'Comparing' : 'Compare'}
          </button>
          {showSelectionAction && (
            <button
              type="button"
              onClick={() => onToggle(pro)}
              disabled={disableSelection}
              className={`browse-card-button-sm w-full border-2 ${
                isSelected
                  ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
                {isSelected ? 'Selected' : t('askForHelp')}
            </button>
          )}
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
  initialRequiredTrades?: string[];
  initialProjectData?: Partial<ProjectFormData>;
  initialSelectedIds?: string[];
  source?: string;
  requireLocation?: boolean;
  defaultFiltersOpen?: boolean;
}

export default function ProfessionalsList({ professionals, initialLocation, projectId, initialSearchTerm, initialRequiredTrades = [], initialProjectData, initialSelectedIds, source, requireLocation = false, defaultFiltersOpen = true }: Props) {
  const t = useTranslations('professionalsPage.list');
  const router = useRouter();
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
  const [locationSearch, setLocationSearch] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ primary?: string; secondary?: string; tertiary?: string; display: string }>>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  
  // Initialize locationDisplay from baseLoc - use only tertiary (most specific) for best filter results
  // The filter will naturally radiate outward from tertiary -> secondary -> primary
  const initialLocationDisplay = baseLoc.tertiary || baseLoc.secondary || baseLoc.primary || '';
  const [locationDisplay, setLocationDisplay] = useState<string>(initialLocationDisplay);
  const hasProjectDefinition = source === 'create-project' || Boolean(
    projectId ||
    initialProjectData?.projectName?.trim() ||
    initialProjectData?.notes?.trim() ||
    (initialProjectData?.tradesRequired && initialProjectData.tradesRequired.length > 0)
  );
  const canInviteProfessionals = hasProjectDefinition;

  // Debug: log pre-population values
    const [minRating, setMinRating] = useState<number>(0);
  const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen);

  console.log('[ProfessionalsList] Pre-population:', {
    projectId,
    initialSearchTerm,
    initialLocation,
    baseLoc,
    initialLocationDisplay,
    initialSearch
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLocationMapOpen, setIsLocationMapOpen] = useState(false);
  const [selectedZoneCode, setSelectedZoneCode] = useState<HkZoneCode | null>(inferZoneCodeFromLocation(baseLoc));
  const [hasManuallyClearedLocation, setHasManuallyClearedLocation] = useState(false);

  const requiredTrades = useMemo(
    () => normalizeUniqueList([...(initialRequiredTrades || []), ...(initialProjectData?.tradesRequired || [])])
      .filter((trade) => !isMimoSurveyTrade(trade)),
    [initialRequiredTrades, initialProjectData?.tradesRequired],
  );
  const [activeRequiredTrades, setActiveRequiredTrades] = useState<string[]>(requiredTrades);
  const [includeMimoDesignService, setIncludeMimoDesignService] = useState(false);
  const [includeMimoSurveyService, setIncludeMimoSurveyService] = useState(Boolean(initialProjectData?.requiresSurveyService));
  const [tradeAutoFilterMode, setTradeAutoFilterMode] = useState<TradeAutoFilterMode>('all');
  const [hasInitializedTradeAutoFilter, setHasInitializedTradeAutoFilter] = useState(false);
  const [coverageViewMode, setCoverageViewMode] = useState<'one-covers-all' | 'individual'>('one-covers-all');

  // Auto-set trade filter when coverage mode changes
  useEffect(() => {
    if (activeRequiredTrades.length <= 1) return;
    if (coverageViewMode === 'one-covers-all') {
      setTradeAutoFilterMode('all');
    } else {
      setTradeAutoFilterMode(`single:${activeRequiredTrades[0]!.toLowerCase()}`);
    }
  }, [coverageViewMode]);
  const [sortKey, setSortKey] = useState<'best-match' | 'rating' | 'completed' | 'award-rate' | 'response-time' | 'recent' | 'name'>('best-match');

  useEffect(() => {
    setActiveRequiredTrades(requiredTrades);
  }, [requiredTrades]);

  useEffect(() => {
    if (hasInitializedTradeAutoFilter) return;

    if (activeRequiredTrades.length === 1) {
      setTradeAutoFilterMode(`single:${activeRequiredTrades[0]!.toLowerCase()}`);
    } else {
      setTradeAutoFilterMode('all');
    }
    setHasInitializedTradeAutoFilter(true);
  }, [activeRequiredTrades, hasInitializedTradeAutoFilter]);

  useEffect(() => {
    if (activeRequiredTrades.length === 0) {
      if (tradeAutoFilterMode !== 'all') setTradeAutoFilterMode('all');
      return;
    }

    const activeLower = new Set(activeRequiredTrades.map((trade) => trade.toLowerCase()));
    const firstActive = activeRequiredTrades[0]?.toLowerCase();

    if (tradeAutoFilterMode.startsWith('single:')) {
      const selectedTrade = tradeAutoFilterMode.slice('single:'.length).trim().toLowerCase();
      if (!activeLower.has(selectedTrade)) {
        if (activeRequiredTrades.length === 1 && firstActive) {
          setTradeAutoFilterMode(`single:${firstActive}`);
        } else {
          setTradeAutoFilterMode('all');
        }
      }
      return;
    }

    if (tradeAutoFilterMode === 'all' && activeRequiredTrades.length === 1 && firstActive) {
      setTradeAutoFilterMode(`single:${firstActive}`);
    }
  }, [activeRequiredTrades, tradeAutoFilterMode]);

  useEffect(() => {
    if (!activeRequiredTrades.some((trade) => isInteriorDesignTrade(trade))) {
      setIncludeMimoDesignService(false);
    }
  }, [activeRequiredTrades]);

  useEffect(() => {
    if (typeof initialProjectData?.requiresSurveyService === 'boolean') {
      setIncludeMimoSurveyService(initialProjectData.requiresSurveyService);
    }
  }, [initialProjectData?.requiresSurveyService]);

  const enforcedRequiredTrades = useMemo(
    () => {
      if (tradeAutoFilterMode.startsWith('single:')) {
        const trade = tradeAutoFilterMode.slice('single:'.length).trim();
        return trade ? [trade] : [];
      }
      return activeRequiredTrades;
    },
    [tradeAutoFilterMode, activeRequiredTrades],
  );

  const activeFilterContext = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const mappedProfession = needle ? matchServiceToProfession(needle) : null;
    const effectiveProfession = (mappedProfession || professionHint || '').toLowerCase() || undefined;
    const typedLocation = locationSearch.trim().toLowerCase();

    const locationParts = (() => {
      if (typedLocation) {
        const matched = matchLocation(typedLocation);
        if (matched) {
          return [matched.primary, matched.secondary, matched.tertiary]
            .filter(Boolean)
            .map((part) => part!.toLowerCase());
        }
        return [typedLocation];
      }

      return [loc.primary, loc.secondary, loc.tertiary]
        .filter(Boolean)
        .map((part) => part!.toLowerCase());
    })();

    const selectedZoneCode =
      !typedLocation &&
      typeof loc.secondary === 'string' &&
      Boolean(HK_ZONE_LABELS[loc.secondary.toUpperCase() as HkZoneCode])
        ? loc.secondary.toUpperCase()
        : null;

    return {
      needle,
      effectiveProfession,
      locationParts,
      selectedZoneCode,
    };
  }, [searchTerm, professionHint, locationSearch, loc.primary, loc.secondary, loc.tertiary]);

  const tradeAutoFilterCounts = useMemo(() => {
    const countWithMode = (mode: TradeAutoFilterMode, trades: string[]) => {
      const requiredTradesLower = trades.map((trade) => trade.toLowerCase());

      return professionals.filter((pro) => {
        if (!matchesTradeAutoFilterMode(pro, requiredTradesLower, mode)) {
          return false;
        }

        return true;
      }).length;
    };

    const single: Record<string, number> = {};
    activeRequiredTrades.forEach((trade) => {
      single[trade.toLowerCase()] = countWithMode(`single:${trade.toLowerCase()}`, [trade]);
    });

    return {
      single,
    };
  }, [professionals, activeRequiredTrades]);

  const missingTradeLabels = useMemo(
    () => activeRequiredTrades.filter((trade) => (tradeAutoFilterCounts.single[trade.toLowerCase()] ?? 0) === 0),
    [activeRequiredTrades, tradeAutoFilterCounts.single],
  );

  useEffect(() => {
    if (activeRequiredTrades.length <= 1) return;
    if (tradeAutoFilterMode !== 'all') return;
    if (tradeAutoFilterCounts.single && Object.values(tradeAutoFilterCounts.single).some((c) => c > 0)) return;

    const firstTradeWithMatches = activeRequiredTrades.find(
      (trade) => (tradeAutoFilterCounts.single?.[trade.toLowerCase()] ?? 0) > 0,
    );

    if (firstTradeWithMatches) {
      setTradeAutoFilterMode(`single:${firstTradeWithMatches.toLowerCase()}`);
    }
  }, [activeRequiredTrades, tradeAutoFilterCounts, tradeAutoFilterMode]);

  useEffect(() => {
    const hasSelectedLocation = Boolean(loc.primary || loc.secondary || loc.tertiary);
    const hasIncomingLocation = Boolean(
      initialLocation?.primary || initialLocation?.secondary || initialLocation?.tertiary,
    );

    if (hasSelectedLocation || !hasIncomingLocation || hasManuallyClearedLocation) return;

    setLoc(initialLocation as CanonicalLocation);
    setLocationDisplay(
      initialLocation?.tertiary || initialLocation?.secondary || initialLocation?.primary || '',
    );
  }, [
    initialLocation?.primary,
    initialLocation?.secondary,
    initialLocation?.tertiary,
    loc.primary,
    loc.secondary,
    loc.tertiary,
    hasManuallyClearedLocation,
  ]);

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
  };

  const handleLocationSearch = (value: string) => {
    setLocationSearch(value);
    const trimmed = value.trim();

    if (!trimmed) {
      setLoc({});
      setHasManuallyClearedLocation(true);
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    const matched = matchLocation(trimmed);
    if (matched) {
      setLoc({
        primary: matched.primary,
        secondary: matched.secondary,
        tertiary: matched.tertiary,
      });
    } else {
      // Keep filtering responsive for free-typed values even when no canonical location match is found.
      setLoc({ primary: trimmed });
    }
    setHasManuallyClearedLocation(false);

    const results = searchLocations(value, 6);
    setLocationSuggestions(results);
    setShowLocationSuggestions(results.length > 0);
  };

  const handleLocationSelect = (result: { primary?: string; secondary?: string; tertiary?: string; display: string }) => {
    setLoc(result as CanonicalLocation);
    setLocationSearch('');
    setLocationDisplay(result.display);
    setShowLocationSuggestions(false);
    setSelectedZoneCode(null);
    setHasManuallyClearedLocation(false);
  };

  const openLocationMapModal = () => {
    setSelectedZoneCode(inferZoneCodeFromLocation(loc));
    setIsLocationMapOpen(true);
  };

  const applyLocationFromMap = () => {
    if (!selectedZoneCode) {
      setLoc({});
      setLocationDisplay('');
      setLocationSearch('');
      setShowLocationSuggestions(false);
      setHasManuallyClearedLocation(true);
      setIsLocationMapOpen(false);
      return;
    }

    const label = HK_ZONE_LABELS[selectedZoneCode];
    setLoc({ primary: label, secondary: selectedZoneCode });
    setLocationDisplay(label);
    setLocationSearch('');
    setShowLocationSuggestions(false);
    setHasManuallyClearedLocation(false);
    setIsLocationMapOpen(false);
  };

  const filteredBase = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const mappedProfession = needle ? matchServiceToProfession(needle) : null;
    const effectiveProfession = (mappedProfession || professionHint || '').toLowerCase() || undefined;
    const requiredTradesLower = enforcedRequiredTrades.map((trade) => trade.toLowerCase());

    const typedLocation = locationSearch.trim().toLowerCase();
    const locationParts = (() => {
      if (typedLocation) {
        const matched = matchLocation(typedLocation);
        if (matched) {
          return [matched.primary, matched.secondary, matched.tertiary]
            .filter(Boolean)
            .map((part) => part!.toLowerCase());
        }
        return [typedLocation];
      }

      return [loc.primary, loc.secondary, loc.tertiary]
        .filter(Boolean)
        .map((part) => part!.toLowerCase());
    })();

    const selectedZoneCode =
      !typedLocation &&
      typeof loc.secondary === 'string' &&
      Boolean(HK_ZONE_LABELS[loc.secondary.toUpperCase() as HkZoneCode])
        ? loc.secondary.toUpperCase()
        : null;

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

      if (!matchesTradeAutoFilterMode(pro, requiredTradesLower, tradeAutoFilterMode)) {
        return false;
      }

      // Trade must match — location and rating are soft-ranked, not hard-filtered.
      return true;
    });

    const targetParts = locationParts.slice().reverse();

    const scoreFor = (pro: Professional) => {
      const areas = getProfessionalCoverageTokens(pro);

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
      // ── User-selected sort keys (non-default) ──
      if (sortKey !== 'best-match') {
        const nameA = (a.fullName || a.businessName || '').toLowerCase();
        const nameB = (b.fullName || b.businessName || '').toLowerCase();
        const ratingA = typeof a.rating === 'number' ? a.rating : 0;
        const ratingB = typeof b.rating === 'number' ? b.rating : 0;

        switch (sortKey) {
          case 'rating':
            return ratingB - ratingA || nameA.localeCompare(nameB);
          case 'completed':
            return ((b.completedProjectsCount ?? 0) - (a.completedProjectsCount ?? 0))
              || (ratingB - ratingA)
              || nameA.localeCompare(nameB);
          case 'award-rate': {
            const arA = a.awardRate ?? -1;
            const arB = b.awardRate ?? -1;
            return arB - arA || (ratingB - ratingA) || nameA.localeCompare(nameB);
          }
          case 'response-time': {
            const rtA = a.avgResponseHours ?? Infinity;
            const rtB = b.avgResponseHours ?? Infinity;
            return rtA - rtB || (ratingB - ratingA) || nameA.localeCompare(nameB);
          }
          case 'recent':
            return (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
              || (ratingB - ratingA)
              || nameA.localeCompare(nameB);
          case 'name':
            return nameA.localeCompare(nameB);
          default:
            break;
        }
      }

      // ── Best match (default multi-tier) ──
      const strengthA = getMatchStrength(a, locationParts, selectedZoneCode, minRating);
      const strengthB = getMatchStrength(b, locationParts, selectedZoneCode, minRating);
      if (strengthB !== strengthA) return strengthB - strengthA;

      const tradeA = getTradeCoverageMeta(a, requiredTradesLower);
      const tradeB = getTradeCoverageMeta(b, requiredTradesLower);

      const aPrimaryTier = tradeA.coversAllRequiredTrades ? 3 : 0;
      const bPrimaryTier = tradeB.coversAllRequiredTrades ? 3 : 0;
      if (bPrimaryTier !== aPrimaryTier) return bPrimaryTier - aPrimaryTier;

      const aSecondaryTier = tradeA.coversAllRequiredTrades ? 2 : 0;
      const bSecondaryTier = tradeB.coversAllRequiredTrades ? 2 : 0;
      if (bSecondaryTier !== aSecondaryTier) return bSecondaryTier - aSecondaryTier;

      if (tradeB.matchedCount !== tradeA.matchedCount) return tradeB.matchedCount - tradeA.matchedCount;

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
  }, [professionals, searchTerm, professionHint, loc.primary, loc.secondary, loc.tertiary, locationSearch, minRating, enforcedRequiredTrades, tradeAutoFilterMode, sortKey]);

  const [regionExpanded, setRegionExpanded] = useState(false);
  // Reset expansion whenever the location filter itself changes
  useEffect(() => { setRegionExpanded(false); }, [loc.primary, loc.secondary, loc.tertiary]);

  const filtered = useMemo(() => {
    const hasLocation = Boolean(locationSearch.trim() || loc.primary || loc.secondary || loc.tertiary);
    const requiredTradesLower = enforcedRequiredTrades.map((trade) => trade.toLowerCase());

    const sortByTradePipeline = (a: Professional, b: Professional) => {
      // If user selected a non-default sort, use that instead of trade coverage
      if (sortKey !== 'best-match') {
        const nameA = (a.fullName || a.businessName || '').toLowerCase();
        const nameB = (b.fullName || b.businessName || '').toLowerCase();
        const rA = typeof a.rating === 'number' ? a.rating : 0;
        const rB = typeof b.rating === 'number' ? b.rating : 0;
        switch (sortKey) {
          case 'rating': return rB - rA || nameA.localeCompare(nameB);
          case 'completed': return ((b.completedProjectsCount ?? 0) - (a.completedProjectsCount ?? 0)) || (rB - rA) || nameA.localeCompare(nameB);
          case 'award-rate': { const aA = a.awardRate ?? -1; const aB = b.awardRate ?? -1; return aB - aA || (rB - rA) || nameA.localeCompare(nameB); }
          case 'response-time': { const tA = a.avgResponseHours ?? Infinity; const tB = b.avgResponseHours ?? Infinity; return tA - tB || (rB - rA) || nameA.localeCompare(nameB); }
          case 'recent': return (new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()) || (rB - rA) || nameA.localeCompare(nameB);
          case 'name': return nameA.localeCompare(nameB);
          default: break;
        }
      }

      const tradeA = getTradeCoverageMeta(a, requiredTradesLower);
      const tradeB = getTradeCoverageMeta(b, requiredTradesLower);

      const aPrimaryTier = tradeA.coversAllRequiredTrades ? 3 : 0;
      const bPrimaryTier = tradeB.coversAllRequiredTrades ? 3 : 0;
      if (bPrimaryTier !== aPrimaryTier) return bPrimaryTier - aPrimaryTier;

      const aSecondaryTier = tradeA.coversAllRequiredTrades ? 2 : 0;
      const bSecondaryTier = tradeB.coversAllRequiredTrades ? 2 : 0;
      if (bSecondaryTier !== aSecondaryTier) return bSecondaryTier - aSecondaryTier;

      if (tradeB.matchedCount !== tradeA.matchedCount) return tradeB.matchedCount - tradeA.matchedCount;

      const ra = typeof a.rating === 'number' ? a.rating : 0;
      const rb = typeof b.rating === 'number' ? b.rating : 0;
      if (rb !== ra) return rb - ra;
      return (a.fullName || a.businessName || '').toLowerCase().localeCompare((b.fullName || b.businessName || '').toLowerCase());
    };

    // If the user explicitly expanded to all regions, return trade+rating without location
    if (regionExpanded && hasLocation) {
      const needle = searchTerm.trim().toLowerCase();
      const mappedProfession = needle ? matchServiceToProfession(needle) : null;
      const effectiveProfession = (mappedProfession || professionHint || '').toLowerCase() || undefined;
      return professionals
        .filter((pro) => {
          const haystacks = [
            pro.professionType, pro.fullName, pro.businessName, pro.primaryTrade,
            ...(pro.tradesOffered ?? []), ...(pro.suppliesOffered ?? []),
          ].filter(Boolean).map((s) => s!.toString().toLowerCase());
          const textMatch = needle ? haystacks.some((s) => s.includes(needle)) : false;
          const professionMatch = effectiveProfession ? haystacks.some((s) => s.includes(effectiveProfession)) : false;
          const bySearch = needle || effectiveProfession ? textMatch || professionMatch || (!needle && professionMatch) : true;
          if (!bySearch) return false;
          if (!matchesTradeAutoFilterMode(pro, requiredTradesLower, tradeAutoFilterMode)) return false;
          return minRating === 0 || (typeof pro.rating === 'number' && pro.rating >= minRating);
        })
        .sort(sortByTradePipeline);
    }

    return filteredBase;
  }, [filteredBase, professionals, loc.primary, loc.secondary, loc.tertiary, locationSearch, searchTerm, professionHint, minRating, regionExpanded, enforcedRequiredTrades, tradeAutoFilterMode, sortKey]);

  // Narrowly-scoped count: how many matched with location+trade+rating (before any widening)
  const filteredBaseCount = filteredBase.length;
  const locationIsActive = Boolean(loc.primary || loc.secondary || loc.tertiary);
  // Show expand nudge when a region is active, not yet expanded, and local results are thin (≤2)
  const canShowExpand = locationIsActive && !regionExpanded && filteredBaseCount <= 2;

  const maxSelect = activeRequiredTrades.length > 1 ? Math.max(3, activeRequiredTrades.length * 2) : 3;
  // Initialize selection from URL param if provided
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds?.filter((id): id is string => typeof id === 'string' && id.length > 0) ?? []),
  );

  // Sync initialSelectedIds into state when navigating back with pre-selected IDs
  useEffect(() => {
    if (!initialSelectedIds || initialSelectedIds.length === 0) return;
    setSelectedIds(new Set(initialSelectedIds));
  }, [initialSelectedIds?.join(',')]);
  const selectedTradeCoverageKeys = useMemo(() => {
    const requiredTradesLower = activeRequiredTrades.map((trade) => trade.toLowerCase());
    const covered = new Set<string>();

    professionals.forEach((pro) => {
      if (!selectedIds.has(pro.id)) return;
      const tradeTokens = getProfessionalTradeTokens(pro);
      requiredTradesLower.forEach((requiredTrade) => {
        const matchesTrade = tradeTokens.some(
          (token) => token.includes(requiredTrade) || requiredTrade.includes(token),
        );
        if (matchesTrade) covered.add(requiredTrade);
      });
    });

    return covered;
  }, [professionals, selectedIds, activeRequiredTrades]);
  const locationSelected = Boolean(loc.primary || loc.secondary || loc.tertiary);
  const blockInviteForMissingLocation = requireLocation && !locationSelected;

  const locationPartsForRender = useMemo(() => {
    const typedLocation = locationSearch.trim().toLowerCase();
    if (typedLocation) {
      const matched = matchLocation(typedLocation);
      if (matched) {
        return [matched.primary, matched.secondary, matched.tertiary]
          .filter(Boolean)
          .map((part) => part!.toLowerCase());
      }
      return [typedLocation];
    }

    return [loc.primary, loc.secondary, loc.tertiary]
      .filter(Boolean)
      .map((part) => part!.toLowerCase());
  }, [locationSearch, loc.primary, loc.secondary, loc.tertiary]);

  const selectedZoneCodeForRender = useMemo(() => {
    const typedLocation = locationSearch.trim().toLowerCase();
    if (typedLocation) return null;

    if (
      typeof loc.secondary === 'string' &&
      Boolean(HK_ZONE_LABELS[loc.secondary.toUpperCase() as HkZoneCode])
    ) {
      return loc.secondary.toUpperCase();
    }

    return null;
  }, [locationSearch, loc.secondary]);

  // Preselect first N (recommendation) - only if coming from home page with intent.
  // Do not clear existing selections when the user changes filters; selection is meant to span modes.
  useMemo(() => {
    const allIds = new Set(professionals.map((pro) => pro.id));
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (allIds.has(id)) next.add(id);
    });

    const hasRequiredLocation = !requireLocation || Boolean(loc.primary || loc.secondary || loc.tertiary);
    if (next.size === 0 && filtered.length > 0 && initialFromIntent.profession && hasRequiredLocation && canInviteProfessionals) {
      for (let i = 0; i < Math.min(3, filtered.length); i++) {
        next.add(filtered[i].id);
      }
    }

    if (Array.from(next).sort().join(',') !== Array.from(selectedIds).sort().join(',')) {
      setSelectedIds(next);
    }
  }, [professionals, filtered, initialFromIntent.profession, requireLocation, loc.primary, loc.secondary, loc.tertiary, canInviteProfessionals]);

  useEffect(() => {
    if (!canInviteProfessionals && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [canInviteProfessionals, selectedIds]);

  const toggleSelection = (pro: Professional) => {
    if (!canInviteProfessionals || blockInviteForMissingLocation) return;

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

  const groupedTradeDisplay = useMemo(() => {
    const requiredTradesLower = enforcedRequiredTrades.map((trade) => trade.toLowerCase());
    if (requiredTradesLower.length < 2) {
      console.log('[ProfessionalsList] Grouping disabled - not enough trades:', { requiredTrades: enforcedRequiredTrades, requiredTradesLower });
      return {
        isEnabled: false,
        fullCoverageCompanies: [] as Professional[],
        specialistSections: [] as Array<{ trade: string; professionals: Professional[] }>,
        uncategorized: [] as Professional[],
      };
    }

    const matchesTrade = (pro: Professional, trade: string) => {
      const tradeTokens = getProfessionalTradeTokens(pro);
      return tradeTokens.some((token) => token.includes(trade) || trade.includes(token));
    };

    const coversAllRequired = (pro: Professional) =>
      requiredTradesLower.every((trade) => matchesTrade(pro, trade));

    const fullCoverageCompanies = filtered.filter(
      (pro) => (pro.professionType === 'company' || pro.professionType === 'contractor') && coversAllRequired(pro),
    );

    const specialistSections = enforcedRequiredTrades.map((trade, index) => {
      const tradeLower = requiredTradesLower[index];
      const professionalsForTrade = filtered.filter((pro) => {
        if (!matchesTrade(pro, tradeLower)) return false;
        return true;
      });

      return {
        trade,
        professionals: professionalsForTrade,
      };
    });

    const uncategorized: Professional[] = [];

    console.log('[ProfessionalsList] Grouping enabled:', {
      requiredTrades: enforcedRequiredTrades,
      fullCoverageCompanyCount: fullCoverageCompanies.length,
      specialistSections: specialistSections.map((s) => ({ trade: s.trade, count: s.professionals.length })),
      uncategorizedCount: uncategorized.length,
      filteredTotal: filtered.length,
    });

    return {
      isEnabled: true,
      fullCoverageCompanies,
      specialistSections,
      uncategorized,
    };
  }, [filtered, enforcedRequiredTrades, tradeAutoFilterMode]);

  const activeFilterLabel = useMemo(() => {
    if (activeRequiredTrades.length === 0) return null;
    if (tradeAutoFilterMode === 'all') return null;
    if (tradeAutoFilterMode.startsWith('single:')) {
      const selectedTrade = tradeAutoFilterMode.slice('single:'.length).trim().toLowerCase();
      return activeRequiredTrades.find((trade) => trade.toLowerCase() === selectedTrade) || enforcedRequiredTrades[0] || 'Trade';
    }
    return null;
  }, [activeRequiredTrades, tradeAutoFilterMode, enforcedRequiredTrades]);

  const shouldShowMimoDesignCard = useMemo(
    () => activeRequiredTrades.some((trade) => isInteriorDesignTrade(trade)),
    [activeRequiredTrades],
  );

  const shareInitialData = useMemo<Partial<ProjectFormData>>(() => {
    const needle = (searchTerm || '').trim();
    const mapped = needle ? matchServiceToProfession(needle) : (professionHint || '');
    const mainTrade = (mapped || needle || '').trim();
    const locationLabel = [loc.primary, loc.secondary, loc.tertiary].filter(Boolean).join(', ');
    const defaultTitle = (() => {
      if (mainTrade && locationLabel) return t('defaults.tradeInLocation', { trade: mainTrade, location: locationLabel });
      if (mainTrade) return mainTrade;
      if (locationLabel) return t('defaults.serviceRequestInLocation', { location: locationLabel });
      return t('defaults.serviceRequest');
    })();
    const prefill = initialProjectData || {};

    return {
      projectName: prefill.projectName || defaultTitle,
      location: prefill.location || loc,
      tradesRequired: activeRequiredTrades.length > 0
        ? activeRequiredTrades
        : (mainTrade ? [mainTrade] : []),
      notes: prefill.notes || initialFromIntent.description || '',
      isEmergency: prefill.isEmergency,
      requiresDesignService: includeMimoDesignService,
      requiresSurveyService: includeMimoSurveyService,
      photoUrls: prefill.photoUrls,
      onlySelectedProfessionalsCanBid: prefill.onlySelectedProfessionalsCanBid ?? true,
    };
  }, [initialFromIntent.description, initialProjectData, loc, professionHint, searchTerm, t, activeRequiredTrades, includeMimoDesignService, includeMimoSurveyService]);

  const handleInviteSelected = () => {
    if (requireLocation && !loc.primary && !loc.secondary && !loc.tertiary) {
      return;
    }

    if (projectId) {
      setIsModalOpen(true);
      return;
    }

    const selectedProfessionals = professionals.filter((p) => selectedIds.has(p.id));
    if (selectedProfessionals.length === 0) return;

    const handoffDebug =
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('debugFlow') === '1' ||
        window.localStorage.getItem('fh_debug_handoff') === '1');

    let existingDraft: {
      initialData?: Partial<ProjectFormData>;
      aiIntakeId?: string;
    } | null = null;
    let existingProjectDescription: {
      title?: string;
      description?: string;
      isEmergency?: boolean;
      tradesRequired?: string[];
      location?: CanonicalLocation;
    } | null = null;
    try {
      const rawDraft = sessionStorage.getItem('createProjectDraft');
      if (rawDraft) {
        existingDraft = JSON.parse(rawDraft) as {
          initialData?: Partial<ProjectFormData>;
          aiIntakeId?: string;
        };
      }

      const rawDescription = sessionStorage.getItem('projectDescription');
      if (rawDescription) {
        existingProjectDescription = JSON.parse(rawDescription) as {
          title?: string;
          description?: string;
          projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
          isEmergency?: boolean;
          tradesRequired?: string[];
          location?: CanonicalLocation;
        };
      }
    } catch {
      existingDraft = null;
      existingProjectDescription = null;
    }

    const memoryDraft = getCreateProjectDraftHandoff();
    const memoryProjectDescription = getProjectDescriptionHandoff();

    const resolvedTradesRequired = activeRequiredTrades.length > 0
      ? normalizeUniqueList(activeRequiredTrades)
      : normalizeUniqueList([
          ...(memoryDraft?.initialData?.tradesRequired || []),
          ...(existingDraft?.initialData?.tradesRequired || []),
          ...(memoryProjectDescription?.tradesRequired || []),
          ...(existingProjectDescription?.tradesRequired || []),
          ...(shareInitialData.tradesRequired || []),
        ]);

    const mergedInitialData: Partial<ProjectFormData> = {
      ...(memoryDraft?.initialData || existingDraft?.initialData || {}),
      ...shareInitialData,
      projectName:
        memoryProjectDescription?.title ||
        existingProjectDescription?.title ||
        memoryDraft?.initialData?.projectName ||
        existingDraft?.initialData?.projectName ||
        shareInitialData.projectName ||
        '',
      notes:
        memoryProjectDescription?.description ||
        existingProjectDescription?.description ||
        memoryDraft?.initialData?.notes ||
        existingDraft?.initialData?.notes ||
        shareInitialData.notes ||
        initialFromIntent.description ||
        '',
      isEmergency:
        memoryProjectDescription?.isEmergency ??
        existingProjectDescription?.isEmergency ??
        memoryDraft?.initialData?.isEmergency ??
        existingDraft?.initialData?.isEmergency ??
        shareInitialData.isEmergency,
      aiFrom: shareInitialData.aiFrom || memoryDraft?.initialData?.aiFrom || existingDraft?.initialData?.aiFrom,
      photoUrls:
        shareInitialData.photoUrls ??
        memoryDraft?.initialData?.photoUrls ??
        existingDraft?.initialData?.photoUrls,
      requiresDesignService:
        includeMimoDesignService ||
        shareInitialData.requiresDesignService ||
        memoryDraft?.initialData?.requiresDesignService ||
        existingDraft?.initialData?.requiresDesignService,
      requiresSurveyService:
        includeMimoSurveyService ||
        shareInitialData.requiresSurveyService ||
        memoryDraft?.initialData?.requiresSurveyService ||
        existingDraft?.initialData?.requiresSurveyService,
      existingPhotos:
        shareInitialData.existingPhotos ??
        memoryDraft?.initialData?.existingPhotos ??
        existingDraft?.initialData?.existingPhotos,
      tradesRequired: resolvedTradesRequired,
    };

    if (handoffDebug) {
      console.info('[AI-HANDOFF][professionals-list] merged initial data', {
        sourceDraft: {
          projectName: existingDraft?.initialData?.projectName,
          notesLength: (existingDraft?.initialData?.notes || '').length,
          isEmergency: existingDraft?.initialData?.isEmergency,
        },
        sourceProjectDescription: {
          title: existingProjectDescription?.title,
          descriptionLength: (existingProjectDescription?.description || '').length,
          isEmergency: existingProjectDescription?.isEmergency,
        },
        sourceShareInitial: {
          projectName: shareInitialData.projectName,
          notesLength: (shareInitialData.notes || '').length,
          isEmergency: shareInitialData.isEmergency,
        },
        resolved: {
          projectName: mergedInitialData.projectName,
          notesLength: (mergedInitialData.notes || '').length,
          isEmergency: mergedInitialData.isEmergency,
        },
      });
    }

    try {
      sessionStorage.setItem(
        'projectDescription',
        JSON.stringify({
          title: mergedInitialData.projectName || '',
          description: mergedInitialData.notes || '',
          projectScale:
            mergedInitialData.projectScale === 'SCALE_1' ||
            mergedInitialData.projectScale === 'SCALE_2' ||
            mergedInitialData.projectScale === 'SCALE_3'
              ? mergedInitialData.projectScale
              : undefined,
          isEmergency: Boolean(mergedInitialData.isEmergency),
          profession: resolvedTradesRequired[0],
          location: mergedInitialData.location,
          tradesRequired: resolvedTradesRequired,
        }),
      );
    } catch {
      console.warn('[professionals-list] Unable to persist projectDescription due to storage limits.');
    }

    setProjectDescriptionHandoff({
      title: mergedInitialData.projectName || '',
      description: mergedInitialData.notes || '',
      projectScale:
        mergedInitialData.projectScale === 'SCALE_1' ||
        mergedInitialData.projectScale === 'SCALE_2' ||
        mergedInitialData.projectScale === 'SCALE_3'
          ? mergedInitialData.projectScale
          : undefined,
      isEmergency: Boolean(mergedInitialData.isEmergency),
      profession: resolvedTradesRequired[0],
      location: mergedInitialData.location,
      tradesRequired: resolvedTradesRequired,
    });

    const selectedProfessionalsForDraft = selectedProfessionals.map((professional) => ({
      id: professional.id,
      professionType: professional.professionType,
      email: professional.email || '',
      phone: professional.phone || '',
      status: professional.status || 'approved',
      rating: Number.isFinite(professional.rating) ? professional.rating : 0,
      fullName: professional.fullName ?? null,
      businessName: professional.businessName ?? null,
      requestedTrades: deriveRequestedTradesForProfessional(
        professional,
        resolvedTradesRequired,
        'all',
      ),
    }));

    const saved = writeCreateProjectDraftSafely({
      initialData: mergedInitialData,
      selectedProfessionals: selectedProfessionalsForDraft,
      ...(memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId
        ? { aiIntakeId: memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId }
        : {}),
    });

    setCreateProjectDraftHandoff({
      initialData: mergedInitialData,
      selectedProfessionals: selectedProfessionalsForDraft,
      ...(memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId
        ? { aiIntakeId: memoryDraft?.aiIntakeId || existingDraft?.aiIntakeId }
        : {}),
    });

    if (!saved) {
      console.warn('[professionals-list] Unable to persist full createProjectDraft due to storage limits.');
    }

    router.push('/create-project');
  };

  const openDetails = (pro: Professional) => {
    setDetailsPro(pro);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-2">
      {/* Filters */}
      <div className="rounded-2xl border border-white/45 bg-[#F5EEDE]/90 px-4 shadow-sm">
        {/* Collapsible header */}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-semibold text-slate-700">Filters</span>
          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="flex items-center gap-1 rounded-lg p-1 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 transition"
            aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
          >
            <svg className={`h-4 w-4 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
        </div>
        {filtersOpen && (
        <div className="pb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative grid gap-1">
            <label className="flex h-10 items-center text-sm font-semibold text-slate-700">Name or Trade</label>
            <div className="relative">
              <input
                type="text"
                placeholder={t('filters.professionalOrTradePlaceholder')}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 pr-8 text-sm"
                list="name-or-trade-options"
              />
              <datalist id="name-or-trade-options">
                {suggestionPool.slice(0, 60).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  aria-label={t('filters.clearSearchAria')}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="relative grid gap-1">
            <label className="flex h-10 items-center text-sm font-semibold text-slate-700">{t('filters.location')}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={t('filters.locationPlaceholder')}
                  value={locationDisplay || locationSearch}
                  onChange={(e) => {
                    setLocationDisplay('');
                    handleLocationSearch(e.target.value);
                  }}
                  onFocus={() => {
                    if (locationSearch) setShowLocationSuggestions(locationSuggestions.length > 0);
                  }}
                  onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 100)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 pr-8 text-sm"
                />
                {(locationSearch || locationDisplay || loc.primary || loc.secondary || loc.tertiary) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleLocationSearch('');
                      setLocationDisplay('');
                      setLoc({});
                      setSelectedZoneCode(null);
                      setHasManuallyClearedLocation(true);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    aria-label={t('filters.clearLocationAria')}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={openLocationMapModal}
                className="h-10 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Map
              </button>
            </div>
            {showLocationSuggestions && locationSuggestions.length > 0 ? (
              <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                {locationSuggestions.map((result, idx) => (
                  <button
                    key={`${idx}-${result.primary}-${result.secondary}-${result.tertiary}`}
                    type="button"
                    className="w-full border-b border-slate-100 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleLocationSelect(result)}
                  >
                    <div className="text-sm font-medium">{result.display}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative grid gap-1">
            <label className="flex h-10 items-center text-sm font-semibold text-slate-700">{t('filters.rating')}</label>
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value={0}>{t('filters.anyRating')}</option>
              <option value={5}>⭐⭐⭐⭐⭐ 5</option>
              <option value={4.5}>⭐⭐⭐⭐+ 4+</option>
              <option value={4}>⭐⭐⭐⭐ 4+</option>
              <option value={3}>⭐⭐⭐ 3+</option>
              <option value={2}>⭐⭐ 2+</option>
              <option value={1}>⭐ 1+</option>
            </select>
          </div>
        </div>

      </div>
        )}
      </div>

      {activeRequiredTrades.length > 0 && (
        <div className="rounded-2xl border border-white/45 bg-[#F5EEDE]/90 px-4 py-3 shadow-sm">
          <p className="mb-2 flex items-center justify-center gap-1.5 h-10 text-sm font-semibold text-slate-700">
            Select your team as{' '}
            {activeRequiredTrades.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setCoverageViewMode('one-covers-all')}
                  className={`h-10 rounded-md px-3 text-sm font-semibold transition flex items-center ${
                    coverageViewMode === 'one-covers-all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-600 hover:border-emerald-400'
                  }`}
                >
                  one pro covers all
                </button>
                {' or '}
                <button
                  type="button"
                  onClick={() => setCoverageViewMode('individual')}
                  className={`h-10 rounded-md px-3 text-sm font-semibold transition flex items-center ${
                    coverageViewMode === 'individual'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white border border-slate-300 text-slate-600 hover:border-orange-400'
                  }`}
                >
                  individual trades working together
                </button>
              </>
            ) : (
              <>Select your {activeRequiredTrades[0]}</>
            )}
          </p>
          {activeRequiredTrades.length > 1 && coverageViewMode === 'individual' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {activeRequiredTrades.map((trade) => {
              const key = `single:${trade.toLowerCase()}` as const;
              const hasSelectedTrade = selectedTradeCoverageKeys.has(trade.toLowerCase());
              return (
                <div key={`autofilter-${trade}`} className={`group flex h-10 items-center overflow-hidden rounded-full border transition ${
                  hasSelectedTrade
                    ? 'border-emerald-400 bg-emerald-600'
                    : 'border-slate-300 bg-white'
                }`}>
                  <button
                    type="button"
                    onClick={() => {
                      setTradeAutoFilterMode(key);
                      setSearchTerm('');
                    }}
                    className={`h-10 px-4 text-sm font-semibold transition ${
                      tradeAutoFilterMode === key
                        ? hasSelectedTrade
                          ? 'bg-emerald-700 text-[#F5EEDE] shadow-sm'
                          : 'bg-sky-600 text-white shadow-sm'
                        : hasSelectedTrade
                          ? 'text-[#F5EEDE] hover:bg-emerald-700'
                          : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {`${trade}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRequiredTrades((prev) => prev.filter((item) => item.toLowerCase() !== trade.toLowerCase()));
                    }}
                    className={`h-10 border-l px-2.5 transition ${
                      hasSelectedTrade
                        ? 'border-emerald-400 text-[#F5EEDE]/70 hover:bg-[#F97362] hover:text-white'
                        : 'border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700'
                    }`}
                    aria-label={`Remove ${trade}`}
                    title={`Remove ${trade}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
            {tradeAutoFilterMode !== 'all' && coverageViewMode === 'one-covers-all' && (
              <button
                type="button"
                onClick={() => { setTradeAutoFilterMode('all'); setSearchTerm(''); }}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                All trades ×
              </button>
            )}
          </div>
          )}
        </div>
      )}

      {shouldShowMimoDesignCard && (
        <div className={`rounded-2xl border px-4 py-3 shadow-sm ${
          includeMimoDesignService
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-slate-200 bg-white'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                <img src="/assets/mimo.webp" alt="Mimo" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Mimo Interior Design Service</p>
                <p className="mt-0.5 text-xs text-slate-600">Prefer Mimo to handle design direction and styling scope for this project.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIncludeMimoDesignService((prev) => !prev)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                includeMimoDesignService
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {includeMimoDesignService ? 'Added' : 'Add service'}
            </button>
          </div>
        </div>
      )}

      {includeMimoSurveyService && (
        <div className="rounded-2xl border border-[#F7D2C5] bg-[#FFF2EB] px-4 py-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src="/assets/mimo.webp" alt="Mimo" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Mimo Surveying+ Service</p>
              <p className="mt-0.5 text-xs text-slate-700">Requested in AI chat. This is delivered by Mimo and is not part of professional matching.</p>
              <p className="mt-1 text-xs font-semibold text-[#A94237]">Status: Requested</p>
            </div>
          </div>
        </div>
      )}

      {missingTradeLabels.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-amber-900">No current professionals found for:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missingTradeLabels.map((trade) => (
              <span key={`missing-${trade}`} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                {trade}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            Keep these in the brief. Mimo can review sourcing options and help decide whether to widen the trade scope.
          </p>
        </div>
      )}

      {isLocationMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={() => setIsLocationMapOpen(false)} />
          <div
            className="relative mx-4 flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-white/45 bg-[#F5EEDE] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Location Picker</p>
                <h3 className="text-lg font-bold text-slate-900">Select a zone from the map</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLocationMapOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <HkZoneMap
              highlightedCodes={selectedZoneCode ? [selectedZoneCode] : []}
              onToggleCode={(code) => setSelectedZoneCode((prev) => (prev === code ? null : code))}
              svgClassName="h-[52vh] w-full"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {HK_ZONE_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedZoneCode((prev) => (prev === code ? null : code))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedZoneCode === code
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {HK_ZONE_LABELS[code]}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedZoneCode(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear map selection
              </button>
              <button
                type="button"
                onClick={applyLocationFromMap}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Apply location
              </button>
            </div>
          </div>
        </div>
      )}

      {blockInviteForMissingLocation && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Please choose your project location first. We can&apos;t continue to professional selection without a location.
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {t('states.empty')}
        </div>
      ) : (
        groupedTradeDisplay.isEnabled ? (
          <div className="space-y-5" suppressHydrationWarning>
            {coverageViewMode === 'one-covers-all' && groupedTradeDisplay.fullCoverageCompanies.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-white/45 bg-[#F5EEDE]/90 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Covers all trades ({groupedTradeDisplay.fullCoverageCompanies.length})</p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Sorted by
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700"
                    >
                    <option value="best-match">Best match</option>
                    <option value="rating">Rating</option>
                    <option value="completed">Most projects</option>
                    <option value="award-rate">Award rate</option>
                    <option value="response-time">Response time</option>
                    <option value="recent">Recently active</option>
                    <option value="name">Name</option>
                  </select>
                  </label>
                </div>
                <div className="space-y-3">
                  {groupedTradeDisplay.fullCoverageCompanies.map((pro) => (
                    <ProfessionalRowItem
                      key={pro.id}
                      pro={pro}
                      requiredTrades={enforcedRequiredTrades}
                      locationParts={locationPartsForRender}
                      selectedZoneCode={selectedZoneCodeForRender}
                      minRating={minRating}
                      isSelected={selectedIds.has(pro.id)}
                      onToggle={toggleSelection}
                      onViewDetails={openDetails}
                      disableSelection={blockInviteForMissingLocation}
                      showSelectionAction={canInviteProfessionals}
                      displayAllTrades={!canInviteProfessionals}
                    />
                  ))}
                </div>
              </section>
            )}

            {coverageViewMode === 'individual' && groupedTradeDisplay.specialistSections.map((section) => {
              return (
                <section key={`specialists-${section.trade}`} className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-white/45 bg-[#F5EEDE]/90 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{section.trade} ({section.professionals.length})</p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      Sorted by
                      <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700"
                      >
                        <option value="best-match">Best match</option>
                        <option value="rating">Rating</option>
                        <option value="completed">Most projects</option>
                        <option value="award-rate">Award rate</option>
                        <option value="response-time">Response time</option>
                        <option value="recent">Recently active</option>
                        <option value="name">Name</option>
                      </select>
                    </label>
                  </div>
                  {section.professionals.length > 0 ? (
                    <div className="space-y-3">
                      {section.professionals.map((pro) => (
                        <ProfessionalRowItem
                          key={pro.id}
                          pro={pro}
                          requiredTrades={enforcedRequiredTrades}
                          locationParts={locationPartsForRender}
                          selectedZoneCode={selectedZoneCodeForRender}
                          minRating={minRating}
                          isSelected={selectedIds.has(pro.id)}
                          onToggle={toggleSelection}
                          onViewDetails={openDetails}
                          disableSelection={blockInviteForMissingLocation}
                          showSelectionAction={canInviteProfessionals}
                          displayAllTrades={!canInviteProfessionals}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-amber-300 bg-white px-4 py-3 text-sm text-slate-600">
                      No one is currently listed for this trade in the selected area.
                    </div>
                  )}
                </section>
              );
            })}

          </div>
        ) : (
          <div className="space-y-3" suppressHydrationWarning>
            {filtered.map((pro) => (
              <ProfessionalRowItem
                key={pro.id}
                pro={pro}
                requiredTrades={enforcedRequiredTrades}
                locationParts={locationPartsForRender}
                selectedZoneCode={selectedZoneCodeForRender}
                minRating={minRating}
                isSelected={selectedIds.has(pro.id)}
                onToggle={toggleSelection}
                onViewDetails={openDetails}
                disableSelection={blockInviteForMissingLocation}
                showSelectionAction={canInviteProfessionals}
                displayAllTrades={!canInviteProfessionals}
              />
            ))}
          </div>
        )
      )}

      {/* Region expansion nudge — shown when local results are thin (≤2) */}
      {canShowExpand && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">
            {filteredBaseCount === 0
              ? 'No professionals found in your selected area.'
              : `Only ${filteredBaseCount} professional${filteredBaseCount === 1 ? '' : 's'} found in your selected area.`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Expanding the search can surface professionals from other regions who may be available to travel.
          </p>
          <button
            type="button"
            onClick={() => setRegionExpanded(true)}
            className="browse-card-button browse-card-button-primary mt-4"
          >
            Show professionals from all areas
          </button>
          <p className="mt-2 text-[11px] text-slate-400 italic">✦ Smart region expansion coming soon — results will automatically include nearby areas</p>
        </div>
      )}

      {/* Banner shown while region is expanded */}
      {regionExpanded && locationIsActive && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="text-amber-800">
            <span className="font-semibold">Showing all areas.</span> Results are no longer filtered by your selected region.
          </p>
          <button
            type="button"
            onClick={() => setRegionExpanded(false)}
            className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            Back to local results
          </button>
        </div>
      )}

      {/* Compare action button hidden */}

      <ProjectShareModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          // Clear selections after sending emails
          setSelectedIds(new Set());
        }}
        professionals={professionals.filter((p) => selectedIds.has(p.id))}
        projectId={projectId}
        initialData={shareInitialData}
      />

      <ProfessionalDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        professional={detailsPro}
        onSelect={canInviteProfessionals ? (pro) => toggleSelection(pro) : undefined}
        isSelected={detailsPro ? selectedIds.has(detailsPro.id) : false}
      />

      {/* Selection band — centered fixed footer to avoid viewport-edge jitter */}
      <div className="fixed bottom-3 left-1/2 z-40 w-[min(1200px,calc(100%-1rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-[#F5EEDE]/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold text-slate-800 shrink-0">
              {selectedIds.size === 0 ? '0 selected' : selectedIds.size === 1 ? '1 selected' : `${selectedIds.size} selected`}
            </span>
            {selectedIds.size > 0 && (
              <div className="hidden md:flex flex-wrap gap-1.5 min-w-0">
                {Array.from(selectedIds).map((id) => {
                  const pro = professionals.find((p) => p.id === id);
                  if (!pro) return null;
                  return (
                    <span key={id} className="flex items-center gap-1 rounded-full bg-emerald-600 pl-2.5 pr-1 py-0.5 text-[11px] font-semibold text-white">
                      {pro.fullName || pro.businessName || 'Professional'}
                      <button
                        type="button"
                        onClick={() => toggleSelection(pro)}
                        className="rounded-full p-0.5 hover:bg-emerald-500 text-emerald-100"
                        aria-label={`Deselect ${pro.fullName || pro.businessName}`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleInviteSelected}
              disabled={blockInviteForMissingLocation}
              className="rounded-lg bg-[#DC143C] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#b01030] disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t('actions.shareProjectAria')}
            >
              Finish creating your project →
            </button>
          </div>
        </div>
      </div>

      {/* Comparison overlay hidden for now */}
      
      {/* Back to top button - behind the share project button */}
      <BackToTop zIndex={30} />
    </div>
  );
}

function ComparisonOverlay({
  professionals,
  selectedIds,
  onToggle,
  canSelectForInvite,
  onClose,
}: {
  professionals: Professional[];
  selectedIds: Set<string>;
  onToggle: (pro: Professional) => void;
  canSelectForInvite: boolean;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; value: (pro: Professional) => string }> = [
    {
      label: 'Rating',
      value: (pro) =>
        typeof pro.rating === 'number' && Number.isFinite(pro.rating)
          ? `${pro.rating.toFixed(1)}★`
          : '—',
    },
    { label: 'Type', value: (pro) => pro.professionType || '—' },
    { label: 'Trade Focus', value: (pro) => pro.primaryTrade || '—' },
    {
      label: 'Coverage',
      value: (pro) => {
        const zoneCodes = [
          ...new Set(
            (pro.regionCoverage || [])
              .map((c) => c?.zone?.label)
              .filter(Boolean) as string[]
          ),
        ];
        if (zoneCodes.length > 0) return zoneCodes.join(', ');
        return (
          (pro.serviceArea || '')
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(', ') || '—'
        );
      },
    },
    {
      label: 'References',
      value: (pro) => String(pro.referenceProjects?.length || 0),
    },
    {
      label: 'Portfolio Photos',
      value: (pro) => String(pro.profileImages?.length || 0),
    },
    {
      label: 'Emergency',
      value: (pro) => (pro.emergencyCalloutAvailable ? 'Available' : 'Standard'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative mx-4 w-full max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Comparison</p>
            <h3 className="text-lg font-bold text-white">Compare professionals side by side</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-500 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `220px repeat(${professionals.length}, minmax(220px, 1fr))` }}>
            <div className="sticky left-0 z-10 rounded-lg bg-slate-100 p-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Name
            </div>
            {professionals.map((pro, columnIndex) => (
              <div key={pro.id} className={`rounded-lg border border-slate-200 p-3 ${columnIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 line-clamp-2">
                    {pro.fullName || pro.businessName || 'Professional'}
                  </p>
                  {canSelectForInvite && selectedIds.has(pro.id) ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Selected
                    </span>
                  ) : null}
                </div>
                {canSelectForInvite ? (
                  <button
                    type="button"
                    onClick={() => onToggle(pro)}
                    className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      selectedIds.has(pro.id)
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {selectedIds.has(pro.id) ? '✓ Selected for Invite' : 'Select for Invite'}
                  </button>
                ) : null}
              </div>
            ))}

            {rows.map((row) => (
              <Fragment key={row.label}>
                <div className="sticky left-0 z-10 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  {row.label}
                </div>
                {professionals.map((pro, columnIndex) => (
                  <div
                    key={`${pro.id}-${row.label}`}
                    className={`rounded-lg border border-slate-100 p-3 text-sm text-slate-700 ${columnIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    {row.value(pro)}
                  </div>
                ))}
              </Fragment>
            ))}

            {/* Zone map row */}
            <Fragment key="zone-map">
              <div className="sticky left-0 z-10 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                Zone Map
              </div>
              {professionals.map((pro, columnIndex) => (
                <div
                  key={`${pro.id}-zone-map`}
                  className={`rounded-lg border border-slate-100 p-3 ${columnIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <HkZoneMap highlightedCodes={deriveHighlightedZones(pro)} compact />
                </div>
              ))}
            </Fragment>
          </div>
        </div>
      </div>
    </div>
  );
}
