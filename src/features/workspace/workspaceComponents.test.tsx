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
    pingLabel: '东京 ICMP',
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
      resetLabel: '每月1日重置',
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

  it('keeps server order and opens a row directly', async () => {
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

    expect(
      within(screen.getByRole('group', { name: '探针列表' }))
        .getAllByRole('button')
        .map(
          (button) => button.querySelector('.probe-copy strong')?.textContent,
        ),
    ).toEqual(['Missing', 'Low', 'High'])

    await user.click(screen.getByRole('button', { name: /Low/ }))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'low' }),
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
    expect(card).toHaveTextContent('每月1日重置')
  })

  it('keeps cumulative traffic visible without a quota', () => {
    render(
      <ProbeOverviewPane
        onSelect={vi.fn()}
        probes={[
          probe('No quota', {
            traffic: {
              used: null,
              limit: null,
              percent: null,
              basis: null,
              resetLabel: '每月15日重置',
            },
          }),
        ]}
        view="list"
      />,
    )

    const row = screen.getByRole('button', { name: /No quota/ })
    expect(row).toHaveTextContent('↑86.4 GB')
    expect(row).toHaveTextContent('↓428.7 GB')
    expect(row).toHaveTextContent('每月15日重置')
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
