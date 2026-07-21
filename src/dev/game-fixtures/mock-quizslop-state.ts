import type {
  QuizslopChooseTopicResult,
  QuizslopInitiateDisputeResult,
} from "@/games/quizslop/ui/quizslop-view-contracts";
import {
  HOME_TOPICS,
  catalogQuestion,
  createQuizslopFixtureScript,
  type QuizslopFixtureBeat,
} from "./mock-quizslop-fixture-script";
import { appendQuizslopDisputeSequence } from "./mock-quizslop-sequence-disputes";
import { appendQuizslopFinaleSequence } from "./mock-quizslop-sequence-finale";
import { appendQuizslopMiddleSequence } from "./mock-quizslop-sequence-middle";
import { appendQuizslopOpeningSequence } from "./mock-quizslop-sequence-opening";

export {
  QUIZSLOP_FIXTURE_KIND,
  QUIZSLOP_FIXTURE_PLAYER_KEYS,
  type QuizslopFixtureBeat,
  type QuizslopFixturePlayerKey,
} from "./mock-quizslop-fixture-script";

export function createQuizslopFixtureBeats(nowMs: number): QuizslopFixtureBeat[] {
  const script = createQuizslopFixtureScript(nowMs);
  appendQuizslopOpeningSequence(script);
  appendQuizslopMiddleSequence(script);
  appendQuizslopDisputeSequence(script);
  appendQuizslopFinaleSequence(script);
  return script.beats;
}

/* ─── Fixture mutation results for controller flows ─── */

/** Beat data is scripted, so mutations only demo the result contract. */
export function mockChooseCatalogTopicResult(catalogTopicId: string): QuizslopChooseTopicResult {
  // The mythology pack is "claimed" in fixture-land so the lost-race path renders.
  if (catalogTopicId === "cat-greek-mythology") return { kind: "TOPIC_TAKEN" };
  return { kind: "CONFIRMED", topicId: `topic-${catalogTopicId}` };
}

export function mockInitiateDisputeResult(questionId: string): QuizslopInitiateDisputeResult {
  // The shark HARD question already has a ballot in the r4 dispute beat.
  const challenged = catalogQuestion(HOME_TOPICS.P4, "HARD").id;
  if (questionId === challenged) return { kind: "ALREADY_OPEN" };
  return { kind: "OPENED", disputeId: `dispute-${questionId}` };
}

/* ─── Cross-tab beat sync (localStorage + BroadcastChannel, matchslop pattern) ─── */

const BEAT_STORAGE_KEY = "mock-quizslop:beat-index";
const BEAT_EVENT_NAME = "mock-quizslop:beat-change";
const BEAT_CHANNEL_NAME = "mock-quizslop:beat-index";

export function clampQuizslopBeatIndex(index: number, beatCount: number): number {
  if (!Number.isFinite(index) || beatCount <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), beatCount - 1);
}

export function readSharedQuizslopBeatIndex(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(BEAT_STORAGE_KEY);
  const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function writeSharedQuizslopBeatIndex(index: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BEAT_STORAGE_KEY, String(index));
  window.dispatchEvent(new CustomEvent(BEAT_EVENT_NAME, { detail: index }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(BEAT_CHANNEL_NAME);
    channel.postMessage(index);
    channel.close();
  }
}

export function subscribeToSharedQuizslopBeatIndex(onIndex: (index: number) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== BEAT_STORAGE_KEY) return;
    onIndex(readSharedQuizslopBeatIndex());
  };
  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<number>).detail;
    onIndex(typeof detail === "number" ? detail : readSharedQuizslopBeatIndex());
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(BEAT_EVENT_NAME, handleCustom as EventListener);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(BEAT_CHANNEL_NAME);
    channel.addEventListener("message", (event: MessageEvent<number>) => {
      onIndex(typeof event.data === "number" ? event.data : readSharedQuizslopBeatIndex());
    });
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(BEAT_EVENT_NAME, handleCustom as EventListener);
    channel?.close();
  };
}
