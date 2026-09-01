import { workspaceStatus } from './statusPresentation'
import { MetricGauge, TrafficGauge } from './ProbeMeters'
import type { WorkspaceProbe } from './types'

export interface ProbeCardGridProps {
  probes: ReadonlyArray<WorkspaceProbe>
  onSelect: (probe: WorkspaceProbe) => void
}

function systemLabel(probe: WorkspaceProbe) {
  return [probe.operatingSystem, probe.architecture].filter(Boolean).join(' · ')
}

function ProbeCard({
  probe,
  onSelect,
}: {
  probe: WorkspaceProbe
  onSelect: (probe: WorkspaceProbe) => void
}) {
  const status = workspaceStatus(probe)
  const visibleTags = probe.tags.slice(0, 4)
  const extraTagCount = Math.max(0, probe.tags.length - visibleTags.length)
  const hasTrafficTotals =
    probe.network.uploadTotal || probe.network.downloadTotal

  return (
    <button
      className="probe-card"
      onClick={() => onSelect(probe)}
      type="button"
    >
      <span className="probe-card-heading">
        <span className="probe-card-identity">
          <span
            aria-hidden="true"
            className={`status-dot status-${status.tone} freshness-${probe.freshness}`}
          />
          <span className="probe-card-copy">
            <strong>{probe.name}</strong>
            <small>{status.detail}</small>
          </span>
        </span>

        {probe.billing ? (
          <span className="probe-card-billing" data-tone={probe.billing.tone}>
            {probe.billing.price ? (
              <strong>{probe.billing.price}</strong>
            ) : null}
            {probe.billing.remaining ? (
              <span>{probe.billing.remaining}</span>
            ) : null}
            {probe.billing.expiresOn ? (
              <small>到期 {probe.billing.expiresOn}</small>
            ) : null}
            {probe.billing.autoRenewal ? <small>自动续费</small> : null}
          </span>
        ) : null}
      </span>

      {probe.publicRemark ? (
        <span className="probe-card-remark">{probe.publicRemark}</span>
      ) : null}

      {visibleTags.length ? (
        <span aria-label="标签" className="probe-card-tags">
          {visibleTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {extraTagCount ? <span>+{extraTagCount}</span> : null}
        </span>
      ) : null}

      <span className="probe-card-metrics">
        <MetricGauge label="CPU" tone="cpu" value={probe.cpu} />
        <MetricGauge label="内存" tone="memory" value={probe.memory} />
        <MetricGauge label="磁盘" tone="disk" value={probe.disk} />
        <MetricGauge label="Ping" suffix="ms" tone="ping" value={probe.ping} />
      </span>

      <span className="probe-card-traffic">
        <span className="probe-card-section-heading">
          <strong>流量</strong>
          {probe.traffic.basis ? <span>{probe.traffic.basis}</span> : null}
        </span>
        {probe.traffic.limit ? (
          <TrafficGauge traffic={probe.traffic} />
        ) : hasTrafficTotals ? (
          <span className="probe-card-totals">
            <span>↑{probe.network.uploadTotal ?? '—'}</span>
            <span>↓{probe.network.downloadTotal ?? '—'}</span>
          </span>
        ) : (
          <span className="probe-card-empty">—</span>
        )}
        {probe.traffic.limit && hasTrafficTotals ? (
          <span className="probe-card-totals">
            <span>↑{probe.network.uploadTotal ?? '—'}</span>
            <span>↓{probe.network.downloadTotal ?? '—'}</span>
          </span>
        ) : null}
      </span>

      <span className="probe-card-footer">
        <span>
          <small>速率</small>
          <strong>
            ↑{probe.network.uploadRate ?? '—'} ↓
            {probe.network.downloadRate ?? '—'}
          </strong>
        </span>
        <span>
          <small>系统</small>
          <strong>{systemLabel(probe) || '—'}</strong>
        </span>
        <span>
          <small>运行</small>
          <strong>{probe.uptime ?? '—'}</strong>
        </span>
      </span>
    </button>
  )
}

export function ProbeCardGrid({ probes, onSelect }: ProbeCardGridProps) {
  return (
    <div aria-label="探针卡片" className="probe-card-grid">
      {probes.map((probe) => (
        <ProbeCard key={probe.id} onSelect={onSelect} probe={probe} />
      ))}
    </div>
  )
}
