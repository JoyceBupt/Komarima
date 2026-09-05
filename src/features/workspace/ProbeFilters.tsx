import { CloseIcon, SearchIcon } from '../../ui/Icons'
import type { ProbeFiltersState } from './useProbeFilters'

interface ProbeFiltersProps {
  filters: ProbeFiltersState
  groups: string[]
  active: boolean
  onChange: (key: keyof ProbeFiltersState, value: string | null) => void
  onReset: () => void
}

export function ProbeFilters({
  filters,
  groups,
  active,
  onChange,
  onReset,
}: ProbeFiltersProps) {
  const availableGroups =
    filters.group !== null && !groups.includes(filters.group)
      ? [filters.group, ...groups]
      : groups
  return (
    <div className="probe-filters" aria-label="探针筛选">
      <label className="probe-search">
        <SearchIcon />
        <input
          aria-label="搜索探针"
          placeholder="搜索探针"
          value={filters.q}
          onChange={(event) => onChange('q', event.target.value)}
        />
        {filters.q ? (
          <button
            aria-label="清除搜索"
            type="button"
            onClick={() => onChange('q', '')}
          >
            <CloseIcon />
          </button>
        ) : null}
      </label>
      <select
        aria-label="筛选状态"
        value={filters.status}
        onChange={(event) => onChange('status', event.target.value)}
      >
        <option value="all">全部状态</option>
        <option value="online">在线</option>
        <option value="offline">离线</option>
        <option value="missing">未上报</option>
        <option value="delayed">数据延迟</option>
      </select>
      <select
        aria-label="筛选分组"
        value={JSON.stringify(filters.group)}
        onChange={(event) =>
          onChange('group', JSON.parse(event.target.value) as string | null)
        }
      >
        <option value="null">全部分组</option>
        {availableGroups.map((group) => (
          <option key={group} value={JSON.stringify(group)}>
            {group || '未分组'}
          </option>
        ))}
      </select>
      <select
        aria-label="探针排序"
        value={filters.sort}
        onChange={(event) => onChange('sort', event.target.value)}
      >
        <option value="default">默认排序</option>
        <option value="name">名称</option>
        <option value="cpu">CPU ↓</option>
        <option value="memory">内存 ↓</option>
        <option value="traffic">流量占比 ↓</option>
      </select>
      {active ? (
        <button className="filter-reset" type="button" onClick={onReset}>
          重置
        </button>
      ) : null}
    </div>
  )
}
