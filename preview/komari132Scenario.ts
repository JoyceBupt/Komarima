import latestStatusResponse from '../tests/fixtures/komari-1.3.2/latest-status-rpc.json' with { type: 'json' }
import meGuest from '../tests/fixtures/komari-1.3.2/me-guest.json' with { type: 'json' }
import metricDefinitionsResponse from '../tests/fixtures/komari-1.3.2/metric-definitions-rpc.json' with { type: 'json' }
import metricQueryResponse from '../tests/fixtures/komari-1.3.2/metric-query-rpc.json' with { type: 'json' }
import nodesResponse from '../tests/fixtures/komari-1.3.2/nodes-rpc.json' with { type: 'json' }
import permissionDeniedResponse from '../tests/fixtures/komari-1.3.2/permission-denied-rpc.json' with { type: 'json' }
import privateSitePublic from '../tests/fixtures/komari-1.3.2/private-site-public.json' with { type: 'json' }
import publicInfo from '../tests/fixtures/komari-1.3.2/public-info.json' with { type: 'json' }
export type Komari132ScenarioPreset = 'public' | 'private' | 'scale-500'

export interface Komari132ScenarioOptions {
  preset?: Komari132ScenarioPreset
  privateSite?: boolean
  nodeCount?: number
  authenticated?: boolean
  rpcDenied?: boolean
  unassignedDefaultPing?: boolean
  failPingTasks?: boolean
  now?: () => Date
}

export interface Komari132ScenarioResponse {
  status: number
  body: unknown
}

