'use client';

import { useState, useCallback } from 'react';
import { PhotoDropZone } from '@/components/photo-drop-zone';
import { VoiceInputButton } from '@/components/voice-input-button';

export type IntakeMode = 'photos' | 'words' | null;

interface FlipChoiceProps {
  onIntake: (mode: 'photos' | 'words', data: { text?: string; photos?: File[] }) => void;
  voiceLang?: string;
}

export function FlipChoice({ onIntake, voiceLang = 'en-HK' }: FlipChoiceProps) {
  const [mode, setMode] = useState<IntakeMode>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [isFlipping, setIsFlipping] = useState(false);

  const selectMode = useCallback(
    (selected: 'photos' | 'words') => {
      if (mode === selected) return;
      setIsFlipping(true);
      setTimeout(() => {
        setMode(selected);
        setIsFlipping(false);
      }, 350);
    },
    [mode],
  );

  const handleSubmit = useCallback(() => {
    if (mode === 'words' && text.trim()) {
      onIntake('words', { text: text.trim() });
    } else if (mode === 'photos' && photos.length > 0) {
      onIntake('photos', { photos });
    }
  }, [mode, text, photos, onIntake]);

  const backToChoice = useCallback(() => {
    setIsFlipping(true);
    setTimeout(() => {
      setMode(null);
      setIsFlipping(false);
    }, 350);
  }, []);

  return (
    <div className="w-full" style={{ perspective: '1200px' }}>
      {/* Choice cards — visible when no mode selected */}
      <div
        className={`grid gap-4 transition-all duration-500 ${
          mode ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100 grid-cols-2'
        }`}
      >
        {/* Photos card */}
        <button
          type="button"
          onClick={() => selectMode('photos')}
          className="group relative overflow-hidden rounded-2xl border-2 border-[rgba(120,53,15,0.15)] bg-[rgba(245,238,219,0.85)] p-6 text-left transition-all hover:border-amber-400 hover:shadow-lg hover:scale-[1.02]"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl">
            📸
          </div>
          <h3 className="text-lg font-bold text-stone-800">Show us</h3>
          <p className="mt-1 text-sm text-stone-600">
            Upload photos of your space — our AI will identify rooms, condition, and issues.
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            Tap to start
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Words card */}
        <button
          type="button"
          onClick={() => selectMode('words')}
          className="group relative overflow-hidden rounded-2xl border-2 border-[rgba(120,53,15,0.15)] bg-[rgba(245,238,219,0.85)] p-6 text-left transition-all hover:border-emerald-400 hover:shadow-lg hover:scale-[1.02]"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-2xl">
            📝
          </div>
          <h3 className="text-lg font-bold text-stone-800">Tell us</h3>
          <p className="mt-1 text-sm text-stone-600">
            Describe your project in words — what needs doing, where, and any preferences.
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            Tap to start
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Input panel — flips in when mode selected */}
      <div
        className={`transition-all duration-500 ${
          mode ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'
        } ${isFlipping ? 'scale-95 blur-sm' : 'scale-100 blur-0'}`}
      >
        <div className={`rounded-2xl border-2 p-6 ${
          mode === 'photos'
            ? 'border-amber-300 bg-[rgba(245,238,219,0.9)]'
            : 'border-emerald-300 bg-[rgba(245,238,219,0.9)]'
        }`}>
          {/* Header with back button */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-800">
              {mode === 'photos' ? '📸 Show us your space' : '📝 Tell us about your project'}
            </h2>
            <button
              type="button"
              onClick={backToChoice}
              className="rounded-full border border-[rgba(120,53,15,0.2)] bg-white px-3 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition"
            >
              ← Back
            </button>
          </div>

          {/* Photo mode */}
          {mode === 'photos' && (
            <div className="space-y-4">
              <PhotoDropZone
                onPhotos={setPhotos}
                maxFiles={1}
              />
              <p className="text-xs text-stone-500 text-center">
                Tip: show the whole room — you can add more photos later in the chat.
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={photos.length === 0}
                className="w-full rounded-xl bg-amber-600 py-3 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-40"
              >
                {photos.length === 0 ? 'Add at least one photo' : `Continue with ${photos.length} photo${photos.length > 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {/* Words mode */}
          {mode === 'words' && (
            <div className="space-y-4">
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. I need to renovate my kitchen, about 80 sq ft, replace cabinets and countertops..."
                  rows={4}
                  className="w-full rounded-xl border border-[rgba(120,53,15,0.2)] bg-white px-4 py-3 text-sm text-stone-800 placeholder-stone-400 resize-none focus:border-emerald-400 focus:outline-none"
                  autoFocus
                />
                <div className="absolute bottom-2 right-2">
                  <VoiceInputButton
                    lang={voiceLang as any}
                    onTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!text.trim()}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
              >
                {text.trim() ? 'Continue' : 'Describe your project to continue'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
