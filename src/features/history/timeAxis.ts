import type uPlot from 'uplot'

const daySeconds = 24 * 60 * 60
const multiDaySeconds = 2 * daySeconds
const shortRangeTickSpace = 64
const longRangeTickSpace = 96

const formatters = new Map<string, Intl.DateTimeFormat>()

function dateTimeFormatter(timeZone?: string) {
  const key = timeZone ?? 'local'
  const cached = formatters.get(key)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  })
  formatters.set(key, formatter)
  return formatter
}

function timeParts(timestampSeconds: number, timeZone?: string) {
  if (!Number.isFinite(timestampSeconds)) return null

  const parts = dateTimeFormatter(timeZone).formatToParts(
    new Date(timestampSeconds * 1_000),
  )
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  if (!values.month || !values.day || !values.hour || !values.minute) {
    return null
  }

  return {
    date: `${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

export function formatTimeAxisTicks(
  timestamps: ReadonlyArray<number>,
  spanSeconds: number,
  timeZone?: string,
) {
  let previousDate: string | null = null

  return timestamps.map((timestamp) => {
    const parts = timeParts(timestamp, timeZone)
    if (!parts) return ''
    if (spanSeconds < daySeconds) return parts.time

    const firstTickForDate = parts.date !== previousDate
    previousDate = parts.date

    if (spanSeconds >= multiDaySeconds) {
      return firstTickForDate ? parts.date : ''
    }
    return firstTickForDate ? parts.date : parts.time
  })
}

export function minimumTimeAxisSpace(
  spanSeconds: number,
  plotDimension: number,
) {
  const preferred =
    spanSeconds >= daySeconds ? longRangeTickSpace : shortRangeTickSpace
  return Number.isFinite(plotDimension) && plotDimension > 0
    ? Math.min(preferred, plotDimension)
    : preferred
}

function axisSpan(self: uPlot) {
  const scale = self.scales.x
  return scale && typeof scale.min === 'number' && typeof scale.max === 'number'
    ? Math.max(0, scale.max - scale.min)
    : 0
}

export const responsiveTimeAxisSpace: uPlot.Axis.Space = (
  _self,
  _axisIndex,
  scaleMinimum,
  scaleMaximum,
  plotDimension,
) =>
  minimumTimeAxisSpace(Math.max(0, scaleMaximum - scaleMinimum), plotDimension)

export const responsiveTimeAxisValues: uPlot.Axis.DynamicValues = (
  self,
  splits,
) => formatTimeAxisTicks(splits, axisSpan(self))
