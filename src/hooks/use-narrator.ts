"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import type { GameStatus, GamePlayer } from "@/lib/types";
import { getAudioContext, setNarratorDucking } from "@/lib/sounds";
import { NarratorPlaybackQueue, base64ToPCM, pcm16ToFloat32 } from "@/lib/narrator-audio";
import { buildSystemPrompt, NARRATOR_MODEL } from "@/lib/narrator-events";

function noop() {}

interface UseNarratorOptions {
  code: string;
  playerId: string | null;
  isHost: boolean;
  ttsMode: string;
  gameStatus: GameStatus | undefined;
  players: GamePlayer[];
  totalRounds: number;
}

interface UseNarratorReturn {
  narrate: (text: string) => void;
  isConnected: boolean;
  isSpeaking: boolean;
}

export function useNarrator({
  code,
  playerId,
  isHost,
  ttsMode,
  gameStatus,
  players,
  totalRounds,
}: UseNarratorOptions): UseNarratorReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const queueRef = useRef<NarratorPlaybackQueue | null>(null);
  const resumeHandleRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);
  const connectedOnceRef = useRef(false);
  const gameEndedRef = useRef(false);
  const playersSnapshotRef = useRef(players);
  const totalRoundsSnapshotRef = useRef(totalRounds);

  const handleActiveChange = useCallback((active: boolean) => {
    setNarratorDucking(active);
    setIsSpeaking(active);
  }, []);

  // Connect once when game transitions away from LOBBY (host only, ttsMode ON)
  useEffect(() => {
    if (!isHost || ttsMode !== "ON" || !playerId) return;
    if (!gameStatus || gameStatus === "LOBBY" || gameStatus === "FINAL_RESULTS") return;
    if (connectedOnceRef.current) return;
    if (connectingRef.current || sessionRef.current) return;

    connectedOnceRef.current = true;
    connectingRef.current = true;
    gameEndedRef.current = false;
    playersSnapshotRef.current = players;
    totalRoundsSnapshotRef.current = totalRounds;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRetry(delayMs = 1500) {
      if (cancelled || gameEndedRef.current || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (cancelled || gameEndedRef.current || sessionRef.current || connectingRef.current) return;
        connectingRef.current = true;
        void connect();
      }, delayMs);
    }

    async function connect(handle?: string) {
      try {
        const res = await fetch(`/api/games/${code}/narrator`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        });
        if (!res.ok) {
          resumeHandleRef.current = null;
          connectedOnceRef.current = false;
          const errorText = await res.text().catch(() => "");
          console.warn("[narrator] token request failed:", res.status, errorText);
          connectingRef.current = false;
          if (res.status >= 500 || res.status === 429) {
            scheduleRetry();
          }
          return;
        }
        if (cancelled) {
          connectingRef.current = false;
          return;
        }
        const { token, voiceName } = await res.json();
        if (!token || !voiceName) {
          console.warn("[narrator] token response missing fields");
          connectingRef.current = false;
          connectedOnceRef.current = false;
          scheduleRetry();
          return;
        }

        getAudioContext();

        const ai = new GoogleGenAI({ apiKey: token, apiVersion: "v1alpha" });
        const systemInstruction = buildSystemPrompt(
          playersSnapshotRef.current,
          totalRoundsSnapshotRef.current,
        );

        queueRef.current?.destroy();
        const queue = new NarratorPlaybackQueue(handleActiveChange);
        queueRef.current = queue;

        const session = await ai.live.connect({
          model: NARRATOR_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            realtimeInputConfig: {
              automaticActivityDetection: { disabled: true },
            },
            thinkingConfig: { thinkingBudget: 0 },
            ...(handle
              ? { sessionResumption: { handle } }
              : { sessionResumption: {} }),
          },
          callbacks: {
            onmessage(msg: LiveServerMessage) {
              if (msg.sessionResumptionUpdate?.newHandle) {
                resumeHandleRef.current = msg.sessionResumptionUpdate.newHandle;
              }

              const parts = msg.serverContent?.modelTurn?.parts ?? [];
              for (const part of parts) {
                const data = part.inlineData?.data;
                if (!data) continue;
                const float32 = pcm16ToFloat32(base64ToPCM(data));
                queue.enqueue(float32);
              }
            },
            onclose() {
              if (!mountedRef.current) return;
              setIsConnected(false);
              sessionRef.current = null;
              connectingRef.current = false;
              queueRef.current?.destroy();
              queueRef.current = null;
              setNarratorDucking(false);

              if (resumeHandleRef.current && !gameEndedRef.current) {
                const handle = resumeHandleRef.current;
                setTimeout(() => {
                  if (mountedRef.current && !sessionRef.current && !gameEndedRef.current) {
                    void connect(handle);
                  }
                }, 500);
              }
            },
            onerror(err: unknown) {
              console.warn("[narrator] session error:", err);
            },
          },
        });

        if (cancelled) {
          session.close();
          connectingRef.current = false;
          return;
        }

        sessionRef.current = session;
        connectingRef.current = false;
        if (mountedRef.current) setIsConnected(true);
      } catch (err) {
        console.warn("[narrator] connect failed:", err);
        connectingRef.current = false;
        connectedOnceRef.current = false;
        scheduleRetry();
      }
    }

    void connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus, isHost, ttsMode, playerId, code]);

  // Disconnect after a brief delay when game reaches FINAL_RESULTS
  useEffect(() => {
    if (gameStatus !== "FINAL_RESULTS") return;
    gameEndedRef.current = true;
    const timer = setTimeout(() => {
      sessionRef.current?.close();
      sessionRef.current = null;
      connectingRef.current = false;
      if (mountedRef.current) setIsConnected(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [gameStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.close();
      sessionRef.current = null;
      queueRef.current?.destroy();
      queueRef.current = null;
      setNarratorDucking(false);
    };
  }, []);

  const narrate = useCallback((xml: string) => {
    if (!sessionRef.current || !xml) return;
    queueRef.current?.clear();
    sessionRef.current.sendClientContent({
      turns: [{ role: "user", parts: [{ text: xml }] }],
      turnComplete: true,
    });
  }, []);

  const disabled = ttsMode !== "ON" || !isHost;

  return {
    narrate: disabled ? noop : narrate,
    isConnected: disabled ? false : isConnected,
    isSpeaking: disabled ? false : isSpeaking,
  };
}
