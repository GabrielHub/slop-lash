export interface DissolveRequest {
  sourceRect: DOMRect;
  colors?: string[];
  particleCount?: number;
  onDissolveComplete?: () => void;
  onSequenceComplete?: () => void;
}

type DissolveListener = (request: DissolveRequest) => void;

const listeners = new Set<DissolveListener>();

export function emitDissolve(request: DissolveRequest) {
  listeners.forEach((fn) => fn(request));
}

export function subscribeDissolve(fn: DissolveListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
