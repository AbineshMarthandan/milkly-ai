export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with jitter: ~400ms, ~1.2s, ~3s … */
export function backoffDelay(attempt: number, baseMs = 400): number {
  return Math.round(baseMs * 2.5 ** attempt * (0.75 + Math.random() * 0.5));
}
