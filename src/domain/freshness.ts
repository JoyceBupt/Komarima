export type FreshnessState =
  'missing' | 'fresh' | 'delayed' | 'clock-skew' | 'invalid'

export interface FreshnessResult {
  state: FreshnessState
  sampledAt: Date | null
  ageMs: number | null
}

export interface FreshnessOptions {
  now?: Date
  staleAfterMs: number
  futureToleranceMs?: number
}

export const classifyFreshness = (
  timestamp: string | null | undefined,
  {
    now = new Date(),
    staleAfterMs,
    futureToleranceMs = 5_000,
  }: FreshnessOptions,
): FreshnessResult => {
  if (!timestamp) {
    return { state: 'missing', sampledAt: null, ageMs: null }
  }
  if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
    return { state: 'invalid', sampledAt: null, ageMs: null }
  }
  if (!Number.isFinite(futureToleranceMs) || futureToleranceMs < 0) {
    return { state: 'invalid', sampledAt: null, ageMs: null }
  }

  const sampledAt = new Date(timestamp)
  if (!Number.isFinite(sampledAt.getTime())) {
    return { state: 'invalid', sampledAt: null, ageMs: null }
  }

  const rawAgeMs = now.getTime() - sampledAt.getTime()
  if (rawAgeMs < -futureToleranceMs) {
    return { state: 'clock-skew', sampledAt, ageMs: rawAgeMs }
  }

  const ageMs = Math.max(0, rawAgeMs)
  return {
    state: ageMs > staleAfterMs ? 'delayed' : 'fresh',
    sampledAt,
    ageMs,
  }
}
