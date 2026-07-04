'use client';

import { useState, useEffect } from 'react';

interface TypewriterTextProps {
  text: string;
  /** Milliseconds between words. Defaults to a staggered 60–155ms per word. */
  speedMs?: number;
  /** Initial delay before first word appears. Default 130ms. */
  initialDelayMs?: number;
  /** Show a blinking cursor at the end while typing. Default true. */
  showCursor?: boolean;
  className?: string;
}

/**
 * Renders text word-by-word with a typewriter animation.
 * Extracted from SearchFlow so it can be reused elsewhere.
 */
export default function TypewriterText({
  text,
  speedMs,
  initialDelayMs = 130,
  showCursor = true,
  className = 'text-base leading-relaxed text-slate-700',
}: TypewriterTextProps) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const [visibleWordCount, setVisibleWordCount] = useState(0);

  useEffect(() => {
    if (words.length === 0) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const streamNextWord = () => {
      if (cancelled) return;

      setVisibleWordCount((current) => {
        const next = Math.min(current + 1, words.length);
        if (next < words.length && !cancelled) {
          const delayMs = speedMs ?? (60 + ((next * 31) % 95));
          timeoutId = window.setTimeout(streamNextWord, delayMs);
        }
        return next;
      });
    };

    timeoutId = window.setTimeout(streamNextWord, initialDelayMs);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [words.length, speedMs, initialDelayMs]);

  if (words.length === 0) return null;

  return (
    <p className={className}>
      {words.slice(0, visibleWordCount).join(' ')}
      {showCursor && visibleWordCount < words.length && (
        <span className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse bg-slate-400 align-[-2px]" />
      )}
    </p>
  );
}
