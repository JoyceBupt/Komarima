import { describe, expect, it } from 'vitest'
import type { NormalizedMetricSeries } from '../../domain'
import { toAlignedMetricData, toAlignedMultiMetricData } from './chartData'

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

describe('toAlignedMultiMetricData', () => {
  const metric = (
    taskId: string,
    points: NormalizedMetricSeries['points'],
  ): NormalizedMetricSeries => ({
    metricKey: 'ping.latency_ms',
    entityId: 'node-a',
    type: 'gauge',
    unit: 'ms',
    tags: { task_id: taskId },
    downsampled: false,
    downsampleAlgorithm: null,
    intervalSeconds: 60,
    count: points.length,
    points,
  })

  it('aligns tagged series on a sorted union while retaining null gaps', () => {
    const data = toAlignedMultiMetricData([
      metric('7', [
        { timeMs: 3_000, value: 13, count: 1 },
        { timeMs: 1_000, value: 11, count: 1 },
        { timeMs: 2_000, value: null, count: 0 },
      ]),
      metric('8', [
        { timeMs: 2_000, value: 22, count: 1 },
        { timeMs: 3_000, value: Number.NaN, count: 1 },
        { timeMs: Number.NaN, value: 24, count: 1 },
      ]),
    ])

    expect(data).toEqual([
      [1, 2, 3],
      [11, null, 13],
      [undefined, 22, null],
    ])
  })
})
