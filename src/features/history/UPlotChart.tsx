import { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { NormalizedMetricSeries } from '../../domain'
import { toAlignedMetricData } from './chartData'
import {
  formatCursorTime,
  formatMetricValue,
  isUsableMetricPoint,
} from './metricPresentation'

export interface UPlotChartProps {
  label: string
  series: NormalizedMetricSeries
  height?: number
}

interface CursorReadout {
  timeMs: number
  value: number | null
}

function cssColor(
  style: CSSStyleDeclaration,
  property: string,
  fallback: string,
) {
  return style.getPropertyValue(property).trim() || fallback
}

const longAxisSpanSeconds = 24 * 60 * 60

// Kept beside the chart because this formatter is part of its rendering contract.
// eslint-disable-next-line react-refresh/only-export-components
export function formatTimeAxisTick(
  timestampSeconds: number,
  spanSeconds: number,
  timeZone?: string,
) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    ...(spanSeconds >= longAxisSpanSeconds
      ? { month: '2-digit', day: '2-digit' }
      : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(timestampSeconds * 1_000))
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  const time = `${values.hour}:${values.minute}`

  return spanSeconds >= longAxisSpanSeconds
    ? `${values.month}-${values.day} ${time}`
    : time
}

function latestReadout(series: NormalizedMetricSeries): CursorReadout | null {
  let latest: CursorReadout | null = null
  for (const point of series.points) {
    if (!isUsableMetricPoint(point)) continue
    if (!latest || point.timeMs > latest.timeMs) {
      latest = { timeMs: point.timeMs, value: point.value }
    }
  }
  return latest
}

export function UPlotChart({ label, series, height = 232 }: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [themeRevision, setThemeRevision] = useState(0)
  const [cursorReadout, setCursorReadout] = useState<CursorReadout | null>(() =>
    latestReadout(series),
  )

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setThemeRevision((revision) => revision + 1),
    )
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const styles = getComputedStyle(container)
    const accent = cssColor(styles, '--history-chart-accent', '#0a84ff')
    const text = cssColor(styles, '--km-text-secondary', '#657083')
    const separator = cssColor(
      styles,
      '--km-separator',
      'rgba(25, 39, 57, 0.08)',
    )
    const border = cssColor(styles, '--km-border', 'rgba(25, 39, 57, 0.11)')
    const data = toAlignedMetricData(series.points)
    const validPointCount = series.points.filter(isUsableMetricPoint).length
    const width = Math.max(1, Math.floor(container.clientWidth || 640))

    const plot = new uPlot(
      {
        width,
        height,
        legend: { show: false },
        cursor: {
          drag: { x: true, y: false, setScale: false },
          focus: { prox: 28 },
        },
        hooks: {
          setCursor: [
            (self) => {
              const index = self.cursor.idx
              if (index == null) return
              const timeSeconds = self.data[0][index]
              const value = self.data[1]?.[index]
              if (typeof timeSeconds !== 'number') return
              setCursorReadout({
                timeMs: timeSeconds * 1_000,
                value:
                  typeof value === 'number' && Number.isFinite(value)
                    ? value
                    : null,
              })
            },
          ],
        },
        axes: [
          {
            stroke: text,
            grid: { stroke: separator, width: 1 },
            ticks: { stroke: border, width: 1 },
            font: '12px -apple-system, BlinkMacSystemFont, sans-serif',
            values: (self, splits) => {
              const scale = self.scales.x
              const spanSeconds =
                scale &&
                typeof scale.min === 'number' &&
                typeof scale.max === 'number'
                  ? Math.max(0, scale.max - scale.min)
                  : 0
              return splits.map((value) =>
                formatTimeAxisTick(value, spanSeconds),
              )
            },
          },
          {
            stroke: text,
            grid: { stroke: separator, width: 1 },
            ticks: { stroke: border, width: 1 },
            font: '12px -apple-system, BlinkMacSystemFont, sans-serif',
            values: (_self, splits) =>
              splits.map((value) => formatMetricValue(value, series.unit)),
          },
        ],
        series: [
          {},
          {
            label,
            stroke: accent,
            width: 2,
            spanGaps: false,
            points: {
              show: validPointCount === 1,
              size: 8,
              width: 2,
              stroke: accent,
              fill: accent,
            },
          },
        ],
      },
      data,
      container,
    )

    const resize = (nextWidth: number) => {
      const rounded = Math.max(1, Math.floor(nextWidth))
      if (rounded !== plot.width) plot.setSize({ width: rounded, height })
    }

    let resizeObserver: ResizeObserver | null = null
    const onWindowResize = () => resize(container.clientWidth)

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) resize(entry.contentRect.width)
      })
      resizeObserver.observe(container)
    } else {
      window.addEventListener('resize', onWindowResize)
    }

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onWindowResize)
      plot.destroy()
    }
  }, [height, label, series, themeRevision])

  return (
    <div className="history-chart-shell">
      <div
        aria-atomic="true"
        aria-live="polite"
        className="history-chart-readout"
      >
        <span>
          <b>时间</b>
          {cursorReadout ? (
            <time dateTime={new Date(cursorReadout.timeMs).toISOString()}>
              {formatCursorTime(cursorReadout.timeMs)}
            </time>
          ) : (
            '—'
          )}
        </span>
        <span>
          <b>{label}</b>
          {formatMetricValue(cursorReadout?.value ?? null, series.unit)}
        </span>
      </div>
      <div aria-hidden="true" className="history-uplot" ref={containerRef} />
    </div>
  )
}
