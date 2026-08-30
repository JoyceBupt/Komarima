import type {
  Aggregation,
  MetricQueryParams,
  PingMetricStatsParams,
} from '../schemas'

export const P0_METRIC_KEYS = [
  'cpu.usage',
  'memory.used',
  'swap.used',
  'load.average',
  'disk.used',
  'net.in.rate',
  'net.out.rate',
  'net.total.up',
  'net.total.down',
  'process.count',
  'connections.tcp',
  'connections.udp',
  'ping.latency_ms',
  'ping.loss',
] as const

export type P0MetricKey = (typeof P0_METRIC_KEYS)[number]

export const P0_DEFAULT_MAX_POINTS = 240
export const P0_MIN_MAX_POINTS = 120
export const P0_MAX_MAX_POINTS = 360
export const P0_MAX_METRICS_PER_QUERY = 4
export const P0_MAX_PING_TASKS_PER_QUERY = 8
export const P0_DEFAULT_HOURS = 4
export const P0_MIN_HOURS = 1
export const P0_MAX_HOURS = 24 * 30

const allowedMetricKeys = new Set<string>(P0_METRIC_KEYS)
const counterMetricKeys = new Set<string>(['net.total.up', 'net.total.down'])

export class QueryPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueryPolicyError'
  }
}

const assertPointLimit = (value: number, name: string) => {
  if (
    !Number.isInteger(value) ||
    value < P0_MIN_MAX_POINTS ||
    value > P0_MAX_MAX_POINTS
  ) {
    throw new QueryPolicyError(
      `${name} must be an integer from ${P0_MIN_MAX_POINTS} to ${P0_MAX_MAX_POINTS}`,
    )
  }
}

const normalizedMetricKeys = (params: MetricQueryParams) => {
  const keys = [
    params.metric_key,
    ...(params.metric_keys ?? []),
    ...(params.metrics ?? []),
  ]
    .filter((key): key is string => Boolean(key?.trim()))
    .map((key) => key.trim())
  return [...new Set(keys)]
}

const normalizeTimeWindow = <
  T extends {
    hours?: number
    start?: string
    start_time?: string
    end?: string
    end_time?: string
  },
>(
  params: T,
): T => {
  if (params.start && params.start_time) {
    throw new QueryPolicyError('Use only one start timestamp field')
  }
  if (params.end && params.end_time) {
    throw new QueryPolicyError('Use only one end timestamp field')
  }

  const start = params.start ?? params.start_time
  const end = params.end ?? params.end_time
  if (start || end) {
    if (!start || !end) {
      throw new QueryPolicyError('History queries require both start and end')
    }
    if (params.hours !== undefined) {
      throw new QueryPolicyError('Do not mix hours with start/end')
    }
    const rangeHours = (Date.parse(end) - Date.parse(start)) / 3_600_000
    if (
      !Number.isFinite(rangeHours) ||
      rangeHours < P0_MIN_HOURS ||
      rangeHours > P0_MAX_HOURS
    ) {
      throw new QueryPolicyError(
        `History range must be from ${P0_MIN_HOURS} to ${P0_MAX_HOURS} hours`,
      )
    }
    return params
  }

  const hours = params.hours ?? P0_DEFAULT_HOURS
  if (hours < P0_MIN_HOURS || hours > P0_MAX_HOURS) {
    throw new QueryPolicyError(
      `hours must be from ${P0_MIN_HOURS} to ${P0_MAX_HOURS}`,
    )
  }
  return { ...params, hours }
}

const effectiveAggregation = (
  params: MetricQueryParams,
  metricKey: string,
): Aggregation | undefined =>
  params.aggregation_by_metric?.[metricKey] ??
  params.algorithm_by_metric?.[metricKey] ??
  params.aggregation ??
  params.algorithm

const validatePointOverrides = (
  params: MetricQueryParams,
  requestedKeys: Set<string>,
) => {
  for (const [name, overrides] of [
    ['points_by_metric', params.points_by_metric],
    ['max_points_by_metric', params.max_points_by_metric],
  ] as const) {
    for (const [metricKey, value] of Object.entries(overrides ?? {})) {
      if (!requestedKeys.has(metricKey)) {
        throw new QueryPolicyError(`${name} contains an unrequested metric`)
      }
      assertPointLimit(value, `${name}.${metricKey}`)
    }
  }
}

