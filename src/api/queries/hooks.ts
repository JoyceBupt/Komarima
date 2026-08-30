import {
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import type { BootstrapResult, KomariApiClient } from '../client'
import {
  ContractError,
  HttpError,
  RequestTimeoutError,
  RpcResponseError,
} from '../errors'
import type {
  MetricQueryParams,
  MetricQueryResult,
  MetricSeries,
  PingMetricStatsParams,
} from '../schemas'
import { komariQueryKeys, normalizeUuidSelection } from './keys'
import {
  normalizeP0MetricQueryParams,
  normalizeP0PingStatsParams,
  P0_MAX_PING_TASKS_PER_QUERY,
  QueryPolicyError,
} from './policy'
import { settingsFromBootstrap } from './settings'
import { usePageVisibility } from './visibility'

const canReadPublicData = (bootstrap: BootstrapResult | undefined) =>
  Boolean(bootstrap && !bootstrap.requiresLogin)

export const isPublicDataAccessDenied = (error: unknown) =>
  (error instanceof HttpError &&
    (error.status === 401 || error.status === 403)) ||
  (error instanceof RpcResponseError &&
    (error.code === -32040 || error.code === -32041))

export const shouldRecoverPublicDataAccess = (
  accessScope: string,
  recoveredScopes: ReadonlySet<string>,
  error: unknown,
) =>
  accessScope !== 'pending' &&
  accessScope !== 'blocked' &&
  isPublicDataAccessDenied(error) &&
  !recoveredScopes.has(accessScope)

export async function revokePublicDataAccess(
  queryClient: QueryClient,
  client: KomariApiClient,
) {
  queryClient.setQueryData<BootstrapResult>(
    komariQueryKeys.bootstrap(client),
    (current) =>
      current
        ? {
            ...current,
            requiresLogin: true,
          }
        : current,
  )
  await queryClient.cancelQueries({
    queryKey: komariQueryKeys.dataRoot(client),
  })
  queryClient.removeQueries({ queryKey: komariQueryKeys.dataRoot(client) })
  await queryClient.invalidateQueries({
    queryKey: komariQueryKeys.bootstrap(client),
    exact: true,
  })
}

function useCancelWhenDisabled(queryKey: QueryKey, enabled: boolean) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled) {
      void queryClient.cancelQueries({ queryKey, exact: true })
    }
  }, [enabled, queryClient, queryKey])
}

function combineMetricQueryResults(
  results: Array<UseQueryResult<MetricQueryResult>>,
) {
  const errors = results.flatMap((result) =>
    result.error ? [result.error] : [],
  )
  const error =
    errors.find((candidate) => isPublicDataAccessDenied(candidate)) ??
    errors[0] ??
    null

  return {
    series: results.flatMap((result) => result.data?.series ?? []),
    error,
    isError: results.some((result) => result.isError),
    isPending: results.some((result) => result.isPending),
    isFetching: results.some((result) => result.isFetching),
    refetch: () => Promise.all(results.map((result) => result.refetch())),
  }
}

export const retryPublicRead = (failureCount: number, error: unknown) => {
  if (failureCount >= 2) return false
  if (error instanceof ContractError) return false
  if (error instanceof QueryPolicyError) return false
  if (error instanceof RequestTimeoutError) return false
  if (error instanceof RpcResponseError) {
    return ![-32601, -32602, -32040, -32041, -32050].includes(error.code)
  }
  if (error instanceof HttpError) {
    return error.status >= 500
  }
  return true
}

export const useBootstrapQuery = (client: KomariApiClient) => {
  const pageVisible = usePageVisibility()
  return useQuery({
    queryKey: komariQueryKeys.bootstrap(client),
    queryFn: ({ signal }) => client.bootstrap({ signal }),
    staleTime: 30_000,
    retry: retryPublicRead,
    refetchInterval: pageVisible ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}

export const useNodesQuery = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
) => {
  const pageVisible = usePageVisibility()
  const enabled = canReadPublicData(bootstrap)
  const queryKey = komariQueryKeys.nodes(client, bootstrap)
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => client.listNodes({ signal }),
    enabled,
    staleTime: 60_000,
    retry: retryPublicRead,
    refetchInterval: enabled && pageVisible ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  useCancelWhenDisabled(queryKey, enabled)
  return query
}

export const useLatestStatusesQuery = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
  uuids?: string[],
) => {
  const pageVisible = usePageVisibility()
  const settings = settingsFromBootstrap(bootstrap)
  const normalizedUuids = normalizeUuidSelection(uuids)
  const hasRequestedNodes =
    normalizedUuids === undefined || normalizedUuids.length > 0
  const enabled =
    canReadPublicData(bootstrap) && pageVisible && hasRequestedNodes

  const queryKey = komariQueryKeys.latestStatuses(
    client,
    bootstrap,
    normalizedUuids,
  )
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      client.getLatestStatuses(
        normalizedUuids ? { uuids: normalizedUuids } : {},
        { signal },
      ),
    enabled,
    staleTime: Math.min(settings.refreshIntervalMs, 5_000),
    retry: retryPublicRead,
    refetchInterval: enabled ? settings.refreshIntervalMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  useCancelWhenDisabled(queryKey, enabled)
  return query
}

