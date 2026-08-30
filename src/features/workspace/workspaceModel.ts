import type {
  NavigatorGroupNode,
  NavigatorSelection,
  ProbeSort,
  ProbeSortKey,
  WorkspaceProbe,
} from './types'

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

export function normalizedDimension(value: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function dimensionLabel(value: string | null, fallback: string) {
  return normalizedDimension(value) ?? fallback
}

export function groupKey(group: string | null) {
  return JSON.stringify(['group', normalizedDimension(group)])
}

export function regionKey(group: string | null, region: string | null) {
  return JSON.stringify([
    'region',
    normalizedDimension(group),
    normalizedDimension(region),
  ])
}

export function buildNavigatorTree(
  probes: ReadonlyArray<WorkspaceProbe>,
): NavigatorGroupNode[] {
  const groups = new Map<string | null, Map<string | null, number>>()

  for (const probe of probes) {
    const group = normalizedDimension(probe.group)
    const region = normalizedDimension(probe.region)
    const regions = groups.get(group) ?? new Map<string | null, number>()
    regions.set(region, (regions.get(region) ?? 0) + 1)
    groups.set(group, regions)
  }

  return Array.from(groups.entries()).map(([group, regions]) => ({
    key: groupKey(group),
    value: group,
    label: dimensionLabel(group, '未分组'),
    count: Array.from(regions.values()).reduce(
      (total, count) => total + count,
      0,
    ),
    regions: Array.from(regions.entries()).map(([region, count]) => ({
      key: regionKey(group, region),
      value: region,
      label: dimensionLabel(region, '未标注'),
      count,
    })),
  }))
}

export function matchesNavigatorSelection(
  probe: WorkspaceProbe,
  selection: NavigatorSelection,
) {
  if (selection.kind === 'all') return true

  const group = normalizedDimension(probe.group)
  if (group !== normalizedDimension(selection.group)) return false
  if (selection.kind === 'group') return true
  return (
    normalizedDimension(probe.region) === normalizedDimension(selection.region)
  )
}

export function isGroupSelected(
  selection: NavigatorSelection,
  group: string | null,
) {
  return (
    selection.kind === 'group' &&
    normalizedDimension(selection.group) === normalizedDimension(group)
  )
}

export function isRegionSelected(
  selection: NavigatorSelection,
  group: string | null,
  region: string | null,
) {
  return (
    selection.kind === 'region' &&
    normalizedDimension(selection.group) === normalizedDimension(group) &&
    normalizedDimension(selection.region) === normalizedDimension(region)
  )
}

function numericSortValue(
  probe: WorkspaceProbe,
  key: Exclude<ProbeSortKey, 'name'>,
) {
  const value = probe[key]
  return value !== null && Number.isFinite(value) ? value : null
}

export function sortWorkspaceProbes(
  probes: ReadonlyArray<WorkspaceProbe>,
  sort: ProbeSort | null,
): WorkspaceProbe[] {
  if (!sort) return [...probes]

  return probes
    .map((probe, index) => ({ probe, index }))
    .sort((left, right) => {
      let comparison: number

      if (sort.key === 'name') {
        comparison = collator.compare(left.probe.name, right.probe.name)
      } else {
        const leftValue = numericSortValue(left.probe, sort.key)
        const rightValue = numericSortValue(right.probe, sort.key)
        if (leftValue === null && rightValue === null)
          return left.index - right.index
        if (leftValue === null) return 1
        if (rightValue === null) return -1
        comparison = leftValue - rightValue
      }

      if (comparison === 0) return left.index - right.index
      return sort.direction === 'ascending' ? comparison : -comparison
    })
    .map(({ probe }) => probe)
}

export function nextProbeSort(
  current: ProbeSort | null,
  key: ProbeSortKey,
): ProbeSort {
  if (current?.key === key) {
    return {
      key,
      direction: current.direction === 'ascending' ? 'descending' : 'ascending',
    }
  }

  return {
    key,
    direction: key === 'name' ? 'ascending' : 'descending',
  }
}
