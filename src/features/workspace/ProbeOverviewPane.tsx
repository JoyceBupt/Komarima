import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { ProbeCardGrid } from './ProbeCardGrid'
import { MetricGauge, TrafficGauge } from './ProbeMeters'
import { workspaceStatus } from './statusPresentation'
import type {
  ProbeSort,
  ProbeSortKey,
  WorkspaceProbe,
  WorkspaceView,
} from './types'
import { nextProbeSort, sortWorkspaceProbes } from './workspaceModel'

export interface ProbeOverviewPaneProps {
  probes: ReadonlyArray<WorkspaceProbe>
  view: WorkspaceView
  onSelect: (probe: WorkspaceProbe) => void
}

function SortableColumnHeader({
  column,
  label,
  sort,
  className,
  onSort,
}: {
  column: ProbeSortKey
  label: string
  sort: ProbeSort | null
  className?: string
  onSort: (key: ProbeSortKey) => void
}) {
  const active = sort?.key === column
  const next = nextProbeSort(sort, column)
  const ariaSort = active && sort ? sort.direction : 'none'
  const currentDirection =
    active && sort ? (sort.direction === 'ascending' ? '升序' : '降序') : null
  const nextDirection = next.direction === 'ascending' ? '升序' : '降序'

  return (
    <span aria-label={label} className={className}>
      <button
        aria-label={
          currentDirection
            ? `${label}，当前${currentDirection}，切换为${nextDirection}`
            : `按${label}${nextDirection}排列`
        }
        aria-pressed={active}
        className="probe-sort-button"
        data-sort-direction={ariaSort}
        onClick={() => onSort(column)}
        type="button"
      >
        <span aria-hidden="true">{label}</span>
        <span aria-hidden="true" className="probe-sort-mark">
          {active ? (sort?.direction === 'ascending' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </span>
  )
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
  if (probe.traffic.limit) {
    return <TrafficGauge compact traffic={probe.traffic} />
  }

  if (!probe.network.uploadTotal && !probe.network.downloadTotal) {
    return (
      <span aria-label="流量暂无数据" className="traffic-totals-cell is-empty">
        —
      </span>
    )
  }

  return (
    <span className="traffic-totals-cell">
      <span>↑{probe.network.uploadTotal ?? '—'}</span>
      <span>↓{probe.network.downloadTotal ?? '—'}</span>
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
  style,
  measure,
}: {
  index: number
  setSize: number
  probe: WorkspaceProbe
  tabIndex: number
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onSelect: (probe: WorkspaceProbe) => void
  style?: CSSProperties
  measure?: (element: HTMLButtonElement | null) => void
}) {
  const status = workspaceStatus(probe)
  return (
    <button
      className="probe-row"
      data-index={index}
      onClick={() => onSelect(probe)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      ref={measure}
      style={style}
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
  sort,
  onSort,
  onSelect,
}: {
  probes: WorkspaceProbe[]
  sort: ProbeSort | null
  onSort: (key: ProbeSortKey) => void
  onSelect: (probe: WorkspaceProbe) => void
}) {
  'use no memo'

  const [focusedProbeId, setFocusedProbeId] = useState(probes[0]?.id ?? '')
  const listRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = probes.length > 100
  // TanStack Virtual owns mutable measurement state, so this component opts out of compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? probes.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 104,
    overscan: 8,
    getItemKey: (index) => probes[index]?.id ?? index,
  })
  const focusedIndex = probes.findIndex((probe) => probe.id === focusedProbeId)
  const tabbableIndex = focusedIndex >= 0 ? focusedIndex : 0

  const focusProbeAt = (index: number) => {
    if (!probes.length) return
    const nextIndex = Math.max(0, Math.min(index, probes.length - 1))
    const nextProbe = probes[nextIndex]
    if (!nextProbe) return

    setFocusedProbeId(nextProbe.id)
    if (shouldVirtualize)
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' })
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
      <div aria-label="探针排序" className="probe-column-header">
        <SortableColumnHeader
          className="probe-column-identity"
          column="name"
          label="探针"
          onSort={onSort}
          sort={sort}
        />
        <SortableColumnHeader
          column="cpu"
          label="CPU"
          onSort={onSort}
          sort={sort}
        />
        <SortableColumnHeader
          column="memory"
          label="内存"
          onSort={onSort}
          sort={sort}
        />
        <SortableColumnHeader
          className="column-disk"
          column="disk"
          label="磁盘"
          onSort={onSort}
          sort={sort}
        />
        <SortableColumnHeader
          column="ping"
          label="Ping"
          onSort={onSort}
          sort={sort}
        />
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
        {shouldVirtualize ? (
          <div
            className="virtual-probe-space"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const probe = probes[row.index]
              return probe ? (
                <ProbeRow
                  index={row.index}
                  key={probe.id}
                  measure={(element) => virtualizer.measureElement(element)}
                  onFocus={() => setFocusedProbeId(probe.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, row.index)}
                  onSelect={onSelect}
                  probe={probe}
                  setSize={probes.length}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: `translateY(${row.start}px)`,
                  }}
                  tabIndex={row.index === tabbableIndex ? 0 : -1}
                />
              ) : null
            })}
          </div>
        ) : (
          probes.map((probe, index) => (
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
          ))
        )}
      </div>
    </>
  )
}

export function ProbeOverviewPane({
  probes,
  view,
  onSelect,
}: ProbeOverviewPaneProps) {
  const [sort, setSort] = useState<ProbeSort | null>(null)
  const sortedProbes = useMemo(
    () => sortWorkspaceProbes(probes, sort),
    [probes, sort],
  )

  return (
    <section
      aria-labelledby="probe-overview-title"
      className={`workspace-pane overview-pane view-${view}`}
    >
      <header className="pane-heading overview-heading">
        <h2 id="probe-overview-title">探针</h2>
      </header>

      {sortedProbes.length ? (
        view === 'cards' ? (
          <ProbeCardGrid onSelect={onSelect} probes={sortedProbes} />
        ) : (
          <ProbeList
            onSelect={onSelect}
            onSort={(key) => setSort((current) => nextProbeSort(current, key))}
            probes={sortedProbes}
            sort={sort}
          />
        )
      ) : (
        <div className="empty-state">
          <strong>暂无探针</strong>
        </div>
      )}
    </section>
  )
}
