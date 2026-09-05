import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  KomariApiClient,
  isPublicDataAccessDenied,
  komariQueryKeys,
  P0_MAX_PING_TASKS_PER_QUERY,
  publicDataAccessScope,
  revokePublicDataAccess,
  settingsFromBootstrap,
  shouldRecoverPublicDataAccess,
  useBootstrapQuery,
  useLatestStatusesQuery,
  useMetricDefinitionsQuery,
  useMetricQuery,
  useNodesQuery,
  usePingMetricQueries,
  usePingTasksQuery,
} from '../../api'
import { normalizeMetricSeries } from '../../domain'
import {
  availableMetricHours,
  historyAvailabilityLabel,
  HistoryDetailView,
  seriesIdentity,
  type HistoryLoadState,
  type HistoryIssue,
  type HistoryRange,
} from '../history'
import { ChevronLeftIcon } from '../../ui/Icons'
import { workspaceProbesFromDomain } from './fromDomain'
import { ProbeWorkspace } from './ProbeWorkspace'
import { ProbeInfo } from './ProbeInfo'

const defaultClient = new KomariApiClient()
const historyHours: Record<HistoryRange, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 168,
}
const resourceMetricKeys = ['cpu.usage', 'memory.used', 'disk.used']
const networkMetricKeys = ['net.in.rate', 'net.out.rate']
const pingMetricKeys = ['ping.latency_ms']

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
  return value === '1h' || value === '6h' || value === '24h' || value === '7d'
    ? value
    : '24h'
}

