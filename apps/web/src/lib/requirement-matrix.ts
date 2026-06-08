// ============================================================
// Requirement Topics Matrix
// ============================================================
// Defines which scoping topics the AI should track and confirm
// per project category. Edit the arrays below to change what
// Mimo asks about for each project type.
// ============================================================

/** Project categories that Mimo detects from user descriptions */
export type ProjectCategory =
  | 'painting'
  | 'decoration'
  | 'flooring'
  | 'tiling'
  | 'wallpaper'
  | 'plastering'
  | 'plumbing'
  | 'electrical'
  | 'carpentry'
  | 'carpeting'
  | 'general';

/** A scoping requirement topic the AI tracks */
export interface RequirementTopic {
  /** Unique key matching AI's coveredTopics values */
  key: string;
  /** Display label in the checklist */
  label: string;
  /** Higher = more critical for matching/tender quality (0-10) */
  priority: number;
}

// ── Topic Definitions ──────────────────────────────────────────
// Add new topics here and they automatically appear in the checklist
// for categories that include their key.
export const TOPIC_DEFS: RequirementTopic[] = [
  { key: 'roomSize',           label: 'Room size',      priority: 9 },
  { key: 'existingCondition',  label: 'Condition',      priority: 7 },
  { key: 'materialPreference', label: 'Materials',      priority: 6 },
  { key: 'fixtureType',        label: 'Fixture type',   priority: 8 },
  { key: 'existingWiring',     label: 'Wiring',         priority: 6 },
  { key: 'pipeAccess',         label: 'Pipe access',    priority: 7 },
];

// ── Category → Topic Mapping ───────────────────────────────────
// Keys must match RequirementTopic.key above.
export const CATEGORY_TOPICS: Record<ProjectCategory, string[]> = {
  painting:    ['roomSize', 'existingCondition', 'materialPreference'],
  decoration:  ['roomSize', 'existingCondition', 'materialPreference'],
  flooring:    ['roomSize', 'existingCondition', 'materialPreference'],
  tiling:      ['roomSize', 'existingCondition', 'materialPreference'],
  wallpaper:   ['roomSize', 'existingCondition'],
  plastering:  ['roomSize', 'existingCondition'],
  plumbing:    ['fixtureType', 'pipeAccess'],
  electrical:  ['existingWiring', 'fixtureType'],
  carpentry:   ['roomSize', 'materialPreference'],
  carpeting:   ['roomSize', 'materialPreference'],
  general:     ['roomSize'],
};

// ── Helpers ─────────────────────────────────────────────────────

/** Get topic definitions for a given category, sorted by priority desc */
export function getTopicsForCategory(category: ProjectCategory): RequirementTopic[] {
  const keys = CATEGORY_TOPICS[category] ?? CATEGORY_TOPICS.general;
  return TOPIC_DEFS
    .filter((t) => keys.includes(t.key))
    .sort((a, b) => b.priority - a.priority);
}

/** Derive a project category from AI-detected trades */
const TRADE_CATEGORY_MAP: Record<string, ProjectCategory> = {
  Plumber: 'plumbing',
  Electrician: 'electrical',
  'Tiler': 'tiling',
  'Floor Fitter': 'flooring',
  'Painter': 'painting',
  'Decorator': 'decoration',
  'Wallpaper Installer': 'wallpaper',
  'Plasterer': 'plastering',
  'Carpenter': 'carpentry',
  'Carpet Fitter': 'carpeting',
  'Handyman': 'general',
};

export function deriveCategoryFromTrades(trades: string[]): ProjectCategory {
  for (const trade of trades) {
    const category = TRADE_CATEGORY_MAP[trade];
    if (category) return category;
  }
  return 'general';
}
