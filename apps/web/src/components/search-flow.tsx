'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { matchIntent, type IntentResult } from '@/lib/intent-matcher';
import SearchBox from '@/components/search-box';

interface IntentModalProps {
  intent: IntentResult | null;
  onClose: () => void;
}

function IntentModal({ intent, onClose }: IntentModalProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  if (!intent || intent.confidence === 0) return null;

  const handleProceed = () => {
    setIsNavigating(true);
    // Store metadata in sessionStorage for the next page to consume
    if (intent.metadata.professionType || intent.metadata.location || intent.metadata.description) {
      sessionStorage.setItem(
        'intentData',
        JSON.stringify({
          professionType: intent.metadata.professionType,
          location: intent.metadata.location,
          description: intent.metadata.description,
        })
      );
    }
    router.push(intent.route);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in duration-200">
        {/* Icon */}
        <div className="text-5xl text-center">
          {intent.action === 'find-professional' && '🔍'}
          {intent.action === 'join' && '⭐'}
          {intent.action === 'manage-projects' && '📋'}
          {intent.action === 'unknown' && '🤔'}
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">
            {intent.metadata.displayText}
          </h2>
          <p className="text-sm text-slate-600">
            {intent.confidence === 1 || intent.confidence > 0.9
              ? 'Ready to proceed?'
              : 'Is this what you meant?'}
          </p>
        </div>

        {/* Details (if any) */}
        {(intent.metadata.professionType || intent.metadata.location) && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
            {intent.metadata.professionType && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600">Professional Type:</span>
                <span className="font-semibold text-slate-900 capitalize">
                  {intent.metadata.professionType}
                </span>
              </div>
            )}
            {intent.metadata.location && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600">Location:</span>
                <span className="font-semibold text-slate-900 capitalize">
                  {intent.metadata.location}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition"
            disabled={isNavigating}
          >
            Back
          </button>
          <button
            onClick={handleProceed}
            disabled={isNavigating}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {isNavigating ? 'Loading...' : 'Let\'s go'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SearchFlow() {
  const [intent, setIntent] = useState<IntentResult | null>(null);

  const handleSearch = (query: string) => {
    const result = matchIntent(query);
    setIntent(result);
  };

  return (
    <>
      <SearchBox onSubmit={handleSearch} />
      <IntentModal intent={intent} onClose={() => setIntent(null)} />
    </>
  );
}
