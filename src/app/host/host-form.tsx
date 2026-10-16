"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AI_MODELS, getModelByModelId } from "@/lib/models";
import { FREE_PLAY_WRITER_MODEL_ID, getFreePlayAiPlayerLimit } from "@/lib/free-play";
import type { GameType } from "@/games/core/types";
import { GAME_META } from "@/games/meta";
import { ErrorBanner } from "@/components/error-banner";
import { ChevronDownIcon } from "@/components/icons";
import { TopBar } from "@/components/top-bar";
import { collapse, enter, listParent, press } from "@/lib/animations";
import { originOf, pulseAmbient } from "@/lib/ambient-events";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import type { MatchSlopIdentity } from "@/games/matchslop/identities";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { isMobileDevice } from "@/lib/mobile-device";
import { roomPath, saveRoomSession } from "@/room/session";
import { saveLastName, useRememberedName } from "../join/last-name";
import { NameField } from "../join/name-field";
import { readStored, writeStored } from "@/lib/safe-storage";
import { HumanPlayerGuidance } from "./host-player-guidance";
import { getCostTier } from "./host-model-options";
import {
  HostGamePicker,
  HostParticipationPicker,
  type HostParticipation,
} from "./host-game-mode-picker";
import { HostGamePreview } from "./host-game-preview";
import { HostNarratorSettings, type TtsMode } from "./host-narrator-settings";
import { MatchSlopDatingSetup, PersonaModelPicker } from "./host-matchslop-settings";
import { OptionSwitch } from "./host-option-switch";
import { AiModelRow } from "./ai-model-row";
import {
  FreePlayRoster,
  HostAccessFooter,
  isFreePlayAvailable,
  type HostAccess,
} from "./host-access-picker";
import { useClientValue } from "@/hooks/use-hydrated";

const ACCESS_STORAGE_KEY = "slop-lash:host-access";
const TUTORIAL_STORAGE_KEY = "slop-lash:host-tutorial";

function readStoredAccess(): HostAccess | null {
  const stored = readStored(ACCESS_STORAGE_KEY);
  return stored === "FREE" || stored === "HOST" ? stored : null;
}

/** The how-to-play video is on until a host turns it off, then stays off. */
function readStoredTutorial(): boolean {
  return readStored(TUTORIAL_STORAGE_KEY) !== "OFF";
}

const SECTION_HEADING = "font-display text-lg font-bold text-ink";

/**
 * The host setup, in the order hosts think: which game, where they're playing,
 * their name, the AI lineup, then everything optional. On phones the lineup
 * sits above a sticky Create bar; on wide screens it moves to a right column.
 */
