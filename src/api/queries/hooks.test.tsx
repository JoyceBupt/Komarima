import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BootstrapResult, KomariApiClient } from '../client'
import {
  ContractError,
  HttpError,
  RequestTimeoutError,
  RpcResponseError,
} from '../errors'
import {
  isPublicDataAccessDenied,
  revokePublicDataAccess,
  useBootstrapQuery,
  useLatestStatusesQuery,
  useMetricQuery,
  useNodesQuery,
  usePingMetricStatsQuery,
  retryPublicRead,
} from './hooks'
import { komariQueryKeys, publicDataAccessScope } from './keys'
import { QueryPolicyError } from './policy'
import { usePageVisibility } from './visibility'

const publicBootstrap = {
  publicInfo: {
    sitename: 'Komarima Lab',
    description: 'Probe workspace',
    custom_head: '',
    custom_body: '',
    oauth_enable: true,
    oauth_provider: 'github',
    disable_password_login: false,
    cors_origin_check_enabled: true,
    record_enabled: true,
    record_preserve_time: 720,
    ping_record_preserve_time: 720,
    private_site: false,
    visitor_audit_enabled: false,
    theme: 'Komarima',
    theme_settings: {
      refreshIntervalSeconds: 5,
      staleAfterSeconds: 30,
    },
  },
  me: { username: 'Guest', logged_in: false },
  requiresLogin: false,
} satisfies BootstrapResult

const privateBootstrap = {
  ...publicBootstrap,
  publicInfo: { ...publicBootstrap.publicInfo, private_site: true },
  requiresLogin: true,
} satisfies BootstrapResult

const adminBootstrap = {
  ...publicBootstrap,
  me: {
    username: 'owner',
    uuid: 'admin-1',
    logged_in: true,
  },
} satisfies BootstrapResult

const createMockClient = () =>
  ({
    baseUrl: '',
    bootstrap: vi.fn(async () => publicBootstrap),
    listNodes: vi.fn(async () => []),
    getLatestStatuses: vi.fn(async () => ({})),
    queryMetrics: vi.fn(async () => ({
      start: '2026-08-30T03:00:00Z',
      end: '2026-08-30T04:00:00Z',
      server_downsample_default: true as const,
      default_points: 500,
      series: [],
      count: 0,
    })),
    getPingMetricStats: vi.fn(async () => ({
      start: '2026-08-30T03:00:00Z',
      end: '2026-08-30T04:00:00Z',
      stats: [],
      count: 0,
    })),
  }) as unknown as KomariApiClient

const createWrapper = (config: QueryClientConfig = {}) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
    },
    ...config,
  })

  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('public query gates', () => {
  it('isolates public-data keys by authenticated identity', () => {
    const api = createMockClient()

    expect(publicDataAccessScope(publicBootstrap)).toBe('guest:public')
    expect(publicDataAccessScope(privateBootstrap)).toBe('blocked')
    expect(publicDataAccessScope(adminBootstrap)).toBe('user:admin-1')
    expect(komariQueryKeys.nodes(api, adminBootstrap)).not.toEqual(
      komariQueryKeys.nodes(api, publicBootstrap),
    )
  })

  it('removes public data and blocks rendering after access denial', async () => {
    const api = createMockClient()
    const { client } = createWrapper()
    client.setQueryData(komariQueryKeys.bootstrap(api), adminBootstrap)
    client.setQueryData(komariQueryKeys.nodes(api, adminBootstrap), [
      { uuid: 'hidden-node' },
    ])

    await revokePublicDataAccess(client, api)

    expect(client.getQueryData(komariQueryKeys.bootstrap(api))).toMatchObject({
      requiresLogin: true,
    })
    expect(
      client.getQueriesData({ queryKey: komariQueryKeys.dataRoot(api) }),
    ).toEqual([])
  })

  it('loads bootstrap over REST once', async () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useBootstrapQuery(api), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.bootstrap).toHaveBeenCalledTimes(1)
    expect(result.current.data?.requiresLogin).toBe(false)
  })

  it('does not request nodes for an anonymous private site', async () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useNodesQuery(api, privateBootstrap), {
      wrapper,
    })

    await act(async () => Promise.resolve())
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.listNodes).not.toHaveBeenCalled()
  })

  it('requests node metadata once the public-data gate opens', async () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useNodesQuery(api, publicBootstrap), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listNodes).toHaveBeenCalledTimes(1)
  })
})

