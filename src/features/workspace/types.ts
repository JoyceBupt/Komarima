export type WorkspaceProbeConnection = 'online' | 'offline' | 'unknown'
export type WorkspaceDataQuality = 'valid' | 'invalid'

export type WorkspaceProbeFreshness =
  'fresh' | 'delayed' | 'stale' | 'missing' | 'clock-skew' | 'invalid'

export type WorkspaceView = 'list' | 'cards'

export interface WorkspaceNetwork {
  uploadRate: string | null
  downloadRate: string | null
  uploadTotal: string | null
  downloadTotal: string | null
}

export interface WorkspaceTraffic {
  used: string | null
  limit: string | null
  percent: number | null
  basis: '合计' | '较大' | '较小' | '上行' | '下行' | null
}

export type WorkspaceBillingTone = 'normal' | 'warning' | 'critical' | 'expired'

export interface WorkspaceBilling {
  price: string | null
  remaining: string | null
  expiresOn: string | null
  autoRenewal: boolean
  tone: WorkspaceBillingTone
}

export interface WorkspaceProbe {
  id: string
  name: string
  group: string | null
  region: string | null
  operatingSystem: string | null
  architecture: string | null
  cpuCores: number | null
  memoryTotal: string | null
  diskTotal: string | null
  publicRemark: string | null
  tags: string[]
  connection: WorkspaceProbeConnection
  dataQuality: WorkspaceDataQuality
  freshness: WorkspaceProbeFreshness
  ageLabel: string | null
  cpu: number | null
  memory: number | null
  disk: number | null
  ping: number | null
  network: WorkspaceNetwork
  traffic: WorkspaceTraffic
  billing: WorkspaceBilling | null
  uptime: string | null
}

export type ProbeSortKey = 'name' | 'cpu' | 'memory' | 'disk' | 'ping'
export type ProbeSortDirection = 'ascending' | 'descending'

export interface ProbeSort {
  key: ProbeSortKey
  direction: ProbeSortDirection
}
