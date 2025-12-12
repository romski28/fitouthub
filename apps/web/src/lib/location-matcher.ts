import { LOCATIONS } from '../../../../packages/schemas/locations';

export interface LocationMatchResult {
  primary: string;
  secondary: string;
  tertiary?: string;
  granularity: 'primary' | 'secondary' | 'tertiary';
  display: string; // Friendly label for UI
  confidence: number; // 0-1 based on granularity
}

// Common synonyms/aliases
const NAME_ALIASES: Record<string, string[]> = {
  'hong kong island': ['hk island', 'hki'],
  'tsim sha tsui': ['tst'],
  'discovery bay': ['db'],
  "chek lap kok (hong kong international airport)": ['airport', 'hkg', 'chek lap kok'],
  'lohas park': ['lohas'],
  "jardine's lookout": ["jardines lookout"],
  'robin’s nest': ["robins nest"],
  'mai po / nam sang wai': ['mai po', 'nam sang wai'],
  'mong kok': ['mk'],
  'wan chai': ['wch', 'wanchai'],
  'north point': ['np'],
  'causeway bay': ['cwb'],
  'kowloon': ['kln'],
  'new territories': ['nt'],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build an index for fast lookup
const INDEX: Map<string, LocationMatchResult> = new Map();

(function buildIndex() {
  for (const loc of LOCATIONS) {
    const names: string[] = [];
    if (loc.tertiary) names.push(loc.tertiary);
    names.push(loc.secondary);
    names.push(loc.primary);

    for (const name of names) {
      const key = normalize(name);
      const granularity = loc.tertiary && name === loc.tertiary ? 'tertiary' : name === loc.secondary ? 'secondary' : 'primary';
      const confidence = granularity === 'tertiary' ? 0.95 : granularity === 'secondary' ? 0.9 : 0.85;
      INDEX.set(key, {
        primary: loc.primary,
        secondary: loc.secondary,
        tertiary: loc.tertiary,
        granularity,
        display: loc.tertiary || loc.secondary,
        confidence,
      });

      const aliases = NAME_ALIASES[key] || NAME_ALIASES[name.toLowerCase()];
      if (aliases) {
        for (const alias of aliases) {
          INDEX.set(normalize(alias), {
            primary: loc.primary,
            secondary: loc.secondary,
            tertiary: loc.tertiary,
            granularity,
            display: loc.tertiary || loc.secondary,
            confidence: Math.max(confidence - 0.05, 0.8),
          });
        }
      }
    }
  }
})();

export function matchLocation(query: string): LocationMatchResult | null {
  const q = normalize(query);

  // Exact includes match across indexed keys
  // Prefer longest/most granular match
  let best: LocationMatchResult | null = null;

  for (const [key, value] of INDEX.entries()) {
    if (q.includes(key)) {
      if (!best) {
        best = value;
      } else {
        const granularityRank = (g: 'primary' | 'secondary' | 'tertiary') => (g === 'tertiary' ? 3 : g === 'secondary' ? 2 : 1);
        const currentRank = granularityRank(value.granularity);
        const bestRank = granularityRank(best.granularity);
        if (currentRank > bestRank || (currentRank === bestRank && key.length > normalize(best.display).length)) {
          best = value;
        }
      }
    }
  }

  return best;
}

export function getPrimaries(): string[] {
  return Array.from(new Set(LOCATIONS.map((l) => l.primary)));
}

export function getSecondaries(primary: string): string[] {
  return Array.from(new Set(LOCATIONS.filter((l) => l.primary === primary).map((l) => l.secondary)));
}

export function getTerciaries(primary: string, secondary: string): string[] {
  return Array.from(new Set(LOCATIONS.filter((l) => l.primary === primary && l.secondary === secondary).map((l) => l.tertiary!).filter(Boolean)));
}
