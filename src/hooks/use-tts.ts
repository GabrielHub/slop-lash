"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TtsMode, GamePrompt } from "@/lib/types";
import { isMuted, getVolume, getAudioContext } from "@/lib/sounds";

/** Replace madlib blanks with a spoken pause. Mirrors server-side prepareTtsText. */
function prepareTtsText(text: string): string {
  return text.replace(/_+/g, "...");
}

/** Decode a base64 WAV string and play it through the shared Web Audio master gain. */
async function playBase64Audio(
  base64: string,
  audioRef: React.RefObject<AudioBufferSourceNode | null>,
): Promise<void> {
  const { ctx, gain } = getAudioContext();
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);

  // Copy the buffer — decodeAudioData detaches the original ArrayBuffer
  const buffer = await ctx.decodeAudioData(arr.buffer.slice(0) as ArrayBuffer).catch(() => null);
  if (!buffer) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  audioRef.current = source;

  return new Promise<void>((resolve) => {
    source.onended = () => {
      source.disconnect();
      if (audioRef.current === source) audioRef.current = null;
      resolve();
    };
    source.start();
  });
}

interface UseTtsOptions {
  code: string;
  ttsMode: TtsMode;
  prompts: GamePrompt[];
  /** The prompt ID to pre-fetch audio for (typically the current voting prompt). */
  activePromptId?: string;
}

interface UseTtsReturn {
  playPromptTts: (promptId: string) => Promise<void>;
  isPlaying: boolean;
  currentPromptId: string | null;
  stop: () => void;
}

export function useTts({ code, ttsMode, prompts, activePromptId }: UseTtsOptions): UseTtsReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);
  const audioRef = useRef<AudioBufferSourceNode | null>(null);
  const cacheRef = useRef(new Map<string, string>());
  const fetchingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  // Pre-fetch audio for the active prompt only (server generates just-in-time per sub-phase)
  useEffect(() => {
    if (ttsMode !== "AI_VOICE" || !activePromptId) return;
    if (cacheRef.current.has(activePromptId) || fetchingRef.current.has(activePromptId)) return;

    fetchingRef.current.add(activePromptId);
    const promptId = activePromptId;
    fetch(`/api/games/${code}/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptId }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.audio) {
            cacheRef.current.set(promptId, data.audio);
          }
        } else {
          // Mark as failed so we don't retry on every render
          cacheRef.current.set(promptId, "");
        }
      })
      .catch(() => {
        // Mark as failed so we don't retry on every render
        cacheRef.current.set(promptId, "");
      })
      .finally(() => {
        fetchingRef.current.delete(promptId);
      });
  }, [ttsMode, activePromptId, code]);

  function cancelAllPlayback() {
    if (audioRef.current) {
      try {
        audioRef.current.stop();
      } catch {
        // Already stopped
      }
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

          // Chrome bug: after speechSynthesis.cancel(), calling speak()
          // immediately can cause the utterance to repeat. Add a small
          // delay on the first utterance so the engine fully resets.
          const effectiveDelay = index === 1 ? Math.max(delay, 100) : delay;

          setTimeout(() => {
            if (!mountedRef.current || isMuted()) {
              resolve();
              return;
            }
            const utt = new SpeechSynthesisUtterance(text);
            utt.pitch = pitch;
            utt.rate = 1.0;
            utt.volume = getVolume();
            utt.onend = () => speakNext();
            utt.onerror = () => speakNext();
            window.speechSynthesis.speak(utt);
          }, effectiveDelay);
        }

        speakNext();
      });
    },
    [],
  );

  const fetchAiVoice = useCallback(
    async (promptId: string): Promise<string | null> => {
      // Already failed previously — don't retry
      if (cacheRef.current.get(promptId) === "") return null;

      try {
        const res = await fetch(`/api/games/${code}/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptId }),
          signal: AbortSignal.timeout(8_000),
        });

        if (!res.ok) {
          cacheRef.current.set(promptId, "");
          return null;
        }
        const data = await res.json();
        if (!data.audio) {
          cacheRef.current.set(promptId, "");
          return null;
        }

        cacheRef.current.set(promptId, data.audio);
        return data.audio;
      } catch {
        cacheRef.current.set(promptId, "");
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
          const cached = cacheRef.current.get(promptId);
          // Cache states: undefined = not fetched, "" = previously failed, non-empty = audio data
          const audio = cached || (cached === undefined ? await fetchAiVoice(promptId) : null);
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