function WorkspaceGate({
  title,
  message,
  action,
  busy = false,
  siteName = 'Komarima',
}: {
  title: string
  message?: string
  action?: ReactNode
  busy?: boolean
  siteName?: string
}) {
  return (
    <main className="km-app">
      <section
        aria-label="Komarima 探针工作区"
        className="km-window km-gate-window"
      >
        <header className="gate-toolbar">
          <span className="brand">{siteName}</span>
        </header>
        <div className="workspace-gate">
          <span
            aria-hidden="true"
            className={busy ? 'gate-mark' : 'gate-static-mark'}
          >
            {busy ? null : '!'}
          </span>
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
  const location = useLocation()
  const navigate = useNavigate()
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
  const settings = useMemo(
    () => settingsFromBootstrap(bootstrapQuery.data),
    [bootstrapQuery.data],
  )
  const siteName = bootstrapQuery.data?.publicInfo.sitename.trim() || 'Komarima'
  const probes = useMemo(() => {
    const result = workspaceProbesFromDomain({
      nodes: nodesQuery.data ?? [],
      latestStatuses: latestQuery.data ?? {},
      settings,
      now,
    })
    if (settings.offlinePosition === 'last')
      result.sort(
        (a, b) =>
          Number(a.connection === 'offline') -
          Number(b.connection === 'offline'),
      )
    return result
  }, [nodesQuery.data, latestQuery.data, settings, now])
  const selectedProbe = probes.find((probe) => probe.id === uuid)
  const historyRange = parseHistoryRange(searchParams.get('range'))
  const requestedHistoryHours = historyHours[historyRange]
  const selectedNode = nodesQuery.data?.find((node) => node.uuid === uuid)
  const historyActive = Boolean(selectedNode)
  const metricDefinitions = useMetricDefinitionsQuery(
    client,
    bootstrapQuery.data,
    historyActive,
  )
  const definitionsReady = !metricDefinitions.isPending
  const resourceHistoryHours = availableMetricHours(
    metricDefinitions.data,
    resourceMetricKeys,
    requestedHistoryHours,
  )
  const networkHistoryHours = availableMetricHours(
    metricDefinitions.data,
    networkMetricKeys,
    requestedHistoryHours,
  )
  const pingHistoryHours = availableMetricHours(
    metricDefinitions.data,
    pingMetricKeys,
    requestedHistoryHours,
  )
  const historyBase = selectedNode
    ? { entity_id: selectedNode.uuid, max_points: 240 }
    : null
  const resourceHistory = useMetricQuery(
    client,
    bootstrapQuery.data,
    historyBase
      ? {
          ...historyBase,
          hours: resourceHistoryHours,
          metric_keys: resourceMetricKeys,
        }
      : null,
    historyActive && definitionsReady,
  )
  const networkHistory = useMetricQuery(
    client,
    bootstrapQuery.data,
    historyBase
      ? {
          ...historyBase,
          hours: networkHistoryHours,
          metric_keys: networkMetricKeys,
        }
      : null,
    historyActive && definitionsReady,
  )
  const pingTasks = usePingTasksQuery(
    client,
    bootstrapQuery.data,
    historyActive,
  )
  const selectedNodeId = selectedNode?.uuid
  const selectedPingTasks = useMemo(() => {
    if (!selectedNodeId) return []
    const seenTaskIds = new Set<number>()
    return (pingTasks.data ?? [])
      .filter((task) => task.clients.includes(selectedNodeId))
      .sort((left, right) => left.weight - right.weight || left.id - right.id)
      .filter((task) => {
        if (seenTaskIds.has(task.id)) return false
        seenTaskIds.add(task.id)
        return true
      })
      .slice(0, P0_MAX_PING_TASKS_PER_QUERY)
  }, [pingTasks.data, selectedNodeId])
  const pingHistoryParams = useMemo(
    () =>
      selectedNodeId
        ? selectedPingTasks.map((task) => ({
            entity_id: selectedNodeId,
            hours: pingHistoryHours,
            max_points: 240,
            metric_key: 'ping.latency_ms',
            tags: { task_id: String(task.id) },
          }))
        : [],
    [pingHistoryHours, selectedNodeId, selectedPingTasks],
  )
  const pingHistory = usePingMetricQueries(
    client,
    bootstrapQuery.data,
    pingHistoryParams,
    historyActive && definitionsReady && pingTasks.isSuccess,
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
    metricDefinitions.error,
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
  const historyPresentation = useMemo(() => {
    const pingTaskNames = new Map(
      selectedPingTasks.map((task) => [String(task.id), task.name]),
    )
    const pingSeries = pingHistory.series.map(normalizeMetricSeries)
    const metricLabels = Object.fromEntries(
      pingSeries.flatMap((series) => {
        const label = pingTaskNames.get(series.tags.task_id)
        if (!label) return []
        return [[seriesIdentity(series), label]]
      }),
    )

    return {
      series: [
        ...(resourceHistory.data?.series ?? []),
        ...(networkHistory.data?.series ?? []),
      ]
        .map(normalizeMetricSeries)
        .concat(pingSeries),
      metricLabels,
    }
  }, [
    networkHistory.data,
    pingHistory.series,
    resourceHistory.data,
    selectedPingTasks,
  ])
  const resourceState: HistoryLoadState = resourceHistory.isError
    ? 'error'
    : resourceHistory.isPending
      ? 'loading'
      : 'ready'
  const networkState: HistoryLoadState = networkHistory.isError
    ? 'error'
    : networkHistory.isPending
      ? 'loading'
      : 'ready'
  const pingState: HistoryLoadState =
    pingTasks.isError || pingHistory.isError
      ? 'error'
      : pingTasks.isPending ||
          (selectedPingTasks.length > 0 && pingHistory.isPending)
        ? 'loading'
        : 'ready'
  const historyStates = [resourceState, networkState, pingState]
  const historyState: HistoryLoadState = historyStates.every(
    (state) => state === 'error',
  )
    ? 'error'
    : metricDefinitions.isPending ||
        historyStates.every((state) => state === 'loading')
      ? 'loading'
      : 'ready'
  const closeHistory = useCallback(() => {
    const state = location.state as { fromWorkspace?: boolean } | null
    if (state?.fromWorkspace) {
      navigate(-1)
      return
    }
    navigate('/', { replace: true })
  }, [location.state, navigate])
  const changeHistoryRange = useCallback(
    (range: HistoryRange) => {
      const next = new URLSearchParams(searchParams)
      next.set('range', range)
      setSearchParams(next, { replace: true, state: location.state })
    },
    [location.state, searchParams, setSearchParams],
  )
  const { refetch: refetchResourceHistory } = resourceHistory
  const { refetch: refetchNetworkHistory } = networkHistory
  const { refetch: refetchMetricDefinitions } = metricDefinitions
  const { refetch: refetchPingTasks } = pingTasks
  const { refetch: refetchPingHistory } = pingHistory
  const retryHistory = useCallback(() => {
    void refetchResourceHistory()
    void refetchNetworkHistory()
    void refetchMetricDefinitions()
    void refetchPingTasks()
    if (selectedPingTasks.length > 0) void refetchPingHistory()
  }, [
    refetchNetworkHistory,
    refetchMetricDefinitions,
    refetchPingHistory,
    refetchPingTasks,
    refetchResourceHistory,
    selectedPingTasks.length,
  ])
  const historyIssues = useMemo(() => {
    const issues: HistoryIssue[] = []
    if (resourceState !== 'ready')
      issues.push({
        label: '资源',
        state: resourceState,
        onRetry: () => {
          void refetchResourceHistory()
        },
      })
    if (networkState !== 'ready')
      issues.push({
        label: '网络',
        state: networkState,
        onRetry: () => {
          void refetchNetworkHistory()
        },
      })
    if (pingState !== 'ready')
      issues.push({
        label: 'Ping',
        state: pingState,
        partial: pingHistory.series.length > 0,
        onRetry: () => {
          if (pingTasks.isError) void refetchPingTasks()
          else void refetchPingHistory()
        },
      })
    return issues
  }, [
    resourceState,
    networkState,
    pingState,
    pingHistory.series.length,
    pingTasks.isError,
    refetchResourceHistory,
    refetchNetworkHistory,
    refetchPingTasks,
    refetchPingHistory,
  ])
  const historyRangeNote = historyAvailabilityLabel({
    requestedHours: requestedHistoryHours,
    resourceHours: Math.min(resourceHistoryHours, networkHistoryHours),
    pingHours: pingHistoryHours,
    hasPing: selectedPingTasks.length > 0,
  })
  const historyContent = useMemo(
    () =>
      historyActive && selectedNode ? (
        <section className="workspace-pane history-editor-shell">
          <div className="history-editor-toolbar">
            <button
              aria-label="返回探针列表"
              onClick={closeHistory}
              type="button"
            >
              <ChevronLeftIcon />
              探针
            </button>
          </div>
          <HistoryDetailView
            defaultView="history"
            errorMessage="历史暂不可用"
            nodeName={selectedNode.name}
            metricLabels={historyPresentation.metricLabels}
            onRangeChange={changeHistoryRange}
            onRetry={retryHistory}
            range={historyRange}
            rangeNote={historyRangeNote ?? undefined}
            series={historyPresentation.series}
            state={historyState}
            issues={historyIssues}
            overviewContent={
              selectedProbe ? <ProbeInfo probe={selectedProbe} /> : undefined
            }
          />
        </section>
      ) : undefined,
    [
      changeHistoryRange,
      closeHistory,
      historyActive,
      historyRange,
      historyRangeNote,
      historyPresentation,
      historyState,
      historyIssues,
      retryHistory,
      selectedNode,
      selectedProbe,
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
    return <WorkspaceGate title="正在验证" busy siteName={siteName} />
  }

  if (bootstrapQuery.isPending) {
    return <WorkspaceGate title="正在连接" busy siteName={siteName} />
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
        siteName={siteName}
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
        siteName={siteName}
      />
    )
  }

  if (nodesQuery.isPending) {
    return <WorkspaceGate title="正在载入探针" busy siteName={siteName} />
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
        siteName={siteName}
      />
    )
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
      siteName={siteName}
    />
  )
}
