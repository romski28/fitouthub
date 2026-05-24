'use client';

import { clearCreateProjectDraftHandoff, clearProjectDescriptionHandoff } from '@/lib/create-project-handoff';

const AI_STORAGE_KEYS = [
  'aiSandboxSessionId',
  'intentData',
  'createProjectDraft',
  'projectDescription',
  'postLoginRedirect',
] as const;

export const AI_STATE_CLEAR_EVENT = 'fitouthub:clear-ai-state';

export function clearAiClientState() {
  if (typeof window === 'undefined') return;

  for (const key of AI_STORAGE_KEYS) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {}
  }

  clearCreateProjectDraftHandoff();
  clearProjectDescriptionHandoff();

  window.dispatchEvent(new CustomEvent(AI_STATE_CLEAR_EVENT));
}