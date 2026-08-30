import type { MetricQueryParams, PingMetricStatsParams } from '../schemas'
import type { BootstrapResult, KomariApiClient } from '../client'

const scope = (client: KomariApiClient) => client.baseUrl || 'same-origin'

export const publicDataAccessScope = (
  bootstrap: BootstrapResult | undefined,
) => {
  if (!bootstrap) return 'pending'
  if (bootstrap.requiresLogin) return 'blocked'
  if (bootstrap.me.logged_in) {
    return `user:${bootstrap.me.uuid || bootstrap.me.username}`
  }
  return bootstrap.publicInfo.private_site ? 'guest:shared' : 'guest:public'
}

export const normalizeUuidSelection = (uuids?: string[]) =>
  uuids
    ? [...new Set(uuids.map((uuid) => uuid.trim()).filter(Boolean))].sort()
    : undefined

export const komariQueryKeys = {
  root: (client: KomariApiClient) => ['komari', scope(client)] as const,
  bootstrap: (client: KomariApiClient) =>
    [...komariQueryKeys.root(client), 'bootstrap'] as const,
  dataRoot: (client: KomariApiClient) =>
    [...komariQueryKeys.root(client), 'access'] as const,
  access: (client: KomariApiClient, bootstrap: BootstrapResult | undefined) =>
    [
      ...komariQueryKeys.dataRoot(client),
      publicDataAccessScope(bootstrap),
    ] as const,
  nodes: (client: KomariApiClient, bootstrap: BootstrapResult | undefined) =>
    [...komariQueryKeys.access(client, bootstrap), 'nodes'] as const,
  latestStatuses: (
    client: KomariApiClient,
    bootstrap: BootstrapResult | undefined,
    uuids?: string[],
  ) =>
    [
      ...komariQueryKeys.access(client, bootstrap),
      'latest-statuses',
      normalizeUuidSelection(uuids) ?? 'all',
    ] as const,
  metricDefinitions: (
    client: KomariApiClient,
    bootstrap: BootstrapResult | undefined,
  ) =>
    [
      ...komariQueryKeys.access(client, bootstrap),
      'metric-definitions',
    ] as const,
  metrics: (
    client: KomariApiClient,
    bootstrap: BootstrapResult | undefined,
    params: MetricQueryParams,
  ) =>
    [...komariQueryKeys.access(client, bootstrap), 'metrics', params] as const,
  pingTasks: (
    client: KomariApiClient,
    bootstrap: BootstrapResult | undefined,
  ) => [...komariQueryKeys.access(client, bootstrap), 'ping-tasks'] as const,
  pingStats: (
    client: KomariApiClient,
    bootstrap: BootstrapResult | undefined,
    params: PingMetricStatsParams,
  ) =>
    [
      ...komariQueryKeys.access(client, bootstrap),
      'ping-stats',
      params,
    ] as const,
}
