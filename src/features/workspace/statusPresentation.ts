import type { WorkspaceProbe } from './types'

export type WorkspaceStatusTone =
  'online' | 'delayed' | 'stale' | 'offline' | 'unknown'

export function workspaceStatus(probe: WorkspaceProbe): {
  label: string
  detail: string
  tone: WorkspaceStatusTone
} {
  if (probe.connection === 'offline') {
    return {
      label: '离线',
      detail: probe.ageLabel ? `离线 · ${probe.ageLabel}上报` : '离线',
      tone: 'offline',
    }
  }

  if (probe.freshness === 'missing') {
    return { label: '暂无上报', detail: '暂无上报', tone: 'unknown' }
  }

  if (probe.connection === 'unknown') {
    return { label: '状态未知', detail: '状态未知', tone: 'unknown' }
  }

  if (probe.dataQuality === 'invalid') {
    return { label: '数据异常', detail: '数据异常', tone: 'unknown' }
  }

  if (probe.freshness === 'clock-skew') {
    return { label: '时钟偏移', detail: '时钟偏移', tone: 'delayed' }
  }

  if (probe.freshness === 'invalid') {
    return { label: '时间无效', detail: '时间无效', tone: 'unknown' }
  }

  if (probe.freshness === 'delayed') {
    return {
      label: '数据延迟',
      detail: probe.ageLabel ? `数据延迟 · ${probe.ageLabel}上报` : '数据延迟',
      tone: 'delayed',
    }
  }

  if (probe.freshness === 'stale') {
    return {
      label: '旧值',
      detail: probe.ageLabel ? `旧值 · ${probe.ageLabel}` : '旧值',
      tone: 'stale',
    }
  }

  return {
    label: '在线',
    detail: probe.ageLabel ? `在线 · ${probe.ageLabel}` : '在线',
    tone: 'online',
  }
}
