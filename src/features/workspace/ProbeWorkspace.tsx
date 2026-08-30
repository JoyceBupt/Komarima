import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { AppearanceMenu, type ThemePreference } from '../../ui/AppearanceMenu'
import { FilterIcon, MenuIcon, PanelIcon, SearchIcon } from '../../ui/Icons'
import { demoProbes } from './demoData'
import { InspectorPane } from './InspectorPane'
import { NavigatorPane } from './NavigatorPane'
import { ProbeEditorPane } from './ProbeEditorPane'
import type {
  NavigatorSelection,
  ProbeSort,
  ProbeSortDirection,
  ProbeSortKey,
  WorkspaceProbe,
} from './types'
import { matchesNavigatorSelection } from './workspaceModel'

type ConnectionFilter = 'all' | 'online' | 'offline' | 'unknown'
type FreshnessFilter = 'all' | 'fresh' | 'delayed' | 'missing' | 'issue'

const connectionOptions: ReadonlyArray<{
  value: ConnectionFilter
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'unknown', label: '未知' },
]

const freshnessOptions: ReadonlyArray<{
  value: FreshnessFilter
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'fresh', label: '正常' },
  { value: 'delayed', label: '延迟' },
  { value: 'missing', label: '暂无' },
  { value: 'issue', label: '异常' },
]

const sortKeys = new Set<ProbeSortKey>([
  'name',
  'cpu',
  'memory',
  'disk',
  'ping',
])

function parseConnectionFilter(value: string | null): ConnectionFilter {
  return value === 'online' || value === 'offline' || value === 'unknown'
    ? value
    : 'all'
}

function parseFreshnessFilter(value: string | null): FreshnessFilter {
  return value === 'fresh' ||
    value === 'delayed' ||
    value === 'missing' ||
    value === 'issue'
    ? value
    : 'all'
}

function matchesConnection(probe: WorkspaceProbe, filter: ConnectionFilter) {
  return filter === 'all' || probe.connection === filter
}

function matchesFreshness(probe: WorkspaceProbe, filter: FreshnessFilter) {
  if (filter === 'all') return true
  if (filter === 'fresh') return probe.freshness === 'fresh'
  if (filter === 'missing') return probe.freshness === 'missing'
  if (filter === 'delayed') {
    return probe.freshness === 'delayed' || probe.freshness === 'stale'
  }
  return probe.freshness === 'clock-skew' || probe.freshness === 'invalid'
}

function navigatorSelectionFromParams(
  group: string | null,
  region: string | null,
): NavigatorSelection {
  if (!group) return { kind: 'all' }
  return region ? { kind: 'region', group, region } : { kind: 'group', group }
}

function parseSort(
  key: string | null,
  direction: string | null,
): ProbeSort | null {
  if (!key || !sortKeys.has(key as ProbeSortKey)) return null
  const normalizedDirection: ProbeSortDirection =
    direction === 'asc' ? 'ascending' : 'descending'
  return { key: key as ProbeSortKey, direction: normalizedDirection }
}

function initialPanelState(query: string) {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia(query).matches
}

export interface ProbeWorkspaceProps {
  probes?: ReadonlyArray<WorkspaceProbe>
  defaultAppearance?: ThemePreference
  editorContent?: ReactNode
  footerLabel?: string
  refreshLabel?: string
  refreshTone?: 'online' | 'loading' | 'error'
}

