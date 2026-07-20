/**
 * Shared AI answer-option generation for wizard chat and search-flow.
 * Used as a fallback when the AI doesn't include options in its JSON response.
 */
export function generateAiOptions(text: string): { label: string; value: string }[] | null {
  const trimmed = text?.trim() || '';

  // Always return at least the default options, even for empty/statement-only responses
  if (!trimmed) {
    return [
      { label: 'Tell me more', value: 'let me give you more details' },
      { label: 'That covers it', value: 'that covers everything' },
    ];
  }

  const lower = trimmed.toLowerCase();

  // 1. Comma-separated list with optional trailing "or": "X, Y, or Z?"
  const questionBody = trimmed.replace(/[?.]$/, '').trim();
  const parts = questionBody
    .split(/,\s*(?:or\s+)?/i)
    .filter((s) => s.trim().length > 0)
    .slice(-5);

  if (parts.length >= 3) {
    return parts.map((s) => ({ label: s.trim(), value: s.trim().toLowerCase() })).slice(0, 5);
  }

  // 2. Simple "X or Y" pattern (e.g. "indoor or outdoor?")
  const orMatch = questionBody.match(/(.+)\s+or\s+(.+)/i);
  if (orMatch) {
    return [
      { label: orMatch[1].trim(), value: orMatch[1].trim().toLowerCase() },
      { label: orMatch[2].trim(), value: orMatch[2].trim().toLowerCase() },
      { label: 'Something else', value: 'something else' },
    ];
  }

  // 3. What/which/how questions — checked BEFORE yes/no so "What type … are you …" doesn't falsely match yes/no
  if (/\b(what|which|how)\b/i.test(lower) && /\?$/.test(trimmed)) {
    return [
      { label: 'Tell me more', value: 'let me give you more details' },
      { label: 'Not sure yet', value: 'I am not sure yet' },
    ];
  }

  // 4. Yes/No question detection — only when the question STARTS with a yes/no auxiliary
  if (
    /\b(yes|no)\b/.test(lower) ||
    (/\?$/.test(trimmed) && /^(would you|do you|are you|is it|can you|have you|did you)\b/i.test(lower))
  ) {
    return [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
      { label: 'Not sure', value: 'I am not sure' },
    ];
  }

  // 5. Default: encouragement
  return [
    { label: 'Tell me more', value: 'let me give you more details' },
    { label: 'That covers it', value: 'that covers everything' },
  ];
}

/**
 * Parse AI-generated options from a payload, or fall back to text-based generation.
 */
export function extractAiOptions(
  parsedOutput: Record<string, unknown> | null | undefined,
  payloadOptions: unknown,
  fallbackText: string,
): { label: string; value: string }[] | null {
  // Try AI-generated options first
  const raw: unknown[] | null =
    Array.isArray(parsedOutput?.options)
      ? (parsedOutput!.options as unknown[])
      : Array.isArray(payloadOptions)
        ? (payloadOptions as unknown[])
        : null;

  if (raw?.length) {
    const valid = raw
      .filter((o: unknown) => {
        const obj = o as Record<string, unknown>;
        return typeof obj?.label === 'string' && typeof obj?.value === 'string';
      })
      .map((o: unknown) => {
        const obj = o as Record<string, string>;
        return { label: obj.label.trim(), value: obj.value.trim() };
      })
      .filter((o) => o.label && o.value)
      // Filter out generic fallback options the UI already provides
      .filter((o) => {
        const lower = o.label.toLowerCase();
        return !/^(other|something else|or something else|tell me more|that'?s all|none of the above)$/i.test(lower);
      })
      // Trim overly long labels (full sentences aren't button-friendly)
      .map((o) => ({
        label: o.label.length > 40 ? o.label.slice(0, 37) + '…' : o.label,
        value: o.value,
      }))
      .slice(0, 4);

    if (valid.length) return valid;
  }

  // Fallback: generate from text
  return generateAiOptions(fallbackText);
}
