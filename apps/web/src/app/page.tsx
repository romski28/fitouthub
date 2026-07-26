'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { VideoTeaser } from '@/components/video-teaser';

// STEP 1: Layout + Suspense + useSearchParams — without SearchFlow
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
  const [inputValue, setInputValue] = useState('');

  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      alert('Form: ' + inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-y-auto overflow-x-hidden" style={{ height: 'calc(100vh - 64px)', WebkitOverflowScrolling: 'touch' }}>
      {/* Test: Button */}
      <div className="text-center mb-4">
        <button onClick={() => setClicks(c => c + 1)} className="rounded-lg bg-coral px-4 py-2 text-white font-bold">
          Clicks: {clicks} | Hydrated: {isLoggedIn !== undefined ? 'YES' : 'NO'} | searchParams: {shouldFocusPrompt ? 'focusPrompt=1' : 'none'}
        </button>
      </div>

      {/* Test: Form */}
      <form onSubmit={handleSubmit} className="flex gap-2 justify-center mb-4">
        <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)}
          placeholder="Type..." className="border px-3 py-1 rounded" />
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">Submit</button>
      </form>

      {/* Test: Link */}
      <div className="text-center mb-4">
        <Link href="/docs" className="text-blue-600 underline">Go to Docs →</Link>
      </div>

      {/* Original layout shell */}
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
                <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex items-center justify-center">
                  <p className="text-slate-400 text-lg">[SearchFlow placeholder — not loaded]</p>
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









