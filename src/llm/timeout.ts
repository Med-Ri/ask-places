/** Free-tier Gemini and similar models are often slow with structured JSON; 30 s was too short. */
export const LLM_TIMEOUT_MS = 90_000;

export function llmAbortSignal(): AbortSignal {
  return AbortSignal.timeout(LLM_TIMEOUT_MS);
}

/** AbortSignal.timeout() throws a DOMException named TimeoutError (or AbortError on some runtimes). */
export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}
