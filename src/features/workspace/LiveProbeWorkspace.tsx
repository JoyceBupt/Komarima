import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  KomariApiClient,
  isPublicDataAccessDenied,
  komariQueryKeys,
  publicDataAccessScope,
  revokePublicDataAccess,
  settingsFromBootstrap,
  shouldRecoverPublicDataAccess,
  useBootstrapQuery,
  useLatestStatusesQuery,
  useMetricQuery,
  useNodesQuery,
  usePingTasksQuery,
} from '../../api'
import { normalizeMetricSeries } from '../../domain'
import {
  HistoryDetailView,
  type HistoryLoadState,
  type HistoryRange,
} from '../history'
import { workspaceProbesFromDomain } from './fromDomain'
import { ProbeWorkspace } from './ProbeWorkspace'

const defaultClient = new KomariApiClient()
const historyHours: Record<HistoryRange, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 168,
}

function useClock(active: boolean) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [active])

  return now
}

function refreshAgeLabel(updatedAt: number, now: Date) {
  if (!updatedAt) return '正在刷新'
  const ageSeconds = Math.max(
    0,
    Math.floor((now.getTime() - updatedAt) / 1_000),
  )
  if (ageSeconds < 2) return '刚刚刷新'
  if (ageSeconds < 60) return `最近刷新 ${ageSeconds}秒前`
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 60) return `最近刷新 ${minutes}分钟前`
  return `最近刷新 ${Math.floor(minutes / 60)}小时前`
}

function parseHistoryRange(value: string | null): HistoryRange {
  return value === '1h' || value === '24h' || value === '7d' ? value : '6h'
}

function WorkspaceGate({
  title,
  message,
  action,
}: {
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <main className="km-app">
      <section
        aria-label="Komarima 探针工作区"
        className="km-window km-gate-window"
      >
        <header className="gate-toolbar">
          <span className="brand">Komarima</span>
        </header>
        <div className="workspace-gate">
          <span aria-hidden="true" className="gate-mark" />
          <h1>{title}</h1>
          {message ? <p>{message}</p> : null}
          {action}
        </div>
        <footer className="bottom-statusbar gate-statusbar">
          <span>Powered by Komari Monitor.</span>
        </footer>
      </section>
    </main>
  )
}

export interface LiveProbeWorkspaceProps {
  client?: KomariApiClient
}

