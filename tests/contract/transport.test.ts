import { describe, expect, it, vi } from 'vitest'
import { KomariApiClient } from '../../src/api/client'
import {
  ContractError,
  HttpError,
  RequestTimeoutError,
  RpcResponseError,
} from '../../src/api/errors'
import { capabilityFromError } from '../../src/domain'
import meGuestFixture from '../fixtures/komari-1.3.2/me-guest.json'
import metricDefinitionsFixture from '../fixtures/komari-1.3.2/metric-definitions-rpc.json'
import metricQueryFixture from '../fixtures/komari-1.3.2/metric-query-rpc.json'
import nodesFixture from '../fixtures/komari-1.3.2/nodes-rpc.json'
import permissionDeniedFixture from '../fixtures/komari-1.3.2/permission-denied-rpc.json'
import pingStatsFixture from '../fixtures/komari-1.3.2/ping-stats-rpc.json'
import privateSiteFixture from '../fixtures/komari-1.3.2/private-site-public.json'

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('Komari 1.3.2 transports', () => {
  it('aborts a request after the bounded transport timeout', async () => {
    let observedSignal: AbortSignal | undefined
    const client = new KomariApiClient(
      '',
      vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            observedSignal = init?.signal ?? undefined
            observedSignal?.addEventListener(
              'abort',
              () => reject(observedSignal?.reason),
              { once: true },
            )
          }),
      ) as typeof fetch,
    )

    await expect(client.getMe({ timeoutMs: 5 })).rejects.toBeInstanceOf(
      RequestTimeoutError,
    )
    expect(observedSignal?.aborted).toBe(true)
  })

  it('keeps the timeout active while reading a stalled response body', async () => {
    let observedSignal: AbortSignal | undefined
    const client = new KomariApiClient(
      '',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        observedSignal = init?.signal ?? undefined
        return new Response(
          new ReadableStream({
            start() {
              // Intentionally leave the body open to exercise the deadline.
            },
          }),
          { status: 200 },
        )
      }) as typeof fetch,
    )

    await expect(client.getMe({ timeoutMs: 5 })).rejects.toBeInstanceOf(
      RequestTimeoutError,
    )
    expect(observedSignal?.aborted).toBe(true)
  })

  it('invokes the browser fetch function with its global receiver', async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis)
      return Promise.resolve(jsonResponse(meGuestFixture))
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const client = new KomariApiClient()
      await expect(client.getMe()).resolves.toMatchObject({ logged_in: false })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('bootstraps private-site state over REST before RPC', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/public')) return jsonResponse(privateSiteFixture)
      if (url.endsWith('/api/me')) return jsonResponse(meGuestFixture)
      throw new Error(`Unexpected URL: ${url}`)
    })
    const client = new KomariApiClient('', fetchMock as typeof fetch)

    await expect(client.bootstrap()).resolves.toMatchObject({
      requiresLogin: true,
      me: { logged_in: false },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends typed JSON-RPC requests and parses results', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          method: string
          params?: unknown
        }
        expect(request.method).toBe('public:getNodesInformation')
        expect(request.params).toBeUndefined()
        return jsonResponse(nodesFixture)
      },
    )
    const client = new KomariApiClient('', fetchMock as typeof fetch)

    const nodes = await client.listNodes()
    expect(nodes.map((node) => node.uuid)).toContain('node-online')
  })

  it('separates HTTP private-site denial from JSON-RPC denial', async () => {
    const httpClient = new KomariApiClient(
      '',
      vi.fn(async () =>
        jsonResponse(
          {
            status: 'error',
            message: 'Private site is enabled, please login first.',
          },
          401,
        ),
      ) as typeof fetch,
    )
    await expect(httpClient.listNodes()).rejects.toBeInstanceOf(HttpError)

    const rpcClient = new KomariApiClient(
      '',
      vi.fn(async () => jsonResponse(permissionDeniedFixture)) as typeof fetch,
    )
    let rpcError: unknown
    try {
      await rpcClient.listNodes()
    } catch (error) {
      rpcError = error
    }
    expect(rpcError).toBeInstanceOf(RpcResponseError)
    expect(capabilityFromError(rpcError)).toBe('denied')
  })

  it('fails fast when a successful response violates the contract', async () => {
    const client = new KomariApiClient(
      '',
      vi.fn(async () =>
        jsonResponse({ jsonrpc: '2.0', id: 1, result: [{ name: 'no uuid' }] }),
      ) as typeof fetch,
    )

    await expect(client.listNodes()).rejects.toBeInstanceOf(ContractError)
  })

  it('rejects a mismatched JSON-RPC response id', async () => {
    const client = new KomariApiClient(
      '',
      vi.fn(async () =>
        jsonResponse({ jsonrpc: '2.0', id: 99, result: nodesFixture.result }),
      ) as typeof fetch,
    )

    await expect(client.listNodes()).rejects.toMatchObject({
      name: 'ContractError',
      message: 'JSON-RPC response id did not match',
    })
  })

  it('keeps non-JSON private-site responses classified as HTTP errors', async () => {
    const client = new KomariApiClient(
      '',
      vi.fn(
        async () =>
          new Response('<html>login required</html>', {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'Content-Type': 'text/html' },
          }),
      ) as typeof fetch,
    )

    await expect(client.listNodes()).rejects.toMatchObject({
      name: 'HttpError',
      status: 401,
      payload: '<html>login required</html>',
    })
  })

  it('rejects an explicit empty latest-status UUID list before transport', async () => {
    const fetchMock = vi.fn()
    const client = new KomariApiClient('', fetchMock as typeof fetch)

    await expect(client.getLatestStatuses({ uuids: [] })).rejects.toBeDefined()
    await expect(client.getLatestStatus('')).rejects.toBeDefined()
    await expect(client.getLatestStatus('   ')).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parses the public Metric definition list', async () => {
    const client = new KomariApiClient(
      '',
      vi.fn(async () => jsonResponse(metricDefinitionsFixture)) as typeof fetch,
    )

    const definitions = await client.listMetricDefinitions()
    expect(definitions.map((definition) => definition.name)).toEqual([
      'cpu.usage',
      'load.average',
      'net.total.up',
    ])
  })

  it('sends bounded counter queries with an explicit semantic aggregation', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          id: number
          params: Record<string, unknown>
        }
        expect(request.params).toMatchObject({
          metric_key: 'net.total.up',
          entity_id: 'node-online',
          hours: 4,
          max_points: 240,
          fill_empty: true,
          aggregation_by_metric: { 'net.total.up': 'last' },
        })
        return jsonResponse({ ...metricQueryFixture, id: request.id })
      },
    )
    const client = new KomariApiClient('', fetchMock as typeof fetch)

    await expect(
      client.queryMetrics({
        metric_key: 'net.total.up',
        entity_id: 'node-online',
      }),
    ).resolves.toMatchObject({ count: 3 })
  })

  it('rejects averaged, unbounded, or multi-entity P0 Metric queries', async () => {
    const fetchMock = vi.fn()
    const client = new KomariApiClient('', fetchMock as typeof fetch)

    await expect(
      client.queryMetrics({
        metric_key: 'net.total.up',
        entity_id: 'node-online',
        aggregation: 'avg',
      }),
    ).rejects.toThrow('requires last or rate')
    await expect(
      client.queryMetrics({
        metric_key: 'cpu.usage',
        entity_id: 'node-online',
        max_points: 1_000,
      }),
    ).rejects.toThrow('120 to 360')
    await expect(
      client.queryMetrics({
        metric_key: 'cpu.usage',
        entity_ids: ['node-online'],
      }),
    ).rejects.toThrow('exactly one entity_id')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parses bounded single-entity Ping statistics', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          id: number
          params: Record<string, unknown>
        }
        expect(request.params).toMatchObject({
          uuid: 'node-online',
          task_id: 8,
          hours: 1,
          max_points: 240,
        })
        return jsonResponse({ ...pingStatsFixture, id: request.id })
      },
    )
    const client = new KomariApiClient('', fetchMock as typeof fetch)

    const result = await client.getPingMetricStats({
      uuid: 'node-online',
      task_id: 8,
      hours: 1,
    })
    expect(result.stats[1]?.latest).toBeUndefined()
  })

  it('classifies RPC unimplemented as unsupported', () => {
    expect(
      capabilityFromError(new RpcResponseError(-32050, 'not implemented')),
    ).toBe('unsupported')
  })
})
