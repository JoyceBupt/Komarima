import type { NormalizedMetricPoint } from '../../domain'
import { isUsableMetricPoint } from './metricPresentation'

export type AlignedMetricData = [number[], Array<number | null>]

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