export const normalizeP0MetricQueryParams = (
  params: MetricQueryParams,
): MetricQueryParams => {
  const entityId = params.entity_id?.trim()
  if (!entityId || params.entity_ids !== undefined) {
    throw new QueryPolicyError(
      'P0 Metric history requires exactly one entity_id',
    )
  }

  const canonicalParams: MetricQueryParams = {
    ...params,
    entity_id: entityId,
    ...(params.metric_key !== undefined
      ? { metric_key: params.metric_key.trim() }
      : {}),
    ...(params.metric_keys !== undefined
      ? { metric_keys: params.metric_keys.map((key) => key.trim()) }
      : {}),
    ...(params.metrics !== undefined
      ? { metrics: params.metrics.map((key) => key.trim()) }
      : {}),
    ...(params.tags?.task_id !== undefined
      ? { tags: { ...params.tags, task_id: params.tags.task_id.trim() } }
      : {}),
  }

  const metricKeys = normalizedMetricKeys(canonicalParams)
  if (metricKeys.length === 0 || metricKeys.length > P0_MAX_METRICS_PER_QUERY) {
    throw new QueryPolicyError(
      `P0 Metric history requires 1-${P0_MAX_METRICS_PER_QUERY} metrics`,
    )
  }
  for (const metricKey of metricKeys) {
    if (!allowedMetricKeys.has(metricKey)) {
      throw new QueryPolicyError(`Metric is not available in P0: ${metricKey}`)
    }
  }
  if (
    metricKeys.some(
      (metricKey) =>
        metricKey === 'ping.latency_ms' || metricKey === 'ping.loss',
    ) &&
    !canonicalParams.tags?.task_id?.match(/^\d+$/)
  ) {
    throw new QueryPolicyError(
      'P0 Ping Metric history requires an explicit tags.task_id',
    )
  }

  const maxPoints = canonicalParams.max_points ?? P0_DEFAULT_MAX_POINTS
  assertPointLimit(maxPoints, 'max_points')
  validatePointOverrides(canonicalParams, new Set(metricKeys))

  const aggregationByMetric = {
    ...(canonicalParams.aggregation_by_metric ?? {}),
  }
  for (const metricKey of metricKeys) {
    if (!counterMetricKeys.has(metricKey)) continue
    const aggregation = effectiveAggregation(canonicalParams, metricKey)
    if (aggregation === undefined) {
      aggregationByMetric[metricKey] = 'last'
      continue
    }
    if (aggregation !== 'last' && aggregation !== 'rate') {
      throw new QueryPolicyError(
        `Counter metric ${metricKey} requires last or rate aggregation`,
      )
    }
  }

  return normalizeTimeWindow({
    ...canonicalParams,
    max_points: maxPoints,
    fill_empty: canonicalParams.fill_empty ?? true,
    ...(Object.keys(aggregationByMetric).length
      ? { aggregation_by_metric: aggregationByMetric }
      : {}),
  })
}

export const normalizeP0PingStatsParams = (
  params: PingMetricStatsParams,
): PingMetricStatsParams => {
  const uuid = params.uuid?.trim()
  const entityId = params.entity_id?.trim()
  const singleEntity = uuid ?? entityId
  if (
    !singleEntity ||
    params.entity_ids !== undefined ||
    Boolean(uuid && entityId)
  ) {
    throw new QueryPolicyError(
      'P0 Ping history requires exactly one uuid or entity_id',
    )
  }

  if (params.task_ids !== undefined && params.task_ids.length === 0) {
    throw new QueryPolicyError('task_ids cannot be empty')
  }

  const normalizeTaskId = (value: string | number) => {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new QueryPolicyError(
          'Ping task IDs must be non-negative integers',
        )
      }
      return value
    }
    const normalized = value.trim()
    if (!/^\d+$/.test(normalized)) {
      throw new QueryPolicyError('Ping task IDs must be non-negative integers')
    }
    return normalized
  }

  const taskId =
    params.task_id === undefined ? undefined : normalizeTaskId(params.task_id)
  const normalizedTaskIds = params.task_ids?.map(normalizeTaskId)
  const taskIds = [
    ...(taskId === undefined ? [] : [String(taskId)]),
    ...(normalizedTaskIds ?? []).map(String),
  ]
  const taskCount = new Set(taskIds).size
  if (taskCount === 0 || taskCount > P0_MAX_PING_TASKS_PER_QUERY) {
    throw new QueryPolicyError(
      `P0 Ping history requires 1-${P0_MAX_PING_TASKS_PER_QUERY} tasks`,
    )
  }

  const maxPoints = params.max_points ?? P0_DEFAULT_MAX_POINTS
  assertPointLimit(maxPoints, 'max_points')
  return normalizeTimeWindow({
    ...params,
    ...(uuid ? { uuid } : {}),
    ...(entityId ? { entity_id: entityId } : {}),
    ...(taskId === undefined ? {} : { task_id: taskId }),
    ...(normalizedTaskIds === undefined ? {} : { task_ids: normalizedTaskIds }),
    max_points: maxPoints,
  })
}
