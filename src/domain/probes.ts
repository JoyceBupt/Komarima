import type { LatestStatus, PingLatestStat, PublicNode } from '../api/schemas'
import { classifyFreshness, type FreshnessResult } from './freshness'
import {
  normalizeFiniteValue,
  normalizeNonNegativeValue,
  normalizeRatio,
  type NormalizedRatio,
  type NormalizedValue,
} from './value'

export interface Probe {
  id: string
  name: string
  region: string | null
  group: string | null
  tags: string[]
  os: string | null
  arch: string | null
  cpuName: string | null
  cpuCores: number | null
  memoryTotal: number | null
  swapTotal: number | null
  diskTotal: number | null
  publicRemark: string | null
  billing: ProbeBilling
  trafficLimit: ProbeTrafficLimit | null
  weight: number
}

export type ProbeTrafficLimitType = 'sum' | 'max' | 'min' | 'up' | 'down'

export interface ProbeBilling {
  price: number
  cycleDays: number
  autoRenewal: boolean
  currency: string | null
  expiresAt: string | null
}

export interface ProbeTrafficLimit {
  bytes: number
  type: ProbeTrafficLimitType
}

export type ConnectivityState = 'online' | 'offline' | 'unknown'

export interface ProbePing {
  taskId: string
  name: string
  latency: NormalizedValue
  average: NormalizedValue
  lossPercent: NormalizedValue
  tailRatio: NormalizedValue
  minimum: NormalizedValue
  maximum: NormalizedValue
}

export interface ProbeSnapshot {
  probeId: string
  connectivity: ConnectivityState
  freshness: FreshnessResult
  cpuPercent: NormalizedValue
  memory: NormalizedRatio
  swap: NormalizedRatio
  disk: NormalizedRatio
  load1: NormalizedValue
  load5: NormalizedValue
  load15: NormalizedValue
  networkInBytesPerSecond: NormalizedValue
  networkOutBytesPerSecond: NormalizedValue
  totalUploadBytes: NormalizedValue
  totalDownloadBytes: NormalizedValue
  uptimeSeconds: NormalizedValue
  processCount: NormalizedValue
  connectionCount: NormalizedValue
  udpConnectionCount: NormalizedValue
  ping: Map<string, ProbePing>
}

const optionalText = (value: string) => {
  const normalized = value.trim()
  return normalized ? normalized : null
}

const trafficLimitTypes = new Set<ProbeTrafficLimitType>([
  'sum',
  'max',
  'min',
  'up',
  'down',
])

const normalizeTrafficLimitType = (value: string): ProbeTrafficLimitType =>
  trafficLimitTypes.has(value.toLowerCase() as ProbeTrafficLimitType)
    ? (value.toLowerCase() as ProbeTrafficLimitType)
    : 'max'

