'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { matchIntent, type IntentResult } from '@/lib/intent-matcher';
import SearchBox from '@/components/search-box';
import { SearchHelpModal } from '@/components/search-help-modal';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { API_BASE_URL } from '@/config/api';

interface IntentModalProps {
  intent: IntentResult | null;
  onClose: () => void;
  matchCount: number | null;
  countLoading: boolean;
  isLoggedIn: boolean | undefined;
  openJoinModal: () => void;
}

function IntentModal({ intent, onClose, matchCount, countLoading, isLoggedIn, openJoinModal }: IntentModalProps) {
  const router = useRouter();
  const t = useTranslations('home.searchFlow');
  const [isNavigating, setIsNavigating] = useState(false);

  if (!intent || intent.confidence === 0) return null;

  const isAnonProfFind = isLoggedIn === false && intent.action === 'find-professional';

  const handleProceed = () => {
    setIsNavigating(true);
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

  const buildCountMessage = () => {
    if (countLoading) return null;
    const trade = intent.metadata.professionType ?? 'professional';
    const location = intent.metadata.location;
    if (matchCount === null) return null;
    if (matchCount === 0) return t('anonMatchNone');
    if (location) return t('anonMatchFoundInLocation', { count: matchCount, trade, location });
    return t('anonMatchFound', { count: matchCount, trade });
  };

  const countMessage = buildCountMessage();

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

          {isAnonProfFind ? (
            <div className="space-y-2">
              {countLoading ? (
                <p className="text-sm text-slate-500">{t('loading')}</p>
              ) : countMessage ? (
                <>
                  <p className="text-sm font-semibold text-slate-800">{countMessage}</p>
                  {(matchCount ?? 0) > 0 && (
                    <p className="text-sm text-slate-600">{t('anonRegisterPrompt')}</p>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {intent.confidence === 1 || intent.confidence > 0.9
                ? t('readyToProceed')
                : t('isThisRight')}
            </p>
          )}
        </div>

        {/* Details (if any) — shown for logged-in users */}
        {!isAnonProfFind && (intent.metadata.professionType || intent.metadata.location) && (
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
            {t('back')}
          </button>
          {isAnonProfFind ? (
            <button
              onClick={() => { onClose(); openJoinModal(); }}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition"
            >
              {t('anonRegisterCta')}
            </button>
          ) : (
            <button
              onClick={handleProceed}
              disabled={isNavigating}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isNavigating ? t('loading') : t('letsGo')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchFlow() {
  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const { isLoggedIn } = useAuth();
  const { openLoginModal, openJoinModal } = useAuthModalControl();

  // Fetch professional count whenever a find-professional intent is detected
  useEffect(() => {
    if (!intent || intent.action !== 'find-professional') {
      setMatchCount(null);
      return;
    }

    let cancelled = false;
    const fetchCount = async () => {
      setCountLoading(true);
      try {
        const params = new URLSearchParams();
        if (intent.metadata.professionType) params.set('trade', intent.metadata.professionType);
        if (intent.metadata.location) params.set('location', intent.metadata.location);
        const res = await fetch(`${API_BASE_URL}/professionals/public/count?${params.toString()}`);
        if (!res.ok) throw new Error('count fetch failed');
        const data: { count: number } = await res.json();
        if (!cancelled) setMatchCount(data.count);
      } catch {
        if (!cancelled) setMatchCount(null);
      } finally {
        if (!cancelled) setCountLoading(false);
      }
    };

    fetchCount();
    return () => { cancelled = true; };
  }, [intent]);

  const handleSearch = (query: string) => {
    const result = matchIntent(query);
    setMatchCount(null);
    setIntent(result);
  };

  return (
    <div className="space-y-3">
      <div className="text-center space-y-2 mb-6">
        <p className="text-sm text-slate-600">
          Describe what you need in a few words.{' '}
          <button
            onClick={() => setShowHelp(true)}
            className="text-emerald-600 hover:text-emerald-700 font-semibold underline transition"
          >
            We'll help you get started.
          </button>
        </p>
      </div>
      <SearchBox onSubmit={handleSearch} />

      {/* Auth nudge for non-logged-in users */}
      {isLoggedIn === false && (
        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            <button
              onClick={openLoginModal}
              className="text-emerald-600 hover:text-emerald-700 font-semibold bg-transparent border-none cursor-pointer p-0"
            >
              Login
            </button>
            {' or '}
            <button
              onClick={openJoinModal}
              className="text-emerald-600 hover:text-emerald-700 font-semibold bg-transparent border-none cursor-pointer p-0"
            >
              Join Now
            </button>
            {' for the best experience'}
          </p>
        </div>
      )}

      <IntentModal
        intent={intent}
        onClose={() => setIntent(null)}
        matchCount={matchCount}
        countLoading={countLoading}
        isLoggedIn={isLoggedIn}
        openJoinModal={openJoinModal}
      />
      <SearchHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
