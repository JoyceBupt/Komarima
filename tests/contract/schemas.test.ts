import { describe, expect, it } from 'vitest'
import {
  latestStatusMapSchema,
  metricDefinitionsSchema,
  metricQueryParamsSchema,
  metricQueryResultSchema,
  pingMetricStatsResultSchema,
  publicInfoSchema,
  publicNodesSchema,
  restEnvelopeSchema,
  rpcResponseSchema,
} from '../../src/api/schemas'
import latestStatusFixture from '../fixtures/komari-1.3.2/latest-status-rpc.json'
import metricDefinitionsFixture from '../fixtures/komari-1.3.2/metric-definitions-rpc.json'
import metricQueryFixture from '../fixtures/komari-1.3.2/metric-query-rpc.json'
import nodesFixture from '../fixtures/komari-1.3.2/nodes-rpc.json'
import pingStatsFixture from '../fixtures/komari-1.3.2/ping-stats-rpc.json'
import publicInfoFixture from '../fixtures/komari-1.3.2/public-info.json'

describe('Komari 1.3.2 response contracts', () => {
  it('parses the REST public-info envelope without hiding theme settings', () => {
    const parsed = restEnvelopeSchema(publicInfoSchema).parse(publicInfoFixture)

    expect(parsed.data.theme).toBe('Komarima')
    expect(parsed.data.theme_settings.refreshIntervalSeconds).toBe(10)
  })

  it('parses public nodes and keeps a never-reported node as metadata', () => {
    const parsed = rpcResponseSchema(publicNodesSchema).parse(nodesFixture)
    if (!('result' in parsed)) throw new Error('Expected an RPC success')

    expect(parsed.result).toHaveLength(3)
    expect(parsed.result.at(-1)?.uuid).toBe('node-never-reported')
  })

  it('strips private transport fields from the public-node cache shape', () => {
    const injected = structuredClone(nodesFixture)
    Object.assign(injected.result[0], {
      ipv4: '192.0.2.1',
      ipv6: '2001:db8::1',
      token: 'secret',
      remark: 'private',
    })
    const parsed = rpcResponseSchema(publicNodesSchema).parse(injected)
    if (!('result' in parsed)) throw new Error('Expected an RPC success')

    expect(parsed.result[0]).not.toHaveProperty('ipv4')
    expect(parsed.result[0]).not.toHaveProperty('ipv6')
    expect(parsed.result[0]).not.toHaveProperty('token')
    expect(parsed.result[0]).not.toHaveProperty('remark')
  })

  it('does not invent a latest status for a node that never reported', () => {
    const parsed = rpcResponseSchema(latestStatusMapSchema).parse(
      latestStatusFixture,
    )
    if (!('result' in parsed)) throw new Error('Expected an RPC success')

    expect(parsed.result['node-online']?.online).toBe(true)
    expect(parsed.result['node-offline']?.online).toBe(false)
    expect(parsed.result['node-never-reported']).toBeUndefined()
  })

  it('rejects a latest-status map whose key does not match client', () => {
    const mismatched = structuredClone(latestStatusFixture)
    mismatched.result['node-online']!.client = 'different-node'

    expect(() =>
      rpcResponseSchema(latestStatusMapSchema).parse(mismatched),
    ).toThrow('does not match client')
  })

  it('preserves null metric points and tagged series', () => {
    const parsed = rpcResponseSchema(metricQueryResultSchema).parse(
      metricQueryFixture,
    )
    if (!('result' in parsed)) throw new Error('Expected an RPC success')

    expect(parsed.result.series[0]?.points[2]?.value).toBeNull()
    expect(parsed.result.series[2]?.tags).toEqual({ task_id: '8' })
  })

  it('parses metric definitions including optional and localized descriptions', () => {
    const parsed = rpcResponseSchema(metricDefinitionsSchema).parse(
      metricDefinitionsFixture,
    )
    if (!('result' in parsed)) throw new Error('Expected an RPC success')

    expect(parsed.result).toHaveLength(3)
    expect(parsed.result[1]?.description).toBeUndefined()
    expect(parsed.result[2]?.description).toEqual({
      en: 'Network total upload',
      'zh-CN': '累计上传',
    })
  })

  it('keeps missing Ping statistics absent instead of coercing them to zero', () => {
    const parsed = rpcResponseSchema(pingMetricStatsResultSchema).parse(
      pingStatsFixture,
    )
    if (!('result' in parsed)) throw new Error('Expected an RPC success')

    expect(parsed.result.stats[0]?.latest).toBe(21)
    expect(parsed.result.stats[1]?.latest).toBeUndefined()
    expect(parsed.result.stats[1]?.loss).toBe(100)
  })

  it('requires a metric key and strips unsupported 1.3.2 aliases', () => {
    expect(() =>
      metricQueryParamsSchema.parse({ entity_id: 'node-online' }),
    ).toThrow()

    const parsed = metricQueryParamsSchema.parse({
      metric_key: 'cpu.usage',
      entity_id: 'node-online',
      downsample: false,
      downsample_points: 10,
    })

    expect(parsed).not.toHaveProperty('downsample')
    expect(parsed).not.toHaveProperty('downsample_points')
  })
})
