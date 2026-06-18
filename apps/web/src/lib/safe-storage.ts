// Safe sessionStorage wrapper — prevents QuotaExceededError crashes
// Use instead of raw sessionStorage.setItem() calls.

const STALE_PREFIXES = ["ux_feedback_seen_"];

export function safeSessionSet(key: string, value: string): boolean {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.code === 22)
    ) {
      // Clean stale feedback keys (tiny per-key, but many accumulate)
      for (const prefix of STALE_PREFIXES) {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(prefix)) toRemove.push(k);
        }
        for (const k of toRemove) {
          try { sessionStorage.removeItem(k); } catch {}
        }
      }
      // Also clean large draft keys
      try { sessionStorage.removeItem("aiPendingAssistDraft"); } catch {}
      try { sessionStorage.removeItem("aiWizardHandoffPayload"); } catch {}
      try { sessionStorage.removeItem("aiAssistPayload_temp"); } catch {}

      // Retry
      try {
        sessionStorage.setItem(key, value);
        return true;
      } catch {
        // Give up — but don't crash
        return false;
      }
    }
    return false;
  }
}
