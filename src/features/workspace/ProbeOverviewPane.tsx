import { useRef, useState, type KeyboardEvent } from 'react'
import { ProbeCardGrid } from './ProbeCardGrid'
import { MetricGauge, TrafficGauge } from './ProbeMeters'
import { workspaceStatus } from './statusPresentation'
import type { WorkspaceProbe, WorkspaceView } from './types'

export interface ProbeOverviewPaneProps {
  probes: ReadonlyArray<WorkspaceProbe>
  view: WorkspaceView
  onSelect: (probe: WorkspaceProbe) => void
}

function probeSecondaryLabel(probe: WorkspaceProbe) {
  if (probe.publicRemark) return probe.publicRemark
  const status = workspaceStatus(probe)
  if (probe.connection !== 'online' || probe.freshness !== 'fresh') {
    return status.detail
  }

  return (
    [probe.region ?? probe.group, probe.operatingSystem]
      .filter(Boolean)
      .join(' · ') || status.detail
  )
}

function BillingCell({ probe }: { probe: WorkspaceProbe }) {
  if (!probe.billing) {
    return (
      <span aria-label="账单未设置" className="billing-cell is-empty">
        —
      </span>
    )
  }

  return (
    <span className="billing-cell" data-tone={probe.billing.tone}>
      <strong>{probe.billing.price ?? probe.billing.remaining ?? '—'}</strong>
      {probe.billing.price && probe.billing.remaining ? (
        <small>{probe.billing.remaining}</small>
      ) : probe.billing.expiresOn ? (
        <small>{probe.billing.expiresOn}</small>
      ) : probe.billing.autoRenewal ? (
        <small>自动续费</small>
      ) : null}
    </span>
  )
}

function NetworkCell({ probe }: { probe: WorkspaceProbe }) {
  if (!probe.network.uploadRate && !probe.network.downloadRate) {
    return (
      <span aria-label="网络暂无数据" className="network-cell is-empty">
        —
      </span>
    )
  }

  return (
    <span className="network-cell">
      <span>↑{probe.network.uploadRate ?? '—'}</span>
      <span>↓{probe.network.downloadRate ?? '—'}</span>
    </span>
  )
}

function TrafficCell({ probe }: { probe: WorkspaceProbe }) {
  return (
    <span className="traffic-cell">
      {probe.traffic.limit ? (
        <TrafficGauge compact traffic={probe.traffic} />
      ) : !probe.network.uploadTotal && !probe.network.downloadTotal ? (
        <span
          aria-label="流量暂无数据"
          className="traffic-totals-cell is-empty"
        >
          —
        </span>
      ) : (
        <span className="traffic-totals-cell">
          <span>↑{probe.network.uploadTotal ?? '—'}</span>
          <span>↓{probe.network.downloadTotal ?? '—'}</span>
        </span>
      )}
      {probe.traffic.resetLabel ? (
        <small className="traffic-reset-label">
          {probe.traffic.resetLabel}
        </small>
      ) : null}
    </span>
  )
}

function ProbeRow({
  index,
  setSize,
  probe,
  tabIndex,
  onFocus,
  onKeyDown,
  onSelect,
}: {
  index: number
  setSize: number
  probe: WorkspaceProbe
  tabIndex: number
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onSelect: (probe: WorkspaceProbe) => void
}) {
  const status = workspaceStatus(probe)
  return (
    <button
      className="probe-row"
      data-index={index}
      onClick={() => onSelect(probe)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      type="button"
    >
      <span className="probe-identity">
        <span
          aria-hidden="true"
          className={`status-dot status-${status.tone} freshness-${probe.freshness}`}
        />
        <span className="probe-copy">
          <strong>{probe.name}</strong>
          <span className="sr-only">{status.label}</span>
          <small>{probeSecondaryLabel(probe)}</small>
        </span>
      </span>
      <MetricGauge compact label="CPU" tone="cpu" value={probe.cpu} />
      <MetricGauge compact label="内存" tone="memory" value={probe.memory} />
      <span className="column-disk">
        <MetricGauge compact label="磁盘" tone="disk" value={probe.disk} />
      </span>
      <MetricGauge
        compact
        label="Ping"
        suffix="ms"
        tone="ping"
        value={probe.ping}
      />
      <span className="column-network">
        <NetworkCell probe={probe} />
      </span>
      <span className="column-traffic">
        <TrafficCell probe={probe} />
      </span>
      <span className="column-billing">
        <BillingCell probe={probe} />
      </span>
      <span className="sr-only">
        第{index + 1}项，共{setSize}项
      </span>
    </button>
  )
}

function ProbeList({
  probes,
  onSelect,
}: {
  probes: ReadonlyArray<WorkspaceProbe>
  onSelect: (probe: WorkspaceProbe) => void
}) {
  const [focusedProbeId, setFocusedProbeId] = useState(probes[0]?.id ?? '')
  const listRef = useRef<HTMLDivElement>(null)
  const focusedIndex = probes.findIndex((probe) => probe.id === focusedProbeId)
  const tabbableIndex = focusedIndex >= 0 ? focusedIndex : 0

  const focusProbeAt = (index: number) => {
    if (!probes.length) return
    const nextIndex = Math.max(0, Math.min(index, probes.length - 1))
    const nextProbe = probes[nextIndex]
    if (!nextProbe) return

    setFocusedProbeId(nextProbe.id)
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-index="${nextIndex}"]`)
        ?.focus()
    })
  }

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = index + 1
    if (event.key === 'ArrowUp') nextIndex = index - 1
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = probes.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    focusProbeAt(nextIndex)
  }

  return (
    <>
      <div aria-label="探针字段" className="probe-column-header">
        <span className="probe-column-identity">探针</span>
        <span>CPU</span>
        <span>内存</span>
        <span className="column-disk">磁盘</span>
        <span>Ping</span>
        <span className="column-network">网络</span>
        <span className="column-traffic">流量</span>
        <span className="column-billing">账单</span>
      </div>

      <div
        aria-label="探针列表"
        className="probe-list"
        ref={listRef}
        role="group"
      >
        {probes.map((probe, index) => (
          <ProbeRow
            index={index}
            key={probe.id}
            onFocus={() => setFocusedProbeId(probe.id)}
            onKeyDown={(event) => handleRowKeyDown(event, index)}
            onSelect={onSelect}
            probe={probe}
            setSize={probes.length}
            tabIndex={index === tabbableIndex ? 0 : -1}
          />
        ))}
      </div>
    </>
  )
}

export function ProbeOverviewPane({
  probes,
  view,
  onSelect,
}: ProbeOverviewPaneProps) {
  return (
    <section
      aria-labelledby="probe-overview-title"
      className={`workspace-pane overview-pane view-${view}`}
    >
      <header className="pane-heading overview-heading">
        <h2 id="probe-overview-title">探针</h2>
      </header>

      {probes.length ? (
        view === 'cards' ? (
          <ProbeCardGrid onSelect={onSelect} probes={probes} />
        ) : (
          <ProbeList onSelect={onSelect} probes={probes} />
        )
      ) : (
        <div className="empty-state">
          <strong>暂无探针</strong>
        </div>
      )}
    </section>
  )
}
