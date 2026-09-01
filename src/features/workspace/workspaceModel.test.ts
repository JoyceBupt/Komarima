import { describe, expect, it } from 'vitest'
import type { WorkspaceProbe } from './types'
import { sortWorkspaceProbes } from './workspaceModel'

function probe(
  id: string,
  overrides: Partial<WorkspaceProbe> = {},
): WorkspaceProbe {
  return {
    id,
    name: id,
    group: null,
    region: null,
    operatingSystem: null,
    architecture: null,
    cpuCores: null,
    memoryTotal: null,
    diskTotal: null,
    publicRemark: null,
    tags: [],
    connection: 'online',
    dataQuality: 'valid',
    freshness: 'fresh',
    ageLabel: null,
    cpu: null,
    memory: null,
    disk: null,
    ping: null,
    network: {
      uploadRate: null,
      downloadRate: null,
      uploadTotal: null,
      downloadTotal: null,
    },
    traffic: { used: null, limit: null, percent: null, basis: null },
    billing: null,
    uptime: null,
    ...overrides,
  }
}

describe('workspace sorting model', () => {
  const probes = [
    probe('missing', { name: 'Missing', cpu: null }),
    probe('low', { name: 'Low', cpu: 8 }),
    probe('high', { name: 'High', cpu: 81 }),
  ]

  it('keeps missing values last in either direction', () => {
    expect(
      sortWorkspaceProbes(probes, {
        key: 'cpu',
        direction: 'descending',
      }).map(({ id }) => id),
    ).toEqual(['high', 'low', 'missing'])

    expect(
      sortWorkspaceProbes(probes, {
        key: 'cpu',
        direction: 'ascending',
      }).map(({ id }) => id),
    ).toEqual(['low', 'high', 'missing'])
  })

  it('preserves server order before the user selects a sort', () => {
    expect(sortWorkspaceProbes(probes, null).map(({ id }) => id)).toEqual([
      'missing',
      'low',
      'high',
    ])
  })
})