describe('visibility and polling', () => {
  it('tracks page visibility as an external browser state', () => {
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    )
    const { result } = renderHook(() => usePageVisibility())

    expect(result.current).toBe(true)
    act(() => {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(false)
  })

  it('does not overlap latest-status polls and stops them while hidden', async () => {
    vi.useFakeTimers()
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    )

    const api = createMockClient()
    const resolvers: Array<(value: Record<string, never>) => void> = []
    vi.mocked(api.getLatestStatuses).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const { wrapper } = createWrapper()
    renderHook(
      () => useLatestStatusesQuery(api, publicBootstrap, ['b', 'a', 'a']),
      { wrapper },
    )

    await act(async () => Promise.resolve())
    expect(api.getLatestStatuses).toHaveBeenCalledTimes(1)
    expect(api.getLatestStatuses).toHaveBeenCalledWith(
      { uuids: ['a', 'b'] },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    await act(async () => vi.advanceTimersByTimeAsync(15_000))
    expect(api.getLatestStatuses).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolvers[0]?.({})
      await Promise.resolve()
    })
    await act(async () => vi.advanceTimersByTimeAsync(5_000))
    expect(api.getLatestStatuses).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolvers[1]?.({})
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    await act(async () => vi.advanceTimersByTimeAsync(15_000))
    expect(api.getLatestStatuses).toHaveBeenCalledTimes(2)
  })

  it('aborts an in-flight history request when the view closes', async () => {
    const api = createMockClient()
    let observedSignal: AbortSignal | undefined
    vi.mocked(api.queryMetrics).mockImplementation(
      (_params, options) =>
        new Promise((_resolve, reject) => {
          observedSignal = options?.signal
          observedSignal?.addEventListener(
            'abort',
            () => reject(observedSignal?.reason),
            { once: true },
          )
        }),
    )
    const { wrapper } = createWrapper()
    const params = {
      metric_key: 'cpu.usage',
      entity_id: 'node-a',
      hours: 1,
      max_points: 240,
    }
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useMetricQuery(api, publicBootstrap, params, active),
      { wrapper, initialProps: { active: true } },
    )

    await waitFor(() => expect(observedSignal).toBeDefined())
    rerender({ active: false })
    await waitFor(() => expect(observedSignal?.aborted).toBe(true))
  })

  it('does not turn an explicit empty node selection into an all-node query', async () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()
    const { result } = renderHook(
      () => useLatestStatusesQuery(api, publicBootstrap, []),
      { wrapper },
    )

    await act(async () => Promise.resolve())
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.getLatestStatuses).not.toHaveBeenCalled()
  })
})

describe('on-demand history queries', () => {
  it('waits for a concrete metric request and explicit entity selection', async () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()
    let params: Parameters<typeof useMetricQuery>[2] = null
    const { rerender } = renderHook(
      () => useMetricQuery(api, publicBootstrap, params, true),
      { wrapper },
    )

    expect(api.queryMetrics).not.toHaveBeenCalled()
    params = {
      metric_key: 'cpu.usage',
      entity_id: 'node-a',
      hours: 1,
      max_points: 240,
      fill_empty: true,
    }
    rerender()
    await waitFor(() => expect(api.queryMetrics).toHaveBeenCalledTimes(1))
  })

  it('fails fast instead of accidentally querying history for every node', () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()

    expect(() =>
      renderHook(
        () =>
          useMetricQuery(
            api,
            publicBootstrap,
            { metric_key: 'cpu.usage', hours: 1 },
            true,
          ),
        { wrapper },
      ),
    ).toThrow('P0 Metric history requires exactly one entity_id')
  })

  it('gates Ping history behind both activation and public access', async () => {
    const api = createMockClient()
    const { wrapper } = createWrapper()
    const params = { uuid: 'node-a', task_id: 8, hours: 1 }
    const { rerender } = renderHook(
      ({ access, active }: { access: BootstrapResult; active: boolean }) =>
        usePingMetricStatsQuery(api, access, params, active),
      {
        wrapper,
        initialProps: {
          access: privateBootstrap as BootstrapResult,
          active: true as boolean,
        },
      },
    )

    expect(api.getPingMetricStats).not.toHaveBeenCalled()
    rerender({ access: publicBootstrap, active: false })
    expect(api.getPingMetricStats).not.toHaveBeenCalled()
    rerender({ access: publicBootstrap, active: true })
    await waitFor(() => expect(api.getPingMetricStats).toHaveBeenCalledTimes(1))
  })
})

describe('retry policy', () => {
  it('recognizes HTTP and RPC access revocation', () => {
    expect(isPublicDataAccessDenied(new HttpError(401, 'denied', {}))).toBe(
      true,
    )
    expect(isPublicDataAccessDenied(new HttpError(403, 'denied', {}))).toBe(
      true,
    )
    expect(
      isPublicDataAccessDenied(new RpcResponseError(-32040, 'login')),
    ).toBe(true)
    expect(isPublicDataAccessDenied(new HttpError(500, 'error', {}))).toBe(
      false,
    )
  })

  it('does not retry contract, permission, or invalid-parameter failures', () => {
    expect(retryPublicRead(0, new ContractError('/api', 'bad', {}))).toBe(false)
    expect(retryPublicRead(0, new RpcResponseError(-32041, 'denied'))).toBe(
      false,
    )
    expect(retryPublicRead(0, new RpcResponseError(-32602, 'invalid'))).toBe(
      false,
    )
    expect(
      retryPublicRead(0, new RpcResponseError(-32050, 'not implemented')),
    ).toBe(false)
    expect(retryPublicRead(0, new QueryPolicyError('unsafe query'))).toBe(false)
    expect(retryPublicRead(0, new RequestTimeoutError('/api', 15_000))).toBe(
      false,
    )
    expect(retryPublicRead(0, new HttpError(401, 'denied', {}))).toBe(false)
    expect(retryPublicRead(0, new HttpError(503, 'unavailable', {}))).toBe(true)
  })
})
