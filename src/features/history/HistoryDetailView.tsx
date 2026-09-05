import {
  lazy,
  Suspense,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { NormalizedMetricSeries } from '../../domain'
import {
  coverageLabel,
  filterSeriesByRange,
  formatMetricValue,
  hasFiniteMetricData,
  historyRangeRequest,
  historyRanges,
  latestSeriesTime,
  metricSeriesLabel,
  metricStats,
  metricTone,
  seriesIdentity,
  shortErrorMessage,
  timeCoverage,
  type HistoryLoadState,
  type HistoryRange,
  type HistoryRangeRequest,
  type HistoryView,
} from './metricPresentation'
import './HistoryDetail.css'

const LazyUPlotChart = lazy(() =>
  import('./UPlotChart').then((module) => ({ default: module.UPlotChart })),
)
const LazyPingProbeChart = lazy(() =>
  import('./PingProbeChart').then((module) => ({
    default: module.PingProbeChart,
  })),
)

export interface HistoryIssue {
  label: string
  state: 'loading' | 'error'
  partial?: boolean
  onRetry?: () => void
}

interface HistoryDetailBaseProps {
  nodeName: string
  series: ReadonlyArray<NormalizedMetricSeries>
  state?: HistoryLoadState
  errorMessage?: string
  defaultView?: HistoryView
  endTimeMs?: number
  metricLabels?: Readonly<Record<string, string>>
  rangeNote?: string
  className?: string
  onRetry?: () => void
  issues?: ReadonlyArray<HistoryIssue>
  overviewContent?: ReactNode
}

interface ControlledHistoryRangeProps {
  range: HistoryRange
  defaultRange?: never
  onRangeChange: (range: HistoryRange, request: HistoryRangeRequest) => void
}

interface UncontrolledHistoryRangeProps {
  range?: undefined
  defaultRange?: HistoryRange
  onRangeChange?: (range: HistoryRange, request: HistoryRangeRequest) => void
}

export type HistoryDetailViewProps = HistoryDetailBaseProps &
  (ControlledHistoryRangeProps | UncontrolledHistoryRangeProps)

function formatCoverage(value: number | null) {
  if (value === null) return '—'
  return `${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
  }).format(value)}%`
}

function MetricSummary({
  series,
  label,
  compact = false,
}: {
  series: NormalizedMetricSeries
  label: string
  compact?: boolean
}) {
  const stats = metricStats(series)
  const averageLabel = series.type === 'counter' ? '类型' : '平均'
  const averageValue =
    series.type === 'counter'
      ? '累计值'
      : formatMetricValue(stats.average, series.unit)
  const sampleLabel = `${stats.sampleCount} 样本`

  return (
    <div
      className={compact ? 'history-summary is-compact' : 'history-summary'}
      data-tone={metricTone(series.metricKey)}
    >
      <div className="history-summary-heading">
        <div>
          <h3>{label}</h3>
          <p>
            {series.downsampled ? '已降采样 · ' : ''}
            {sampleLabel}
          </p>
        </div>
        <strong>{formatMetricValue(stats.latest, series.unit)}</strong>
      </div>

      <dl className="history-stat-grid" aria-label={`${label}数值摘要`}>
        <div>
          <dt>最小</dt>
          <dd>{formatMetricValue(stats.minimum, series.unit)}</dd>
        </div>
        <div>
          <dt>最大</dt>
          <dd>{formatMetricValue(stats.maximum, series.unit)}</dd>
        </div>
        <div>
          <dt>{averageLabel}</dt>
          <dd>{averageValue}</dd>
        </div>
        <div>
          <dt>覆盖</dt>
          <dd>{formatCoverage(stats.coveragePercent)}</dd>
        </div>
        <div>
          <dt>缺口</dt>
          <dd>{stats.gapCount}</dd>
        </div>
      </dl>
    </div>
  )
}

function LoadingState() {
  return (
    <div aria-live="polite" className="history-state" role="status">
      <span aria-hidden="true" className="history-spinner" />
      <strong>加载历史</strong>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  const detail = shortErrorMessage(message)
  return (
    <div className="history-state" role="alert">
      <strong>加载失败</strong>
      {detail ? <span>{detail}</span> : null}
      {onRetry ? (
        <button onClick={onRetry} type="button">
          重试
        </button>
      ) : null}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="history-state">
      <strong>暂无历史</strong>
    </div>
  )
}

function HistoryIssues({ issues }: { issues: ReadonlyArray<HistoryIssue> }) {
  if (!issues.length) return null
  return (
    <div className="history-issues">
      {issues.map((issue) => (
        <div
          key={issue.label}
          className={'history-issue is-' + issue.state}
          role={issue.state === 'error' ? 'alert' : 'status'}
        >
          <span>
            {issue.label} ·{' '}
            {issue.state === 'loading'
              ? '加载中'
              : issue.partial
                ? '部分失败'
                : '加载失败'}
          </span>
          {issue.state === 'error' && issue.onRetry ? (
            <button
              type="button"
              aria-label={'重试' + issue.label}
              onClick={issue.onRetry}
            >
              重试
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

const noIssues: ReadonlyArray<HistoryIssue> = []

export function HistoryDetailView({
  nodeName,
  series,
  state = 'ready',
  errorMessage,
  defaultView = 'overview',
  defaultRange = '24h',
  range: controlledRange,
  endTimeMs,
  metricLabels,
  rangeNote,
  className,
  onRangeChange,
  onRetry,
  issues = noIssues,
  overviewContent,
}: HistoryDetailViewProps) {
  const [view, setView] = useState<HistoryView>(defaultView)
  const [internalRange, setInternalRange] = useState<HistoryRange>(defaultRange)
  const overviewTabRef = useRef<HTMLButtonElement>(null)
  const historyTabRef = useRef<HTMLButtonElement>(null)
  const instanceId = useId().replaceAll(':', '')
  const activeRange = controlledRange ?? internalRange
  const resolvedEndTimeMs = endTimeMs ?? latestSeriesTime(series)
  const visibleSeries = useMemo(
    () => filterSeriesByRange(series, activeRange, resolvedEndTimeMs),
    [series, activeRange, resolvedEndTimeMs],
  )
  const hasData = hasFiniteMetricData(visibleSeries)
  const actualCoverage = timeCoverage(visibleSeries)
  const pingSeries = useMemo(
    () =>
      visibleSeries.filter((metric) => metric.metricKey === 'ping.latency_ms'),
    [visibleSeries],
  )
  const standardSeries = useMemo(
    () =>
      visibleSeries.filter((metric) => metric.metricKey !== 'ping.latency_ms'),
    [visibleSeries],
  )
  const titleId = `history-title-${instanceId}`
  const overviewTabId = `history-overview-tab-${instanceId}`
  const overviewPanelId = `history-overview-panel-${instanceId}`
  const chartTabId = `history-chart-tab-${instanceId}`
  const chartPanelId = `history-chart-panel-${instanceId}`

  const selectRange = (nextRange: HistoryRange) => {
    if (controlledRange === undefined) setInternalRange(nextRange)
    onRangeChange?.(
      nextRange,
      historyRangeRequest(nextRange, resolvedEndTimeMs),
    )
  }

  const activateView = (nextView: HistoryView, focus = false) => {
    setView(nextView)
    if (focus) {
      const target =
        nextView === 'overview' ? overviewTabRef.current : historyTabRef.current
      target?.focus()
    }
  }

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: HistoryView,
  ) => {
    let nextView: HistoryView | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      nextView = currentView === 'overview' ? 'history' : 'overview'
    } else if (event.key === 'Home') {
      nextView = 'overview'
    } else if (event.key === 'End') {
      nextView = 'history'
    }

    if (!nextView) return
    event.preventDefault()
    activateView(nextView, true)
  }

  const renderState = () => {
    if (state === 'loading') return <LoadingState />
    if (state === 'error') {
      return <ErrorState message={errorMessage} onRetry={onRetry} />
    }
    if (!hasData && !issues.length) return <EmptyState />
    return null
  }

  return (
    <section
      aria-labelledby={titleId}
      className={`history-detail${className ? ` ${className}` : ''}`}
    >
      <header className="history-header">
        <div className="history-title">
          <span>探针详情</span>
          <h2 id={titleId}>{nodeName}</h2>
        </div>

        <div
          aria-label="详情视图"
          aria-orientation="horizontal"
          className="history-view-switch"
          role="tablist"
        >
          <button
            aria-controls={overviewPanelId}
            aria-selected={view === 'overview'}
            id={overviewTabId}
            onClick={() => activateView('overview')}
            onKeyDown={(event) => handleTabKeyDown(event, 'overview')}
            ref={overviewTabRef}
            role="tab"
            tabIndex={view === 'overview' ? 0 : -1}
            type="button"
          >
            概览
          </button>
          <button
            aria-controls={chartPanelId}
            aria-selected={view === 'history'}
            id={chartTabId}
            onClick={() => activateView('history')}
            onKeyDown={(event) => handleTabKeyDown(event, 'history')}
            ref={historyTabRef}
            role="tab"
            tabIndex={view === 'history' ? 0 : -1}
            type="button"
          >
            历史
          </button>
        </div>
      </header>

      {view === 'history' || hasData ? (
        <div className="history-range-toolbar">
          <div aria-label="时间范围" className="history-range-switch">
            {historyRanges.map((option) => (
              <button
                aria-pressed={activeRange === option.value}
                key={option.value}
                onClick={() => selectRange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="history-coverage">
            {rangeNote ?? coverageLabel(visibleSeries, activeRange)}
          </p>
        </div>
      ) : null}

      <div
        aria-labelledby={overviewTabId}
        className="history-content"
        hidden={view !== 'overview'}
        id={overviewPanelId}
        role="tabpanel"
        tabIndex={0}
      >
        {view === 'overview' ? overviewContent : null}
        {view === 'overview' && state === 'ready' ? (
          <HistoryIssues issues={issues} />
        ) : null}
        {view === 'overview' ? renderState() : null}
        {view === 'overview' &&
        overviewContent &&
        state === 'ready' &&
        hasData ? (
          <h3 className="history-section-heading">时段统计</h3>
        ) : null}
        {view === 'overview' && state === 'ready' && hasData ? (
          <div className="history-overview-grid" aria-label="时段统计">
            {visibleSeries.map((metric) => {
              const identity = seriesIdentity(metric)
              return (
                <MetricSummary
                  key={identity}
                  label={metricSeriesLabel(metric, metricLabels)}
                  series={metric}
                />
              )
            })}
          </div>
        ) : null}
      </div>

      <div
        aria-labelledby={chartTabId}
        className="history-content"
        hidden={view !== 'history'}
        id={chartPanelId}
        role="tabpanel"
        tabIndex={0}
      >
        {view === 'history' && state === 'ready' ? (
          <HistoryIssues issues={issues} />
        ) : null}
        {view === 'history' ? renderState() : null}
        {view === 'history' && state === 'ready' && hasData ? (
          <div className="history-chart-list">
            {pingSeries.length ? (
              <Suspense
                fallback={
                  <div
                    aria-live="polite"
                    className="history-chart-loading history-chart-card"
                    role="status"
                  >
                    加载图表
                  </div>
                }
              >
                <LazyPingProbeChart
                  metricLabels={metricLabels}
                  series={pingSeries}
                />
              </Suspense>
            ) : null}
            {standardSeries.map((metric) => {
              const identity = seriesIdentity(metric)
              const label = metricSeriesLabel(metric, metricLabels)
              const stats = metricStats(metric)
              const chartKey = `${identity}:${activeRange}:${
                actualCoverage?.startTimeMs ?? 0
              }:${actualCoverage?.endTimeMs ?? 0}`
              return (
                <article
                  className="history-chart-card"
                  data-tone={metricTone(metric.metricKey)}
                  key={identity}
                >
                  <MetricSummary compact label={label} series={metric} />
                  {stats.validPointCount ? (
                    <Suspense
                      fallback={
                        <div
                          aria-live="polite"
                          className="history-chart-loading"
                          role="status"
                        >
                          加载图表
                        </div>
                      }
                    >
                      <LazyUPlotChart
                        key={chartKey}
                        label={label}
                        series={metric}
                      />
                    </Suspense>
                  ) : (
                    <div className="history-chart-empty">该时段暂无数据</div>
                  )}
                </article>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
