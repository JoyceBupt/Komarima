import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedMetricSeries } from '../../domain'
import { HistoryDetailView } from './HistoryDetailView'

vi.mock('./UPlotChart', () => ({
  UPlotChart: ({ series }: { series: NormalizedMetricSeries }) => (
    <div
      data-null-count={
        series.points.filter((point) => point.value === null).length
      }
      data-point-count={series.points.length}
      data-testid={`chart-${series.metricKey}-${series.tags.task_id ?? 'default'}`}
    />
  ),
}))

afterEach(cleanup)

const hourMs = 60 * 60 * 1_000
const endTimeMs = Date.parse('2026-08-30T08:00:00.000Z')

const cpuSeries: NormalizedMetricSeries = {
  metricKey: 'cpu.usage',
  entityId: 'tokyo-web-01',
  type: 'gauge',
  unit: '%',
  tags: {},
  downsampled: false,
  downsampleAlgorithm: null,
  intervalSeconds: 3_600,
  count: 4,
  points: [
    { timeMs: endTimeMs - 7 * hourMs, value: 8, count: 1 },
    { timeMs: endTimeMs - 5 * hourMs, value: 12, count: 1 },
    { timeMs: endTimeMs - hourMs, value: null, count: 0 },
    { timeMs: endTimeMs, value: 42, count: 1 },
  ],
}

const counterSeries: NormalizedMetricSeries = {
  metricKey: 'net.total.up',
  entityId: 'tokyo-web-01',
  type: 'counter',
  unit: 'bytes',
  tags: {},
  downsampled: true,
  downsampleAlgorithm: 'avg',
  intervalSeconds: 3_600,
  count: 2,
  points: [
    { timeMs: endTimeMs - 2 * hourMs, value: 80, count: 1 },
    { timeMs: endTimeMs, value: 86.4, count: 1 },
  ],
}

const pingSeries = (taskId: string): NormalizedMetricSeries => ({
  metricKey: 'ping.latency_ms',
  entityId: 'tokyo-web-01',
  type: 'gauge',
  unit: 'ms',
  tags: { task_id: taskId },
  downsampled: true,
  downsampleAlgorithm: 'avg',
  intervalSeconds: 60,
  count: 2,
  points: [
    { timeMs: endTimeMs - 60_000, value: 20, count: 1 },
    { timeMs: endTimeMs, value: 22, count: 1 },
  ],
})

describe('HistoryDetailView', () => {
  it('renders weighted coverage summaries without averaging counters', () => {
    render(
      <HistoryDetailView
        defaultRange="7d"
        endTimeMs={endTimeMs}
        nodeName="东京 Web 01"
        series={[cpuSeries, counterSeries]}
      />,
    )

    expect(screen.getByText('探针历史')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '东京 Web 01' }),
    ).toBeInTheDocument()

    const cpuSummary = screen
      .getByRole('heading', { name: 'CPU' })
      .closest('.history-summary')
    if (!(cpuSummary instanceof HTMLElement))
      throw new Error('CPU summary was not rendered')
    expect(within(cpuSummary).getByText('3 样本')).toBeInTheDocument()
    expect(within(cpuSummary).getAllByText(/覆盖/)).toHaveLength(1)
    expect(within(cpuSummary).getByText('20.7%')).toBeInTheDocument()
    expect(within(cpuSummary).getByText('37.5%')).toBeInTheDocument()
    expect(within(cpuSummary).getByText('5')).toBeInTheDocument()

    const counterSummary = screen
      .getByRole('heading', { name: '累计上行' })
      .closest('.history-summary')
    if (!(counterSummary instanceof HTMLElement))
      throw new Error('Counter summary was not rendered')
    expect(within(counterSummary).getByText('累计值')).toBeInTheDocument()
    expect(within(counterSummary).getByText(/已降采样/)).toBeInTheDocument()
  })

  it('requests controlled ranges and reports actual in-memory coverage', async () => {
    const user = userEvent.setup()
    const onRangeChange = vi.fn()
    const { rerender } = render(
      <HistoryDetailView
        endTimeMs={endTimeMs}
        nodeName="东京 Web 01"
        onRangeChange={onRangeChange}
        range="6h"
        series={[cpuSeries]}
      />,
    )

    await user.click(screen.getByRole('tab', { name: '历史' }))
    expect(screen.getByText(/实际 .*请求6小时/)).toBeInTheDocument()
    const sixHourChart = await screen.findByTestId('chart-cpu.usage-default')
    expect(sixHourChart).toHaveAttribute('data-point-count', '3')
    expect(sixHourChart).toHaveAttribute('data-null-count', '1')

    await user.click(screen.getByRole('button', { name: '24h' }))
    expect(onRangeChange).toHaveBeenCalledWith('24h', {
      range: '24h',
      startTimeMs: endTimeMs - 24 * hourMs,
      endTimeMs,
    })
    expect(screen.getByRole('button', { name: '6h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    rerender(
      <HistoryDetailView
        endTimeMs={endTimeMs}
        nodeName="东京 Web 01"
        onRangeChange={onRangeChange}
        range="24h"
        series={[cpuSeries]}
      />,
    )
    expect(screen.getByText(/实际 .*请求24小时/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps multiple tagged Ping series distinct', async () => {
    const user = userEvent.setup()
    render(
      <HistoryDetailView
        defaultRange="1h"
        endTimeMs={endTimeMs}
        nodeName="东京 Web 01"
        series={[pingSeries('7'), pingSeries('8')]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Ping 延迟 · 任务 7' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Ping 延迟 · 任务 8' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '历史' }))
    expect(
      await screen.findByTestId('chart-ping.latency_ms-7'),
    ).toBeInTheDocument()
    expect(
      await screen.findByTestId('chart-ping.latency_ms-8'),
    ).toBeInTheDocument()
  })

  it('implements roving tabs and keeps both controlled panels mounted', async () => {
    const user = userEvent.setup()
    render(
      <HistoryDetailView
        endTimeMs={endTimeMs}
        nodeName="东京 Web 01"
        series={[cpuSeries]}
      />,
    )

    const overviewTab = screen.getByRole('tab', { name: '概览' })
    const historyTab = screen.getByRole('tab', { name: '历史' })
    expect(
      document.getElementById(overviewTab.getAttribute('aria-controls')!),
    ).not.toBeNull()
    expect(
      document.getElementById(historyTab.getAttribute('aria-controls')!),
    ).not.toBeNull()
    expect(overviewTab).toHaveAttribute('tabindex', '0')
    expect(historyTab).toHaveAttribute('tabindex', '-1')

    overviewTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(historyTab).toHaveFocus()
    expect(historyTab).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(overviewTab).toHaveFocus()
    await user.keyboard('{End}')
    expect(historyTab).toHaveFocus()
  })

  it('shows concise loading, error, retry and empty states', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(
      <HistoryDetailView nodeName="东京 Web 01" series={[]} state="loading" />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('加载历史')

    rerender(
      <HistoryDetailView
        errorMessage="请求超时，服务暂时无法返回历史指标数据"
        nodeName="东京 Web 01"
        onRetry={onRetry}
        series={[]}
        state="error"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('加载失败')
    expect(screen.getByRole('alert')).not.toHaveTextContent('历史指标数据')
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(<HistoryDetailView nodeName="东京 Web 01" series={[]} />)
    expect(screen.getByText('暂无历史')).toBeInTheDocument()
  })
})
