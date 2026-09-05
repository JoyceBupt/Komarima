import { useLayoutEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { WorkspaceProbe } from './types'

export interface ProbeFiltersState {
  q: string
  status: 'all' | 'online' | 'offline' | 'missing' | 'delayed'
  group: string | null
  sort: 'default' | 'name' | 'cpu' | 'memory' | 'traffic'
}

export function useProbeFilters(probes: ReadonlyArray<WorkspaceProbe>) {
  const [params, setParams] = useSearchParams()
  const pending = useRef(params)
  useLayoutEffect(() => {
    pending.current = params
  }, [params])
  const requestedStatus = params.get('status')
  const requestedSort = params.get('sort')
  const filters: ProbeFiltersState = {
    q: params.get('q') ?? '',
    group: params.get('group'),
    status:
      requestedStatus === 'online' ||
      requestedStatus === 'offline' ||
      requestedStatus === 'missing' ||
      requestedStatus === 'delayed'
        ? requestedStatus
        : 'all',
    sort:
      requestedSort === 'name' ||
      requestedSort === 'cpu' ||
      requestedSort === 'memory' ||
      requestedSort === 'traffic'
        ? requestedSort
        : 'default',
  }
  const groups = useMemo(
    () =>
      [...new Set(probes.map((probe) => probe.group ?? ''))].sort((a, b) =>
        a.localeCompare(b, 'zh-CN'),
      ),
    [probes],
  )
  const { q, status, group, sort } = filters
  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase()
    const result = probes.filter((probe) => {
      if (group !== null && (probe.group ?? '') !== group) return false
      if (status === 'online' && probe.connection !== 'online') return false
      if (status === 'offline' && probe.connection !== 'offline') return false
      if (status === 'missing' && probe.freshness !== 'missing') return false
      if (
        status === 'delayed' &&
        (probe.connection !== 'online' ||
          !['delayed', 'stale', 'clock-skew', 'invalid'].includes(
            probe.freshness,
          ))
      )
        return false
      return (
        !needle ||
        [
          probe.name,
          probe.region,
          probe.group,
          probe.publicRemark,
          ...probe.tags,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase()
          .includes(needle)
      )
    })
    if (sort === 'name')
      result.sort((a, b) =>
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
      )
    if (sort === 'cpu' || sort === 'memory' || sort === 'traffic') {
      const value = (probe: WorkspaceProbe) =>
        sort === 'traffic' ? probe.traffic.percent : probe[sort]
      result.sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1))
    }
    return result
  }, [group, probes, q, sort, status])
  const active = Boolean(
    q || group !== null || status !== 'all' || sort !== 'default',
  )
  const update = (key: keyof ProbeFiltersState, value: string | null) => {
    const next = new URLSearchParams(pending.current)
    if (
      value === null ||
      (key !== 'group' && value === '') ||
      (key === 'status' && value === 'all') ||
      (key === 'sort' && value === 'default')
    )
      next.delete(key)
    else next.set(key, value)
    pending.current = next
    setParams(next, { replace: true })
  }
  const reset = () => {
    const next = new URLSearchParams(pending.current)
    for (const key of ['q', 'status', 'group', 'sort']) next.delete(key)
    pending.current = next
    setParams(next, { replace: true })
  }
  return { filters, groups, visible, active, update, reset }
}
