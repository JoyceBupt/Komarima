import { describe, expect, it } from 'vitest'
import { toAlignedMetricData } from './chartData'

describe('toAlignedMetricData', () => {
  it('keeps null gaps and rejects invalid timestamps and values', () => {
    const [times, values] = toAlignedMetricData([
      { timeMs: 1_000, value: 12, count: 1 },
      { timeMs: 2_000, value: null, count: 0 },
      { timeMs: Number.NaN, value: 30, count: 1 },
      { timeMs: 3_000, value: Number.NaN, count: 1 },
    ])

    expect(times).toEqual([1, 2, 3])
    expect(values).toEqual([12, null, null])
  })
})
