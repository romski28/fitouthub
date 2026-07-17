'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import SearchFlow from '@/components/search-flow';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { VideoTeaser } from '@/components/video-teaser';

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mimoThinking, setMimoThinking] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  
  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  // Redirect professionals to their dashboard
  useEffect(() => {
    if (profIsLoggedIn && !user) {
      router.replace('/professional-projects');
      return;
    }
  }, [user, profIsLoggedIn, router]);



  return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-5 py-5 sm:px-8 sm:py-8">
        {/* Updates button fixed on right for thumb access, same as project list pages */}
        {(isLoggedIn || profIsLoggedIn) && (
          <div className="fixed bottom-[260px] right-6 z-30">
            <UpdatesButton />
          </div>
        )}

{/* AI Prompt + Response Panel */}
        <section
          id="project-prompt"
          className={`w-full max-w-6xl transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}
          style={{ maxHeight: 'calc(100vh - 128px)' }}
        >
          <div className="mimo-panel relative h-full flex flex-col overflow-hidden py-6 sm:py-8">
            <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8">
              <div className="shrink-0 mb-4 text-center">
                  <h2 className="text-2xl font-bold text-slate-900">
                    <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">I</span>n <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">O</span>ut, Everything in Between.
                  </h2>
                </div>

                {/* 3-col: Sarah | Prompt | Mike */}
                <div className="flex-1 min-h-0 flex items-start gap-2">
                  {/* Sarah — left, hidden below md */}
                  <div className="hidden md:flex items-start justify-end w-[120px] shrink-0 sticky top-4">
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
                  <div className="min-w-0 flex-1 min-h-0 flex flex-col">
                    <div className="shrink-0">
                      <VideoTeaser />
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={setMimoThinking} />
                    </div>
                  </div>

                  {/* Mike — right, hidden below lg */}
                  <div className="hidden lg:flex items-start justify-start w-[120px] shrink-0 sticky top-4">
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









