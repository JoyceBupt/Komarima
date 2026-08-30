import { describe, expect, it, vi } from 'vitest'
import {
  createKomari132Scenario,
  type Komari132Scenario,
  type Komari132ScenarioResponse,
} from '../../preview/komari132Scenario'
import { KomariApiClient } from '../../src/api/client'
import {
  latestStatusMapSchema,
  latestStatusSchema,
  meSchema,
  metricQueryResultSchema,
  publicInfoSchema,
  publicNodesSchema,
  publicPingTasksSchema,
  restEnvelopeSchema,
  rpcFailureSchema,
  rpcSuccessSchema,
} from '../../src/api/schemas'
import latestStatusFixture from '../fixtures/komari-1.3.2/latest-status-rpc.json' with { type: 'json' }
import metricQueryFixture from '../fixtures/komari-1.3.2/metric-query-rpc.json' with { type: 'json' }

const resultFrom = <T>(
  response: Komari132ScenarioResponse,
  schema: Parameters<typeof rpcSuccessSchema<T>>[0],
) => rpcSuccessSchema(schema).parse(response.body).result

const jsonResponse = ({ status, body }: Komari132ScenarioResponse) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function scenarioFetch(scenario: Komari132Scenario) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if ((init?.method ?? 'GET') === 'GET') {
      const response = scenario.handleRest(url)
      if (!response) throw new Error(`Unexpected REST request: ${url}`)
      return jsonResponse(response)
    }

    return jsonResponse(
      scenario.handleRpc(
        JSON.parse(String(init?.body)) as {
          id: string | number
          method: string
          params?: Record<string, unknown>
        },
      ),
    )
  }) as typeof fetch
}

