import type {
  Aggregation,
  MetricDefinition,
  MetricSeries,
} from '../api/schemas'
import type { NormalizedValue } from './value'

export interface NormalizedMetricPoint {
  timeMs: number
  value: number | null
  count: number | null
}

export interface NormalizedMetricSeries {
  metricKey: string
  entityId: string
  type: MetricSeries['type']
  unit: string | null
  tags: Record<string, string>
  downsampled: boolean
  downsampleAlgorithm: MetricSeries['downsample_algorithm'] | null
  intervalSeconds: number | null
  count: number
  points: NormalizedMetricPoint[]
}

export type CounterDeltaResult = NormalizedValue & { resets?: number }

export const normalizeMetricSeries = (
  series: MetricSeries,
): NormalizedMetricSeries => ({
  metricKey: series.metric_key,
  entityId: series.entity_id,
  type: series.type,
  unit: series.unit ?? null,
  tags: series.tags ?? {},
  downsampled: series.downsampled,
  downsampleAlgorithm: series.downsample_algorithm ?? null,
  intervalSeconds: series.interval_seconds ?? null,
  count: series.count,
  points: series.points
    .map((point) => ({
      timeMs: Date.parse(point.time),
      value: point.value,
      count: point.count ?? null,
    }))
    .sort((left, right) => left.timeMs - right.timeMs),
})

const finiteValues = (series: NormalizedMetricSeries) =>
  series.points.flatMap((point) =>
    point.value !== null && Number.isFinite(point.value) ? [point.value] : [],
  )

export const latestMetricValue = (
  series: NormalizedMetricSeries,
): NormalizedValue => {
  for (let index = series.points.length - 1; index >= 0; index -= 1) {
    const value = series.points[index]?.value
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      return { state: 'valid', value }
    }
  }
  return { state: 'missing' }
}

export const averageGauge = (
  series: NormalizedMetricSeries,
): NormalizedValue => {
  if (series.type && series.type !== 'gauge') return { state: 'invalid' }
  const values = finiteValues(series)
  if (!values.length) return { state: 'missing' }
  return {
    state: 'valid',
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

export const resetAwareCounterDelta = (
  series: NormalizedMetricSeries,
): CounterDeltaResult => {
  if (series.type && series.type !== 'counter') return { state: 'invalid' }
  if (series.downsampled || series.downsampleAlgorithm !== null) {
    return { state: 'invalid' }
  }
  if (
    series.points.some(
      (point) =>
        point.value === null || (point.count !== null && point.count !== 1),
    )
  ) {
    return { state: 'invalid' }
  }
  const values = finiteValues(series)
  if (values.length < 2) return { state: 'missing' }
  if (values.some((value) => value < 0)) return { state: 'invalid' }

  let delta = 0
  let resets = 0
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]
    const current = values[index]
    if (previous === undefined || current === undefined) continue
    if (current >= previous) {
      delta += current - previous
    } else {
      resets += 1
      delta += current
    }
  }

  return { state: 'valid', value: delta, resets }
}

export const defaultAggregationForMetric = (
  definition: Pick<MetricDefinition, 'type'>,
): Aggregation => (definition.type === 'counter' ? 'last' : 'avg')
