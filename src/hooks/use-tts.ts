"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TtsMode, GamePrompt } from "@/lib/types";
import { isMuted } from "@/lib/sounds";

/** Replace madlib blanks with a spoken pause. Mirrors server-side prepareTtsText. */
function prepareTtsText(text: string): string {
  return text.replace(/_+/g, "...");
}

/** Decode a base64 WAV string and play it via the Web Audio API. */
function playBase64Audio(
  base64: string,
  audioRef: React.RefObject<HTMLAudioElement | null>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audioRef.current = audio;

    function cleanup() {
      URL.revokeObjectURL(url);
      resolve();
    }

    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.play().catch(cleanup);
  });
}

interface UseTtsOptions {
  code: string;
  ttsMode: TtsMode;
  prompts: GamePrompt[];
}

interface UseTtsReturn {
  playPromptTts: (promptId: string) => Promise<void>;
  isPlaying: boolean;
  currentPromptId: string | null;
  stop: () => void;
}

export function useTts({ code, ttsMode, prompts }: UseTtsOptions): UseTtsReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef(new Map<string, string>());
  const fetchingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  // Pre-fetch audio for all prompts in AI_VOICE mode
  useEffect(() => {
    if (ttsMode !== "AI_VOICE" || prompts.length === 0) return;

    const toFetch = prompts.filter(
      (p) => !cacheRef.current.has(p.id) && !fetchingRef.current.has(p.id),
    );

    for (const prompt of toFetch) {
      fetchingRef.current.add(prompt.id);
      fetch(`/api/games/${code}/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: prompt.id }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.audio) {
              cacheRef.current.set(prompt.id, data.audio);
            }
          }
        })
        .catch(() => {
          // Silently fail — browser voice fallback will handle it
        })
        .finally(() => {
          fetchingRef.current.delete(prompt.id);
        });
    }
  }, [ttsMode, prompts, code]);

  function cancelAllPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAllPlayback();
    };
  }, []);

  const stop = useCallback(() => {
    cancelAllPlayback();
    setIsPlaying(false);
    setCurrentPromptId(null);
  }, []);

  const playBrowserVoice = useCallback(
    (prompt: GamePrompt): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (!window.speechSynthesis) {
          resolve();
          return;
        }

        const [respA, respB] = prompt.responses;
        if (!respA || !respB) {
          resolve();
          return;
        }

        const promptText = prepareTtsText(prompt.text);
        const textA = prepareTtsText(respA.text);
        const textB = prepareTtsText(respB.text);

        const utterances: { text: string; pitch: number; delay: number }[] = [
          { text: promptText, pitch: 0.9, delay: 0 },
          { text: textA, pitch: 1.0, delay: 500 },
          { text: textB, pitch: 1.1, delay: 400 },
        ];

        let index = 0;

        function speakNext() {
          if (!mountedRef.current || index >= utterances.length) {
            resolve();
            return;
          }

          const { text, pitch, delay } = utterances[index];
          index++;

          setTimeout(() => {
            if (!mountedRef.current) {
              resolve();
              return;
            }
            const utt = new SpeechSynthesisUtterance(text);
            utt.pitch = pitch;
            utt.rate = 1.0;
            utt.onend = () => speakNext();
            utt.onerror = () => speakNext();
            window.speechSynthesis.speak(utt);
          }, delay);
        }

        speakNext();
      });
    },
    [],
  );

  const fetchAiVoice = useCallback(
    async (promptId: string): Promise<string | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);

      try {
        const res = await fetch(`/api/games/${code}/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptId }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) return null;
        const data = await res.json();
        if (!data.audio) return null;

        cacheRef.current.set(promptId, data.audio);
        return data.audio;
      } catch {
        clearTimeout(timer);
        return null;
      }
    },
    [code],
  );

  const playPromptTts = useCallback(
    async (promptId: string) => {
      if (ttsMode === "OFF" || isMuted()) return;

      stop();

      const prompt = prompts.find((p) => p.id === promptId);
      if (!prompt || prompt.responses.length < 2) return;

      setIsPlaying(true);
      setCurrentPromptId(promptId);

      try {
        if (ttsMode === "AI_VOICE") {
          const audio = cacheRef.current.get(promptId) ?? await fetchAiVoice(promptId);
          if (audio) {
            await playBase64Audio(audio, audioRef);
          } else {
            await playBrowserVoice(prompt);
          }
        } else if (ttsMode === "BROWSER_VOICE") {
          await playBrowserVoice(prompt);
        }
      } finally {
        if (mountedRef.current) {
          setIsPlaying(false);
          setCurrentPromptId(null);
        }
      }
    },
    [ttsMode, prompts, stop, playBrowserVoice, fetchAiVoice],
  );

  return { playPromptTts, isPlaying, currentPromptId, stop };
}
