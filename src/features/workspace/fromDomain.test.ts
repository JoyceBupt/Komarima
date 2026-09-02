import { describe, expect, it } from 'vitest'
import {
  latestStatusMapSchema,
  publicNodesSchema,
  rpcResponseSchema,
} from '../../api/schemas'
import type { ThemeRuntimeSettings } from '../../api/queries'
import latestStatusFixture from '../../../tests/fixtures/komari-1.3.2/latest-status-rpc.json'
import nodesFixture from '../../../tests/fixtures/komari-1.3.2/nodes-rpc.json'
import {
  formatBytes,
  formatBillingCycle,
  formatRate,
  formatSampleAge,
  formatUptime,
  trafficUsedBytes,
  workspaceProbesFromDomain,
} from './fromDomain'

const nodesResponse = rpcResponseSchema(publicNodesSchema).parse(nodesFixture)
const statusesResponse = rpcResponseSchema(latestStatusMapSchema).parse(
  latestStatusFixture,
)
if (!('result' in nodesResponse) || !('result' in statusesResponse)) {
  throw new Error('Expected successful fixtures')
}

const settings: ThemeRuntimeSettings = {
  appearance: 'system',
  offlinePosition: 'keep',
  refreshIntervalMs: 10_000,
  staleAfterMs: 30_000,
}
const now = new Date('2026-08-30T04:00:00Z')

describe('workspaceProbesFromDomain', () => {
  const probes = workspaceProbesFromDomain({
    nodes: nodesResponse.result,
    latestStatuses: statusesResponse.result,
    settings,
    now,
  })

  it('maps live values and assigns network directions correctly', () => {
    const probe = probes.find((item) => item.id === 'node-online')

    expect(probe).toMatchObject({
      connection: 'online',
      freshness: 'fresh',
      ageLabel: '5 秒前',
      cpu: 23.5,
      memory: 50,
      disk: 50,
      ping: 21,
      publicRemark: 'Public edge',
      tags: ['production', 'asia'],
      network: {
        uploadRate: '1 KB/s',
        downloadRate: '2 KB/s',
        uploadTotal: '4.8 MB',
        downloadTotal: '8.6 MB',
      },
      traffic: {
        used: '13.4 MB',
        limit: '1 TB',
        percent: 0,
        basis: '合计',
        resetLabel: '每月1日重置',
      },
      billing: {
        price: '$8.5/月',
        remaining: null,
        expiresOn: null,
        autoRenewal: true,
        tone: 'normal',
      },
      uptime: '1天',
      memoryTotal: '8 GB',
      diskTotal: '100 GB',
    })
  })

  it('keeps the last reported metrics for an offline probe', () => {
    const probe = probes.find((item) => item.id === 'node-offline')

    expect(probe).toMatchObject({
      connection: 'offline',
      freshness: 'delayed',
      ageLabel: '20 分钟前',
      cpu: 0,
      memory: 50,
      disk: 50,
      network: {
        uploadRate: '0 B/s',
        downloadRate: '0 B/s',
        uploadTotal: '11.4 MB',
        downloadTotal: '21 MB',
      },
      traffic: {
        used: null,
        limit: null,
        percent: null,
        basis: null,
      },
      billing: {
        price: '€12/月',
        remaining: '余124天',
        expiresOn: '2027-01-01',
        autoRenewal: false,
        tone: 'normal',
      },
      uptime: '2天',
    })
  })

  it('keeps never-reported values missing instead of filling zeroes', () => {
    const probe = probes.find((item) => item.id === 'node-never-reported')

    expect(probe).toMatchObject({
      connection: 'unknown',
      freshness: 'missing',
      ageLabel: '暂无上报',
      cpu: null,
      memory: null,
      disk: null,
      ping: null,
      publicRemark: null,
      tags: [],
      network: {
        uploadRate: null,
        downloadRate: null,
        uploadTotal: null,
        downloadTotal: null,
      },
      traffic: {
        used: null,
        limit: null,
        percent: null,
        basis: null,
      },
      billing: null,
      uptime: null,
      memoryTotal: null,
      diskTotal: null,
    })
  })

  it('selects the first valid Ping by stable numeric task id', () => {
    const online = statusesResponse.result['node-online']!
    const adapted = workspaceProbesFromDomain({
      nodes: [nodesResponse.result[0]!],
      latestStatuses: {
        'node-online': {
          ...online,
          ping: {
            '10': { ...online.ping['8']!, latest: 10 },
            '2': { ...online.ping['8']!, latest: 20 },
            '1': { ...online.ping['7']!, latest: -1 },
          },
        },
      },
      settings,
      now,
    })

    expect(adapted[0]?.ping).toBe(20)
  })

  it('keeps invalid and out-of-range values distinct from missing data', () => {
    const online = statusesResponse.result['node-online']!
    const adapted = workspaceProbesFromDomain({
      nodes: [nodesResponse.result[0]!],
      latestStatuses: {
        'node-online': {
          ...online,
          cpu: -1,
          ram: 2,
          ram_total: 1,
        },
      },
      settings,
      now,
    })

    expect(adapted[0]).toMatchObject({
      dataQuality: 'invalid',
      cpu: null,
      memory: null,
    })
  })

  it('rejects an invalid reference clock', () => {
    expect(() =>
      workspaceProbesFromDomain({
        nodes: nodesResponse.result,
        latestStatuses: statusesResponse.result,
        settings,
        now: new Date('invalid'),
      }),
    ).toThrow('valid current time')
  })
})

describe('workspace value formatting', () => {
  it('formats bytes and rates with binary units without inventing values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(0.5)).toBe('0.5 B')
    expect(formatBytes(1024 ** 4 * 1.25)).toBe('1.3 TB')
    expect(formatBytes(null)).toBeNull()
    expect(formatRate(1024 ** 2 * 2.5)).toBe('2.5 MB/s')
  })

  it('formats uptime and sample ages compactly', () => {
    expect(formatUptime(0)).toBe('0秒')
    expect(formatUptime(2 * 86_400 + 3 * 3_600 + 120)).toBe('2天 3小时')
    expect(formatSampleAge('fresh', 0)).toBe('刚刚')
    expect(formatSampleAge('clock-skew', -60_000)).toBe('未来 1 分钟')
    expect(formatSampleAge('invalid', null)).toBeNull()
  })

  it('formats native billing cycles without inventing a cadence', () => {
    expect(formatBillingCycle(-1)).toBe('一次')
    expect(formatBillingCycle(30)).toBe('月')
    expect(formatBillingCycle(90)).toBe('季')
    expect(formatBillingCycle(365)).toBe('年')
    expect(formatBillingCycle(45)).toBe('45天')
    expect(formatBillingCycle(0)).toBeNull()
  })

  it('uses the configured Komari traffic limit basis', () => {
    expect(trafficUsedBytes(100, 40, 'sum')).toBe(140)
    expect(trafficUsedBytes(100, 40, 'max')).toBe(100)
    expect(trafficUsedBytes(100, 40, 'min')).toBe(40)
    expect(trafficUsedBytes(100, null, 'up')).toBe(100)
    expect(trafficUsedBytes(null, 40, 'down')).toBe(40)
    expect(trafficUsedBytes(100, null, 'sum')).toBeNull()
  })
})
