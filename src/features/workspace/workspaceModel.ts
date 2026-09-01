import type { ProbeSort, ProbeSortKey, WorkspaceProbe } from './types'

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

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
