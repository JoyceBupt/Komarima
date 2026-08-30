import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { NormalizedMetricSeries } from '../../domain'
import { toAlignedMultiMetricData } from './chartData'
import {
  formatMetricValue,
  isUsableMetricPoint,
  metricSeriesLabel,
  seriesIdentity,
} from './metricPresentation'
import { formatTimeAxisTick } from './UPlotChart'

export interface PingProbeChartProps {
  series: ReadonlyArray<NormalizedMetricSeries>
  metricLabels?: Readonly<Record<string, string>>
  height?: number
}

interface CursorReadouts {
  source: ReadonlyArray<NormalizedMetricSeries>
  values: Array<number | null>
}

const colorProperties = [
  '--history-ping-blue',
  '--history-ping-orange',
  '--history-ping-green',
  '--history-ping-pink',
  '--history-ping-purple',
  '--history-ping-cyan',
  '--history-ping-red',
  '--history-ping-yellow',
] as const

const colorFallbacks = [
  '#007aff',
  '#ff9500',
  '#34c759',
  '#ff2d55',
  '#af52de',
  '#32ade6',
  '#ff3b30',
  '#ffcc00',
] as const

function cssColor(
  style: CSSStyleDeclaration,
  property: string,
  fallback: string,
) {
  return style.getPropertyValue(property).trim() || fallback
}

function latestValue(series: NormalizedMetricSeries) {
  let latest: { timeMs: number; value: number } | null = null
  for (const point of series.points) {
    if (!isUsableMetricPoint(point)) continue
    if (!latest || point.timeMs > latest.timeMs) {
      latest = { timeMs: point.timeMs, value: point.value as number }
    }
  }
  return latest?.value ?? null
}

function legendLabel(
  series: NormalizedMetricSeries,
  metricLabels?: Readonly<Record<string, string>>,
) {
  const taskName = metricLabels?.[seriesIdentity(series)]?.trim()
  if (taskName) return taskName

  return (
    metricSeriesLabel(series, metricLabels).replace(/^Ping 延迟(?: · )?/, '') ||
    '默认线路'
  )
}

export function PingProbeChart({
  series,
  metricLabels,
  height = 280,
}: PingProbeChartProps) {
  const pingSeries = useMemo(
    () => series.filter((metric) => metric.metricKey === 'ping.latency_ms'),
    [series],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const [themeRevision, setThemeRevision] = useState(0)
  const [cursorReadouts, setCursorReadouts] = useState<CursorReadouts | null>(
    null,
  )
  const readouts =
    cursorReadouts?.source === pingSeries
      ? cursorReadouts.values
      : pingSeries.map(latestValue)

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
    if (!container || !pingSeries.length) return

    const styles = getComputedStyle(container)
    const text = cssColor(styles, '--km-text-secondary', '#657083')
    const separator = cssColor(
      styles,
      '--km-separator',
      'rgba(25, 39, 57, 0.08)',
    )
    const border = cssColor(styles, '--km-border', 'rgba(25, 39, 57, 0.11)')
    const colors = colorProperties.map((property, index) =>
      cssColor(styles, property, colorFallbacks[index]!),
    )
    const data = toAlignedMultiMetricData(pingSeries)
    const width = Math.max(1, Math.floor(container.clientWidth || 720))
    const plot = new uPlot(
      {
        width,
        height,
        legend: { show: false },
        cursor: {
          drag: { x: true, y: false, setScale: false },
          focus: { prox: 28 },
        },
        scales: {
          y: {
            range: (_self, _minimum, maximum) => [
              0,
              Math.max(1, maximum * 1.12),
            ],
          },
        },
        hooks: {
          setCursor: [
            (self) => {
              const index = self.cursor.idx
              if (index == null) return
              setCursorReadouts({
                source: pingSeries,
                values: pingSeries.map((_metric, seriesIndex) => {
                  const value = self.data[seriesIndex + 1]?.[index]
                  return typeof value === 'number' && Number.isFinite(value)
                    ? value
                    : null
                }),
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
              splits.map((value) => formatMetricValue(value, 'ms')),
          },
        ],
        series: [
          {},
          ...pingSeries.map((metric, index) => ({
            label: legendLabel(metric, metricLabels),
            stroke: colors[index % colors.length],
            width: 2,
            spanGaps: false,
            points: { show: false },
          })),
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
  }, [height, metricLabels, pingSeries, themeRevision])

  if (!pingSeries.length) return null

  const hasData = pingSeries.some((metric) =>
    metric.points.some(isUsableMetricPoint),
  )

  return (
    <article className="history-chart-card history-ping-card">
      <header className="history-ping-heading">
        <div>
          <h3>Ping 延迟</h3>
          <p>{pingSeries.length} 条线路</p>
        </div>
        <ul aria-label="Ping 线路">
          {pingSeries.map((metric, index) => (
            <li
              key={seriesIdentity(metric)}
              style={
                {
                  '--history-ping-line': `var(${colorProperties[index % colorProperties.length]})`,
                } as CSSProperties
              }
            >
              <span aria-hidden="true" />
              <b>{legendLabel(metric, metricLabels)}</b>
              <strong>
                {formatMetricValue(readouts[index] ?? null, 'ms')}
              </strong>
            </li>
          ))}
        </ul>
      </header>
      {hasData ? (
        <div aria-hidden="true" className="history-uplot" ref={containerRef} />
      ) : (
        <div className="history-chart-empty">该时段暂无数据</div>
      )}
    </article>
  )
}
