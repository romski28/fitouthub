import { LOCATIONS } from '../../../../packages/schemas/locations';

export interface LocationSearchResult {
  primary: string;
  secondary: string;
  tertiary?: string;
  granularity: 'primary' | 'secondary' | 'tertiary';
  display: string;
  score: number; // 0-1 relevance score
}

/**
 * Search locations by partial text match
 * Returns results sorted by relevance (score)
 */
export function searchLocations(query: string, limit = 10): LocationSearchResult[] {
  if (!query.trim()) return [];

  const normalized = query.toLowerCase().normalize('NFKD').replace(/['']/g, "'").replace(/[^a-z0-9\s]/g, ' ').trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  const results: LocationSearchResult[] = [];
  const seen = new Set<string>();

  for (const loc of LOCATIONS) {
    const names: Array<{ text: string; granularity: 'primary' | 'secondary' | 'tertiary'; score: number }> = [];

    if (loc.tertiary) names.push({ text: loc.tertiary, granularity: 'tertiary', score: 0 });
    names.push({ text: loc.secondary, granularity: 'secondary', score: 0 });
    names.push({ text: loc.primary, granularity: 'primary', score: 0 });

    for (const { text, granularity } of names) {
      const textLower = text.toLowerCase().normalize('NFKD').replace(/['']/g, "'").replace(/[^a-z0-9\s]/g, ' ').trim();

      // Exact match at start (highest score)
      if (textLower.startsWith(normalized)) {
        let score = 1.0;
        if (granularity === 'tertiary') score = 0.95;
        else if (granularity === 'secondary') score = 0.9;
        else score = 0.85;

        const key = `${loc.primary}|${loc.secondary}|${loc.tertiary || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            primary: loc.primary,
            secondary: loc.secondary,
            tertiary: loc.tertiary,
            granularity,
            display: loc.tertiary || loc.secondary,
            score,
          });
        }
        break; // found match at this level, skip others
      }

      // Partial match (lower score)
      if (textLower.includes(normalized)) {
        let score = 0.7;
        if (granularity === 'tertiary') score = 0.65;
        else if (granularity === 'secondary') score = 0.6;
        else score = 0.55;

        const key = `${loc.primary}|${loc.secondary}|${loc.tertiary || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            primary: loc.primary,
            secondary: loc.secondary,
            tertiary: loc.tertiary,
            granularity,
            display: loc.tertiary || loc.secondary,
            score,
          });
        }
        break;
      }

      // Word-wise match (each word in query matches somewhere in name)
      if (words.every((w) => textLower.includes(w))) {
        let score = 0.5;
        if (granularity === 'tertiary') score = 0.45;
        else if (granularity === 'secondary') score = 0.4;
        else score = 0.35;

        const key = `${loc.primary}|${loc.secondary}|${loc.tertiary || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            primary: loc.primary,
            secondary: loc.secondary,
            tertiary: loc.tertiary,
            granularity,
            display: loc.tertiary || loc.secondary,
            score,
          });
        }
        break;
      }
    }
  }

  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get available primaries for a set of selected regions
 */
export function getUniquePrimaries(): string[] {
  return Array.from(new Set(LOCATIONS.map((l) => l.primary)));
}

/**
 * Get secondaries for a primary region
 */
export function getSecondariesForPrimary(primary: string): string[] {
  return Array.from(new Set(LOCATIONS.filter((l) => l.primary === primary).map((l) => l.secondary)));
}
