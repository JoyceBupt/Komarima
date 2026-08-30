import type { ThemeRuntimeSettings } from '../../api/queries'
import type { LatestStatus, PublicNode } from '../../api/schemas'
import {
  normalizeProbes,
  normalizeProbeSnapshot,
  type NormalizedRatio,
  type NormalizedValue,
  type ProbePing,
} from '../../domain'
import type { WorkspaceProbe, WorkspaceProbeFreshness } from './types'

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
})

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

const validNonNegativeNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

export function formatBytes(value: number | null | undefined): string | null {
  const bytes = validNonNegativeNumber(value)
  if (bytes === null) return null
  if (bytes === 0) return '0 B'

  const unitIndex = Math.min(
    Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))),
    byteUnits.length - 1,
  )
  const scaled = bytes / 1024 ** unitIndex
  return `${numberFormatter.format(scaled)} ${byteUnits[unitIndex]}`
}

export function formatRate(value: number | null | undefined): string | null {
  const bytes = formatBytes(value)
  return bytes === null ? null : `${bytes}/s`
}

export function formatUptime(value: number | null | undefined): string | null {
  const secondsValue = validNonNegativeNumber(value)
  if (secondsValue === null) return null

  let remaining = Math.floor(secondsValue)
  const units = [
    { label: '天', seconds: 86_400 },
    { label: '小时', seconds: 3_600 },
    { label: '分钟', seconds: 60 },
    { label: '秒', seconds: 1 },
  ] as const
  const parts: string[] = []

  for (const unit of units) {
    const amount = Math.floor(remaining / unit.seconds)
    if (amount > 0 || (unit.seconds === 1 && parts.length === 0)) {
      parts.push(`${amount}${unit.label}`)
      remaining -= amount * unit.seconds
    }
    if (parts.length === 2) break
  }

  return parts.join(' ')
}

const ageAmount = (ageMs: number) => {
  const seconds = Math.floor(ageMs / 1_000)
  if (seconds < 60) return `${Math.max(1, seconds)} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

export function formatSampleAge(
  freshness: WorkspaceProbeFreshness,
  ageMs: number | null,
): string | null {
  if (freshness === 'missing') return '暂无上报'
  if (freshness === 'invalid' || ageMs === null || !Number.isFinite(ageMs)) {
    return null
  }
  if (freshness === 'clock-skew') {
    return `未来 ${ageAmount(Math.abs(ageMs))}`
  }
  if (ageMs < 1_000) return '刚刚'
  return `${ageAmount(ageMs)}前`
}

const normalizedValue = (value: NormalizedValue) =>
  value.state === 'valid' ? Math.round(value.value * 10) / 10 : null

const normalizedPercent = (value: NormalizedRatio) =>
  value.state === 'valid' && !value.outOfRange && value.percent !== undefined
    ? Math.round(value.percent * 10) / 10
    : null

const isInvalidValue = (value: NormalizedValue) => value.state === 'invalid'

const isInvalidRatio = (value: NormalizedRatio) =>
  value.state === 'invalid' || Boolean(value.outOfRange)

const compareTaskIds = (left: string, right: string) => {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) {
    const leftNumber = BigInt(left)
    const rightNumber = BigInt(right)
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0
  }
  return left.localeCompare(right, 'en', { numeric: true })
}

const firstValidPing = (ping: Map<string, ProbePing>) => {
  const entries = [...ping.entries()].sort(([left], [right]) =>
    compareTaskIds(left, right),
  )
  for (const [, task] of entries) {
    const latency = normalizedValue(task.latency)
    if (latency !== null) return latency
  }
  return null
}

export interface WorkspaceProbesFromDomainInput {
  nodes: PublicNode[]
  latestStatuses: Record<string, LatestStatus>
  settings: ThemeRuntimeSettings
  now: Date
}

export function workspaceProbesFromDomain({
  nodes,
  latestStatuses,
  settings,
  now,
}: WorkspaceProbesFromDomainInput): WorkspaceProbe[] {
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Workspace adapter requires a valid current time')
  }

  const probes = normalizeProbes(nodes)
  return [...probes.values()].map((probe) => {
    const snapshot = normalizeProbeSnapshot(
      probe.id,
      latestStatuses[probe.id],
      { now, staleAfterMs: settings.staleAfterMs },
    )
    const dataQuality =
      isInvalidValue(snapshot.cpuPercent) ||
      (snapshot.cpuPercent.state === 'valid' &&
        snapshot.cpuPercent.value > 100) ||
      isInvalidRatio(snapshot.memory) ||
      isInvalidRatio(snapshot.disk) ||
      isInvalidValue(snapshot.networkInBytesPerSecond) ||
      isInvalidValue(snapshot.networkOutBytesPerSecond) ||
      isInvalidValue(snapshot.totalUploadBytes) ||
      isInvalidValue(snapshot.totalDownloadBytes) ||
      isInvalidValue(snapshot.uptimeSeconds)
        ? 'invalid'
        : 'valid'

    return {
      id: probe.id,
      name: probe.name,
      group: probe.group,
      region: probe.region,
      operatingSystem: probe.os,
      architecture: probe.arch,
      cpuCores: probe.cpuCores,
      memoryTotal: formatBytes(probe.memoryTotal),
      diskTotal: formatBytes(probe.diskTotal),
      connection: snapshot.connectivity,
      dataQuality,
      freshness: snapshot.freshness.state,
      ageLabel: formatSampleAge(
        snapshot.freshness.state,
        snapshot.freshness.ageMs,
      ),
      cpu:
        snapshot.cpuPercent.state === 'valid' &&
        snapshot.cpuPercent.value <= 100
          ? normalizedValue(snapshot.cpuPercent)
          : null,
      memory: normalizedPercent(snapshot.memory),
      disk: normalizedPercent(snapshot.disk),
      ping: firstValidPing(snapshot.ping),
      uploadRate: formatRate(
        normalizedValue(snapshot.networkOutBytesPerSecond),
      ),
      downloadRate: formatRate(
        normalizedValue(snapshot.networkInBytesPerSecond),
      ),
      uploadTotal: formatBytes(normalizedValue(snapshot.totalUploadBytes)),
      downloadTotal: formatBytes(normalizedValue(snapshot.totalDownloadBytes)),
      uptime: formatUptime(normalizedValue(snapshot.uptimeSeconds)),
    }
  })
}
