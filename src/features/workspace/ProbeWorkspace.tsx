import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AppearanceToggle,
  type ThemePreference,
} from '../../ui/AppearanceToggle'
import { GridIcon, ListIcon, SettingsIcon } from '../../ui/Icons'
import { ProbeOverviewPane } from './ProbeOverviewPane'
import { ProbeFilters } from './ProbeFilters'
import { useProbeFilters } from './useProbeFilters'
import type { WorkspaceProbe, WorkspaceView } from './types'

const WORKSPACE_VIEW_STORAGE_KEY = 'komarima-workspace-view'

function loadWorkspaceView(): WorkspaceView {
  if (typeof window === 'undefined') return 'list'
  try {
    return window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY) === 'cards'
      ? 'cards'
      : 'list'
  } catch {
    return 'list'
  }
}

function ViewSwitch({
  view,
  onChange,
}: {
  view: WorkspaceView
  onChange: (view: WorkspaceView) => void
}) {
  return (
    <div aria-label="视图" className="view-switch" role="group">
      <button
        aria-label="列表视图"
        aria-pressed={view === 'list'}
        className={view === 'list' ? 'is-active' : undefined}
        onClick={() => onChange('list')}
        title="列表视图"
        type="button"
      >
        <ListIcon />
      </button>
      <button
        aria-label="卡片视图"
        aria-pressed={view === 'cards'}
        className={view === 'cards' ? 'is-active' : undefined}
        onClick={() => onChange('cards')}
        title="卡片视图"
        type="button"
      >
        <GridIcon />
      </button>
    </div>
  )
}

export interface ProbeWorkspaceProps {
  probes: ReadonlyArray<WorkspaceProbe>
  siteName?: string
  defaultAppearance?: ThemePreference
  editorContent?: ReactNode
  footerLabel?: string
  refreshLabel?: string
  refreshTone?: 'online' | 'loading' | 'error'
}

export function ProbeWorkspace({
  probes,
  siteName = 'Komarima',
  defaultAppearance = 'system',
  editorContent,
  footerLabel = 'Powered by Komari Monitor.',
  refreshLabel = '最近刷新 8秒前',
  refreshTone = 'online',
}: ProbeWorkspaceProps) {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const editorActive = Boolean(editorContent)
  const [view, setView] = useState<WorkspaceView>(loadWorkspaceView)
  const filtering = useProbeFilters(probes)
  const selectedProbe = uuid
    ? (probes.find((probe) => probe.id === uuid) ?? null)
    : null

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, view)
    } catch {
      // The view still applies for the current session.
    }
  }, [view])

  useEffect(() => {
    if (!uuid || selectedProbe || !probes[0]) return
    navigate(
      {
        pathname: `/instance/${encodeURIComponent(probes[0].id)}`,
        search: location.search,
      },
      { replace: true },
    )
  }, [location.search, navigate, probes, selectedProbe, uuid])

  const onlineCount = probes.filter(
    (probe) => probe.connection === 'online',
  ).length
  const offlineCount = probes.filter(
    (probe) => probe.connection === 'offline',
  ).length
  const missingCount = probes.filter(
    (probe) => probe.freshness === 'missing',
  ).length

  const selectProbe = (probe: WorkspaceProbe) => {
    navigate(
      {
        pathname: `/instance/${encodeURIComponent(probe.id)}`,
        search: 'range=24h',
      },
      { state: { fromWorkspace: true } },
    )
  }

  return (
    <main className="km-app">
      <h1 className="sr-only">探针工作区</h1>
      <section aria-label="Komarima 探针工作区" className="km-window">
        <header className="top-toolbar">
          <div className="toolbar-start">
            {!editorActive ? (
              <ViewSwitch onChange={setView} view={view} />
            ) : null}
            <span className="brand" title={siteName}>
              {siteName}
            </span>
          </div>

          <p className="fleet-summary">
            <span className="sr-only">
              {onlineCount} 在线，{offlineCount} 离线，{missingCount} 暂无上报
            </span>
            <span aria-hidden="true" className="fleet-stat" data-tone="online">
              <span className="fleet-stat-dot" />
              <strong>{onlineCount}</strong>
              <span>在线</span>
            </span>
            <span aria-hidden="true" className="fleet-stat" data-tone="offline">
              <span className="fleet-stat-dot" />
              <strong>{offlineCount}</strong>
              <span>离线</span>
            </span>
            <span aria-hidden="true" className="fleet-stat" data-tone="missing">
              <span className="fleet-stat-dot" />
              <strong>{missingCount}</strong>
              <span>暂无上报</span>
            </span>
          </p>

          <div className="toolbar-actions">
            <AppearanceToggle defaultPreference={defaultAppearance} />
            <a
              aria-label="管理后台"
              className="toolbar-button toolbar-link"
              href="/admin"
            >
              <SettingsIcon className="toolbar-icon" />
              <span className="toolbar-label">管理</span>
            </a>
          </div>
        </header>

        <div className="workspace-content">
          {editorContent ? (
            <div className="editor-content-host">{editorContent}</div>
          ) : (
            <ProbeOverviewPane
              onSelect={selectProbe}
              probes={filtering.visible}
              view={view}
              totalCount={probes.length}
              emptyLabel={filtering.active ? '无匹配探针' : '暂无探针'}
              onReset={filtering.active ? filtering.reset : undefined}
              toolbar={
                <ProbeFilters
                  filters={filtering.filters}
                  groups={filtering.groups}
                  active={filtering.active}
                  onChange={filtering.update}
                  onReset={filtering.reset}
                />
              }
            />
          )}
        </div>

        <footer className="bottom-statusbar">
          <span>{footerLabel}</span>
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
