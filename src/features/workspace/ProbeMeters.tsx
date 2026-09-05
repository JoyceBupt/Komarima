import type { CSSProperties } from 'react'
import type { WorkspaceTraffic } from './types'

export type MetricTone = 'cpu' | 'memory' | 'disk' | 'ping'

export function MetricGauge({
  label,
  tone,
  value,
  suffix = '%',
  compact = false,
  detail,
}: {
  label: string
  tone: MetricTone
  value: number | null
  suffix?: string
  compact?: boolean
  detail?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    const className = [
      'metric-cell',
      `metric-${tone}`,
      'is-empty',
      compact ? 'is-compact' : null,
    ]
      .filter(Boolean)
      .join(' ')

    if (!compact) {
      return (
        <span aria-label={`${label}暂无数据`} className={className}>
          <span className="metric-label">{label}</span>
          <span className="metric-value">—</span>
          {tone !== 'ping' ? (
            <span aria-hidden="true" className="metric-track" />
          ) : null}
        </span>
      )
    }

    return (
      <span aria-label={`${label}暂无数据`} className={className}>
        —
      </span>
    )
  }

  const progress = Math.max(0, Math.min(value, 100))

  return (
    <span
      aria-label={`${label}${value}${suffix}${detail ? '，' + detail : ''}`}
      className={[
        'metric-cell',
        `metric-${tone}`,
        compact ? 'is-compact' : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {suffix}
      </span>
      {tone === 'ping' ? (
        detail ? (
          <span className="metric-detail" title={detail}>
            {detail}
          </span>
        ) : null
      ) : (
        <span aria-hidden="true" className="metric-track">
          <span
            className="metric-track-value"
            style={{ width: `${progress}%` } as CSSProperties}
          />
        </span>
      )}
    </span>
  )
}

export function TrafficGauge({
  traffic,
  compact = false,
}: {
  traffic: WorkspaceTraffic
  compact?: boolean
}) {
  if (!traffic.limit) {
    return (
      <span
        aria-label="未设置流量限额"
        className={['traffic-gauge', 'is-empty', compact ? 'is-compact' : null]
          .filter(Boolean)
          .join(' ')}
      >
        —
      </span>
    )
  }

  const progress =
    traffic.percent === null ? 0 : Math.max(0, Math.min(traffic.percent, 100))
  const valueLabel = traffic.used
    ? `${traffic.used} / ${traffic.limit}`
    : `— / ${traffic.limit}`
  const percentLabel =
    traffic.percent === null ? '暂无数据' : `${traffic.percent}%`

  return (
    <span
      aria-label={`流量${traffic.basis ?? ''}${valueLabel}，${percentLabel}`}
      className={['traffic-gauge', compact ? 'is-compact' : null]
        .filter(Boolean)
        .join(' ')}
      data-over-limit={
        traffic.percent !== null && traffic.percent >= 100 ? 'true' : undefined
      }
    >
      <span className="traffic-gauge-copy">
        <span>{valueLabel}</span>
        <strong>
          {traffic.percent === null ? '—' : `${traffic.percent}%`}
        </strong>
      </span>
      <span aria-hidden="true" className="traffic-track">
        <span
          className="traffic-track-value"
          style={{ width: `${progress}%` } as CSSProperties}
        />
      </span>
    </span>
  )
}