export interface Komari132RpcRequest {
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface Komari132Scenario {
  handleRest(path: string): Komari132ScenarioResponse | null
  handleRpc(request: Komari132RpcRequest): Komari132ScenarioResponse
  readonly rpcMethods: string[]
  readonly meRequests: number
  setAuthenticated(value: boolean): void
  setRpcDenied(value: boolean): void
}

type ScenarioNode = (typeof nodesResponse.result)[number]

interface ScenarioLatestStatus extends Record<string, unknown> {
  client: string
  time: string
  cpu: number
  online: boolean
  ping: Record<string, unknown>
}

const fixtureWindowEndMs = Date.parse(metricQueryResponse.result.end)
const maximumGeneratedPoints = 360
const maximumHistoryHours = 24 * 30
const maximumNodes = 500

const pingTasks = [
  {
    id: 8,
    weight: 1,
    name: 'Tokyo ICMP',
    clients: ['node-online'],
    default_on: true,
    type: 'icmp',
    interval: 60,
  },
]

const metricSpecs = {
  'cpu.usage': ['%', 28, 16],
  'memory.used': ['bytes', 4_294_967_296, 536_870_912],
  'disk.used': ['bytes', 53_687_091_200, 1_073_741_824],
  'net.in.rate': ['bytes/s', 2_097_152, 786_432],
  'net.out.rate': ['bytes/s', 1_048_576, 393_216],
  'ping.latency_ms': ['ms', 24, 7],
} as const

const clone = <T>(value: T): T => structuredClone(value)

const pathname = (path: string) => {
  try {
    return new URL(path, 'http://komarima.local').pathname
  } catch {
    return path.split('?')[0]
  }
}

const rpcSuccess = (
  id: string | number,
  result: unknown,
): Komari132ScenarioResponse => ({
  status: 200,
  body: { jsonrpc: '2.0', id, result },
})

const rpcError = (
  id: string | number,
  code: number,
  message: string,
): Komari132ScenarioResponse => ({
  status: 200,
  body: { jsonrpc: '2.0', id, error: { code, message } },
})

const requestedMetricKeys = (params: Record<string, unknown> | undefined) => {
  if (!params) return []
  const values = [
    params.metric_key,
    ...(Array.isArray(params.metric_keys) ? params.metric_keys : []),
    ...(Array.isArray(params.metrics) ? params.metrics : []),
  ]
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
}

const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function queryWindow(
  params: Record<string, unknown> | undefined,
  now: (() => Date) | undefined,
) {
  const hours = finiteNumber(params?.hours) ?? 4
  if (hours <= 0 || hours > maximumHistoryHours) return null
  const endDate = now ? now() : new Date(fixtureWindowEndMs)
  if (!Number.isFinite(endDate.getTime())) {
    throw new Error('Komari preview now() must return a valid Date')
  }
  return {
    start: new Date(endDate.getTime() - hours * 3_600_000),
    end: endDate,
  }
}

function createMetricSeries(
  metricKey: string,
  entityId: string,
  taskId: string,
  start: Date,
  end: Date,
  maxPoints: number,
) {
  const spec = metricSpecs[metricKey as keyof typeof metricSpecs]
  if (!spec) return null

  const rangeMs = end.getTime() - start.getTime()
  const rangeHours = rangeMs / 3_600_000
  const desiredPoints = Math.max(2, Math.ceil(rangeHours * 4) + 1)
  const pointCount = Math.min(maxPoints, desiredPoints)
  const tags = metricKey === 'ping.latency_ms' ? { task_id: taskId } : undefined
  const points = Array.from({ length: pointCount }, (_, index) => {
    const ratio = pointCount <= 1 ? 0 : index / (pointCount - 1)
    const missing = pointCount >= 5 && index === Math.floor(pointCount / 2)
    return {
      time: new Date(start.getTime() + rangeMs * ratio).toISOString(),
      value: missing
        ? null
        : Math.round(
            (spec[1] + Math.sin(ratio * Math.PI * 2) * spec[2]) * 100,
          ) / 100,
      ...(missing ? {} : { count: 1 }),
      ...(tags ? { tags } : {}),
    }
  })

  return {
    metric_key: metricKey,
    entity_id: entityId,
    type: 'gauge' as const,
    unit: spec[0],
    retention_days: 30,
    ...(tags ? { tags } : {}),
    downsampled: pointCount === maxPoints,
    downsample_algorithm: 'avg' as const,
    fill_empty: true,
    max_points: maxPoints,
    interval_seconds: rangeMs / Math.max(1, pointCount - 1) / 1_000,
    count: points.length,
    points,
  }
}

function metricResult(
  params: Record<string, unknown> | undefined,
  now: (() => Date) | undefined,
) {
  const window = queryWindow(params, now)
  if (!window) return null
  const requestedMaxPoints = finiteNumber(params?.max_points) ?? 240
  if (
    !Number.isInteger(requestedMaxPoints) ||
    requestedMaxPoints <= 0 ||
    requestedMaxPoints > maximumGeneratedPoints
  ) {
    return null
  }

  const entityId =
    typeof params?.entity_id === 'string' && params.entity_id.trim()
      ? params.entity_id.trim()
      : 'node-online'
  const taskId =
    typeof params?.tags === 'object' &&
    params.tags !== null &&
    'task_id' in params.tags &&
    typeof params.tags.task_id === 'string'
      ? params.tags.task_id
      : '8'
  const series = requestedMetricKeys(params)
    .map((metricKey) =>
      createMetricSeries(
        metricKey,
        entityId,
        taskId,
        window.start,
        window.end,
        requestedMaxPoints,
      ),
    )
    .filter((value) => value !== null)

  return {
    ...clone(metricQueryResponse.result),
    start: window.start.toISOString(),
    end: window.end.toISOString(),
    server_downsample_default: true,
    series,
    count: series.length,
  }
}

function rebaseStatus(
  status: ScenarioLatestStatus,
  dynamicNow: Date | undefined,
): ScenarioLatestStatus {
  if (!dynamicNow) return clone(status)
  const offset = Date.parse(status.time) - fixtureWindowEndMs
  return {
    ...clone(status),
    time: new Date(dynamicNow.getTime() + offset).toISOString(),
  }
}

export function createKomari132Scenario(
  options: Komari132ScenarioOptions = {},
): Komari132Scenario {
  const preset = options.preset ?? 'public'
  const privateSite = options.privateSite ?? preset === 'private'
  const nodeCount = options.nodeCount ?? (preset === 'scale-500' ? 500 : null)
  if (
    nodeCount !== null &&
    (!Number.isSafeInteger(nodeCount) ||
      nodeCount <= 0 ||
      nodeCount > maximumNodes)
  ) {
    throw new RangeError(
      `Komari preview nodeCount must be an integer from 1 to ${maximumNodes}`,
    )
  }

  const rpcMethods: string[] = []
  let authenticated = Boolean(options.authenticated)
  let rpcDenied = Boolean(options.rpcDenied)
  let meRequests = 0
  const publicNodes: ScenarioNode[] = nodeCount
    ? Array.from({ length: nodeCount }, (_, index) => ({
        ...clone(nodesResponse.result[0]),
        uuid: `node-${String(index).padStart(4, '0')}`,
        name: `Probe ${String(index).padStart(4, '0')}`,
        group: `Group ${index % 10}`,
        region: `Region ${index % 20}`,
        weight: index,
      }))
    : clone(nodesResponse.result)
  const hiddenNode: ScenarioNode = {
    ...clone(nodesResponse.result[0]),
    uuid: 'node-hidden',
    name: 'Hidden Admin Probe',
    hidden: true,
    weight: 99,
  }
  const baseStatus = clone(
    latestStatusResponse.result['node-online'],
  ) as ScenarioLatestStatus
  const publicStatuses: Record<string, ScenarioLatestStatus> = nodeCount
    ? Object.fromEntries(
        publicNodes.map((node, index) => [
          node.uuid,
          {
            ...clone(baseStatus),
            client: node.uuid,
            cpu: index % 100,
            online: true,
            ping: {},
          },
        ]),
      )
    : (clone(latestStatusResponse.result) as Record<
        string,
        ScenarioLatestStatus
      >)

  const resultNodes = () =>
    clone(authenticated ? [...publicNodes, hiddenNode] : publicNodes)
  const resultStatuses = () => {
    const currentNow = options.now?.()
    if (currentNow && !Number.isFinite(currentNow.getTime())) {
      throw new Error('Komari preview now() must return a valid Date')
    }
    const statuses: Record<string, ScenarioLatestStatus> = authenticated
      ? {
          ...publicStatuses,
          'node-hidden': {
            ...clone(baseStatus),
            client: 'node-hidden',
          },
        }
      : publicStatuses
    return Object.fromEntries(
      Object.entries(statuses).map(([uuid, status]) => [
        uuid,
        rebaseStatus(status, currentNow),
      ]),
    ) as Record<string, ScenarioLatestStatus>
  }

  return {
    rpcMethods,
    get meRequests() {
      return meRequests
    },
    handleRest(path) {
      switch (pathname(path)) {
        case '/api/public':
          return {
            status: 200,
            body: clone(privateSite ? privateSitePublic : publicInfo),
          }
        case '/api/me':
          meRequests += 1
          return {
            status: 200,
            body: authenticated
              ? { username: 'owner', uuid: 'admin-1', logged_in: true }
              : clone(meGuest),
          }
        default:
          return null
      }
    },
    handleRpc(request) {
      rpcMethods.push(request.method)
      if (rpcDenied) {
        return rpcError(
          request.id,
          permissionDeniedResponse.error.code,
          permissionDeniedResponse.error.message,
        )
      }

      switch (request.method) {
        case 'public:getNodesInformation':
          return rpcSuccess(request.id, resultNodes())
        case 'common:getNodesLatestStatus': {
          const statuses = resultStatuses()
          if (typeof request.params?.uuid === 'string') {
            const status = statuses[request.params.uuid]
            return status
              ? rpcSuccess(request.id, status)
              : rpcError(request.id, -32602, 'Unknown node UUID')
          }
          if (Array.isArray(request.params?.uuids)) {
            if (request.params.uuids.length === 0) {
              return rpcError(request.id, -32602, 'uuids cannot be empty')
            }
            const selected: Record<string, ScenarioLatestStatus> = {}
            for (const uuid of request.params.uuids) {
              if (typeof uuid !== 'string') continue
              const status = statuses[uuid]
              if (status) selected[uuid] = status
            }
            return rpcSuccess(request.id, selected)
          }
          return rpcSuccess(request.id, statuses)
        }
        case 'public:getPublicPingTasks':
          if (options.failPingTasks) {
            return rpcError(request.id, -32051, 'Unavailable')
          }
          return rpcSuccess(
            request.id,
            pingTasks.map((task) => ({
              ...task,
              clients: options.unassignedDefaultPing ? [] : [...task.clients],
            })),
          )
        case 'public:listMetricDefinitions':
          return rpcSuccess(request.id, clone(metricDefinitionsResponse.result))
        case 'public:queryMetrics': {
          const result = metricResult(request.params, options.now)
          return result
            ? rpcSuccess(request.id, result)
            : rpcError(request.id, -32602, 'Invalid Metric query parameters')
        }
        default:
          return rpcError(request.id, -32601, 'Method not found')
      }
    },
    setAuthenticated(value) {
      authenticated = value
    },
    setRpcDenied(value) {
      rpcDenied = value
    },
  }
}
