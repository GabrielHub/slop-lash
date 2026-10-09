/**
 * Every text model call reasons at the lowest effort that keeps reasoning on.
 * `minimal` is AI SDK's portable level; each provider maps it to its own floor
 * (Anthropic's adaptive thinking runs it at effort `low`).
 */
export const MINIMAL_REASONING = { reasoning: "minimal" } as const;
