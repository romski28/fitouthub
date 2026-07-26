'use client';

import { useState, Suspense, Component } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { VideoTeaser } from '@/components/video-teaser';
import SearchFlow from '@/components/search-flow';

// Error boundary that shows the error ON SCREEN for iOS debugging
class DebugErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="rounded-lg border-2 border-red-500 bg-red-100 p-4 text-sm text-red-800 max-w-lg text-left overflow-auto max-h-64">
            <p className="font-bold mb-2 text-base">SearchFlow crashed on iOS:</p>
            <p className="whitespace-pre-wrap text-xs font-mono">{this.state.error.message}</p>
            <p className="text-xs mt-2 text-red-600">{this.state.error.stack?.split('\n').slice(0, 5).join('\n')}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    }>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [aiHasStarted, setAiHasStarted] = useState(false);
  const [clicks, setClicks] = useState(0);

  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  const handleAiLoadingChange = (loading: boolean) => {
    if (loading) setAiHasStarted(true);
  };

  return (
    <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-y-auto overflow-x-hidden" style={{ height: 'calc(100vh - 64px)', WebkitOverflowScrolling: 'touch' }}>
      {/* Test button to confirm React is alive */}
      <div className="text-center mb-2">
        <button onClick={() => setClicks(c => c + 1)} className="text-xs bg-green-600 text-white px-2 py-1 rounded">
          OK:{clicks}
        </button>
        <Link href="/docs" className="text-xs text-blue-600 underline ml-2">→Docs</Link>
      </div>

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
                  <DebugErrorBoundary>
                    <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={handleAiLoadingChange} />
                  </DebugErrorBoundary>
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