describe('Komari 1.3.2 preview scenario', () => {
  it('serves public, private, authenticated, and denied states', () => {
    const publicScenario = createKomari132Scenario()
    const publicEnvelope = restEnvelopeSchema(publicInfoSchema).parse(
      publicScenario.handleRest('/api/public?preview=1')?.body,
    )
    const guest = meSchema.parse(
      publicScenario.handleRest('http://localhost/api/me')?.body,
    )
    expect(publicEnvelope.data.private_site).toBe(false)
    expect(guest.logged_in).toBe(false)
    expect(publicScenario.meRequests).toBe(1)
    expect(publicScenario.handleRest('/api/unknown')).toBeNull()

    const privateScenario = createKomari132Scenario({ preset: 'private' })
    const privateEnvelope = restEnvelopeSchema(publicInfoSchema).parse(
      privateScenario.handleRest('/api/public')?.body,
    )
    expect(privateEnvelope.data.private_site).toBe(true)

    privateScenario.setAuthenticated(true)
    expect(
      meSchema.parse(privateScenario.handleRest('/api/me')?.body),
    ).toMatchObject({ logged_in: true, uuid: 'admin-1' })
    const authenticatedNodes = resultFrom(
      privateScenario.handleRpc({
        id: 'nodes-authenticated',
        method: 'public:getNodesInformation',
      }),
      publicNodesSchema,
    )
    expect(authenticatedNodes.map((node) => node.uuid)).toContain('node-hidden')

    privateScenario.setAuthenticated(false)
    const guestNodes = resultFrom(
      privateScenario.handleRpc({
        id: 'nodes-guest',
        method: 'public:getNodesInformation',
      }),
      publicNodesSchema,
    )
    expect(guestNodes.map((node) => node.uuid)).not.toContain('node-hidden')

    privateScenario.setRpcDenied(true)
    expect(
      rpcFailureSchema.parse(
        privateScenario.handleRpc({
          id: 'denied',
          method: 'public:getNodesInformation',
        }).body,
      ),
    ).toMatchObject({ id: 'denied', error: { code: -32041 } })
    privateScenario.setRpcDenied(false)
    expect(
      resultFrom(
        privateScenario.handleRpc({
          id: 'recovered',
          method: 'public:getNodesInformation',
        }),
        publicNodesSchema,
      ),
    ).toHaveLength(3)
    expect(privateScenario.rpcMethods).toEqual([
      'public:getNodesInformation',
      'public:getNodesInformation',
      'public:getNodesInformation',
      'public:getNodesInformation',
    ])
  })

  it('filters latest statuses and rebases fixture time without mutation', () => {
    const fixtureBefore = JSON.stringify(latestStatusFixture)
    let currentTime = new Date('2027-02-03T12:00:00Z')
    const scenario = createKomari132Scenario({
      now: () => new Date(currentTime),
    })

    const all = resultFrom(
      scenario.handleRpc({
        id: 1,
        method: 'common:getNodesLatestStatus',
      }),
      latestStatusMapSchema,
    )
    expect(Object.keys(all)).toEqual(['node-online', 'node-offline'])
    expect(all['node-online']?.time).toBe('2027-02-03T11:59:55.000Z')
    expect(all['node-offline']?.time).toBe('2027-02-03T11:40:00.000Z')

    const selected = resultFrom(
      scenario.handleRpc({
        id: 2,
        method: 'common:getNodesLatestStatus',
        params: {
          uuids: ['node-offline', 'unknown-node', 'node-online'],
        },
      }),
      latestStatusMapSchema,
    )
    expect(Object.keys(selected)).toEqual(['node-offline', 'node-online'])

    const single = resultFrom(
      scenario.handleRpc({
        id: 3,
        method: 'common:getNodesLatestStatus',
        params: { uuid: 'node-online' },
      }),
      latestStatusSchema,
    )
    expect(single.client).toBe('node-online')

    expect(
      rpcFailureSchema.parse(
        scenario.handleRpc({
          id: 4,
          method: 'common:getNodesLatestStatus',
          params: { uuids: [] },
        }).body,
      ).error.code,
    ).toBe(-32602)

    currentTime = new Date('2027-02-03T12:00:10Z')
    const advanced = resultFrom(
      scenario.handleRpc({
        id: 5,
        method: 'common:getNodesLatestStatus',
        params: { uuid: 'node-online' },
      }),
      latestStatusSchema,
    )
    expect(advanced.time).toBe('2027-02-03T12:00:05.000Z')
    expect(JSON.stringify(latestStatusFixture)).toBe(fixtureBefore)

    const fixedScenario = createKomari132Scenario()
    const fixed = resultFrom(
      fixedScenario.handleRpc({
        id: 6,
        method: 'common:getNodesLatestStatus',
        params: { uuid: 'node-online' },
      }),
      latestStatusSchema,
    )
    expect(fixed.time).toBe(latestStatusFixture.result['node-online'].time)
  })

  it('generates every UI metric inside the requested bounded window', () => {
    const fixtureBefore = JSON.stringify(metricQueryFixture)
    const scenario = createKomari132Scenario({
      now: () => new Date('2027-02-03T12:00:00Z'),
    })
    const requests = [
      {
        metric_keys: ['cpu.usage', 'memory.used', 'disk.used', 'cpu.usage'],
        entity_id: 'node-online',
        hours: 1,
        max_points: 120,
      },
      {
        metrics: ['net.in.rate', 'net.out.rate'],
        entity_id: 'node-online',
        hours: 1,
        max_points: 120,
      },
      {
        metric_key: 'ping.latency_ms',
        entity_id: 'node-online',
        tags: { task_id: '8' },
        hours: 1,
        max_points: 120,
      },
    ]
    const results = requests.map((params, index) =>
      resultFrom(
        scenario.handleRpc({
          id: index + 1,
          method: 'public:queryMetrics',
          params,
        }),
        metricQueryResultSchema,
      ),
    )
    const series = results.flatMap((result) => result.series)

    expect(series.map((item) => item.metric_key)).toEqual([
      'cpu.usage',
      'memory.used',
      'disk.used',
      'net.in.rate',
      'net.out.rate',
      'ping.latency_ms',
    ])
    for (const result of results) {
      expect(result.start).toBe('2027-02-03T11:00:00.000Z')
      expect(result.end).toBe('2027-02-03T12:00:00.000Z')
      expect(result.count).toBe(result.series.length)
      for (const item of result.series) {
        expect(item.entity_id).toBe('node-online')
        expect(item.max_points).toBe(120)
        expect(item.count).toBe(item.points.length)
        expect(item.points.length).toBeLessThanOrEqual(120)
        expect(item.points[0]?.time).toBe(result.start)
        expect(item.points.at(-1)?.time).toBe(result.end)
      }
    }
    expect(series.find((item) => item.metric_key === 'memory.used')?.unit).toBe(
      'bytes',
    )
    expect(series.find((item) => item.metric_key === 'net.in.rate')?.unit).toBe(
      'bytes/s',
    )
    const ping = series.find((item) => item.metric_key === 'ping.latency_ms')
    expect(ping?.tags).toEqual({ task_id: '8' })
    expect(ping?.points.every((point) => point.tags?.task_id === '8')).toBe(
      true,
    )

    const capped = resultFrom(
      scenario.handleRpc({
        id: 9,
        method: 'public:queryMetrics',
        params: {
          metric_key: 'cpu.usage',
          entity_id: 'node-0499',
          hours: 168,
          max_points: 3,
        },
      }),
      metricQueryResultSchema,
    )
    expect(capped.series[0]).toMatchObject({
      entity_id: 'node-0499',
      max_points: 3,
      count: 3,
    })
    expect(JSON.stringify(metricQueryFixture)).toBe(fixtureBefore)
  })

  it('supports scale and Ping fault options without widening failures', () => {
    const scale = createKomari132Scenario({ preset: 'scale-500' })
    const nodes = resultFrom(
      scale.handleRpc({ id: 1, method: 'public:getNodesInformation' }),
      publicNodesSchema,
    )
    expect(nodes).toHaveLength(500)
    expect(new Set(nodes.map((node) => node.uuid))).toHaveLength(500)

    const selected = resultFrom(
      scale.handleRpc({
        id: 2,
        method: 'common:getNodesLatestStatus',
        params: { uuids: ['node-0000', 'node-0499', 'unknown'] },
      }),
      latestStatusMapSchema,
    )
    expect(Object.keys(selected)).toEqual(['node-0000', 'node-0499'])
    expect(selected['node-0499']?.client).toBe('node-0499')

    const pingScenario = createKomari132Scenario({
      unassignedDefaultPing: true,
      failPingTasks: true,
    })
    expect(
      rpcFailureSchema.parse(
        pingScenario.handleRpc({
          id: 3,
          method: 'public:getPublicPingTasks',
        }).body,
      ).error.code,
    ).toBe(-32051)
    const metric = resultFrom(
      pingScenario.handleRpc({
        id: 4,
        method: 'public:queryMetrics',
        params: {
          metric_key: 'cpu.usage',
          entity_id: 'node-online',
          max_points: 120,
          hours: 1,
        },
      }),
      metricQueryResultSchema,
    )
    expect(metric.series).toHaveLength(1)

    const unassigned = createKomari132Scenario({
      unassignedDefaultPing: true,
    })
    expect(
      resultFrom(
        unassigned.handleRpc({
          id: 5,
          method: 'public:getPublicPingTasks',
        }),
        publicPingTasksSchema,
      )[0],
    ).toMatchObject({ default_on: true, clients: [] })
    expect(() => createKomari132Scenario({ nodeCount: 0 })).toThrow('1 to 500')
    expect(() => createKomari132Scenario({ nodeCount: 501 })).toThrow(
      '1 to 500',
    )
  })

  it('round-trips scenario responses through KomariApiClient contracts', async () => {
    const scenario = createKomari132Scenario({
      now: () => new Date('2027-02-03T12:00:00Z'),
    })
    const client = new KomariApiClient('', scenarioFetch(scenario))

    await expect(client.bootstrap()).resolves.toMatchObject({
      requiresLogin: false,
      me: { logged_in: false },
    })
    await expect(client.listNodes()).resolves.toHaveLength(3)
    await expect(client.listMetricDefinitions()).resolves.toHaveLength(3)
    await expect(
      client.getLatestStatuses({ uuids: ['node-online'] }),
    ).resolves.toEqual(
      expect.objectContaining({
        'node-online': expect.objectContaining({ client: 'node-online' }),
      }),
    )
    await expect(client.getLatestStatus('node-online')).resolves.toMatchObject({
      client: 'node-online',
    })
    await expect(
      client.queryMetrics({
        metric_keys: ['cpu.usage', 'memory.used', 'disk.used'],
        entity_id: 'node-online',
        hours: 1,
        max_points: 120,
      }),
    ).resolves.toMatchObject({ count: 3 })
    await expect(client.listPingTasks()).resolves.toHaveLength(1)
  })

  it('rejects history windows beyond the public query policy', () => {
    const scenario = createKomari132Scenario({
      now: () => new Date('2027-02-03T12:00:00Z'),
    })
    const response = scenario.handleRpc({
      id: 1,
      method: 'public:queryMetrics',
      params: {
        metric_key: 'cpu.usage',
        entity_id: 'node-online',
        hours: 721,
        max_points: 120,
      },
    })

    expect(rpcFailureSchema.parse(response.body).error.code).toBe(-32602)
  })
})
