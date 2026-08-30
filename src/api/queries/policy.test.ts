import { describe, expect, it } from 'vitest'
import {
  normalizeP0MetricQueryParams,
  normalizeP0PingStatsParams,
} from './policy'

describe('P0 Metric query policy', () => {
  it('adds explicit safe defaults and last aggregation for counters', () => {
    expect(
      normalizeP0MetricQueryParams({
        metric_keys: ['cpu.usage', 'net.total.up'],
        entity_id: 'node-a',
      }),
    ).toMatchObject({
      hours: 4,
      max_points: 240,
      fill_empty: true,
      aggregation_by_metric: { 'net.total.up': 'last' },
    })
  })

  it('preserves an explicit reset-aware counter rate request', () => {
    expect(
      normalizeP0MetricQueryParams({
        metric_key: 'net.total.down',
        entity_id: 'node-a',
        aggregation: 'rate',
        max_points: 120,
        hours: 1,
      }),
    ).toMatchObject({ aggregation: 'rate', max_points: 120, hours: 1 })
  })

  it('rejects unsafe counter aggregation and point overrides', () => {
    expect(() =>
      normalizeP0MetricQueryParams({
        metric_key: 'net.total.up',
        entity_id: 'node-a',
        aggregation: 'avg',
      }),
    ).toThrow('requires last or rate')

    expect(() =>
      normalizeP0MetricQueryParams({
        metric_key: 'cpu.usage',
        entity_id: 'node-a',
        max_points_by_metric: { 'cpu.usage': 361 },
      }),
    ).toThrow('120 to 360')
  })

  it('limits entity, metric count, metric names, and time windows', () => {
    expect(() =>
      normalizeP0MetricQueryParams({
        metric_key: 'cpu.usage',
        entity_ids: ['node-a'],
      }),
    ).toThrow('exactly one entity_id')

    expect(() =>
      normalizeP0MetricQueryParams({
        metric_keys: [
          'cpu.usage',
          'memory.used',
          'disk.used',
          'net.in.rate',
          'net.out.rate',
        ],
        entity_id: 'node-a',
      }),
    ).toThrow('1-4 metrics')

    expect(() =>
      normalizeP0MetricQueryParams({
        metric_key: 'custom.metric',
        entity_id: 'node-a',
      }),
    ).toThrow('not available in P0')

    expect(() =>
      normalizeP0MetricQueryParams({
        metric_key: 'cpu.usage',
        entity_id: 'node-a',
        hours: 0.5,
      }),
    ).toThrow('hours must be from')
  })

  it('requires one concrete task for Ping Metric series', () => {
    expect(() =>
      normalizeP0MetricQueryParams({
        metric_key: 'ping.latency_ms',
        entity_id: 'node-a',
      }),
    ).toThrow('tags.task_id')

    expect(
      normalizeP0MetricQueryParams({
        metric_key: 'ping.latency_ms',
        entity_id: 'node-a',
        tags: { task_id: '8' },
      }),
    ).toMatchObject({ tags: { task_id: '8' }, max_points: 240 })
  })
})

describe('P0 Ping query policy', () => {
  it('adds bounded defaults for one entity', () => {
    expect(normalizeP0PingStatsParams({ uuid: 'node-a', task_id: 8 })).toEqual({
      uuid: 'node-a',
      task_id: 8,
      hours: 4,
      max_points: 240,
    })
  })

  it('rejects multiple entities, empty tasks, and excessive point counts', () => {
    expect(() =>
      normalizeP0PingStatsParams({ entity_ids: ['node-a'] }),
    ).toThrow('exactly one uuid or entity_id')
    expect(() =>
      normalizeP0PingStatsParams({ uuid: 'node-a', task_ids: [] }),
    ).toThrow('task_ids cannot be empty')
    expect(() => normalizeP0PingStatsParams({ uuid: 'node-a' })).toThrow(
      'requires 1-8 tasks',
    )
    expect(() =>
      normalizeP0PingStatsParams({ uuid: 'node-a', task_id: ' ' }),
    ).toThrow('non-negative integers')
    expect(() =>
      normalizeP0PingStatsParams({
        uuid: 'node-a',
        task_id: 8,
        max_points: 500,
      }),
    ).toThrow('120 to 360')
  })
})
