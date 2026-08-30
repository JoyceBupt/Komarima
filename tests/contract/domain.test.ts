import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  latestStatusMapSchema,
  metricQueryResultSchema,
  publicNodesSchema,
  rpcResponseSchema,
} from '../../src/api/schemas'
import {
  averageGauge,
  classifyFreshness,
  defaultAggregationForMetric,
  normalizeMetricSeries,
  normalizeProbeSnapshot,
  normalizeProbes,
  normalizeRatio,
  resetAwareCounterDelta,
} from '../../src/domain'
import latestStatusFixture from '../fixtures/komari-1.3.2/latest-status-rpc.json'
import metricQueryFixture from '../fixtures/komari-1.3.2/metric-query-rpc.json'
import nodesFixture from '../fixtures/komari-1.3.2/nodes-rpc.json'

const rpcResult = <T>(fixture: unknown, schema: z.ZodType<T>): T => {
  const parsed = rpcResponseSchema(schema).parse(fixture)
  if (!('result' in parsed)) throw new Error('Expected an RPC success')
  return parsed.result
}

describe('probe normalization', () => {
  const nodes = rpcResult(nodesFixture, publicNodesSchema)
  const statuses = rpcResult(latestStatusFixture, latestStatusMapSchema)
  const now = new Date('2026-08-30T04:00:00Z')

  it('normalizes tags and excludes private transport fields', () => {
    const probes = normalizeProbes(nodes)
    const online = probes.get('node-online')

    expect(online?.tags).toEqual(['production', 'asia'])
    expect(online).not.toHaveProperty('ipv4')
  })

  it('keeps connection and sample freshness orthogonal', () => {
    const online = normalizeProbeSnapshot(
      'node-online',
      statuses['node-online'],
      { now, staleAfterMs: 30_000 },
    )
    const offline = normalizeProbeSnapshot(
      'node-offline',
      statuses['node-offline'],
      { now, staleAfterMs: 30_000 },
    )

    expect(online.connectivity).toBe('online')
    expect(online.freshness.state).toBe('fresh')
    expect(offline.connectivity).toBe('offline')
    expect(offline.freshness.state).toBe('delayed')
  })

  it('represents no report, zero values, and zero denominators honestly', () => {
    const absent = normalizeProbeSnapshot('node-never-reported', undefined, {
      now,
      staleAfterMs: 30_000,
    })
    const offline = normalizeProbeSnapshot(
      'node-offline',
      statuses['node-offline'],
      { now, staleAfterMs: 30_000 },
    )

    expect(absent.connectivity).toBe('unknown')
    expect(absent.freshness.state).toBe('missing')
    expect(offline.cpuPercent).toEqual({ state: 'valid', value: 0 })
    expect(offline.swap.state).toBe('missing')
    expect(normalizeRatio(10, 0).state).toBe('missing')
  })

  it('treats all-loss Ping sentinel values as missing latency', () => {
    const online = normalizeProbeSnapshot(
      'node-online',
      statuses['node-online'],
      { now, staleAfterMs: 30_000 },
    )

    expect(online.ping.get('7')?.latency.state).toBe('missing')
    expect(online.ping.get('7')?.average.state).toBe('missing')
    expect(online.ping.get('7')?.lossPercent).toEqual({
      state: 'valid',
      value: 100,
    })
  })

  it('reports future timestamps as clock skew', () => {
    expect(
      classifyFreshness('2026-08-30T04:01:00Z', {
        now,
        staleAfterMs: 30_000,
      }).state,
    ).toBe('clock-skew')
  })

  it('fails fast instead of binding one probe status to another probe', () => {
    expect(() =>
      normalizeProbeSnapshot('node-offline', statuses['node-online'], {
        now,
        staleAfterMs: 30_000,
      }),
    ).toThrow('Probe status client mismatch')
  })
})

describe('metric semantics', () => {
  const query = rpcResult(metricQueryFixture, metricQueryResultSchema)
  const cpu = normalizeMetricSeries(query.series[0]!)
  const counter = normalizeMetricSeries(query.series[1]!)

  it('does not convert a chart gap into zero', () => {
    expect(cpu.points[2]?.value).toBeNull()
    expect(cpu.points[0]?.count).toBe(1)
    expect(cpu.count).toBe(5)
    expect(cpu.downsampleAlgorithm).toBe('avg')
    expect(averageGauge(cpu)).toEqual({ state: 'valid', value: 25 })
  })

  it('computes reset-aware counter deltas instead of averaging counters', () => {
    expect(resetAwareCounterDelta(counter)).toEqual({
      state: 'valid',
      value: 130,
      resets: 1,
    })
    expect(averageGauge(counter).state).toBe('invalid')
  })

  it('refuses to report a precise counter delta from downsampled buckets', () => {
    const downsampled = normalizeMetricSeries({
      ...query.series[1]!,
      downsampled: true,
      downsample_algorithm: 'last',
      interval_seconds: 60,
    })

    expect(downsampled.downsampleAlgorithm).toBe('last')
    expect(resetAwareCounterDelta(downsampled)).toEqual({ state: 'invalid' })
  })

  it('selects a semantic server aggregation from metric type', () => {
    expect(defaultAggregationForMetric({ type: 'counter' })).toBe('last')
    expect(defaultAggregationForMetric({ type: 'gauge' })).toBe('avg')
  })
})
