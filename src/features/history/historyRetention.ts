import type { MetricDefinition } from '../../api'

export function availableMetricHours(
  definitions: ReadonlyArray<MetricDefinition> | undefined,
  metricKeys: ReadonlyArray<string>,
  requestedHours: number,
) {
  const requested = Math.max(1, requestedHours)
  const requestedKeys = new Set(metricKeys)
  const retentionHours = (definitions ?? [])
    .filter(
      (definition) =>
        requestedKeys.has(definition.name) && definition.retention_days > 0,
    )
    .map((definition) => definition.retention_days * 24)

  return retentionHours.length
    ? Math.min(requested, ...retentionHours)
    : requested
}

function formatHours(hours: number) {
  return hours === 168 ? '7d' : `${hours}h`
}

export function historyAvailabilityLabel({
  requestedHours,
  resourceHours,
  pingHours,
  hasPing,
}: {
  requestedHours: number
  resourceHours: number
  pingHours: number
  hasPing: boolean
}) {
  if (
    resourceHours >= requestedHours &&
    (!hasPing || pingHours >= requestedHours)
  ) {
    return null
  }

  const parts = [`资源${formatHours(resourceHours)}`]
  if (hasPing) parts.push(`Ping${formatHours(pingHours)}`)
  return parts.join(' · ')
}