export function ProbeWorkspace({
  probes = demoProbes,
  defaultAppearance = 'system',
  editorContent,
  footerLabel = 'Powered by Komari Monitor.',
  refreshLabel = '最近刷新 8秒前',
  refreshTone = 'online',
}: ProbeWorkspaceProps) {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchInput = useRef<HTMLInputElement>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  const searchPopover = useRef<HTMLDivElement>(null)
  const filterPopover = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [navigatorOpen, setNavigatorOpen] = useState(() =>
    initialPanelState('(min-width: 1100px)'),
  )
  const [inspectorOpen, setInspectorOpen] = useState(
    () => Boolean(uuid) || initialPanelState('(min-width: 1440px)'),
  )
  const [navigatorDocked, setNavigatorDocked] = useState(() =>
    initialPanelState('(min-width: 1100px)'),
  )
  const [inspectorDocked, setInspectorDocked] = useState(() =>
    initialPanelState('(min-width: 1440px)'),
  )

  useEffect(() => {
    const navigatorMedia = window.matchMedia?.('(min-width: 1100px)')
    const inspectorMedia = window.matchMedia?.('(min-width: 1440px)')
    const updateNavigator = (event: MediaQueryListEvent) => {
      setNavigatorDocked(event.matches)
      setNavigatorOpen(event.matches)
    }
    const updateInspector = (event: MediaQueryListEvent) => {
      setInspectorDocked(event.matches)
      setInspectorOpen(event.matches)
    }

    navigatorMedia?.addEventListener('change', updateNavigator)
    inspectorMedia?.addEventListener('change', updateInspector)

    return () => {
      navigatorMedia?.removeEventListener('change', updateNavigator)
      inspectorMedia?.removeEventListener('change', updateInspector)
    }
  }, [])

  useEffect(() => {
    if (searchOpen) {
      searchInput.current?.focus()
    }
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen && !filterOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (
        searchOpen &&
        !searchPopover.current?.contains(event.target) &&
        !searchTrigger.current?.contains(event.target)
      ) {
        setSearchOpen(false)
      }
      if (
        filterOpen &&
        !filterPopover.current?.contains(event.target) &&
        !filterTrigger.current?.contains(event.target)
      ) {
        setFilterOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (searchOpen) {
        setSearchOpen(false)
        searchTrigger.current?.focus()
      }
      if (filterOpen) {
        setFilterOpen(false)
        filterTrigger.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filterOpen, searchOpen])

  const updateSearchParams = (
    updates: Record<string, string | null>,
    replace = true,
  ) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (!value) next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace })
  }

  const query = searchParams.get('q') ?? ''
  const connectionFilter = parseConnectionFilter(searchParams.get('connection'))
  const freshnessFilter = parseFreshnessFilter(searchParams.get('freshness'))
  const navigatorSelection = navigatorSelectionFromParams(
    searchParams.get('group'),
    searchParams.get('region'),
  )
  const sort = parseSort(searchParams.get('sort'), searchParams.get('dir'))
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleProbes = probes.filter((probe) => {
    const matchesNavigator = matchesNavigatorSelection(
      probe,
      navigatorSelection,
    )
    const matchesQuery =
      !normalizedQuery ||
      `${probe.name} ${probe.group ?? ''} ${probe.region ?? ''} ${probe.operatingSystem ?? ''}`
        .toLocaleLowerCase('zh-CN')
        .includes(normalizedQuery)
    return (
      matchesNavigator &&
      matchesQuery &&
      matchesConnection(probe, connectionFilter) &&
      matchesFreshness(probe, freshnessFilter)
    )
  })
  const selectedProbe =
    visibleProbes.find((probe) => probe.id === uuid) ?? visibleProbes[0] ?? null

  useEffect(() => {
    if (!uuid || !selectedProbe || selectedProbe.id === uuid) return
    navigate(
      { pathname: `/instance/${selectedProbe.id}`, search: location.search },
      { replace: true },
    )
  }, [location.search, navigate, selectedProbe, uuid])

  const onlineCount = probes.filter(
    (probe) => probe.connection === 'online',
  ).length
  const offlineCount = probes.filter(
    (probe) => probe.connection === 'offline',
  ).length
  const missingCount = probes.filter(
    (probe) => probe.freshness === 'missing',
  ).length
  const navigatorModal = navigatorOpen && !navigatorDocked
  const inspectorModal = inspectorOpen && !inspectorDocked
  const overlayOpen = navigatorModal || inspectorModal

  const selectProbe = (probe: WorkspaceProbe) => {
    navigate({ pathname: `/instance/${probe.id}`, search: location.search })
    if (!initialPanelState('(min-width: 1440px)')) {
      setInspectorOpen(true)
    }
  }

  return (
    <main className="km-app">
      <h1 className="sr-only">探针工作区</h1>
      <section aria-label="Komarima 探针工作区" className="km-window">
        <header className="top-toolbar">
          <div className="toolbar-start">
            <div className="panel-toggle-group">
              <button
                aria-controls="probe-navigator"
                aria-expanded={navigatorOpen}
                aria-label="切换导航"
                onClick={() => {
                  if (!navigatorOpen && !navigatorDocked) {
                    setInspectorOpen(false)
                  }
                  setNavigatorOpen((current) => !current)
                }}
                type="button"
              >
                <MenuIcon />
              </button>
              <button
                aria-controls="probe-inspector"
                aria-expanded={inspectorOpen}
                aria-label="切换检查器"
                onClick={() => {
                  if (!inspectorOpen && !inspectorDocked) {
                    setNavigatorOpen(false)
                  }
                  setInspectorOpen((current) => !current)
                }}
                type="button"
              >
                <PanelIcon />
              </button>
            </div>
            <span className="brand">Komarima</span>
          </div>

          <p className="fleet-summary">
            {onlineCount} 在线<span aria-hidden="true"> · </span>
            {offlineCount} 离线<span aria-hidden="true"> · </span>
            {missingCount} 暂无上报
          </p>

          <div className="toolbar-actions">
            <div className="toolbar-popover">
              <button
                aria-expanded={searchOpen}
                aria-haspopup="dialog"
                className="toolbar-button"
                onClick={() => setSearchOpen((current) => !current)}
                ref={searchTrigger}
                type="button"
              >
                <SearchIcon className="toolbar-icon" />
                <span className="toolbar-label">搜索</span>
              </button>
              {searchOpen ? (
                <div
                  aria-label="搜索探针"
                  className="search-popover"
                  ref={searchPopover}
                  role="dialog"
                >
                  <SearchIcon aria-hidden="true" />
                  <input
                    aria-label="搜索探针"
                    onChange={(event) =>
                      updateSearchParams({ q: event.target.value })
                    }
                    placeholder="名称或分组"
                    ref={searchInput}
                    type="search"
                    value={query}
                  />
                </div>
              ) : null}
            </div>

            <div className="toolbar-popover">
              <button
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                className={
                  connectionFilter !== 'all' || freshnessFilter !== 'all'
                    ? 'toolbar-button is-active'
                    : 'toolbar-button'
                }
                onClick={() => setFilterOpen((current) => !current)}
                ref={filterTrigger}
                type="button"
              >
                <FilterIcon className="toolbar-icon" />
                <span className="toolbar-label">筛选</span>
              </button>
              {filterOpen ? (
                <div
                  aria-label="状态筛选"
                  className="popover-menu filter-menu"
                  ref={filterPopover}
                  role="dialog"
                >
                  <label>
                    <span>连接</span>
                    <select
                      aria-label="连接状态"
                      onChange={(event) =>
                        updateSearchParams({
                          connection:
                            event.target.value === 'all'
                              ? null
                              : event.target.value,
                        })
                      }
                      value={connectionFilter}
                    >
                      {connectionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>数据</span>
                    <select
                      aria-label="数据状态"
                      onChange={(event) =>
                        updateSearchParams({
                          freshness:
                            event.target.value === 'all'
                              ? null
                              : event.target.value,
                        })
                      }
                      value={freshnessFilter}
                    >
                      {freshnessOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="filter-reset"
                    onClick={() =>
                      updateSearchParams({
                        connection: null,
                        freshness: null,
                      })
                    }
                    type="button"
                  >
                    清除
                  </button>
                </div>
              ) : null}
            </div>

            <AppearanceMenu defaultPreference={defaultAppearance} />
          </div>
        </header>

        <div
          className="workspace-grid"
          data-inspector-open={inspectorOpen}
          data-nav-open={navigatorOpen}
          data-overlay-open={overlayOpen}
        >
          <button
            aria-label="关闭面板"
            className="panel-scrim"
            onClick={() => {
              if (!initialPanelState('(min-width: 1100px)'))
                setNavigatorOpen(false)
              setInspectorOpen(false)
            }}
            tabIndex={overlayOpen ? 0 : -1}
            type="button"
          />
          <NavigatorPane
            isOpen={navigatorOpen}
            onClose={() => setNavigatorOpen(false)}
            modal={navigatorModal}
            onSelect={(selection) => {
              if (selection.kind === 'all') {
                updateSearchParams({ group: null, region: null })
              } else if (selection.kind === 'group') {
                updateSearchParams({ group: selection.group, region: null })
              } else {
                updateSearchParams({
                  group: selection.group,
                  region: selection.region,
                })
              }
            }}
            probes={probes}
            selection={navigatorSelection}
          />
          {editorContent ? (
            <div
              className="editor-content-host"
              inert={overlayOpen || undefined}
            >
              {editorContent}
            </div>
          ) : (
            <ProbeEditorPane
              emptyState={probes.length ? 'no-results' : 'no-probes'}
              inert={overlayOpen}
              onSelect={selectProbe}
              onSortChange={(nextSort) =>
                updateSearchParams({
                  sort: nextSort.key,
                  dir: nextSort.direction === 'ascending' ? 'asc' : 'desc',
                })
              }
              probes={visibleProbes}
              selectedId={selectedProbe?.id ?? ''}
              sort={sort}
            />
          )}
          <InspectorPane
            isOpen={inspectorOpen}
            modal={inspectorModal}
            onClose={() => setInspectorOpen(false)}
            probe={selectedProbe}
          />
        </div>

        <footer className="bottom-statusbar">
          <span>{footerLabel}</span>
          <span>显示 {visibleProbes.length} 个</span>
          <span className="refresh-status">
            {refreshLabel}
            <span
              aria-hidden="true"
              className={`status-dot status-${
                refreshTone === 'error'
                  ? 'offline'
                  : refreshTone === 'loading'
                    ? 'unknown'
                    : 'online'
              }`}
            />
          </span>
        </footer>
      </section>
    </main>
  )
}
