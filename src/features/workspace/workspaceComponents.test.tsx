import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { InspectorPane } from './InspectorPane'
import { NavigatorPane } from './NavigatorPane'
import { ProbeEditorPane } from './ProbeEditorPane'
import type { WorkspaceProbe } from './types'

afterEach(cleanup)

function probe(
  id: string,
  overrides: Partial<WorkspaceProbe> = {},
): WorkspaceProbe {
  return {
    id,
    name: id,
    group: '客户 A',
    region: '边缘集群',
    operatingSystem: 'Debian 12',
    architecture: 'amd64',
    cpuCores: 4,
    memoryTotal: '8 GB',
    diskTotal: '80 GB',
    connection: 'online',
    dataQuality: 'valid',
    freshness: 'fresh',
    ageLabel: '8 秒前',
    cpu: null,
    memory: 40,
    disk: 30,
    ping: 28,
    uploadRate: '1.2',
    downloadRate: '8.4 MB/s',
    uploadTotal: '86.4 GB',
    downloadTotal: '428.7 GB',
    uptime: '12天',
    ...overrides,
  }
}

describe('NavigatorPane', () => {
  it('renders arbitrary group-region data and returns a structured selection', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const probes = [
      probe('one'),
      probe('two', { region: '核心集群' }),
      probe('three', { group: '内部', region: '实验环境' }),
    ]

    render(
      <NavigatorPane
        isOpen
        onClose={vi.fn()}
        onSelect={onSelect}
        probes={probes}
        selection={{ kind: 'all' }}
      />,
    )

    expect(
      screen.getByRole('navigation', { name: '探针分组' }).closest('aside'),
    ).toHaveClass('navigator-pane', 'is-open')
    expect(screen.getByRole('button', { name: /全部探针/ })).toHaveClass(
      'tree-row-all',
      'is-selected',
    )
    expect(screen.getByText('客户 A')).toBeInTheDocument()
    const groupToggle = screen.getByRole('button', {
      name: /^(展开|收起)客户 A$/,
    })
    if (groupToggle.getAttribute('aria-expanded') === 'false') {
      await user.click(groupToggle)
    }

    await user.click(screen.getByRole('button', { name: /边缘集群/ }))
    expect(onSelect).toHaveBeenLastCalledWith({
      kind: 'region',
      group: '客户 A',
      region: '边缘集群',
    })
  })
})

describe('InspectorPane', () => {
  it('closes a modal inspector before opening history', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <MemoryRouter initialEntries={['/instance/one']}>
        <InspectorPane isOpen modal onClose={onClose} probe={probe('one')} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: '详情' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ProbeEditorPane', () => {
  it('distinguishes an empty site from a filtered result', () => {
    const { rerender } = render(
      <ProbeEditorPane onSelect={vi.fn()} probes={[]} selectedId="" />,
    )
    expect(screen.getByText('暂无探针')).toBeInTheDocument()
    expect(screen.getByText('等待探针接入')).toBeInTheDocument()

    rerender(
      <ProbeEditorPane
        emptyState="no-results"
        onSelect={vi.fn()}
        probes={[]}
        selectedId=""
      />,
    )
    expect(screen.getByText('没有结果')).toBeInTheDocument()
    expect(screen.getByText('调整搜索或筛选')).toBeInTheDocument()
  })

  it('sorts clickable metric columns and exposes the active direction', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    const probes = [
      probe('missing', { name: 'Missing', cpu: null }),
      probe('low', { name: 'Low', cpu: 8 }),
      probe('high', { name: 'High', cpu: 81 }),
    ]

    render(
      <ProbeEditorPane
        onSelect={vi.fn()}
        onSortChange={onSortChange}
        probes={probes}
        selectedId="high"
      />,
    )

    const nameSort = screen.getByRole('button', { name: '按探针升序排列' })
    const cpuSort = screen.getByRole('button', { name: '按CPU降序排列' })
    expect(nameSort).toHaveAttribute('aria-pressed', 'false')
    expect(cpuSort).toHaveAttribute('data-sort-direction', 'none')
    expect(screen.getByRole('button', { name: /High/ })).toHaveClass(
      'probe-row',
      'is-selected',
    )

    await user.click(cpuSort)
    expect(cpuSort).toHaveAccessibleName('CPU，当前降序，切换为升序')
    expect(cpuSort).toHaveAttribute('data-sort-direction', 'descending')
    expect(onSortChange).toHaveBeenLastCalledWith({
      key: 'cpu',
      direction: 'descending',
    })
    expect(
      within(screen.getByRole('group', { name: '探针列表' }))
        .getAllByRole('button')
        .map((button) => button.querySelector('strong')?.textContent),
    ).toEqual(['High', 'Low', 'Missing'])

    await user.click(cpuSort)
    expect(cpuSort).toHaveAttribute('data-sort-direction', 'ascending')
    expect(
      within(screen.getByRole('group', { name: '探针列表' }))
        .getAllByRole('button')
        .map((button) => button.querySelector('strong')?.textContent),
    ).toEqual(['Low', 'High', 'Missing'])
  })

  it('announces clock skew and invalid sample time', () => {
    render(
      <ProbeEditorPane
        onSelect={vi.fn()}
        probes={[
          probe('clock', { freshness: 'clock-skew' }),
          probe('invalid', { freshness: 'invalid' }),
        ]}
        selectedId="clock"
      />,
    )

    expect(
      screen.getByRole('button', { name: /clock.*时钟偏移/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /invalid.*时间无效/ }),
    ).toBeInTheDocument()
  })

  it('uses one tab stop and supports arrow, Home, and End navigation', async () => {
    const user = userEvent.setup()
    render(
      <ProbeEditorPane
        onSelect={vi.fn()}
        probes={[probe('first'), probe('second'), probe('third')]}
        selectedId="first"
      />,
    )

    const rows = within(
      screen.getByRole('group', { name: '探针列表' }),
    ).getAllByRole('button')
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1])
    expect(rows[2]).toHaveAccessibleName(/第3项，共3项/)

    rows[0]?.focus()
    await user.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(rows[1]).toHaveFocus())

    await user.keyboard('{End}')
    await vi.waitFor(() => expect(rows[2]).toHaveFocus())

    await user.keyboard('{Home}')
    await vi.waitFor(() => expect(rows[0]).toHaveFocus())
  })
})
