'use client';

import React from 'react';

export type ProjectSentiment = 'ok' | 'dispute' | 'mitigated';

const SENTIMENT_ORDER: ProjectSentiment[] = ['ok', 'dispute', 'mitigated'];

const SENTIMENT_META: Record<ProjectSentiment, { emoji: string; label: string; className: string }> = {
  ok: {
    emoji: '❤️',
    label: 'Running OK',
    className: 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40',
  },
  dispute: {
    emoji: '💔',
    label: 'Needs Attention',
    className: 'bg-rose-500/20 text-rose-100 border border-rose-500/40',
  },
  mitigated: {
    emoji: '❤️‍🩹',
    label: 'Mitigated',
    className: 'bg-amber-500/20 text-amber-100 border border-amber-500/40',
  },
};

const normalizeSentiment = (value: unknown): ProjectSentiment => {
  if (value === 'dispute' || value === 'mitigated') return value;
  return 'ok';
};

type ProjectSentimentBadgeProps = {
  projectId: string;
  storageScope: 'client' | 'professional' | 'shared';
};

export function ProjectSentimentBadge({ projectId, storageScope }: ProjectSentimentBadgeProps) {
  const storageKey = `fitouthub:project-sentiment:${storageScope}:${projectId}`;
  const [sentiment, setSentiment] = React.useState<ProjectSentiment>('ok');

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setSentiment(normalizeSentiment(stored));
    } catch {
      setSentiment('ok');
    }
  }, [storageKey]);

  const handleCycle = () => {
    setSentiment((prev) => {
      const currentIndex = SENTIMENT_ORDER.indexOf(prev);
      const next = SENTIMENT_ORDER[(currentIndex + 1) % SENTIMENT_ORDER.length];
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
      }
      return next;
    });
  };

  const meta = SENTIMENT_META[sentiment];

  return (
    <button
      type="button"
      onClick={handleCycle}
      data-dispute-sentiment-tag="DISPUTE_MANAGEMENT_PLACEHOLDER"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${meta.className}`}
      title={`Project sentiment: ${meta.label}. Click to cycle sentiment state.`}
      aria-label={`Project sentiment ${meta.label}. Click to change sentiment.`}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      <span>{meta.label}</span>
    </button>
  );
}
