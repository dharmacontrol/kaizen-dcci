"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff } from "lucide-react";

/* ============================================================================
 * Minimal typing for the Web Speech API. Not part of TypeScript's DOM lib, so
 * we declare just enough of the shape this component actually uses rather
 * than pulling in a third-party ambient-types package.
 * ========================================================================== */

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Feature support never changes while the page is open, so there's nothing to
// subscribe to — only the (server vs. client) snapshot differs. Modeled on
// `usePrefersReducedMotion` in SuggestionWizard.tsx: `useSyncExternalStore`
// lets the client snapshot (support detected) win after mount without ever
// calling `setState` inside an effect.
function subscribeNever() {
  return () => {};
}

function getSupportSnapshot(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

function getServerSupportSnapshot(): boolean {
  return false;
}

function useSpeechRecognitionSupported(): boolean {
  return useSyncExternalStore(subscribeNever, getSupportSnapshot, getServerSupportSnapshot);
}

export type VoiceInputButtonProps = {
  /** Called with the recognized (final) transcript each time recognition produces one. */
  onResult: (text: string) => void;
  disabled?: boolean;
};

/**
 * Small mic-icon button that feature-detects the Web Speech API and renders
 * nothing at all when it's unavailable (rather than a disabled button) —
 * callers position it inline and don't need to special-case its absence.
 */
export default function VoiceInputButton({ onResult, disabled }: VoiceInputButtonProps) {
  const supported = useSpeechRecognitionSupported();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Stop any in-flight recognition if the button unmounts mid-session.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "id-ID";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal && result[0]) {
          onResult(result[0].transcript);
        }
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onResult]);

  const handleClick = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Berhenti merekam suara" : "Isi dengan suara"}
      title={listening ? "Berhenti merekam suara" : "Isi dengan suara"}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        listening
          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-primary"
      }`}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
