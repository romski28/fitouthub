/**
 * Returns the best available project scope text, preferring AI-compiled
 * summary over raw user notes. Used consistently across client, pro, and
 * admin views to ensure everyone sees the same scope.
 */
export function getProjectScope(project: {
  notes?: string | null;
  aiIntake?: { summary?: string | null } | null;
}): string {
  return project.aiIntake?.summary?.trim() || project.notes?.trim() || '';
}
