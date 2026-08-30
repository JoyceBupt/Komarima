import type {
  NormalizedMetricPoint,
  NormalizedMetricSeries,
} from '../../domain'
import { isUsableMetricPoint } from './metricPresentation'

export type AlignedMetricData = [number[], Array<number | null>]
export type AlignedMultiMetricData = [
  number[],
  ...Array<Array<number | null | undefined>>,
]

export function toAlignedMetricData(
  points: ReadonlyArray<NormalizedMetricPoint>,
): AlignedMetricData {
  const times: number[] = []
  const values: Array<number | null> = []

  for (const point of points) {
    if (!Number.isFinite(point.timeMs)) continue
    times.push(point.timeMs / 1_000)
    values.push(isUsableMetricPoint(point) ? point.value : null)
  }

  return [times, values]
}

export function toAlignedMultiMetricData(
  series: ReadonlyArray<NormalizedMetricSeries>,
): AlignedMultiMetricData {
  const timestamps = new Set<number>()
  const valuesBySeries = series.map((metric) => {
    const values = new Map<number, number | null>()

    for (const point of metric.points) {
      if (!Number.isFinite(point.timeMs)) continue
      const timestampSeconds = point.timeMs / 1_000
      timestamps.add(timestampSeconds)
      values.set(
        timestampSeconds,
        isUsableMetricPoint(point) ? point.value : null,
      )
    }

    return values
  })
  const times = [...timestamps].sort((left, right) => left - right)

  return [
    times,
    ...valuesBySeries.map((values) =>
      times.map((timestamp) =>
        values.has(timestamp) ? values.get(timestamp) : undefined,
      ),
    ),
  ]
}
