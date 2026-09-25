'use client';

import type { FeedbackTag } from '@/lib/feedback-tags';

interface Props {
  label: string;
  tags: FeedbackTag[];
  selected: string[];
  text: string;
  onToggleTag: (id: string) => void;
  onTextChange: (value: string) => void;
}

/**
 * A labelled row of multi-select tag chips that slides out an optional
 * free-text field ("Would you like to tell us more?") once any chip is chosen.
 */
export function FeedbackChipGroup({
  label,
  tags,
  selected,
  text,
  onToggleTag,
  onTextChange,
}: Props) {
  const showText = selected.length > 0;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => {
          const active = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggleTag(t.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-300'
              }`}
            >
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>
      <div
        className={`grid transition-all duration-200 ease-out ${
          showText ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={2}
            placeholder="Would you like to tell us more?"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm resize-none"
          />
        </div>
      </div>
    </div>
  );
}