export const useMetricDefinitionsQuery = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
  active: boolean,
) => {
  const pageVisible = usePageVisibility()
  const enabled = canReadPublicData(bootstrap) && active && pageVisible
  const queryKey = komariQueryKeys.metricDefinitions(client, bootstrap)
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => client.listMetricDefinitions({ signal }),
    enabled,
    staleTime: 5 * 60_000,
    retry: retryPublicRead,
    refetchOnWindowFocus: false,
  })
  useCancelWhenDisabled(queryKey, enabled)
  return query
}

export const useMetricQuery = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
  params: MetricQueryParams | null,
  active: boolean,
) => {
  const pageVisible = usePageVisibility()
  const fallbackParams: MetricQueryParams = {
    metric_key: '__inactive__',
    entity_id: '__inactive__',
  }
  let policyError: QueryPolicyError | null = null
  let queryParams = fallbackParams
  if (params) {
    try {
      queryParams = normalizeP0MetricQueryParams(params)
    } catch (error) {
      if (!(error instanceof QueryPolicyError)) throw error
      policyError = error
    }
  }

  const enabled =
    canReadPublicData(bootstrap) &&
    Boolean(params) &&
    !policyError &&
    active &&
    pageVisible
  const queryKey = komariQueryKeys.metrics(client, bootstrap, queryParams)
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => client.queryMetrics(queryParams, { signal }),
    enabled,
    staleTime: 30_000,
    retry: retryPublicRead,
    refetchOnWindowFocus: false,
  })
  useCancelWhenDisabled(queryKey, enabled)

  if (policyError) throw policyError
  return query
}

export const usePingMetricQueries = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
  params: ReadonlyArray<MetricQueryParams>,
  active: boolean,
) => {
  const pageVisible = usePageVisibility()
  const queryClient = useQueryClient()
  let policyError: QueryPolicyError | null = null
  let queryParams: MetricQueryParams[] = []

  if (params.length > P0_MAX_PING_TASKS_PER_QUERY) {
    policyError = new QueryPolicyError(
      `P0 Ping history accepts at most ${P0_MAX_PING_TASKS_PER_QUERY} tasks`,
    )
  } else {
    try {
      queryParams = params.map((params) => {
        const normalized = normalizeP0MetricQueryParams(params)
        const metricKeys = [
          normalized.metric_key,
          ...(normalized.metric_keys ?? []),
        ].filter((key): key is string => Boolean(key))
        if (metricKeys.length !== 1 || metricKeys[0] !== 'ping.latency_ms') {
          throw new QueryPolicyError(
            'Parallel Ping history only accepts ping.latency_ms',
          )
        }
        return normalized
      })
    } catch (error) {
      if (!(error instanceof QueryPolicyError)) throw error
      policyError = error
    }
  }

  const enabled =
    canReadPublicData(bootstrap) &&
    queryParams.length > 0 &&
    !policyError &&
    active &&
    pageVisible
  const queryKeys = queryParams.map((queryParams) =>
    komariQueryKeys.metrics(client, bootstrap, queryParams),
  )
  const query = useQueries({
    queries: queryParams.map((queryParams, index) => ({
      queryKey: queryKeys[index]!,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const result = await client.queryMetrics(queryParams, { signal })
        const taskId = queryParams.tags?.task_id
        if (taskId === undefined) return result

        return {
          ...result,
          series: result.series.map((series): MetricSeries => ({
            ...series,
            tags: { ...series.tags, task_id: taskId },
          })),
        }
      },
      enabled,
      staleTime: 30_000,
      retry: retryPublicRead,
      refetchOnWindowFocus: false,
    })),
    combine: combineMetricQueryResults,
  })

  useEffect(() => {
    if (enabled) return
    for (const queryKey of queryKeys) {
      void queryClient.cancelQueries({ queryKey, exact: true })
    }
  }, [enabled, queryClient, queryKeys])

  if (policyError) throw policyError
  return {
    ...query,
    isPending: enabled && query.isPending,
  }
}

export const usePingTasksQuery = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
  active: boolean,
) => {
  const pageVisible = usePageVisibility()
  const enabled = canReadPublicData(bootstrap) && active && pageVisible
  const queryKey = komariQueryKeys.pingTasks(client, bootstrap)
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => client.listPingTasks({ signal }),
    enabled,
    staleTime: 5 * 60_000,
    retry: retryPublicRead,
    refetchOnWindowFocus: false,
  })
  useCancelWhenDisabled(queryKey, enabled)
  return query
}

export const usePingMetricStatsQuery = (
  client: KomariApiClient,
  bootstrap: BootstrapResult | undefined,
  params: PingMetricStatsParams | null,
  active: boolean,
) => {
  const pageVisible = usePageVisibility()
  const fallbackParams: PingMetricStatsParams = { uuid: '__inactive__' }
  let policyError: QueryPolicyError | null = null
  let queryParams = fallbackParams
  if (params) {
    try {
      queryParams = normalizeP0PingStatsParams(params)
    } catch (error) {
      if (!(error instanceof QueryPolicyError)) throw error
      policyError = error
    }
  }

  const enabled =
    canReadPublicData(bootstrap) &&
    Boolean(params) &&
    !policyError &&
    active &&
    pageVisible
  const queryKey = komariQueryKeys.pingStats(client, bootstrap, queryParams)
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => client.getPingMetricStats(queryParams, { signal }),
    enabled,
    staleTime: 30_000,
    retry: retryPublicRead,
    refetchOnWindowFocus: false,
  })
  useCancelWhenDisabled(queryKey, enabled)

  if (policyError) throw policyError
  return query
}
