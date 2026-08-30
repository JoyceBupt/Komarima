import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { workspaceStatus } from './statusPresentation'
import type { ProbeSort, ProbeSortKey, WorkspaceProbe } from './types'
import { nextProbeSort, sortWorkspaceProbes } from './workspaceModel'

export interface ProbeEditorPaneProps {
  probes: ReadonlyArray<WorkspaceProbe>
  selectedId: string
  emptyState?: 'no-probes' | 'no-results'
  sort?: ProbeSort | null
  defaultSort?: ProbeSort | null
  onSelect: (probe: WorkspaceProbe) => void
  onSortChange?: (sort: ProbeSort) => void
  inert?: boolean
}

type MetricTone = 'cpu' | 'memory' | 'disk' | 'ping'

function MetricCell({
  label,
  tone,
  value,
  suffix = '%',
}: {
  label: string
  tone: MetricTone
  value: number | null
  suffix?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span
        aria-label={`${label}暂无数据`}
        className={`metric-cell metric-${tone} is-empty`}
      >
        —
      </span>
    )
  }

  const progress = tone === 'ping' ? Math.min((value / 250) * 100, 100) : value

  return (
    <span
      aria-label={`${label}${value}${suffix}`}
      className={`metric-cell metric-${tone}`}
    >
      <span className="metric-value">
        {value}
        {suffix}
      </span>
      <span aria-hidden="true" className="metric-track">
        <span
          className="metric-track-value"
          style={{ width: `${progress}%` } as CSSProperties}
        />
      </span>
    </span>
  )
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

  return (
    <span aria-label={label} className={className}>
      <button
        aria-label={`按${label}${next.direction === 'ascending' ? '升序' : '降序'}排列`}
        aria-pressed={active}
        data-sort-direction={ariaSort}
        className={`flex w-full cursor-pointer items-center gap-1 bg-transparent p-0 text-inherit ${
          column === 'name' ? 'justify-start' : 'justify-center'
        }`}
        onClick={() => onSort(column)}
        type="button"
      >
        <span aria-hidden="true">{label}</span>
        <span
          aria-hidden="true"
          className={`text-[10px] ${
            active ? 'text-(--km-blue)' : 'text-(--km-text-tertiary)'
          }`}
        >
          {active ? (sort?.direction === 'ascending' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </span>
  )
}

function probeSecondaryLabel(probe: WorkspaceProbe) {
  const status = workspaceStatus(probe)
  if (probe.connection !== 'online' || probe.freshness !== 'fresh') {
    return status.detail
  }

  const contextLabel = probe.region ?? probe.group
  if (contextLabel && probe.operatingSystem) {
    return `${contextLabel} · ${probe.operatingSystem}`
  }
  return contextLabel ?? probe.operatingSystem ?? status.detail
}

function ProbeRow({
  probe,
  selected,
  onSelect,
  style,
  virtualIndex,
  measure,
}: {
  probe: WorkspaceProbe
  selected: boolean
  onSelect: (probe: WorkspaceProbe) => void
  style?: CSSProperties
  virtualIndex?: number
  measure?: (element: HTMLButtonElement | null) => void
}) {
  const status = workspaceStatus(probe)
  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={selected ? 'probe-row is-selected' : 'probe-row'}
      data-index={virtualIndex}
      onClick={() => onSelect(probe)}
      ref={measure}
      style={style}
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
      <MetricCell label="CPU" tone="cpu" value={probe.cpu} />
      <MetricCell label="内存" tone="memory" value={probe.memory} />
      <span className="column-disk">
        <MetricCell label="磁盘" tone="disk" value={probe.disk} />
      </span>
      <MetricCell label="Ping" suffix="ms" tone="ping" value={probe.ping} />
      <span className="network-cell column-network">
        {probe.uploadRate && probe.downloadRate ? (
          <>
            <span>↑{probe.uploadRate}</span>
            <span>↓{probe.downloadRate}</span>
            <span aria-hidden="true" className="network-track" />
          </>
        ) : (
          <span aria-label="网络暂无数据" className="network-empty">
            —
          </span>
        )}
      </span>
    </button>
  )
}

export function ProbeEditorPane({
  probes,
  selectedId,
  sort: controlledSort,
  defaultSort = null,
  onSelect,
  onSortChange,
  inert = false,
  emptyState = 'no-probes',
}: ProbeEditorPaneProps) {
  'use no memo'

  const [internalSort, setInternalSort] = useState<ProbeSort | null>(
    defaultSort,
  )
  const sort = controlledSort ?? internalSort
  const sortedProbes = sortWorkspaceProbes(probes, sort)
  const listRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = sortedProbes.length > 100
  // TanStack Virtual owns mutable measurement state, so this component opts out of compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? sortedProbes.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 86,
    overscan: 8,
    getItemKey: (index) => sortedProbes[index]?.id ?? index,
  })

  useEffect(() => {
    if (!shouldVirtualize) return
    const selectedIndex = sortedProbes.findIndex(
      (probe) => probe.id === selectedId,
    )
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedId, shouldVirtualize, sortedProbes, virtualizer])

  const changeSort = (key: ProbeSortKey) => {
    const next = nextProbeSort(sort, key)
    if (controlledSort === undefined) setInternalSort(next)
    onSortChange?.(next)
  }

  return (
    <section
      aria-labelledby="probe-editor-title"
      className="workspace-pane editor-pane"
      inert={inert || undefined}
    >
      <header className="pane-heading editor-heading">
        <h2 id="probe-editor-title">全部探针</h2>
      </header>

      <div aria-label="探针排序" className="probe-column-header">
        <SortableColumnHeader
          className="probe-column-identity"
          column="name"
          label="探针"
          onSort={changeSort}
          sort={sort}
        />
        <SortableColumnHeader
          column="cpu"
          label="CPU"
          onSort={changeSort}
          sort={sort}
        />
        <SortableColumnHeader
          column="memory"
          label="内存"
          onSort={changeSort}
          sort={sort}
        />
        <SortableColumnHeader
          className="column-disk"
          column="disk"
          label="磁盘"
          onSort={changeSort}
          sort={sort}
        />
        <SortableColumnHeader
          column="ping"
          label="Ping"
          onSort={changeSort}
          sort={sort}
        />
        <span className="column-network">网络</span>
      </div>

      <div
        aria-label="探针列表"
        className="probe-list"
        ref={listRef}
        role="group"
      >
        {sortedProbes.length ? (
          shouldVirtualize ? (
            <div
              className="virtual-probe-space"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const probe = sortedProbes[row.index]
                return probe ? (
                  <ProbeRow
                    key={probe.id}
                    measure={(element) => virtualizer.measureElement(element)}
                    onSelect={onSelect}
                    probe={probe}
                    selected={selectedId === probe.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      transform: `translateY(${row.start}px)`,
                    }}
                    virtualIndex={row.index}
                  />
                ) : null
              })}
            </div>
          ) : (
            sortedProbes.map((probe) => (
              <ProbeRow
                key={probe.id}
                onSelect={onSelect}
                probe={probe}
                selected={selectedId === probe.id}
              />
            ))
          )
        ) : (
          <div className="empty-state">
            <strong>
              {emptyState === 'no-results' ? '没有结果' : '暂无探针'}
            </strong>
            <span>
              {emptyState === 'no-results' ? '调整搜索或筛选' : '等待探针接入'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
