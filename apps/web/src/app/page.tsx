'use client';

import { useState, Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { VideoTeaser } from '@/components/video-teaser';
import { API_BASE_URL } from '@/config/api';

// Detect iOS at runtime — must use useEffect to avoid SSR hydration mismatch
function useIsIOS() {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);
  return isIOS;
}

// Simplified prompt for iOS — avoids SearchFlow's problematic module graph
function IOSPrompt({ autoFocus }: { autoFocus: boolean }) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch(`${API_BASE_URL}/ai/sandbox/requirements/conversational`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      setResponse(data.conversationalText || data.output || JSON.stringify(data));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed';
      setResponse('Error: ' + message);
    } finally {
      setLoading(false);
      setQuery('');
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <form onSubmit={handleSubmit} className="shrink-0">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="What do you want to do today?"
            rows={3}
            autoFocus={autoFocus}
            className="w-full p-4 outline-none text-lg text-slate-900 placeholder-slate-400 resize-none"
          />
          <div className="flex justify-end px-4 pb-3">
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-lg bg-[#FF7F50] px-6 py-2 text-white font-bold disabled:opacity-50"
            >
              {loading ? 'Thinking...' : 'Ask Mimo'}
            </button>
          </div>
        </div>
      </form>
      <div className="flex-1 overflow-y-auto">
        {loading && <p className="text-slate-400 animate-pulse">Mimo is thinking...</p>}
        {response && <div className="bg-white rounded-lg border border-slate-200 p-4 text-slate-700 whitespace-pre-wrap text-sm">{response}</div>}
      </div>
    </div>
  );
}

// Full SearchFlow for non-iOS — lazy loaded since we confirmed it works on other platforms
const SearchFlow = dynamic(() => import('@/components/search-flow'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><div className="animate-pulse text-slate-400">Loading...</div></div>,
});

export default function Home() {
  const isIOS = useIsIOS();

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    }>
      {isIOS ? <HomeIOS /> : <HomeStandard />}
    </Suspense>
  );
}

// iOS: simple prompt without SearchFlow's problematic imports
function HomeIOS() {
  const searchParams = useSearchParams();
  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  return (
    <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-y-auto" style={{ height: 'calc(100vh - 64px)', WebkitOverflowScrolling: 'touch' }}>
      <section className="w-full max-w-6xl mx-auto" style={{ height: 'calc(100vh - 64px - 40px - 40px)' }}>
        <div className="mimo-panel relative h-full w-full flex flex-col py-6 sm:py-8">
          <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8">
            <div className="shrink-0 mb-4 text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">I</span>n <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">O</span>ut
              </h2>
            </div>
            <div className="flex-1 min-h-0">
              <IOSPrompt autoFocus={shouldFocusPrompt} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Standard: full SearchFlow for Android/desktop
function HomeStandard() {
  const { isLoggedIn } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const searchParams = useSearchParams();
  const [aiHasStarted, setAiHasStarted] = useState(false);

  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  const handleAiLoadingChange = (loading: boolean) => {
    if (loading) setAiHasStarted(true);
  };

  return (
    <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-y-auto overflow-x-hidden" style={{ height: 'calc(100vh - 64px)', WebkitOverflowScrolling: 'touch' }}>
      <section className="w-full max-w-6xl mx-auto overflow-hidden" style={{ height: 'calc(100vh - 64px - 40px - 40px)' }}>
        <div className="mimo-panel relative h-full w-full flex flex-col overflow-hidden py-6 sm:py-8">
          <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8">
            <div className="shrink-0 mb-4 text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">I</span>n <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">O</span>ut
              </h2>
            </div>
            <div className="flex-1 min-h-0 w-full flex items-start gap-2">
              <div className="hidden md:flex items-start justify-end w-[120px] shrink-0">
                <Image src="/assets/images/sarah-800_cropped.webp" alt="Sarah" width={120} height={240}
                  className="min-w-[120px] max-h-[240px] h-auto object-contain object-top" priority />
              </div>
              <div className="min-w-0 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
                <div className={`shrink-0 transition-all ${aiHasStarted ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-44 opacity-100'}`}>
                  <VideoTeaser />
                </div>
                <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                  <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={handleAiLoadingChange} />
                </div>
              </div>
              <div className="hidden lg:flex items-start justify-start w-[120px] shrink-0">
                <Image src="/assets/images/mike-800_cropped.webp" alt="Mike" width={120} height={240}
                  className="min-w-[120px] max-h-[240px] h-auto object-contain object-top" priority />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}









