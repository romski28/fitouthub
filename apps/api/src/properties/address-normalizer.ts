import { createHash } from 'crypto';

/**
 * HK property address normalisation — Phase B1 (v1).
 *
 * Produces deterministic tokens used to compute `Property.canonicalKey`
 * and to feed pg_trgm similarity search. The v1 goal is consistency, not
 * exhaustive Chinese/address coverage — building aliases (PropertyAlias)
 * and the BuildingGazetteer absorb the long tail.
 *
 * Token shapes must stay in sync with the seed key format:
 *   `<building>|<block>|<floor>|<unit>|<districtAreaId>` (all lowercase),
 *   e.g. `the wings ii|tower 3|12|a|area_sai_kung`.
 */

// Longest-first so multi-char replacements win over single-char ones.
const TRAD_TO_SIMP: Array<[string, string]> = [
  ['花園', '花园'],
  ['屋邨', '屋村'],
  ['商場', '商场'],
  ['廣場', '广场'],
  ['樓', '楼'],
  ['號', '号'],
  ['閣', '阁'],
  ['邨', '村'],
  ['臺', '台'],
  ['灣', '湾'],
  ['東', '东'],
  ['區', '区'],
  ['園', '园'],
  ['廣', '广'],
];

const UNIT_WORDS = /flat|unit|apt|apartment|室|房|單位/gi;
const FLOOR_WORDS = /floor|th\s+floor|st\s+floor|nd\s+floor|rd\s+floor|樓|層|层/gi;

/** NFKC + case-fold + traditional→simplified + strip punctuation, keep CJK/alnum. */
export function normalizeText(input?: string | null): string {
  if (!input) return '';
  let s = input.normalize('NFKC'); // full/half-width + compatibility forms
  for (const [trad, simp] of TRAD_TO_SIMP) {
    s = s.split(trad).join(simp);
  }
  s = s.toLowerCase();
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Floor → leading integer when present ("12/F" → "12", "Ground floor" → "ground"). */
export function normalizeFloor(floor?: string | null): string {
  if (!floor) return '';
  const digits = normalizeText(floor).match(/\d+/);
  if (digits) return digits[0];
  return normalizeText(floor.replace(FLOOR_WORDS, ' '));
}

/** Unit → compact alphanumeric ("Flat A" / "A室" → "a"). */
export function normalizeUnit(unit?: string | null): string {
  if (!unit) return '';
  return normalizeText(unit).replace(UNIT_WORDS, ' ').replace(/\s+/g, '');
}

/** Block/tower keeps its qualifier for v1 ("Tower 3" → "tower 3"), matching seed. */
export function normalizeBlock(block?: string | null): string {
  return block ? normalizeText(block) : '';
}

/** Compute the unique canonical key for a physical unit. */
export function computeCanonicalKey(parts: {
  buildingName: string;
  block?: string | null;
  floor?: string | null;
  unit?: string | null;
  districtAreaId?: string | null;
}): string {
  const joined = [
    parts.buildingName,
    parts.block || '',
    parts.floor || '',
    parts.unit || '',
    parts.districtAreaId || '',
  ]
    .map((p) => p.toLowerCase())
    .join('|');
  return createHash('md5').update(joined).digest('hex');
}

/** Human-friendly rendering only — never used for matching. */
export function formatDisplayAddress(parts: {
  unit?: string | null;
  floor?: string | null;
  block?: string | null;
  buildingName: string;
  districtName?: string | null;
}): string {
  const bits: string[] = [];
  if (parts.unit) bits.push(`Flat ${parts.unit}`);
  if (parts.floor) bits.push(`${parts.floor}/F`);
  if (parts.block) bits.push(parts.block);
  bits.push(parts.buildingName);
  if (parts.districtName) bits.push(parts.districtName);
  return bits.join(', ');
}
