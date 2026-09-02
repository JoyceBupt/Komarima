import type { ThemeRuntimeSettings } from '../../api/queries'
import type { LatestStatus, PublicNode } from '../../api/schemas'
import {
  normalizeProbes,
  normalizeProbeSnapshot,
  type NormalizedRatio,
  type NormalizedValue,
  type ProbePing,
  type ProbeTrafficLimitType,
} from '../../domain'
import type {
  WorkspaceBilling,
  WorkspaceProbe,
  WorkspaceProbeFreshness,
  WorkspaceTraffic,
} from './types'

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
})

const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

const trafficBasisLabels: Record<
  ProbeTrafficLimitType,
  WorkspaceTraffic['basis']
> = {
  sum: '合计',
  max: '较大',
  min: '较小',
  up: '上行',
  down: '下行',
}

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

export function formatBillingCycle(days: number): string | null {
  if (days === -1) return '一次'
  if (days >= 27 && days <= 32) return '月'
  if (days >= 87 && days <= 95) return '季'
  if (days >= 175 && days <= 185) return '半年'
  if (days >= 360 && days <= 370) return '年'
  if (days >= 720 && days <= 750) return '两年'
  if (days >= 1080 && days <= 1150) return '三年'
  if (days >= 1800 && days <= 1850) return '五年'
  return days > 0 ? `${days}天` : null
}

function formatBilling(
  billing: {
    price: number
    cycleDays: number
    autoRenewal: boolean
    currency: string | null
    expiresAt: string | null
  },
  now: Date,
): WorkspaceBilling | null {
  const cycle = formatBillingCycle(billing.cycleDays)
  const price =
    billing.price === -1
      ? '免费'
      : billing.price > 0
        ? `${billing.currency ?? ''}${numberFormatter.format(billing.price)}${cycle ? `/${cycle}` : ''}`
        : null

  if (!billing.expiresAt) {
    return price || billing.autoRenewal
      ? {
          price,
          remaining: null,
          expiresOn: null,
          autoRenewal: billing.autoRenewal,
          tone: 'normal',
        }
      : null
  }

  const expiresAt = new Date(billing.expiresAt)
  if (!Number.isFinite(expiresAt.getTime())) {
    return price || billing.autoRenewal
      ? {
          price,
          remaining: null,
          expiresOn: null,
          autoRenewal: billing.autoRenewal,
          tone: 'normal',
        }
      : null
  }

  const remainingDays = Math.ceil(
    (expiresAt.getTime() - now.getTime()) / 86_400_000,
  )
  const expiresOn = expiresAt.toISOString().slice(0, 10)
  if (remainingDays <= 0) {
    return {
      price,
      remaining: '已到期',
      expiresOn,
      autoRenewal: billing.autoRenewal,
      tone: 'expired',
    }
  }

  return {
    price,
    remaining: remainingDays > 36_500 ? '长期' : `余${remainingDays}天`,
    expiresOn,
    autoRenewal: billing.autoRenewal,
    tone:
      remainingDays <= 7
        ? 'critical'
        : remainingDays <= 15
          ? 'warning'
          : 'normal',
  }
}

export function trafficUsedBytes(
  upload: number | null,
  download: number | null,
  type: ProbeTrafficLimitType,
): number | null {
  if (type === 'up') return upload
  if (type === 'down') return download
  if (upload === null || download === null) return null
  if (type === 'sum') return upload + download
  return type === 'min'
    ? Math.min(upload, download)
    : Math.max(upload, download)
}

function formatTraffic(
  upload: number | null,
  download: number | null,
  limit: { bytes: number; type: ProbeTrafficLimitType } | null,
  resetDay: number | null,
): WorkspaceTraffic {
  const resetLabel =
    resetDay !== null &&
    Number.isInteger(resetDay) &&
    resetDay >= 1 &&
    resetDay <= 31
      ? `每月${resetDay}日重置`
      : null

  if (!limit) {
    return {
      used: null,
      limit: null,
      percent: null,
      basis: null,
      resetLabel,
    }
  }

  const usedBytes = trafficUsedBytes(upload, download, limit.type)
  return {
    used: formatBytes(usedBytes),
    limit: formatBytes(limit.bytes),
    percent:
      usedBytes === null
        ? null
        : Math.round((usedBytes / limit.bytes) * 1_000) / 10,
    basis: trafficBasisLabels[limit.type],
    resetLabel,
  }
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
    const uploadTotalBytes = normalizedValue(snapshot.totalUploadBytes)
    const downloadTotalBytes = normalizedValue(snapshot.totalDownloadBytes)

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
      publicRemark: probe.publicRemark,
      tags: probe.tags,
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
      network: {
        uploadRate: formatRate(
          normalizedValue(snapshot.networkOutBytesPerSecond),
        ),
        downloadRate: formatRate(
          normalizedValue(snapshot.networkInBytesPerSecond),
        ),
        uploadTotal: formatBytes(uploadTotalBytes),
        downloadTotal: formatBytes(downloadTotalBytes),
      },
      traffic: formatTraffic(
        uploadTotalBytes,
        downloadTotalBytes,
        probe.trafficLimit,
        probe.trafficResetDay,
      ),
      billing: formatBilling(probe.billing, now),
      uptime: formatUptime(normalizedValue(snapshot.uptimeSeconds)),
    }
  })
}
