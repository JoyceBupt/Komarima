import { describe, expect, it } from 'vitest'
import type { WorkspaceProbe } from './types'
import {
  buildNavigatorTree,
  matchesNavigatorSelection,
  sortWorkspaceProbes,
} from './workspaceModel'

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
    connection: 'online',
    dataQuality: 'valid',
    freshness: 'fresh',
    ageLabel: null,
    cpu: null,
    memory: null,
    disk: null,
    ping: null,
    uploadRate: null,
    downloadRate: null,
    uploadTotal: null,
    downloadTotal: null,
    uptime: null,
    ...overrides,
  }
}

describe('workspace navigation model', () => {
  it('builds only from actual group and region strings', () => {
    const probes = [
      probe('a', { group: '客户 A', region: '边缘集群' }),
      probe('b', { group: '客户 A', region: '核心集群' }),
      probe('c', { group: '客户 A', region: '边缘集群' }),
      probe('d', { group: '内部', region: '实验环境' }),
      probe('e', { group: '  ', region: null }),
    ]

    const tree = buildNavigatorTree(probes)
    const customer = tree.find((group) => group.value === '客户 A')
    const ungrouped = tree.find((group) => group.value === null)

    expect(tree.map((group) => group.value)).toEqual(['客户 A', '内部', null])
    expect(customer?.count).toBe(3)
    expect(customer?.regions).toEqual([
      expect.objectContaining({ label: '边缘集群', count: 2 }),
      expect.objectContaining({ label: '核心集群', count: 1 }),
    ])
    expect(ungrouped).toEqual(
      expect.objectContaining({ label: '未分组', count: 1 }),
    )
    expect(ungrouped?.regions[0]).toEqual(
      expect.objectContaining({ label: '未标注', count: 1 }),
    )
  })

  it('matches a structured group and region selection', () => {
    const target = probe('a', { group: '客户 A', region: '边缘集群' })

    expect(
      matchesNavigatorSelection(target, { kind: 'group', group: '客户 A' }),
    ).toBe(true)
    expect(
      matchesNavigatorSelection(target, {
        kind: 'region',
        group: '客户 A',
        region: '核心集群',
      }),
    ).toBe(false)
  })
})

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
