'use client';

import { useMemo } from 'react';
import {
  type RequirementTopic,
  getTopicsForCategory,
  deriveCategoryFromTrades,
} from '@/lib/requirement-matrix';

interface Props {
  trades: string[];
  coveredTopics?: string[];
}

export function RequirementChecklist({ trades, coveredTopics = [] }: Props) {
  const category = useMemo(() => deriveCategoryFromTrades(trades), [trades]);
  const topics = useMemo(() => getTopicsForCategory(category), [category]);

  if (topics.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {topics.map((topic) => {
        const isCovered = coveredTopics.includes(topic.key);
        return (
          <span
            key={topic.key}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              isCovered
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <span className={isCovered ? 'text-emerald-600' : 'text-slate-300'}>
              {isCovered ? '✓' : '○'}
            </span>
            {topic.label}
          </span>
        );
      })}
    </div>
  );
}