export function HostForm({ initialGameType }: { initialGameType: GameType }) {
  const router = useRouter();
  const createRoom = useAction(api.rooms.create);
  const freePlayStatus = useQuery(api.freePlay.status);
  const { triggerElement } = usePixelDissolve();
  const [gameType, setGameType] = useState<GameType>(initialGameType);
  // The stored choice only changes through this page, which also holds it in state.
  const storedAccess = useClientValue(readStoredAccess, null);
  const [chosenAccess, setChosenAccess] = useState<HostAccess | null>(null);
  const [freeBotSelected, setFreeBotSelected] = useState(true);
  const [hostSecret, setHostSecret] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const focusPasswordRef = useRef(false);
  const [hostName, setHostName] = useRememberedName();
  const [hostParticipation, setHostParticipation] = useState<HostParticipation>("PLAYER");
  const [seekerIdentity, setSeekerIdentity] = useState<MatchSlopIdentity>("MAN");
  const [personaIdentity, setPersonaIdentity] = useState<MatchSlopIdentity>("WOMAN");
  const [personaModelId, setPersonaModelId] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [timersDisabled, setTimersDisabled] = useState(false);
  const storedTutorial = useClientValue(readStoredTutorial, true);
  const [chosenTutorial, setChosenTutorial] = useState<boolean | null>(null);
  const [ttsMode, setTtsMode] = useState<TtsMode>("OFF");
  const [ttsVoice, setTtsVoice] = useState("RANDOM");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const creatingRef = useRef(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedGameType = GAME_META[gameType];
  const isMatchSlop = gameType === "MATCHSLOP";
  const freePlayAvailable = isFreePlayAvailable(freePlayStatus);
  // Fall back to the password tier when Free Play is off or spent for today.
  const access: HostAccess =
    freePlayStatus !== undefined && !freePlayAvailable
      ? "HOST"
      : (chosenAccess ?? storedAccess ?? "FREE");
  const freePlay = access === "FREE";
  const tutorial = chosenTutorial ?? storedTutorial;
  const freeBotLimit = getFreePlayAiPlayerLimit(gameType);
  // Mode-specific constraints are applied here rather than written back to
  // state, so switching to a mode and back restores the host's prior choices.
  // MatchSlop always hosts from a shared display.
  const effectiveParticipation: HostParticipation = isMatchSlop
    ? "DISPLAY_ONLY"
    : hostParticipation;
  // MatchSlop always has a persona; it starts on the first model until picked.
  const pickedPersonaModelId = personaModelId ?? AI_MODELS[0]?.id ?? null;
  // Free Play pins every model server-side; the UI mirrors those pins.
  const effectivePersonaModelId = freePlay ? FREE_PLAY_WRITER_MODEL_ID : pickedPersonaModelId;
  const selectedPersonaModel = effectivePersonaModelId
    ? getModelByModelId(effectivePersonaModelId)
    : undefined;
  const narratorAvailable = selectedGameType.supportsNarrator && !freePlay;
  const effectiveTtsMode: TtsMode = selectedGameType.supportsNarrator ? ttsMode : "OFF";
  // MatchSlop honours timersDisabled but never shows the toggle, so a value set
  // on another mode must not follow the host across the picker unseen.
  const effectiveTimersDisabled = selectedGameType.timerToggle === null ? false : timersDisabled;
  const maxAiPlayers = selectedGameType.maxPlayers - (effectiveParticipation === "PLAYER" ? 1 : 0);
  // The persona model cannot also be an AI teammate.
  const effectiveModels = selectedModels
    .filter((id) => !(isMatchSlop && id === pickedPersonaModelId))
    .slice(0, maxAiPlayers);
  // Modes without AI players keep any prior selection in state (so switching
  // back restores it) but must never count or submit it. Each access tier
  // keeps its own selection for the same reason.
  const freePlayAiModels = freeBotSelected && freeBotLimit > 0 ? [FREE_PLAY_WRITER_MODEL_ID] : [];
  const activeAiModels = !selectedGameType.supportsAiPlayers
    ? []
    : freePlay
      ? freePlayAiModels
      : effectiveModels;
  const activePlayerCount = (effectiveParticipation === "PLAYER" ? 1 : 0) + activeAiModels.length;

  function setAccess(next: HostAccess) {
    setChosenAccess(next);
    writeStored(ACCESS_STORAGE_KEY, next);
    setError("");
  }

  function setTutorial(next: boolean) {
    setChosenTutorial(next);
    writeStored(TUTORIAL_STORAGE_KEY, next ? "ON" : "OFF");
  }

  function unlockWithPassword() {
    focusPasswordRef.current = true;
    setAccess("HOST");
  }

  useEffect(() => {
    if (access !== "HOST" || !focusPasswordRef.current) return;
    focusPasswordRef.current = false;
    passwordInputRef.current?.focus();
  }, [access]);

  // A toggle commits the visible lineup, dropping models the current mode hides.
  function toggleModel(modelId: string) {
    const targetModel = getModelByModelId(modelId);
    if (!targetModel) return;
    if (isMatchSlop && modelId === pickedPersonaModelId) return;

    if (effectiveModels.includes(modelId)) {
      setSelectedModels(effectiveModels.filter((id) => id !== modelId));
      return;
    }

    const withoutSameProvider = effectiveModels.filter((id) => {
      const model = getModelByModelId(id);
      return model?.provider !== targetModel.provider;
    });

    if (withoutSameProvider.length >= maxAiPlayers) return;
    setSelectedModels([...withoutSameProvider, modelId]);
  }

  async function createGame() {
    if (creatingRef.current) return;
    if (freePlay && !freePlayAvailable) {
      setError("Free Play is unavailable right now. Use the host password.");
      return;
    }
    if (!freePlay && !hostSecret.trim()) {
      setError("Enter the host password");
      passwordInputRef.current?.focus();
      return;
    }
    if (effectiveParticipation === "PLAYER" && !hostName.trim()) {
      setError("Enter your name");
      nameInputRef.current?.focus();
      return;
    }
    creatingRef.current = true;
    setLoading(true);
    setError("");
    if (submitRef.current) triggerElement(submitRef.current);

    try {
      const room = await createRoom({
        gameType,
        // No password makes this a Free Play room.
        hostSecret: freePlay ? undefined : hostSecret.trim(),
        // No name hosts from this screen as a shared display.
        hostName: effectiveParticipation === "PLAYER" ? hostName.trim() : undefined,
        aiModelIds: activeAiModels,
        timersDisabled: effectiveTimersDisabled,
        tutorial,
        ttsMode: narratorAvailable ? effectiveTtsMode : undefined,
        ttsVoice: narratorAvailable && effectiveTtsMode === "ON" ? ttsVoice : undefined,
        settings:
          isMatchSlop && effectivePersonaModelId
            ? {
                matchslop: {
                  seekerIdentity,
                  personaIdentity,
                  personaModelId: effectivePersonaModelId,
                },
              }
            : undefined,
      });
      if (effectiveParticipation === "PLAYER") saveLastName(hostName.trim());
      saveRoomSession(room);
      pulseAmbient({ kind: "cheer", origin: originOf(submitRef.current) });
      router.push(roomPath(room, isMobileDevice()));
    } catch (error) {
      setError(getConvexErrorMessage(error, "Failed to create game"));
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  }

  const timerToggle = selectedGameType.timerToggle;
  // Free Play MatchSlop has no AI players to pick, only the Haiku who plays the date.
  const freePlayDate = freePlay && isMatchSlop;
  let lineupHeading = "Players";
  if (freePlayDate) lineupHeading = "Your date";
  else if (selectedGameType.supportsAiPlayers) lineupHeading = "AI players";

  const lineup = (
    <motion.section variants={enter} className="order-4" aria-labelledby="host-lineup-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="host-lineup-heading" className={SECTION_HEADING}>
          {lineupHeading}
        </h2>
        {selectedGameType.supportsAiPlayers && !freePlayDate && (
          <span className="text-sm tabular-nums text-ink-dim">
            {activePlayerCount} of {selectedGameType.maxPlayers} players
          </span>
        )}
      </div>
      {!selectedGameType.supportsAiPlayers ? (
        <HumanPlayerGuidance
          minPlayers={selectedGameType.minPlayers}
          maxPlayers={selectedGameType.maxPlayers}
        />
      ) : freePlay ? (
        <FreePlayRoster
          botSelected={freeBotSelected}
          botLimit={freeBotLimit}
          personaMode={isMatchSlop}
          onBotToggle={() => setFreeBotSelected((selected) => !selected)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {AI_MODELS.map((model) => {
            const selected = effectiveModels.includes(model.id);
            const replacesSameProvider =
              !selected &&
              effectiveModels.some((id) => {
                const selectedModel = getModelByModelId(id);
                return selectedModel?.provider === model.provider;
              });
            const atLimit =
              effectiveModels.length >= maxAiPlayers && !selected && !replacesSameProvider;

            return (
              <AiModelRow
                key={model.id}
                model={model}
                selected={selected}
                disabled={atLimit}
                detail={<span className="font-mono">{getCostTier(model)}</span>}
                onClick={() => toggleModel(model.id)}
              />
            );
          })}
        </div>
      )}
    </motion.section>
  );

  const createBar = (
    // Opaque on phones: a blur over the live background would cost every frame.
    <div className="order-7 mt-auto max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:-mx-4 max-lg:border-t max-lg:border-edge/60 max-lg:bg-canvas max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(1rem,env(safe-area-inset-bottom))] lg:mt-6">
      <ErrorBanner error={error} className="mb-3" />
      <motion.button
        ref={submitRef}
        type="submit"
        disabled={loading}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-(--host-accent) font-display text-xl font-bold text-accent-ink transition-[background-color,filter] duration-300 hover:brightness-110 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        {...press}
      >
        {loading && (
          <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {loading ? "Creating…" : "Create game"}
      </motion.button>
    </div>
  );

  return (
    <div className="min-h-svh flex flex-col">
      <TopBar backHref="/" backLabel="Back to home" />

      <main className="flex-1 flex flex-col items-center px-4 pt-2 lg:pt-[6svh] lg:pb-12">
        {/* The form previews the picked game's palette: its tokens, and its action
              colour as --host-accent. */}
        <motion.form
          noValidate
          data-game={selectedGameType.theme}
          style={{ "--host-accent": selectedGameType.accent } as CSSProperties}
          onSubmit={(e) => {
            e.preventDefault();
            void createGame();
          }}
          // On phones a focused field scrolls clear of the sticky Create bar, not under it.
          className="flex w-full max-w-xl flex-1 flex-col gap-8 max-lg:[&_*]:scroll-mb-32 lg:max-w-[67rem] lg:grid lg:flex-none lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-start lg:gap-x-14"
          variants={listParent(6)}
          initial="hidden"
          animate="visible"
        >
          {/* Left column on wide screens; its sections interleave with the lineup on phones. */}
          <div className="max-lg:contents lg:flex lg:flex-col lg:gap-8">
            <motion.div variants={enter} className="order-1">
              <HostGamePicker gameType={gameType} onGameTypeChange={setGameType} />
            </motion.div>

            {!isMatchSlop && (
              <motion.div variants={enter} className="order-3">
                <HostParticipationPicker
                  participation={effectiveParticipation}
                  onChange={setHostParticipation}
                />
                <AnimatePresence initial={false}>
                  {effectiveParticipation === "PLAYER" && (
                    <motion.div
                      key="host-name"
                      variants={collapse}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="overflow-hidden"
                    >
                      <NameField
                        id="host-player-name"
                        ref={nameInputRef}
                        value={hostName}
                        onChange={(name) => {
                          setHostName(name);
                          setError("");
                        }}
                        focusClass="focus:border-(--host-accent)"
                        enterKeyHint="done"
                        labelClassName="mt-5"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            <motion.section variants={enter} className="order-5">
              <motion.button
                type="button"
                aria-expanded={optionsOpen}
                aria-controls="host-more-options"
                onClick={() => setOptionsOpen((open) => !open)}
                className="flex h-12 w-full cursor-pointer items-center justify-between rounded-xl px-1 text-left text-base font-semibold text-ink-dim transition-colors hover:text-ink"
                {...press}
              >
                More options
                <ChevronDownIcon
                  size={16}
                  className={`transition-transform duration-200 ${optionsOpen ? "rotate-180" : ""}`}
                />
              </motion.button>
              <AnimatePresence initial={false}>
                {optionsOpen && (
                  <motion.div
                    id="host-more-options"
                    key="options"
                    variants={collapse}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="overflow-hidden"
                  >
                    <div className="mt-1 divide-y divide-edge rounded-xl border-2 border-edge bg-surface/70">
                      <OptionSwitch
                        label="How-to-play video"
                        checked={tutorial}
                        onChange={setTutorial}
                      />
                      {timerToggle && (
                        <OptionSwitch
                          label={timerToggle.label}
                          checked={timerToggle.onWhenDisabled === effectiveTimersDisabled}
                          onChange={(on) =>
                            setTimersDisabled(timerToggle.onWhenDisabled ? on : !on)
                          }
                        />
                      )}
                      {narratorAvailable && (
                        <HostNarratorSettings
                          mode={effectiveTtsMode}
                          voice={ttsVoice}
                          onModeChange={setTtsMode}
                          onVoiceChange={setTtsVoice}
                        />
                      )}
                      {isMatchSlop && (
                        <MatchSlopDatingSetup
                          seekerIdentity={seekerIdentity}
                          personaIdentity={personaIdentity}
                          onSeekerChange={setSeekerIdentity}
                          onPersonaChange={setPersonaIdentity}
                        />
                      )}
                      {isMatchSlop && !freePlay && (
                        <PersonaModelPicker
                          selectedModel={selectedPersonaModel}
                          pickedModelId={pickedPersonaModelId}
                          teammateIds={effectiveModels}
                          onPick={(modelId) => {
                            setPersonaModelId(modelId);
                            setSelectedModels(effectiveModels.filter((id) => id !== modelId));
                          }}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            <motion.div variants={enter} className="order-6 -mt-4">
              <HostAccessFooter
                access={access}
                freePlayStatus={freePlayStatus}
                hostSecret={hostSecret}
                passwordInputRef={passwordInputRef}
                onHostSecretChange={(secret) => {
                  setHostSecret(secret);
                  setError("");
                }}
                onUsePassword={unlockWithPassword}
                onUseFreePlay={() => setAccess("FREE")}
              />
            </motion.div>
          </div>

          {/* Right column on wide screens: the picked game's preview, then the lineup
              with Create under it. On phones the preview follows the picker. */}
          <div className="max-lg:contents lg:sticky lg:top-6 lg:flex lg:flex-col">
            <motion.div variants={enter} className="order-2 lg:mt-12 lg:mb-8">
              <HostGamePreview gameType={gameType} />
            </motion.div>
            {lineup}
            {createBar}
          </div>
        </motion.form>
      </main>
    </div>
  );
}
