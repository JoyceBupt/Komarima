export type WorkspaceProbeConnection = 'online' | 'offline' | 'unknown'
export type WorkspaceDataQuality = 'valid' | 'invalid'

export type WorkspaceProbeFreshness =
  'fresh' | 'delayed' | 'stale' | 'missing' | 'clock-skew' | 'invalid'

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
  connection: WorkspaceProbeConnection
  dataQuality: WorkspaceDataQuality
  freshness: WorkspaceProbeFreshness
  ageLabel: string | null
  cpu: number | null
  memory: number | null
  disk: number | null
  ping: number | null
  uploadRate: string | null
  downloadRate: string | null
  uploadTotal: string | null
  downloadTotal: string | null
  uptime: string | null
}

export type ProbeSortKey = 'name' | 'cpu' | 'memory' | 'disk' | 'ping'
export type ProbeSortDirection = 'ascending' | 'descending'

export interface ProbeSort {
  key: ProbeSortKey
  direction: ProbeSortDirection
}

export type NavigatorSelection =
  | { kind: 'all' }
  | { kind: 'group'; group: string | null }
  | { kind: 'region'; group: string | null; region: string | null }

export interface NavigatorRegionNode {
  key: string
  value: string | null
  label: string
  count: number
}

export interface NavigatorGroupNode {
  key: string
  value: string | null
  label: string
  count: number
  regions: NavigatorRegionNode[]
}
