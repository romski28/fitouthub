'use client';

import { useState, useEffect, Component } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import SearchFlow from '@/components/search-flow';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { VideoTeaser } from '@/components/video-teaser';

class SearchFlowErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message || String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 max-w-md text-center">
            <p className="font-semibold mb-1">Something went wrong</p>
            <p className="text-xs opacity-75">{this.state.errorMessage}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="mt-3 rounded bg-red-600 px-3 py-1 text-xs text-white"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mimoThinking, setMimoThinking] = useState(false);
  const [aiHasStarted, setAiHasStarted] = useState(false);

  const handleAiLoadingChange = (loading: boolean) => {
    setMimoThinking(loading);
    if (loading) setAiHasStarted(true);
  };

  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  // Redirect professionals to their dashboard
  useEffect(() => {
    if (profIsLoggedIn && !user) {
      router.replace('/professional-projects');
      return;
    }
  }, [user, profIsLoggedIn, router]);



  return (
      <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Updates button fixed on right for thumb access, same as project list pages */}
        {(isLoggedIn || profIsLoggedIn) && (
          <div className="fixed bottom-[260px] right-6 z-30">
            <UpdatesButton />
          </div>
        )}

{/* AI Prompt + Response Panel */}
        <section
          id="project-prompt"
          className="w-full max-w-6xl mx-auto overflow-hidden opacity-100 translate-y-0"
          style={{ height: 'calc(100vh - 64px - 40px - 40px)' }}
        >
          <div className="mimo-panel relative h-full w-full flex flex-col overflow-hidden py-6 sm:py-8">
            <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8">
              <div className="shrink-0 mb-4 text-center">
                  <h2 className="text-2xl font-bold text-slate-900">
                    <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">I</span>n <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">O</span>ut, Everything in Between.
                  </h2>
                </div>

                {/* 3-col: Sarah | Prompt | Mike */}
                <div className="flex-1 min-h-0 w-full flex items-start gap-2">
                  {/* Sarah — left, hidden below md */}
                  <div className="hidden md:flex items-start justify-end w-[120px] min-w-[120px] basis-[120px] shrink-0 sticky top-4">
                    <Image
                      src="/assets/images/sarah-800_cropped.webp"
                      alt="Sarah"
                      width={120}
                      height={240}
                      className="min-w-[120px] max-h-[240px] h-auto object-contain object-top"
                      priority
                    />
                  </div>

                  {/* Prompt box — center, flexes to fill */}
                  <div className="min-w-0 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
                    <div className={`shrink-0 transition-all duration-500 ease-out ${aiHasStarted ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-44 opacity-100'}`}>
                      <VideoTeaser />
                    </div>
                    <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                      <SearchFlowErrorBoundary>
                        <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={handleAiLoadingChange} />
                      </SearchFlowErrorBoundary>
                    </div>
                  </div>

                  {/* Mike — right, hidden below lg */}
                  <div className="hidden lg:flex items-start justify-start w-[120px] min-w-[120px] basis-[120px] shrink-0 sticky top-4">
                    <Image
                      src="/assets/images/mike-800_cropped.webp"
                      alt="Mike"
                      width={120}
                      height={240}
                      className="min-w-[120px] max-h-[240px] h-auto object-contain object-top"
                      priority
                    />
                  </div>
                </div>
              </div>
          </div>
        </section>

      </div>
  );
}









