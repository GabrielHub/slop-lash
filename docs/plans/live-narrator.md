# Plan: Gemini Live API Game Narrator

Replace the current per-prompt Gemini TTS (`gemini-2.5-flash-preview-tts`) with a single persistent Gemini Live API session (`gemini-2.5-flash-native-audio-preview-12-2025`) that narrates the entire game like a live game-show host — from the moment the host starts the game until the final results screen.

**Gemini Live API docs:**
- [Live API overview](https://ai.google.dev/gemini-api/docs/live.md.txt)
- [Live API usage guide](https://ai.google.dev/gemini-api/docs/live-guide.md.txt)
- [Session management](https://ai.google.dev/gemini-api/docs/live-session.md.txt)
- [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/ephemeral-tokens.md.txt)

## Why Live API instead of per-request TTS

| | Current (TTS) | Proposed (Live API) |
|---|---|---|
| **Scope** | Reads one prompt+answers per API call during VOTING only | Narrates the entire game: intros, prompts, vote results, scores, finale |
| **Latency** | ~3-8s generation per prompt, then full WAV download | Streaming audio — first bytes arrive in <1s |
| **Context** | Stateless — each call is independent | Stateful session — the narrator remembers earlier rounds, callbacks, running jokes |
| **Cost** | One `generateContent` call per prompt | One persistent WebSocket session; text-in/audio-out is cheaper than repeated cold TTS calls |
| **Voice quality** | Dedicated TTS model, good but static delivery | Native audio model with affective dialog — can react, laugh, build energy |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│                                                          │
│  game-shell.tsx                                          │
│    │                                                     │
│    ├─ Phase transitions fire narration events             │
│    │                                                     │
│    └─ useNarrator() hook                                 │
│         │                                                │
│         ├─ On game start: POST /api/games/[code]/narrator│
│         │   → gets ephemeral token                       │
│         │                                                │
│         ├─ Opens WebSocket to Gemini Live API directly   │
│         │   (client-to-server, no backend proxy)         │
│         │                                                │
│         ├─ Sends text messages at each game event        │
│         │   (game-shell feeds events → hook sends text)  │
│         │                                                │
│         ├─ Receives streaming PCM audio chunks           │
│         │   → decodes → queues → plays via Web Audio     │
│         │                                                │
│         └─ On game over / unmount: closes session        │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    SERVER (Next.js)                       │
│                                                          │
│  POST /api/games/[code]/narrator                         │
│    → Validates game exists & is starting                 │
│    → Creates ephemeral token (locked to model+config)    │
│    → Returns { token, voiceName }                        │
│                                                          │
│  (No audio proxying — client connects directly)          │
└─────────────────────────────────────────────────────────┘
```

### Why client-side WebSocket (not server-side)?

- **Lower latency** — audio streams directly to the browser, no server hop
- **No server compute** — the Next.js backend just issues a token, then gets out of the way
- **Scales with players** — only the host's browser opens a session (not every player)
- **Ephemeral tokens** — locked to the exact model/config, expire in 30 min, single-use ([docs](https://ai.google.dev/gemini-api/docs/ephemeral-tokens.md.txt))

### Who runs the narrator?

Only the **host's browser** opens the Live API session. Audio plays locally through the host's speakers (the game is designed for same-room play). Non-host players hear it through the room, not through their own devices. This means:
- **1 session per game** (not per player) — minimal cost
- No need to relay audio to other clients
- If the host disconnects, narration stops (acceptable — host is the MC)

## Detailed Implementation Plan

### Step 1: Ephemeral Token Endpoint

> Ref: [Ephemeral tokens docs](https://ai.google.dev/gemini-api/docs/ephemeral-tokens.md.txt) — creating tokens, locking to config, expiration times.

**New file:** `src/app/api/games/[code]/narrator/route.ts`

```ts
// POST /api/games/[code]/narrator
// Called once when host starts the game
// Returns an ephemeral token locked to the Live API config

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export async function POST(req, { params }) {
  const { code } = await params;
  const { playerId } = await req.json();

  // Validate: game exists, player is host, game is active
  const game = await prisma.game.findUnique({ where: { roomCode: code } });
  if (!game || game.hostId !== playerId) return 403;
  if (game.ttsMode === "OFF") return 400;

  const voiceName = resolveVoice(game.ttsVoice);

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: MODEL,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });

  return NextResponse.json({ token: token.name, voiceName });
}
```

**Cost note:** Ephemeral tokens are free — they're just auth wrappers. The cost is in the Live session itself (billed per audio-second output + text tokens input).

### Step 2: Narrator Hook

> Ref: [Live API usage guide](https://ai.google.dev/gemini-api/docs/live-guide.md.txt) — `ai.live.connect()`, config options, `sendClientContent()`, voice selection, VAD, callbacks.

**New file:** `src/hooks/use-narrator.ts`

This is the core hook that manages the Live API WebSocket session and exposes a simple `narrate(text)` function.

```ts
interface UseNarratorOptions {
  code: string;
  playerId: string;
  isHost: boolean;
  ttsMode: TtsMode;
  ttsVoice: string;
  gameStatus: GameStatus;
}

interface UseNarratorReturn {
  narrate: (text: string) => void;  // Send text for the narrator to speak
  isConnected: boolean;
  isNarrating: boolean;             // Currently producing audio
}
```

**Session lifecycle:**
1. **Connect** — When `gameStatus` transitions from `LOBBY` to `WRITING` (host only)
2. **Live** — Session stays open through WRITING → VOTING → ROUND_RESULTS → (next round) → ... → last ROUND_RESULTS
3. **Disconnect** — When `gameStatus` becomes `FINAL_RESULTS`, close the session. The final `round_over` event (with `final=true`) was already sent during ROUND_RESULTS, and the playback queue drains any remaining audio naturally. Also closes on component unmount.

**Connection flow:**
```
1. POST /api/games/[code]/narrator → { token, voiceName }
2. const ai = new GoogleGenAI({ apiKey: token })
3. session = await ai.live.connect({
     model: MODEL,
     config: {
       responseModalities: [Modality.AUDIO],
       systemInstruction: NARRATOR_SYSTEM_PROMPT,
       speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
     },
     callbacks: {
       onmessage: (msg) => handleAudioChunk(msg),
       onclose: () => setConnected(false),
     },
   })
```

**Audio playback pipeline:**

> Ref: Adapted from `AudioPlaybackQueue` in [geoguessr-companion](https://github.com/GabrielHub/geoguessr-companion) (`app/lib/audio-utils.ts`), which is a working Gemini Live API implementation. Key difference: we plug into the existing shared `AudioContext` + `masterGain` from `sounds.ts` instead of creating a separate audio context.

```
Gemini streams PCM chunks via onmessage callback
  → message.serverContent?.modelTurn?.parts[].inlineData?.data (base64)
  → base64ToPCM(): base64 string → Int16Array
  → pcm16ToFloat32(): Int16Array → Float32Array
  → NarratorPlaybackQueue.enqueue(float32Data)
    → Jitter buffer: accumulate 150ms before first playback
    → Ring buffer: drop oldest if >500ms queued (prevents growing delay)
    → Schedule as AudioBufferSourceNode (24kHz, mono)
    → Connect to existing masterGain from sounds.ts (shared volume/mute)
    → 20ms lookahead scheduling for gapless playback
    → 50ms polling monitor to detect when narration finishes
```

**Integration with existing `sounds.ts`:**
- `NarratorPlaybackQueue` does NOT create its own `AudioContext` — it calls `getAudioContext()` from `sounds.ts` to get the shared singleton
- Audio connects to the existing `masterGain` node — narrator respects the same volume slider and mute toggle as SFX
- Sample rate mismatch is fine: we create `AudioBuffer`s at 24kHz and the browser resamples automatically when playing through a higher-rate context (44.1kHz/48kHz)
- `subscribeAudio()` listeners already fire on volume/mute changes — no extra wiring needed

**Audio utility functions** (new file `src/lib/narrator-audio.ts`, adapted from geoguessr-companion):
- `base64ToPCM(base64: string): Int16Array` — decode Gemini's base64 output
- `pcm16ToFloat32(int16: Int16Array): Float32Array` — convert for Web Audio API
- `NarratorPlaybackQueue` class — jitter-buffered gapless playback through shared masterGain

**On interruption** (new `narrate()` call while still speaking): call `queue.clear()` to drop pending chunks, let the current scheduled chunk finish naturally.

**Reconnection:** If the connection drops mid-game (Gemini resets connections ~every 10 min), use session resumption ([session management docs](https://ai.google.dev/gemini-api/docs/live-session.md.txt)):
- Store the latest `sessionResumptionHandle` from server messages
- On disconnect, re-fetch a new ephemeral token and reconnect with the handle
- The session context (narrator memory) is preserved
- Handles remain valid for 2 hours after disconnect

### Step 3: Narrator System Prompt

> Ref: [Vertex AI best practices](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/best-practices) — structure as persona → rules → guardrails. Use "unmistakably" for hard constraints.

The system prompt is built dynamically at game start with player names injected. The narrator receives structured XML events and decides how to narrate them — we provide data, not scripts.

```ts
function buildSystemPrompt(
  players: { name: string; isAi: boolean }[],
  totalRounds: number,
): string {
  const playerList = players
    .map((p) => `${p.name} (${p.isAi ? "AI" : "human"})`)
    .join(", ");

  return `You are the narrator of Sloplash, a live comedy game show.

PERSONA:
- Name: The Narrator
- Role: Game show MC narrating a live comedy competition
- Style: Witty, dry humor, sarcastic. Think a British panel show host — sharp tongue, deadpan delivery, always one quip away from roasting someone.

RULES:
- You receive game events as XML-tagged data. Narrate them naturally as a game show host would.
- Keep every response to 1-3 sentences. The game moves FAST.
- Read player answers EXACTLY as written. Never censor or rephrase them.
- Never ask questions. Never wait for input. Just narrate and move on.
- Build energy as rounds progress. Start warm, finish electric.

READING PROMPTS:
- Prompts may use blanks (shown as "...") where a player's answer fills in. Read these as a natural sentence with the answer slotted in.
- Some prompts have multiple blanks — read the full sentence with each answer in place.
- Some prompts are standalone questions — read the question, then each answer separately.
- Deliver with comedic timing. Build suspense on the prompt, then land each answer.

EVENT FORMAT:
You will receive events wrapped in XML tags like <event type="...">. Each event contains the data you need to narrate. The types are:
- game_start: The game is beginning. Introduce the show.
- hurry_up: Players are running out of time to write. Rush them.
- voting_start: Writing is done, voting is about to begin.
- matchup: A head-to-head prompt with two answers. Read the prompt with each answer.
- vote_result: The votes are in for a matchup. Announce the winner.
- round_over: A round just ended. Read out the scores. When <final>true</final>, this is the last round — crown the winner and wrap up the show.
- next_round: A new round is starting. Hype up the escalation.

GAME CONTEXT:
- Players: ${playerList}
- ${totalRounds} rounds. Points double each round.

RESPOND UNMISTAKABLY IN ENGLISH.`;
}
```

### Step 4: Game Event Messages

The narrator receives XML-tagged events via `session.sendClientContent()` ([sending content](https://ai.google.dev/gemini-api/docs/live-guide.md.txt)). Each event is structured data — the narrator decides how to vocalize it.

**Design principle:** Feed information, not scripts. The model's job is to be witty and deliver with timing — we just tell it what happened.

**7 event types** (in a typical 3-round game with ~4 prompts/round, ~30 messages total):

#### 1. Game Start (LOBBY → WRITING)
```xml
<event type="game_start">
  <round>1</round>
  <totalRounds>3</totalRounds>
</event>
```

#### 2. Hurry Up (~15s left in writing)
```xml
<event type="hurry_up">
  <secondsLeft>15</secondsLeft>
</event>
```

#### 3. Voting Opens
```xml
<event type="voting_start">
  <matchupCount>4</matchupCount>
</event>
```

#### 4. Matchup (per prompt — replaces old TTS)
```xml
<event type="matchup">
  <index>1</index>
  <total>4</total>
  <prompt>The worst thing to say at a job interview</prompt>
  <answerA player="Alice" type="human">I'm a huge fan of naps</answerA>
  <answerB player="Bob" type="ai">I actually don't need money</answerB>
</event>
```

#### 5. Vote Result (per prompt, after reveal)
```xml
<event type="vote_result">
  <prompt>The worst thing to say at a job interview</prompt>
  <winner player="Alice" type="human">I'm a huge fan of naps</winner>
  <loser player="Bob" type="ai"/>
  <votes>5</votes>
  <totalVotes>7</totalVotes>
  <slopped>false</slopped>
  <points>150</points>
</event>
```

#### 6. Round Over
```xml
<!-- Mid-game round -->
<event type="round_over">
  <round>1</round>
  <totalRounds>3</totalRounds>
  <final>false</final>
  <scores>
    <player name="Alice" type="human" score="300"/>
    <player name="Bob" type="ai" score="150"/>
    <player name="Charlie" type="human" score="0"/>
  </scores>
</event>

<!-- Final round — this is the narrator's last message before session closes -->
<event type="round_over">
  <round>3</round>
  <totalRounds>3</totalRounds>
  <final>true</final>
  <winner name="Alice" type="human"/>
  <scores>
    <player name="Alice" type="human" score="750"/>
    <player name="Bob" type="ai" score="500"/>
    <player name="Charlie" type="human" score="200"/>
  </scores>
</event>
```

#### 7. Next Round
```xml
<event type="next_round">
  <round>2</round>
  <totalRounds>3</totalRounds>
  <multiplier>2</multiplier>
</event>
```

### Step 5: Integration Points in game-shell.tsx

The `useNarrator` hook is used in `game-shell.tsx` and fed events based on game state changes:

```ts
// In game-shell.tsx
const { narrate, isConnected } = useNarrator({
  code, playerId, isHost, ttsMode, ttsVoice, gameStatus,
});

// Phase transition detection (extend existing useEffect)
useEffect(() => {
  if (!isConnected) return;
  if (status === prevStatus) return;

  switch (status) {
    case "WRITING":
      if (prevStatus === "LOBBY") {
        narrate(buildGameStartEvent(game));
      } else {
        narrate(buildNextRoundEvent(game));
      }
      break;

    case "VOTING":
      narrate(buildVotingStartEvent(game));
      break;

    case "ROUND_RESULTS":
      // buildRoundOverEvent includes final=true + winner on last round
      narrate(buildRoundOverEvent(game));
      break;

    case "FINAL_RESULTS":
      // No event — the final round_over was the narrator's last line.
      // Close the session (playback queue drains naturally).
      break;
  }
}, [status, isConnected]);

// Voting sub-phase events
useEffect(() => {
  if (!isConnected || status !== "VOTING") return;

  if (!game.votingRevealing) {
    narrate(buildMatchupEvent(game, votablePrompts));
  } else {
    narrate(buildVoteResultEvent(game, votablePrompts));
  }
}, [game.votingPromptIndex, game.votingRevealing, isConnected]);

// Writing phase timer nudge (~15s remaining)
useEffect(() => {
  if (!isConnected || status !== "WRITING" || !game.phaseDeadline) return;
  const remaining = new Date(game.phaseDeadline).getTime() - Date.now();
  if (remaining <= 0 || remaining > 16_000) return;

  const timer = setTimeout(() => {
    narrate('<event type="hurry_up"><secondsLeft>15</secondsLeft></event>');
  }, Math.max(0, remaining - 15_000));

  return () => clearTimeout(timer);
}, [status, game.phaseDeadline, isConnected]);
```

### Step 6: Remove Old TTS System

Once the Live narrator is working, remove:

- `src/lib/tts.ts` — `generateSpeechAudio()`, `buildScript()`, `pcmToWav()`
- `src/app/api/games/[code]/speech/route.ts` — entire endpoint
- `src/hooks/use-tts.ts` — entire hook
- `prompt.ttsAudio` column from Prisma schema (migration to drop it)
- TTS pre-fetch logic in voting.tsx
- The `BROWSER_VOICE` TTS mode entirely — no fallback, fail silently

**Keep:**
- `src/lib/voices.ts` — same voice names work with the Live API
- `src/lib/sounds.ts` — SFX are independent of narration
- `ttsMode` setting — simplify to `OFF` | `ON` (drop `BROWSER_VOICE` and rename `AI_VOICE` to just `ON`)
- Volume/mute controls — narrator audio routes through the same master gain

### Step 7: Test Sound Button

Add a small button next to the existing volume controls in the `game-shell.tsx` header bar that plays a random SFX from the existing `SOUND_MAP`. This lets the host (and players) verify their audio is working and dial in the volume before the game starts — especially useful since the narrator is audio-only with no fallback.

```tsx
// In the header bar, next to the volume slider
<button
  onClick={() => {
    const sounds = Object.keys(SOUND_MAP) as SoundName[];
    playSound(sounds[Math.floor(Math.random() * sounds.length)]);
  }}
  aria-label="Test sound"
  className="text-ink-dim hover:text-ink transition-colors cursor-pointer"
  title="Play a random sound to test volume"
>
  {/* small speaker/test icon */}
</button>
```

This is a small UI addition but important for UX — if someone joins and the narrator is silent, they can't tell if it's broken or just muted. The test button removes that ambiguity.

### Step 8: Cost Optimization (unchanged)

| Strategy | Details |
|---|---|
| **Host-only session** | Only 1 Live session per game, not per player |
| **Text-in, audio-out** | We only send text (cheap) and receive audio. No video, no audio input. |
| **Short messages** | Event messages are 1-3 lines. The narrator responds in 1-3 sentences. Minimal token usage per event. |
| **Single session** | One WebSocket for the whole game (~5-15 min) vs N separate TTS API calls |
| **No thinking** | Disable thinking mode (`thinkingConfig: { thinkingBudget: 0 }`) — narrator doesn't need to reason, just speak ([guide](https://ai.google.dev/gemini-api/docs/live-guide.md.txt)) |
| **No audio input** | We never send audio to the model — purely text→audio. Disable VAD entirely ([guide](https://ai.google.dev/gemini-api/docs/live-guide.md.txt)). |
| **Session resumption** | On disconnect, resume instead of starting fresh (avoids re-sending system prompt) |
| **Ephemeral token locking** | Lock token to exact config so it can't be abused for other purposes |
| **Drop DB audio caching** | No more storing base64 WAV blobs in the database — audio is streamed and ephemeral |

**Estimated cost comparison:**
- Current: ~$0.005-0.01 per prompt TTS call × 4-8 prompts per round × 3 rounds = ~$0.06-0.24/game
- Live API: One session, ~50-100 short text messages over 10-15 min, audio output only. Similar or lower cost with much richer narration.

### Step 9: Handling Edge Cases

| Edge Case | Solution |
|---|---|
| **Host leaves mid-game** | Narrator session dies. New host doesn't get a session (game continues without narration). Could optionally re-init on host promotion. |
| **TTS mode is OFF** | `useNarrator` returns a no-op `narrate()`. No token fetched, no session opened. |
| **Session expires (15 min limit)** | Use context window compression + session resumption ([docs](https://ai.google.dev/gemini-api/docs/live-session.md.txt)). Most games are <15 min. For long games, reconnect transparently. |
| **Rate limiting** | Unlikely with text-in/audio-out, but if hit, narration gracefully stops — game continues fine without it. |
| **Audio context suspended** | Same pattern as current: resume AudioContext on first user interaction. |
| **Muted** | Still receive audio chunks (cheap) but don't play them. Or optionally pause sending events while muted. |
| **Multiple tabs** | Only the host tab opens a session. Other tabs (even same user) just see the game without narration. |
| **Slow connection** | PCM chunks are small. Buffer a few chunks before starting playback to smooth jitter. |

## File Changes Summary

| Action | File | Description |
|---|---|---|
| **Create** | `src/app/api/games/[code]/narrator/route.ts` | Ephemeral token endpoint |
| **Create** | `src/hooks/use-narrator.ts` | Core Live API hook (connect, narrate, playback) |
| **Create** | `src/lib/narrator-events.ts` | Event message builders (buildGameStartEvent, etc.) |
| **Create** | `src/lib/narrator-audio.ts` | `base64ToPCM`, `pcm16ToFloat32`, `NarratorPlaybackQueue` (adapted from [geoguessr-companion](https://github.com/GabrielHub/geoguessr-companion)) |
| **Modify** | `src/lib/sounds.ts` | No structural changes — narrator plugs into existing `getAudioContext()` + `masterGain` |
| **Modify** | `src/components/game-shell.tsx` | Wire up useNarrator, send events on phase changes, add test sound button to header |
| **Modify** | `src/app/game/[code]/voting.tsx` | Remove old TTS trigger, narrator handles it now |
| **Modify** | `prisma/schema.prisma` | Remove `ttsAudio` field from Prompt model |
| **Modify** | `src/lib/types.ts` | Simplify TtsMode enum (`OFF` / `ON`) |
| **Delete** | `src/lib/tts.ts` | Old server-side TTS generation |
| **Delete** | `src/app/api/games/[code]/speech/route.ts` | Old speech endpoint |
| **Delete** | `src/hooks/use-tts.ts` | Old TTS playback hook |

## Implementation Order

1. **Add test sound button to `game-shell.tsx` header** — quick win, validates audio pipeline works before narrator exists
2. **Create `narrator-audio.ts`** — `base64ToPCM`, `pcm16ToFloat32`, `NarratorPlaybackQueue` (adapted from geoguessr-companion, wired to existing `sounds.ts` masterGain)
3. **Create `narrator-events.ts`** — pure functions building XML event strings, no dependencies
4. **Create `narrator/route.ts`** — ephemeral token endpoint
5. **Create `use-narrator.ts`** — Live API hook using `narrator-audio.ts` for playback
6. **Modify `game-shell.tsx`** — wire up useNarrator, send events on phase changes
7. **Modify `voting.tsx`** — remove old TTS playback trigger
8. **Test end-to-end** — play a full game with narration
9. **Remove old TTS files** — clean up once everything works
10. **Migration** — drop `ttsAudio` column from Prompt model

## Decisions

1. **Host-only narration.** No relaying audio to other players. The host's speakers are the room's speakers.
2. **No browser voice fallback.** If the Live API fails to connect or drops, fail silently (log it, but literal silence). No SpeechSynthesis fallback. `TtsMode` simplifies to `OFF` | `ON`.
3. **Writing phase: hurry-up only.** No phase announcement — just a timer nudge at ~15s remaining. Keep it simple and short.
4. **XML events, not scripts.** Events are structured data (XML tags), not prescriptive text. The model decides how to narrate. Player names + human/AI labels are in the system prompt.
5. **Narrator personality: witty, dry humor, sarcastic.** British panel show host energy — sharp tongue, deadpan delivery. The model has creative freedom on how to react to results, roast players, etc.
