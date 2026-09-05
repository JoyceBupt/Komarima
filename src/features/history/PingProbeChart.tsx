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
import { responsiveTimeAxisSpace, responsiveTimeAxisValues } from './timeAxis'

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
  height = 230,
}: PingProbeChartProps) {
  const pingSeries = useMemo(
    () => series.filter((metric) => metric.metricKey === 'ping.latency_ms'),
    [series],
  )
  const pingEntries = useMemo(
    () =>
      pingSeries.map((metric, colorIndex) => ({
        metric,
        colorIndex,
        identity: seriesIdentity(metric),
      })),
    [pingSeries],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const [themeRevision, setThemeRevision] = useState(0)
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [cursorReadouts, setCursorReadouts] = useState<CursorReadouts | null>(
    null,
  )
  const visibleEntries = useMemo(
    () => pingEntries.filter((entry) => !hiddenSeriesIds.has(entry.identity)),
    [hiddenSeriesIds, pingEntries],
  )
  const visiblePingSeries = useMemo(
    () => visibleEntries.map((entry) => entry.metric),
    [visibleEntries],
  )
  const cursorValues = useMemo(() => {
    if (cursorReadouts?.source !== visiblePingSeries) return null
    return new Map(
      visibleEntries.map((entry, index) => [
        entry.identity,
        cursorReadouts.values[index] ?? null,
      ]),
    )
  }, [cursorReadouts, visibleEntries, visiblePingSeries])

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
    if (!container || !visiblePingSeries.length) return

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
    const data = toAlignedMultiMetricData(visiblePingSeries)
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
                source: visiblePingSeries,
                values: visiblePingSeries.map((_metric, seriesIndex) => {
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
            space: responsiveTimeAxisSpace,
            values: responsiveTimeAxisValues,
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
          ...visibleEntries.map((entry) => ({
            label: legendLabel(entry.metric, metricLabels),
            stroke: colors[entry.colorIndex % colors.length],
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
  }, [height, metricLabels, themeRevision, visibleEntries, visiblePingSeries])

  if (!pingSeries.length) return null

  const hasData = visiblePingSeries.some((metric) =>
    metric.points.some(isUsableMetricPoint),
  )

  const toggleSeries = (identity: string) => {
    setHiddenSeriesIds((current) => {
      const next = new Set(current)
      if (next.has(identity)) next.delete(identity)
      else next.add(identity)
      return next
    })
    setCursorReadouts(null)
  }

  return (
    <article className="history-chart-card history-ping-card">
      <header className="history-ping-heading">
        <div>
          <h3>Ping 延迟</h3>
          <p>
            {visibleEntries.length}/{pingEntries.length} 条线路
          </p>
        </div>
        <ul aria-label="Ping 线路">
          {pingEntries.map((entry) => {
            const visible = !hiddenSeriesIds.has(entry.identity)
            const label = legendLabel(entry.metric, metricLabels)
            const value = cursorValues?.has(entry.identity)
              ? (cursorValues.get(entry.identity) ?? null)
              : latestValue(entry.metric)
            return (
              <li key={entry.identity}>
                <button
                  aria-label={`${label}，${visible ? '已显示' : '已隐藏'}`}
                  aria-pressed={visible}
                  onClick={() => toggleSeries(entry.identity)}
                  style={
                    {
                      '--history-ping-line': `var(${colorProperties[entry.colorIndex % colorProperties.length]})`,
                    } as CSSProperties
                  }
                  type="button"
                >
                  <span aria-hidden="true" />
                  <b>{label}</b>
                  <strong>{formatMetricValue(value, 'ms')}</strong>
                </button>
              </li>
            )
          })}
        </ul>
      </header>
      {visiblePingSeries.length && hasData ? (
        <div aria-hidden="true" className="history-uplot" ref={containerRef} />
      ) : (
        <div className="history-chart-empty">
          {visiblePingSeries.length ? '该时段暂无数据' : '未选线路'}
        </div>
      )}
    </article>
  )
}
