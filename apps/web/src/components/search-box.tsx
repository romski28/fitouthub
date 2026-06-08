'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface SearchBoxProps {
  onSubmit: (query: string) => void;
  autoFocus?: boolean;
  onClear?: () => void;
  submitLabel?: string;
  clearKey?: number;
  imageSection?: ReactNode;
  imageActions?: ReactNode;
  onHelpClick?: () => void;
}

const MAX_QUERY_CHARS = 5000;

export default function SearchBox({ onSubmit, autoFocus = false, onClear, submitLabel = 'Ask Mimo', clearKey, imageSection, imageActions, onHelpClick }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prompts = useMemo(
    () => [
      'What do you want to do today?',
      'Describe your problem.',
      'What service are you looking for?',
      'Let us know where you are.',
      'Need a pro? Tell us!',
    ],
    []
  );
  const [placeholder, setPlaceholder] = useState(prompts[0]);
  const [promptIndex, setPromptIndex] = useState(0);
  const typingRef = useRef<number | null>(null);
  const cycleRef = useRef<number | null>(null);

  // Typing/deleting animation for placeholder when input is empty
  useEffect(() => {
    const typeSpeed = 35;
    const holdTime = 3000; // 3s read time
    const deleteSpeed = 20;

    if (query) {
      // If user starts typing, stop animations
      if (typingRef.current) window.clearTimeout(typingRef.current);
      if (cycleRef.current) window.clearTimeout(cycleRef.current);
      return;
    }

    // Use local buffer to avoid stale closures on placeholder
    let current = prompts[promptIndex];
    setPlaceholder(current);

    const startCycle = () => {
      // delete current
      const deleteStep = () => {
        current = current.slice(0, -1);
        setPlaceholder(current);
        if (current.length > 0) {
          typingRef.current = window.setTimeout(deleteStep, deleteSpeed);
        } else {
          // type next
          const nextIdx = (promptIndex + 1) % prompts.length;
          const nextText = prompts[nextIdx];
          let i = 0;
          const typeStep = () => {
            current = nextText.slice(0, i + 1);
            setPlaceholder(current);
            i++;
            if (i < nextText.length) {
              typingRef.current = window.setTimeout(typeStep, typeSpeed);
            } else {
              setPromptIndex(nextIdx);
              cycleRef.current = window.setTimeout(startCycle, holdTime);
            }
          };
          typingRef.current = window.setTimeout(typeStep, typeSpeed);
        }
      };
      typingRef.current = window.setTimeout(deleteStep, holdTime); // hold before deleting
    };

    // start initial cycle
    cycleRef.current = window.setTimeout(startCycle, holdTime);

    return () => {
      if (typingRef.current) window.clearTimeout(typingRef.current);
      if (cycleRef.current) window.clearTimeout(cycleRef.current);
    };
  }, [query, prompts, promptIndex]);

  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [autoFocus]);

  useEffect(() => {
    if (clearKey === undefined || clearKey === 0) return;
    setQuery('');
  }, [clearKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (query.trim()) {
        onSubmit(query.trim());
      }
    }
  };

  const isExpanded = isFocused || query.trim().length > 0;
  const characterCount = query.length;

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
          <div className="relative px-3 sm:px-4 pt-3 sm:pt-4">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              rows={1}
              maxLength={MAX_QUERY_CHARS}
              style={{ height: isExpanded ? '9rem' : '3.25rem' }}
              className="w-full py-3 sm:py-4 outline-none text-base sm:text-lg text-slate-900 placeholder-slate-400 resize-none overflow-y-auto transition-[height] duration-300 ease-in-out pr-10"
            />
            {onHelpClick && (
              <button
                type="button"
                onClick={onHelpClick}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white shadow-md border-2 border-white text-xs font-bold hover:bg-blue-600 transition"
                title="Help getting started"
                aria-label="Help getting started"
              >
                i
              </button>
            )}
          </div>

          {imageSection && (
            <div className="border-t border-slate-100 px-3 sm:px-4 py-2">
              {imageSection}
            </div>
          )}

          <div className="flex items-center justify-between px-3 sm:px-4 pb-3 sm:pb-4 pt-1">
            <div className="flex items-center gap-2">
              {imageActions}
              <span className="text-xs text-slate-400">
                {characterCount}/{MAX_QUERY_CHARS}
              </span>
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    onClear?.();
                  }}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
            <button
              type="submit"
              className="ml-3 rounded-md border border-[#F5EEDE] bg-[#F97362] px-3 py-2.5 text-sm font-semibold whitespace-nowrap text-[#F5EEDE] shadow-sm transition-colors duration-150 hover:bg-[#e8624f] active:bg-[#d75846] sm:px-6 sm:text-base"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
