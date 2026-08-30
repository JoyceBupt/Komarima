import type { z } from 'zod'
import {
  latestStatusMapSchema,
  latestStatusParamsSchema,
  latestStatusSchema,
  meSchema,
  metricDefinitionsSchema,
  metricQueryParamsSchema,
  metricQueryResultSchema,
  pingMetricStatsParamsSchema,
  pingMetricStatsResultSchema,
  publicInfoSchema,
  publicNodesSchema,
  publicPingTasksSchema,
  restEnvelopeSchema,
  rpcMethodsSchema,
  versionInfoSchema,
} from './schemas'
import type {
  LatestStatus,
  LatestStatusParams,
  Me,
  MetricDefinition,
  MetricQueryParams,
  MetricQueryResult,
  PingMetricStatsParams,
  PingMetricStatsResult,
  PublicInfo,
  PublicNode,
  PublicPingTask,
  VersionInfo,
} from './schemas'
import {
  JsonTransport,
  type FetchLike,
  type TransportOptions,
} from './transport'
import {
  normalizeP0MetricQueryParams,
  normalizeP0PingStatsParams,
} from './queries/policy'

export interface BootstrapResult {
  publicInfo: PublicInfo
  me: Me
  requiresLogin: boolean
}

export class KomariApiClient {
  private requestId = 0
  private readonly transport: JsonTransport
  readonly baseUrl: string

  constructor(baseUrl = '', fetchImpl?: FetchLike) {
    this.baseUrl = baseUrl
    this.transport = new JsonTransport(baseUrl, fetchImpl)
  }

  async getPublicInfo(options?: TransportOptions): Promise<PublicInfo> {
    const response = await this.transport.get(
      '/api/public',
      restEnvelopeSchema(publicInfoSchema),
      options,
    )
    return response.data
  }

  getMe(options?: TransportOptions): Promise<Me> {
    return this.transport.get('/api/me', meSchema, options)
  }

  async bootstrap(options?: TransportOptions): Promise<BootstrapResult> {
    const [publicInfo, me] = await Promise.all([
      this.getPublicInfo(options),
      this.getMe(options),
    ])

    return {
      publicInfo,
      me,
      requiresLogin: publicInfo.private_site && !me.logged_in,
    }
  }

  async getVersion(options?: TransportOptions): Promise<VersionInfo> {
    return this.call('common:getVersion', undefined, versionInfoSchema, options)
  }

  listNodes(options?: TransportOptions): Promise<PublicNode[]> {
    return this.call(
      'public:getNodesInformation',
      undefined,
      publicNodesSchema,
      options,
    )
  }

  async getLatestStatuses(
    params: Omit<LatestStatusParams, 'uuid'> = {},
    options?: TransportOptions,
  ): Promise<Record<string, LatestStatus>> {
    const parsed = latestStatusParamsSchema.parse(params)
    return this.call(
      'common:getNodesLatestStatus',
      parsed,
      latestStatusMapSchema,
      options,
    )
  }

  async getLatestStatus(
    uuid: string,
    options?: TransportOptions,
  ): Promise<LatestStatus> {
    const params = latestStatusParamsSchema.parse({ uuid })
    return this.call(
      'common:getNodesLatestStatus',
      params,
      latestStatusSchema,
      options,
    )
  }

  listMetricDefinitions(
    options?: TransportOptions,
  ): Promise<MetricDefinition[]> {
    return this.call(
      'public:listMetricDefinitions',
      undefined,
      metricDefinitionsSchema,
      options,
    )
  }

  async queryMetrics(
    params: MetricQueryParams,
    options?: TransportOptions,
  ): Promise<MetricQueryResult> {
    const parsed = normalizeP0MetricQueryParams(
      metricQueryParamsSchema.parse(params),
    )
    return this.call(
      'public:queryMetrics',
      parsed,
      metricQueryResultSchema,
      options,
    )
  }

  listPingTasks(options?: TransportOptions): Promise<PublicPingTask[]> {
    return this.call(
      'public:getPublicPingTasks',
      undefined,
      publicPingTasksSchema,
      options,
    )
  }

  async getPingMetricStats(
    params: PingMetricStatsParams,
    options?: TransportOptions,
  ): Promise<PingMetricStatsResult> {
    const parsed = normalizeP0PingStatsParams(
      pingMetricStatsParamsSchema.parse(params),
    )
    return this.call(
      'public:getPingMetricStats',
      parsed,
      pingMetricStatsResultSchema,
      options,
    )
  }

  listRpcMethods(options?: TransportOptions): Promise<string[]> {
    return this.call('rpc.methods', {}, rpcMethodsSchema, options)
  }

  private call<T>(
    method: string,
    params: unknown,
    resultSchema: z.ZodType<T>,
    options?: TransportOptions,
  ): Promise<T> {
    this.requestId += 1
    return this.transport.rpc(
      method,
      params,
      resultSchema,
      this.requestId,
      options,
    )
  }
}
