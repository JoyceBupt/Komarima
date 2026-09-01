import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProbeOverviewPane } from './ProbeOverviewPane'
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
    region: '东京',
    operatingSystem: 'Debian 12',
    architecture: 'amd64',
    cpuCores: 4,
    memoryTotal: '8 GB',
    diskTotal: '80 GB',
    publicRemark: '公开备注',
    tags: ['生产', '东京'],
    connection: 'online',
    dataQuality: 'valid',
    freshness: 'fresh',
    ageLabel: '8 秒前',
    cpu: 12,
    memory: 40,
    disk: 30,
    ping: 28,
    network: {
      uploadRate: '1.2 MB/s',
      downloadRate: '8.4 MB/s',
      uploadTotal: '86.4 GB',
      downloadTotal: '428.7 GB',
    },
    traffic: {
      used: '515.1 GB',
      limit: '1 TB',
      percent: 50.3,
      basis: '合计',
    },
    billing: {
      price: '$8.5/月',
      remaining: '余124天',
      expiresOn: '2027-01-01',
      autoRenewal: true,
      tone: 'normal',
    },
    uptime: '12天',
    ...overrides,
  }
}

describe('ProbeOverviewPane', () => {
  it('shows one concise empty state', () => {
    render(<ProbeOverviewPane onSelect={vi.fn()} probes={[]} view="list" />)

    expect(screen.getByText('暂无探针')).toBeInTheDocument()
    expect(screen.queryByText('等待探针接入')).not.toBeInTheDocument()
  })

  it('sorts list metrics and opens a row directly', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ProbeOverviewPane
        onSelect={onSelect}
        probes={[
          probe('missing', { name: 'Missing', cpu: null }),
          probe('low', { name: 'Low', cpu: 8 }),
          probe('high', { name: 'High', cpu: 81 }),
        ]}
        view="list"
      />,
    )

    const cpuSort = screen.getByRole('button', { name: '按CPU降序排列' })
    await user.click(cpuSort)
    expect(cpuSort).toHaveAccessibleName('CPU，当前降序，切换为升序')
    expect(screen.getByLabelText('CPU81%')).toHaveClass('is-compact')
    expect(
      within(screen.getByRole('group', { name: '探针列表' }))
        .getAllByRole('button')
        .map(
          (button) => button.querySelector('.probe-copy strong')?.textContent,
        ),
    ).toEqual(['High', 'Low', 'Missing'])

    await user.click(screen.getByRole('button', { name: /High/ }))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'high' }),
    )
  })

  it('shows billing, public remark, and quota in card view', () => {
    render(
      <ProbeOverviewPane
        onSelect={vi.fn()}
        probes={[probe('Tokyo Edge')]}
        view="cards"
      />,
    )

    const card = screen.getByRole('button', { name: /Tokyo Edge/ })
    expect(card).toHaveTextContent('公开备注')
    expect(card).toHaveTextContent('$8.5/月')
    expect(card).toHaveTextContent('余124天')
    expect(card).toHaveTextContent('自动续费')
    expect(card).toHaveTextContent('515.1 GB / 1 TB')
    expect(card).toHaveTextContent('50.3%')
    expect(card).toHaveTextContent('合计')
  })

  it('keeps cumulative traffic visible without a quota', () => {
    render(
      <ProbeOverviewPane
        onSelect={vi.fn()}
        probes={[
          probe('No quota', {
            traffic: { used: null, limit: null, percent: null, basis: null },
          }),
        ]}
        view="list"
      />,
    )

    const row = screen.getByRole('button', { name: /No quota/ })
    expect(row).toHaveTextContent('↑86.4 GB')
    expect(row).toHaveTextContent('↓428.7 GB')
  })

  it('announces clock skew and invalid sample time', () => {
    render(
      <ProbeOverviewPane
        onSelect={vi.fn()}
        probes={[
          probe('clock', { freshness: 'clock-skew' }),
          probe('invalid', { freshness: 'invalid' }),
        ]}
        view="list"
      />,
    )

    expect(
      screen.getByRole('button', { name: /clock.*时钟偏移/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /invalid.*时间无效/ }),
    ).toBeInTheDocument()
  })

  it('uses one list tab stop and supports arrow, Home, and End', async () => {
    const user = userEvent.setup()
    render(
      <ProbeOverviewPane
        onSelect={vi.fn()}
        probes={[probe('first'), probe('second'), probe('third')]}
        view="list"
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
