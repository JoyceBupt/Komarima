import { describe, expect, it } from 'vitest'
import type { NormalizedMetricSeries } from '../../domain'
import {
  formatMetricValue,
  metricSeriesLabel,
  metricStats,
  seriesIdentity,
} from './metricPresentation'

function series(
  overrides: Partial<NormalizedMetricSeries> = {},
): NormalizedMetricSeries {
  return {
    metricKey: 'cpu.usage',
    entityId: 'node-a',
    type: 'gauge',
    unit: '%',
    tags: {},
    downsampled: true,
    downsampleAlgorithm: 'avg',
    intervalSeconds: 60,
    count: 3,
    points: [
      { timeMs: 0, value: 10, count: 9 },
      { timeMs: 60_000, value: null, count: 0 },
      { timeMs: 120_000, value: 100, count: 1 },
    ],
    ...overrides,
  }
}

describe('metric presentation', () => {
  it('uses stable sorted tags in identity and visible Ping titles', () => {
    const taskSeven = series({
      metricKey: 'ping.latency_ms',
      unit: 'ms',
      tags: { target: 'Tokyo', task_id: '7' },
    })
    const sameTaskDifferentOrder = series({
      metricKey: 'ping.latency_ms',
      unit: 'ms',
      tags: { task_id: '7', target: 'Tokyo' },
    })
    const taskEight = series({
      metricKey: 'ping.latency_ms',
      unit: 'ms',
      tags: { target: 'Tokyo', task_id: '8' },
    })

    expect(seriesIdentity(taskSeven)).toBe(
      seriesIdentity(sameTaskDifferentOrder),
    )
    expect(seriesIdentity(taskSeven)).not.toBe(seriesIdentity(taskEight))
    expect(metricSeriesLabel(taskSeven)).toBe(
      'Ping 延迟 · 任务 7 · target=Tokyo',
    )
  })

  it('weights gauge averages by point count and reports gaps', () => {
    const stats = metricStats(series())

    expect(stats.average).toBe(19)
    expect(stats.sampleCount).toBe(10)
    expect(stats.validPointCount).toBe(2)
    expect(stats.expectedPointCount).toBe(3)
    expect(stats.gapCount).toBe(1)
    expect(stats.coveragePercent).toBeCloseTo(66.666, 2)
  })

  it('maps 1.3.2 units without guessing', () => {
    expect(formatMetricValue(1_073_741_824, 'bytes')).toBe('1 GB')
    expect(formatMetricValue(1_048_576, 'bytes/s')).toBe('1 MB/s')
    expect(formatMetricValue(0.125, 'ratio')).toBe('12.5%')
    expect(formatMetricValue(28, 'ms')).toBe('28 ms')
    expect(formatMetricValue(45, '°C')).toBe('45°C')
    expect(formatMetricValue(12, 'count')).toBe('12')
  })
})
