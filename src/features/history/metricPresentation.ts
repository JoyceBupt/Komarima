import type {
  NormalizedMetricPoint,
  NormalizedMetricSeries,
} from '../../domain'

export type HistoryRange = '1h' | '6h' | '24h' | '7d'
export type HistoryView = 'overview' | 'history'
export type HistoryLoadState = 'ready' | 'loading' | 'error'

export interface HistoryRangeOption {
  value: HistoryRange
  label: string
  longLabel: string
  durationMs: number
}

export interface HistoryRangeRequest {
  range: HistoryRange
  startTimeMs: number
  endTimeMs: number
}

export const historyRanges: ReadonlyArray<HistoryRangeOption> = [
  {
    value: '1h',
    label: '1h',
    longLabel: '1小时',
    durationMs: 60 * 60 * 1_000,
  },
  {
    value: '6h',
    label: '6h',
    longLabel: '6小时',
    durationMs: 6 * 60 * 60 * 1_000,
  },
  {
    value: '24h',
    label: '24h',
    longLabel: '24小时',
    durationMs: 24 * 60 * 60 * 1_000,
  },
  {
    value: '7d',
    label: '7d',
    longLabel: '7天',
    durationMs: 7 * 24 * 60 * 60 * 1_000,
  },
]

export interface MetricStats {
  latest: number | null
  minimum: number | null
  maximum: number | null
  average: number | null
  validPointCount: number
  sampleCount: number
  expectedPointCount: number
  gapCount: number
  coveragePercent: number | null
}

export interface TimeCoverage {
  startTimeMs: number
  endTimeMs: number
  pointCount: number
}

const builtinMetricLabels: Readonly<Record<string, string>> = {
  'cpu.usage': 'CPU',
  'gpu.usage': 'GPU',
  'gpu.device.usage': 'GPU 设备',
  'gpu.memory.used': 'GPU 显存',
  'gpu.memory.total': 'GPU 总显存',
  'gpu.temperature': 'GPU 温度',
  'memory.used': '内存',
  'swap.used': 'Swap',
  'load.average': '系统负载',
  'disk.used': '磁盘',
  'net.in.rate': '入站速率',
  'net.out.rate': '出站速率',
  'net.total.up': '累计上行',
  'net.total.down': '累计下行',
  'traffic.up': '上行流量',
  'traffic.down': '下行流量',
  'process.count': '进程数',
  'connections.tcp': 'TCP 连接',
  'connections.udp': 'UDP 连接',
  'ping.latency_ms': 'Ping 延迟',
  'ping.loss': 'Ping 丢包',
}

function sortedTags(series: NormalizedMetricSeries) {
  return Object.entries(series.tags).sort(([left], [right]) =>
    left.localeCompare(right),
  )
}

export function seriesIdentity(series: NormalizedMetricSeries) {
  return JSON.stringify([series.metricKey, series.entityId, sortedTags(series)])
}

function metricBaseLabel(
  series: NormalizedMetricSeries,
  labels?: Readonly<Record<string, string>>,
) {
  return (
    labels?.[seriesIdentity(series)] ??
    labels?.[series.metricKey] ??
    builtinMetricLabels[series.metricKey] ??
    series.metricKey
      .replaceAll(/[._-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase())
  )
}

export function metricSeriesLabel(
  series: NormalizedMetricSeries,
  labels?: Readonly<Record<string, string>>,
) {
  const base = metricBaseLabel(series, labels)
  const tags = sortedTags(series)
  if (!tags.length) return base

  const taskId = series.tags.task_id
  const suffix = [
    ...(taskId ? [`任务 ${taskId}`] : []),
    ...tags
      .filter(([key]) => key !== 'task_id')
      .map(([key, value]) => `${key}=${value}`),
  ]
  return `${base} · ${suffix.join(' · ')}`
}

export function metricTone(metricKey: string) {
  if (metricKey === 'cpu.usage') return 'cpu'
  if (
    metricKey === 'memory.used' ||
    metricKey === 'swap.used' ||
    metricKey.startsWith('gpu.memory.')
  ) {
    return 'memory'
  }
  if (metricKey === 'disk.used') return 'disk'
  if (metricKey.startsWith('ping.')) return 'ping'
  return 'network'
}

export function pointSampleWeight(point: NormalizedMetricPoint) {
  if (point.count === null) return 1
  return Number.isFinite(point.count) && point.count > 0 ? point.count : 0
}

export function isUsableMetricPoint(point: NormalizedMetricPoint) {
  return (
    Number.isFinite(point.timeMs) &&
    point.value !== null &&
    Number.isFinite(point.value) &&
    pointSampleWeight(point) > 0
  )
}

export function metricStats(series: NormalizedMetricSeries): MetricStats {
  const timedPoints = series.points.filter((point) =>
    Number.isFinite(point.timeMs),
  )
  const validPoints = timedPoints.filter(isUsableMetricPoint)
  const values = validPoints.map((point) => point.value as number)
  const sampleCount = validPoints.reduce(
    (total, point) => total + pointSampleWeight(point),
    0,
  )

  let latestPoint: NormalizedMetricPoint | null = null
  for (const point of validPoints) {
    if (!latestPoint || point.timeMs > latestPoint.timeMs) latestPoint = point
  }

  let expectedPointCount = timedPoints.length
  if (
    timedPoints.length &&
    series.intervalSeconds &&
    series.intervalSeconds > 0
  ) {
    const times = timedPoints.map((point) => point.timeMs)
    const spanMs = Math.max(...times) - Math.min(...times)
    const intervalMs = series.intervalSeconds * 1_000
    expectedPointCount = Math.max(
      timedPoints.length,
      Math.round(spanMs / intervalMs) + 1,
    )
  }

  const gapCount = Math.max(0, expectedPointCount - validPoints.length)
  const coveragePercent = expectedPointCount
    ? (validPoints.length / expectedPointCount) * 100
    : null

  const average =
    series.type === 'gauge' && sampleCount
      ? validPoints.reduce(
          (total, point) =>
            total + (point.value as number) * pointSampleWeight(point),
          0,
        ) / sampleCount
      : null

  return {
    latest: latestPoint?.value ?? null,
    minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    average,
    validPointCount: validPoints.length,
    sampleCount,
    expectedPointCount,
    gapCount,
    coveragePercent,
  }
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits,
  }).format(value)
}

function formatBytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const
  const absolute = Math.abs(value)
  if (absolute < 1_024) return `${formatNumber(value, 0)} B`

  const exponent = Math.min(
    Math.floor(Math.log(absolute) / Math.log(1_024)),
    units.length - 1,
  )
  const scaled = value / 1_024 ** exponent
  return `${formatNumber(scaled, Math.abs(scaled) < 10 ? 2 : 1)} ${units[exponent]}`
}

export function formatMetricValue(value: number | null, unit: string | null) {
  if (value === null || !Number.isFinite(value)) return '—'

  const normalizedUnit = unit?.trim().toLocaleLowerCase() ?? ''
  if (normalizedUnit === 'bytes') return formatBytes(value)
  if (normalizedUnit === 'bytes/s') return `${formatBytes(value)}/s`
  if (normalizedUnit === 'ratio') return `${formatNumber(value * 100, 1)}%`

  const formatted = formatNumber(value, Math.abs(value) < 10 ? 2 : 1)
  if (!unit || normalizedUnit === 'count' || normalizedUnit === 'load') {
    return formatted
  }
  if (unit === '%' || unit === '°C') return `${formatted}${unit}`
  if (normalizedUnit === 'ms') return `${formatted} ms`
  return `${formatted} ${unit}`
}

export function latestSeriesTime(
  series: ReadonlyArray<NormalizedMetricSeries>,
) {
  let latest = 0
  for (const metric of series) {
    for (const point of metric.points) {
      if (Number.isFinite(point.timeMs)) latest = Math.max(latest, point.timeMs)
    }
  }
  return latest || Date.now()
}

export function historyRangeRequest(
  range: HistoryRange,
  endTimeMs: number,
): HistoryRangeRequest {
  const option =
    historyRanges.find((candidate) => candidate.value === range) ??
    historyRanges[1]!
  return {
    range,
    startTimeMs: endTimeMs - option.durationMs,
    endTimeMs,
  }
}

export function filterSeriesByRange(
  series: ReadonlyArray<NormalizedMetricSeries>,
  range: HistoryRange,
  endTimeMs = latestSeriesTime(series),
): NormalizedMetricSeries[] {
  const request = historyRangeRequest(range, endTimeMs)
  return series.map((metric) => ({
    ...metric,
    points: metric.points.filter(
      (point) =>
        point.timeMs >= request.startTimeMs &&
        point.timeMs <= request.endTimeMs,
    ),
  }))
}

export function timeCoverage(
  series: ReadonlyArray<NormalizedMetricSeries>,
): TimeCoverage | null {
  const times = series.flatMap((metric) =>
    metric.points.flatMap((point) =>
      Number.isFinite(point.timeMs) ? [point.timeMs] : [],
    ),
  )
  if (!times.length) return null
  return {
    startTimeMs: Math.min(...times),
    endTimeMs: Math.max(...times),
    pointCount: times.length,
  }
}

function compactDateTime(timeMs: number) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timeMs))
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  return `${values.month}-${values.day} ${values.hour}:${values.minute}`
}

export function coverageLabel(
  series: ReadonlyArray<NormalizedMetricSeries>,
  requestedRange: HistoryRange,
) {
  const requested =
    historyRanges.find((option) => option.value === requestedRange)
      ?.longLabel ?? requestedRange
  const actual = timeCoverage(series)
  if (!actual) return `实际无数据 · 请求${requested}`

  const start = compactDateTime(actual.startTimeMs)
  const end = compactDateTime(actual.endTimeMs)
  return `实际 ${start}${start === end ? '' : `–${end}`} · 请求${requested}`
}

export function formatCursorTime(timeMs: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timeMs))
}

export function hasFiniteMetricData(
  series: ReadonlyArray<NormalizedMetricSeries>,
) {
  return series.some((metric) => metric.points.some(isUsableMetricPoint))
}

export function shortErrorMessage(message?: string) {
  const normalized = message?.trim()
  if (!normalized) return null
  return normalized.length > 15 ? `${normalized.slice(0, 14)}…` : normalized
}
