'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTextToSpeechOptions {
  lang?: string;
  rate?: number;
}

interface UseTextToSpeechReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
  voiceLabel: string;
}

const FEMALE_KEYWORDS = [
  'female', 'woman', 'girl',
  'sin-ji', 'sinji',
  'ting-ting',
  'google uk english female',
  'microsoft ka yan',
  'zira',
];

function pickFemaleVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const isFemale = (v: SpeechSynthesisVoice) =>
    FEMALE_KEYWORDS.some((k) => v.name.toLowerCase().includes(k));

  const langPrefix = lang.split('-')[0].toLowerCase();

  // Exact lang + female
  let match = voices.find((v) => v.lang === lang && isFemale(v));
  if (match) return match;

  // Lang family + female
  match = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix) && isFemale(v));
  if (match) return match;

  // Any female
  match = voices.find(isFemale);
  if (match) return match;

  // Fallback
  return voices[0] || null;
}

export function useTextToSpeech({
  lang = 'en-HK',
  rate = 0.95,
}: UseTextToSpeechOptions = {}): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState('');
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!isSupported) return;

    const select = () => {
      const voice = pickFemaleVoice(lang);
      voiceRef.current = voice;
      setVoiceLabel(voice ? `${voice.name} (${voice.lang})` : 'default');
    };

    select();
    window.speechSynthesis.onvoiceschanged = select;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported, lang]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text) return;

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      if (voiceRef.current) utterance.voice = voiceRef.current;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, lang, rate],
  );

  return { isSupported, isSpeaking, speak, stop, voiceLabel };
}
