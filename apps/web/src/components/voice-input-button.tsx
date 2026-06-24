'use client';

import { useVoiceInput, VOICE_LANGUAGES, type VoiceLang } from '@/hooks/use-voice-input';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  defaultLang?: VoiceLang;
  className?: string;
}

export function VoiceInputButton({
  onTranscript,
  onInterim,
  defaultLang = 'yue-Hant-HK',
  className = '',
}: VoiceInputButtonProps) {
  const { isSupported, isListening, lang, start, stop, cycleLang } = useVoiceInput({
    lang: defaultLang,
    onResult: onTranscript,
    onInterim,
  });

  if (!isSupported) return null;

  const currentLang = VOICE_LANGUAGES.find(l => l.code === lang);

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {/* Lang toggle */}
      <button
        type="button"
        onClick={cycleLang}
        className="rounded-md border border-slate-300 px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 transition"
        title={`Switch language (current: ${currentLang?.label})`}
      >
        {currentLang?.short || '粵'}
      </button>

      {/* Mic button */}
      <button
        type="button"
        onClick={isListening ? stop : start}
        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
          isListening
            ? 'border-red-400 bg-red-50 text-red-600 animate-pulse'
            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
        }`}
        title={isListening ? 'Stop recording' : 'Start voice input'}
        aria-label={isListening ? 'Stop recording' : 'Start voice input'}
      >
        {/* Mic icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
        </svg>

        {/* Recording indicator dot */}
        {isListening && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
        )}
      </button>
    </div>
  );
}