export const splitProbeTags = (raw: string) => {
  const seen = new Set<string>()
  for (const value of raw.split(';')) {
    const tag = value.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

export const normalizeProbe = (node: PublicNode): Probe => ({
  id: node.uuid,
  name: node.name,
  region: optionalText(node.region),
  group: optionalText(node.group),
  tags: splitProbeTags(node.tags),
  os: optionalText(node.os),
  arch: optionalText(node.arch),
  cpuName: optionalText(node.cpu_name),
  cpuCores: node.cpu_cores > 0 ? node.cpu_cores : null,
  memoryTotal: node.mem_total > 0 ? node.mem_total : null,
  swapTotal: node.swap_total > 0 ? node.swap_total : null,
  diskTotal: node.disk_total > 0 ? node.disk_total : null,
  publicRemark: optionalText(node.public_remark ?? ''),
  billing: {
    price: node.price,
    cycleDays: node.billing_cycle,
    autoRenewal: node.auto_renewal,
    currency: optionalText(node.currency),
    expiresAt: node.expired_at,
  },
  trafficLimit:
    node.traffic_limit > 0
      ? {
          bytes: node.traffic_limit,
          type: normalizeTrafficLimitType(node.traffic_limit_type),
        }
      : null,
  weight: node.weight,
})

export const normalizeProbes = (nodes: PublicNode[]) => {
  const probes = new Map<string, Probe>()
  for (const node of nodes) probes.set(node.uuid, normalizeProbe(node))
  return probes
}

const normalizePingLatency = (value: unknown): NormalizedValue => {
  const normalized = normalizeFiniteValue(value)
  if (normalized.state !== 'valid') return normalized
  return normalized.value < 0 ? { state: 'missing' } : normalized
}

const normalizePing = (taskId: string, ping: PingLatestStat): ProbePing => {
  const hasValidSample = ping.latest >= 0
  const unavailable: NormalizedValue = { state: 'missing' }

  return {
    taskId,
    name: ping.name,
    latency: normalizePingLatency(ping.latest),
    average: hasValidSample ? normalizePingLatency(ping.avg) : unavailable,
    lossPercent: normalizeNonNegativeValue(ping.loss),
    tailRatio: hasValidSample
      ? normalizeNonNegativeValue(ping.tail)
      : unavailable,
    minimum: hasValidSample ? normalizePingLatency(ping.min) : unavailable,
    maximum: hasValidSample ? normalizePingLatency(ping.max) : unavailable,
  }
}

export interface SnapshotOptions {
  now?: Date
  staleAfterMs: number
  futureToleranceMs?: number
}

export const normalizeProbeSnapshot = (
  probeId: string,
  status: LatestStatus | undefined,
  options: SnapshotOptions,
): ProbeSnapshot => {
  if (!status) {
    return {
      probeId,
      connectivity: 'unknown',
      freshness: classifyFreshness(undefined, options),
      cpuPercent: { state: 'missing' },
      memory: { state: 'missing' },
      swap: { state: 'missing' },
      disk: { state: 'missing' },
      load1: { state: 'missing' },
      load5: { state: 'missing' },
      load15: { state: 'missing' },
      networkInBytesPerSecond: { state: 'missing' },
      networkOutBytesPerSecond: { state: 'missing' },
      totalUploadBytes: { state: 'missing' },
      totalDownloadBytes: { state: 'missing' },
      uptimeSeconds: { state: 'missing' },
      processCount: { state: 'missing' },
      connectionCount: { state: 'missing' },
      udpConnectionCount: { state: 'missing' },
      ping: new Map(),
    }
  }

  if (status.client !== probeId) {
    throw new Error(
      `Probe status client mismatch: expected ${probeId}, received ${status.client}`,
    )
  }

  return {
    probeId,
    connectivity: status.online ? 'online' : 'offline',
    freshness: classifyFreshness(status.time, options),
    cpuPercent: normalizeNonNegativeValue(status.cpu),
    memory: normalizeRatio(status.ram, status.ram_total),
    swap: normalizeRatio(status.swap, status.swap_total),
    disk: normalizeRatio(status.disk, status.disk_total),
    load1: normalizeNonNegativeValue(status.load),
    load5: normalizeNonNegativeValue(status.load5),
    load15: normalizeNonNegativeValue(status.load15),
    networkInBytesPerSecond: normalizeNonNegativeValue(status.net_in),
    networkOutBytesPerSecond: normalizeNonNegativeValue(status.net_out),
    totalUploadBytes: normalizeNonNegativeValue(status.net_total_up),
    totalDownloadBytes: normalizeNonNegativeValue(status.net_total_down),
    uptimeSeconds: normalizeNonNegativeValue(status.uptime),
    processCount: normalizeNonNegativeValue(status.process),
    connectionCount: normalizeNonNegativeValue(status.connections),
    udpConnectionCount: normalizeNonNegativeValue(status.connections_udp),
    ping: new Map(
      Object.entries(status.ping).map(([taskId, ping]) => [
        taskId,
        normalizePing(taskId, ping),
      ]),
    ),
  }
}
