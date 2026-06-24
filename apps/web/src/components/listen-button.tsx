'use client';

import { useTextToSpeech } from '@/hooks/use-text-to-speech';

interface ListenButtonProps {
  text: string;
  lang?: string;
  className?: string;
}

export function ListenButton({ text, lang = 'en-HK', className = '' }: ListenButtonProps) {
  const { isSupported, isSpeaking, speak, stop } = useTextToSpeech({ lang });

  if (!isSupported || !text) return null;

  return (
    <button
      type="button"
      onClick={() => (isSpeaking ? stop() : speak(text))}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all ${
        isSpeaking
          ? 'bg-amber-100 text-amber-600 animate-pulse'
          : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
      } ${className}`}
      title={isSpeaking ? 'Stop' : 'Listen'}
      aria-label={isSpeaking ? 'Stop reading' : 'Read aloud'}
    >
      {/* Speaker icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-3 w-3"
      >
        {isSpeaking ? (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </>
        )}
      </svg>
    </button>
  );
}