export function LiveProbeWorkspace({
  client = defaultClient,
}: LiveProbeWorkspaceProps) {
  const queryClient = useQueryClient()
  const { uuid } = useParams<{ uuid: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const bootstrapQuery = useBootstrapQuery(client)
  const nodesQuery = useNodesQuery(client, bootstrapQuery.data)
  const nodeIds = nodesQuery.data?.map((node) => node.uuid) ?? []
  const latestQuery = useLatestStatusesQuery(
    client,
    bootstrapQuery.data,
    nodesQuery.isSuccess ? nodeIds : [],
  )
  const now = useClock(Boolean(nodesQuery.data?.length))
  const historyRange = parseHistoryRange(searchParams.get('range'))
  const selectedNode = nodesQuery.data?.find((node) => node.uuid === uuid)
  const historyActive =
    searchParams.get('view') === 'history' && Boolean(selectedNode)
  const historyBase = selectedNode
    ? {
        entity_id: selectedNode.uuid,
        hours: historyHours[historyRange],
        max_points: 240,
      }
    : null
  const resourceHistory = useMetricQuery(
    client,
    bootstrapQuery.data,
    historyBase
      ? {
          ...historyBase,
          metric_keys: ['cpu.usage', 'memory.used', 'disk.used'],
        }
      : null,
    historyActive,
  )
  const networkHistory = useMetricQuery(
    client,
    bootstrapQuery.data,
    historyBase
      ? {
          ...historyBase,
          metric_keys: ['net.in.rate', 'net.out.rate'],
        }
      : null,
    historyActive,
  )
  const pingTasks = usePingTasksQuery(
    client,
    bootstrapQuery.data,
    historyActive,
  )
  const pingTask = pingTasks.data
    ?.filter(
      (task) =>
        Boolean(selectedNode) && task.clients.includes(selectedNode!.uuid),
    )
    .sort((left, right) => left.weight - right.weight || left.id - right.id)[0]
  const pingHistory = useMetricQuery(
    client,
    bootstrapQuery.data,
    historyBase && pingTask
      ? {
          ...historyBase,
          metric_key: 'ping.latency_ms',
          tags: { task_id: String(pingTask.id) },
        }
      : null,
    historyActive && resourceHistory.isSuccess && networkHistory.isSuccess,
  )
  const accessScope = publicDataAccessScope(bootstrapQuery.data)
  const previousAccessScope = useRef(accessScope)
  const [recoveredAccessScopes, setRecoveredAccessScopes] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const recoveryStartedScopes = useRef(new Set<string>())
  const accessError = [
    nodesQuery.error,
    latestQuery.error,
    resourceHistory.error,
    networkHistory.error,
    pingTasks.error,
    pingHistory.error,
  ].find(isPublicDataAccessDenied)
  const accessRecoveryPending = shouldRecoverPublicDataAccess(
    accessScope,
    recoveredAccessScopes,
    accessError,
  )
  const historySeries = useMemo(
    () =>
      [
        ...(resourceHistory.data?.series ?? []),
        ...(networkHistory.data?.series ?? []),
        ...(pingHistory.data?.series ?? []),
      ].map(normalizeMetricSeries),
    [networkHistory.data, pingHistory.data, resourceHistory.data],
  )
  const historyState: HistoryLoadState =
    resourceHistory.isError ||
    networkHistory.isError ||
    pingTasks.isError ||
    pingHistory.isError
      ? 'error'
      : resourceHistory.isPending ||
          networkHistory.isPending ||
          pingTasks.isPending ||
          (Boolean(pingTask) && pingHistory.isPending)
        ? 'loading'
        : 'ready'
  const closeHistory = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    next.delete('range')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const changeHistoryRange = useCallback(
    (range: HistoryRange) => {
      const next = new URLSearchParams(searchParams)
      next.set('view', 'history')
      next.set('range', range)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )
  const { refetch: refetchResourceHistory } = resourceHistory
  const { refetch: refetchNetworkHistory } = networkHistory
  const { refetch: refetchPingTasks } = pingTasks
  const { refetch: refetchPingHistory } = pingHistory
  const retryHistory = useCallback(() => {
    void refetchResourceHistory()
    void refetchNetworkHistory()
    void refetchPingTasks()
    if (pingTask) void refetchPingHistory()
  }, [
    pingTask,
    refetchNetworkHistory,
    refetchPingHistory,
    refetchPingTasks,
    refetchResourceHistory,
  ])
  const historyContent = useMemo(
    () =>
      historyActive && selectedNode ? (
        <section className="workspace-pane history-editor-shell">
          <div className="history-editor-toolbar">
            <button autoFocus onClick={closeHistory} type="button">
              返回探针
            </button>
          </div>
          <HistoryDetailView
            defaultView="history"
            errorMessage="历史暂不可用"
            nodeName={selectedNode.name}
            onRangeChange={changeHistoryRange}
            onRetry={retryHistory}
            range={historyRange}
            series={historySeries}
            state={historyState}
          />
        </section>
      ) : undefined,
    [
      changeHistoryRange,
      closeHistory,
      historyActive,
      historyRange,
      historySeries,
      historyState,
      retryHistory,
      selectedNode,
    ],
  )

  useEffect(() => {
    const previous = previousAccessScope.current
    previousAccessScope.current = accessScope
    if (previous === 'pending' || previous === accessScope) return

    const previousKey = [...komariQueryKeys.dataRoot(client), previous] as const
    void queryClient.cancelQueries({ queryKey: previousKey })
    queryClient.removeQueries({ queryKey: previousKey })
  }, [accessScope, client, queryClient])

  useEffect(() => {
    if (
      !shouldRecoverPublicDataAccess(
        accessScope,
        recoveredAccessScopes,
        accessError,
      )
    ) {
      return
    }
    if (recoveryStartedScopes.current.has(accessScope)) return
    recoveryStartedScopes.current.add(accessScope)
    setRecoveredAccessScopes((current) => {
      const next = new Set(current)
      next.add(accessScope)
      return next
    })
    void revokePublicDataAccess(queryClient, client)
  }, [accessError, accessScope, client, queryClient, recoveredAccessScopes])

  if (accessRecoveryPending) {
    return <WorkspaceGate title="正在验证" />
  }

  if (bootstrapQuery.isPending) {
    return <WorkspaceGate title="正在连接" />
  }

  if (bootstrapQuery.isError) {
    return (
      <WorkspaceGate
        action={
          <button
            className="gate-action"
            onClick={() => void bootstrapQuery.refetch()}
            type="button"
          >
            重试
          </button>
        }
        message="无法读取站点信息"
        title="连接失败"
      />
    )
  }

  if (bootstrapQuery.data.requiresLogin) {
    return (
      <WorkspaceGate
        action={
          <a className="gate-action" href="/admin">
            登录
          </a>
        }
        message="此站点仅限已登录用户"
        title="需要登录"
      />
    )
  }

  if (nodesQuery.isPending) {
    return <WorkspaceGate title="正在载入探针" />
  }

  if (nodesQuery.isError) {
    return (
      <WorkspaceGate
        action={
          <button
            className="gate-action"
            onClick={() => void nodesQuery.refetch()}
            type="button"
          >
            重试
          </button>
        }
        message="探针数据暂不可用"
        title="载入失败"
      />
    )
  }

  const settings = settingsFromBootstrap(bootstrapQuery.data)
  const probes = workspaceProbesFromDomain({
    nodes: nodesQuery.data,
    latestStatuses: latestQuery.data ?? {},
    settings,
    now,
  })
  if (settings.offlinePosition === 'last') {
    probes.sort((left, right) => {
      const leftOffline = left.connection === 'offline' ? 1 : 0
      const rightOffline = right.connection === 'offline' ? 1 : 0
      return leftOffline - rightOffline
    })
  }
  const refreshTone = latestQuery.isError
    ? 'error'
    : latestQuery.isFetching
      ? 'loading'
      : 'online'
  const refreshLabel = latestQuery.isError
    ? '刷新失败'
    : refreshAgeLabel(latestQuery.dataUpdatedAt, now)
  return (
    <ProbeWorkspace
      defaultAppearance={settings.appearance}
      editorContent={historyContent}
      probes={probes}
      refreshLabel={refreshLabel}
      refreshTone={refreshTone}
    />
  )
}
