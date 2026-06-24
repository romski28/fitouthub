'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceLang = 'yue-Hant-HK' | 'zh-CN' | 'en-HK';

export const VOICE_LANGUAGES: { code: VoiceLang; label: string; short: string }[] = [
  { code: 'yue-Hant-HK', label: '粵語', short: '粵' },
  { code: 'zh-CN', label: '简体', short: '简' },
  { code: 'en-HK', label: 'English', short: 'EN' },
];

interface UseVoiceInputOptions {
  lang?: VoiceLang;
  onResult: (transcript: string) => void;
  onInterim?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  lang: VoiceLang;
  setLang: (lang: VoiceLang) => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  cycleLang: () => void;
}

export function useVoiceInput({
  lang: initialLang = 'yue-Hant-HK',
  onResult,
  onInterim,
  onError,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [lang, setLangState] = useState<VoiceLang>(initialLang);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.('Speech recognition not supported in this browser.');
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    finalTranscriptRef.current = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      finalTranscriptRef.current = final;
      const display = final + interim;
      onInterim?.(display);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'aborted') return;
      onError?.(event.error || 'Speech recognition error');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Submit final transcript
      if (finalTranscriptRef.current.trim()) {
        onResult(finalTranscriptRef.current.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, lang, onResult, onInterim, onError]);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  const setLang = useCallback((newLang: VoiceLang) => {
    if (isListening) stop();
    setLangState(newLang);
  }, [isListening, stop]);

  const cycleLang = useCallback(() => {
    const idx = VOICE_LANGUAGES.findIndex(l => l.code === lang);
    const next = VOICE_LANGUAGES[(idx + 1) % VOICE_LANGUAGES.length];
    setLang(next.code);
  }, [lang, setLang]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isSupported, isListening, lang, setLang, start, stop, toggle, cycleLang };
}
