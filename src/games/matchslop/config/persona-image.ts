export type MatchSlopPersonaImageStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "READY"
  | "FAILED";

export interface MatchSlopPersonaImageState {
  status: MatchSlopPersonaImageStatus;
  provider: string | null;
  providerModel: string | null;
  providerJobId: string | null;
  prompt: string | null;
  negativePrompt: string | null;
  seed: number | null;
  imageUrl: string | null;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export function createInitialPersonaImageState(): MatchSlopPersonaImageState {
  return {
    status: "NOT_REQUESTED",
    provider: null,
    providerModel: null,
    providerJobId: null,
    prompt: null,
    negativePrompt: null,
    seed: null,
    imageUrl: null,
    storageKey: null,
    width: null,
    height: null,
    errorCode: null,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };
}

// TODO: Wire MatchSlop persona image generation through fal.ai in a future pass.
