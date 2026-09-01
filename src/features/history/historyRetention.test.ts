import { describe, expect, it } from 'vitest'
import type { MetricDefinition } from '../../api'
import {
  availableMetricHours,
  historyAvailabilityLabel,
} from './historyRetention'

const definition = (name: string, retentionDays: number): MetricDefinition => ({
  name,
  type: 'gauge',
  retention_days: retentionDays,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-30T00:00:00Z',
})

describe('history retention', () => {
  it('caps grouped queries at the shortest published retention', () => {
    const definitions = [
      definition('cpu.usage', 1),
      definition('memory.used', 3),
      definition('ping.latency_ms', 7),
    ]

    expect(
      availableMetricHours(definitions, ['cpu.usage', 'memory.used'], 168),
    ).toBe(24)
    expect(availableMetricHours(definitions, ['ping.latency_ms'], 168)).toBe(
      168,
    )
    expect(availableMetricHours(definitions, ['disk.used'], 168)).toBe(168)
  })

  it('explains mixed availability without duplicating normal ranges', () => {
    expect(
      historyAvailabilityLabel({
        requestedHours: 168,
        resourceHours: 24,
        pingHours: 168,
        hasPing: true,
      }),
    ).toBe('资源24h · Ping7d')
    expect(
      historyAvailabilityLabel({
        requestedHours: 24,
        resourceHours: 24,
        pingHours: 24,
        hasPing: true,
      }),
    ).toBeNull()
  })
})
