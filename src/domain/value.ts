export type NormalizedValue =
  | { state: 'valid'; value: number }
  | { state: 'missing' }
  | { state: 'invalid' }

export interface NormalizedRatio {
  state: 'valid' | 'missing' | 'invalid'
  used?: number
  total?: number
  percent?: number
  outOfRange?: boolean
}

export const normalizeFiniteValue = (value: unknown): NormalizedValue => {
  if (value === null || value === undefined) return { state: 'missing' }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { state: 'invalid' }
  }
  return { state: 'valid', value }
}

export const normalizeNonNegativeValue = (value: unknown): NormalizedValue => {
  const normalized = normalizeFiniteValue(value)
  if (normalized.state !== 'valid') return normalized
  if (normalized.value < 0) return { state: 'invalid' }
  return normalized
}

export const normalizeRatio = (
  usedValue: unknown,
  totalValue: unknown,
): NormalizedRatio => {
  const used = normalizeNonNegativeValue(usedValue)
  const total = normalizeNonNegativeValue(totalValue)

  if (used.state === 'invalid' || total.state === 'invalid') {
    return { state: 'invalid' }
  }
  if (
    used.state === 'missing' ||
    total.state === 'missing' ||
    total.value === 0
  ) {
    return { state: 'missing' }
  }

  const percent = (used.value / total.value) * 100
  return {
    state: 'valid',
    used: used.value,
    total: total.value,
    percent,
    outOfRange: percent > 100,
  }
}
