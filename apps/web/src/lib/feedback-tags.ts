export interface FeedbackTag {
  id: string;
  label: string;
  emoji: string;
}

// Emoji mood scale for 1–5 party ratings (index 0 = 1 star).
export const EMOJI_SCALE = ['😞', '😐', '🙂', '😃', '🤩'];

export const PROJECT_GOOD_TAGS: FeedbackTag[] = [
  { id: 'communication', label: 'Great communication', emoji: '🗣️' },
  { id: 'schedule', label: 'On schedule', emoji: '⏱️' },
  { id: 'quality', label: 'Quality work', emoji: '🛠️' },
  { id: 'budget', label: 'On budget', emoji: '💰' },
  { id: 'professional', label: 'Professional', emoji: '🤝' },
];

export const PROJECT_BAD_TAGS: FeedbackTag[] = [
  { id: 'communication', label: 'Poor communication', emoji: '🗣️' },
  { id: 'delays', label: 'Delays', emoji: '⏳' },
  { id: 'over_budget', label: 'Over budget', emoji: '💸' },
  { id: 'work_issues', label: 'Work issues', emoji: '🔧' },
  { id: 'unresponsive', label: 'Unresponsive', emoji: '📞' },
];

export const PLATFORM_GOOD_TAGS: FeedbackTag[] = [
  { id: 'easy', label: 'Easy to use', emoji: '😊' },
  { id: 'fast', label: 'Fast', emoji: '🚀' },
  { id: 'support', label: 'Good support', emoji: '💬' },
  { id: 'clear', label: 'Clear info', emoji: '🔍' },
];

export const PLATFORM_BAD_TAGS: FeedbackTag[] = [
  { id: 'confusing', label: 'Confusing', emoji: '😕' },
  { id: 'slow', label: 'Slow', emoji: '🐌' },
  { id: 'help', label: 'Hard to find help', emoji: '🤔' },
  { id: 'features', label: 'Missing features', emoji: '📉' },
];
