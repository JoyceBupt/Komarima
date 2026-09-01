import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedMetricSeries } from '../../domain'
import { PingProbeChart } from './PingProbeChart'

interface FakePlotInstance {
  cursor: { idx: number | null }
  data: Array<Array<number | null | undefined>>
  scales: Record<string, { min?: number; max?: number }>
}

const plotState = vi.hoisted(() => ({
  instances: [] as Array<{
    data: Array<Array<number | null | undefined>>
    destroy: ReturnType<typeof vi.fn>
    options: {
      axes?: Array<{
        values?: (
          self: FakePlotInstance,
          splits: number[],
        ) => Array<string | number>
      }>
      hooks?: {
        setCursor?: Array<(self: FakePlotInstance) => void>
      }
      series: Array<{
        label?: string
        spanGaps?: boolean
        stroke?: string
        width?: number
        points?: { show?: boolean }
      }>
    }
    triggerCursor(index: number): void
  }>,
}))

vi.mock('uplot', () => {
  class FakeUPlot implements FakePlotInstance {
    width: number
    cursor = { idx: null as number | null }
    data: Array<Array<number | null | undefined>>
    scales = { x: { min: 0, max: 0 } }
    destroy = vi.fn()
    options: (typeof plotState.instances)[number]['options']

    constructor(
      options: (typeof plotState.instances)[number]['options'] & {
        width: number
      },
      data: Array<Array<number | null | undefined>>,
    ) {
      this.width = options.width
      this.options = options
      this.data = data
      this.scales.x = {
        min: data[0]?.[0] ?? 0,
        max: data[0]?.at(-1) ?? 0,
      }
      plotState.instances.push({
        data,
        destroy: this.destroy,
        options,
        triggerCursor: (index: number) => {
          this.cursor.idx = index
          options.hooks?.setCursor?.forEach((hook) => hook(this))
        },
      })
    }

    setSize({ width }: { width: number; height: number }) {
      this.width = width
    }
  }

  return { default: FakeUPlot }
})

afterEach(() => {
  cleanup()
  plotState.instances.length = 0
  delete document.documentElement.dataset.theme
})

const startTimeMs = Date.parse('2026-08-30T03:00:00Z')

const pingSeries = (
  taskId: string,
  points: NormalizedMetricSeries['points'],
): NormalizedMetricSeries => ({
  metricKey: 'ping.latency_ms',
  entityId: 'node-a',
  type: 'gauge',
  unit: 'ms',
  tags: { task_id: taskId },
  downsampled: false,
  downsampleAlgorithm: null,
  intervalSeconds: 60,
  count: points.length,
  points,
})

const tokyo = pingSeries('7', [
  { timeMs: startTimeMs, value: 18, count: 1 },
  { timeMs: startTimeMs + 60_000, value: null, count: 0 },
  { timeMs: startTimeMs + 120_000, value: 20, count: 1 },
])
const frankfurt = pingSeries('8', [
  { timeMs: startTimeMs + 60_000, value: 31, count: 1 },
  { timeMs: startTimeMs + 120_000, value: 29, count: 1 },
])

describe('PingProbeChart', () => {
  it('renders readable task summaries and straight, gap-preserving series', () => {
    render(
      <PingProbeChart
        metricLabels={{
          'ping.latency_ms': 'Ping 延迟',
          '["ping.latency_ms","node-a",[["task_id","7"]]]': '东京线路',
          '["ping.latency_ms","node-a",[["task_id","8"]]]': '法兰克福线路',
        }}
        series={[tokyo, frankfurt]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Ping 延迟' })).toBeVisible()
    const taskList = screen.getByRole('list', { name: 'Ping 线路' })
    expect(taskList).toHaveTextContent('东京线路')
    expect(taskList).toHaveTextContent('20 ms')
    expect(taskList).toHaveTextContent('法兰克福线路')
    expect(taskList).toHaveTextContent('29 ms')

    const plot = plotState.instances[0]
    expect(plot?.data).toEqual([
      [
        startTimeMs / 1_000,
        startTimeMs / 1_000 + 60,
        startTimeMs / 1_000 + 120,
      ],
      [18, null, 20],
      [undefined, 31, 29],
    ])
    expect(plot?.options.series).toHaveLength(3)
    expect(plot?.options.series.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '东京线路',
          spanGaps: false,
          width: 2,
          points: { show: false },
        }),
        expect.objectContaining({
          label: '法兰克福线路',
          spanGaps: false,
          width: 2,
          points: { show: false },
        }),
      ]),
    )
    expect(document.querySelector('.history-uplot')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('updates cursor values and recreates the plot for a theme change', async () => {
    const { unmount } = render(<PingProbeChart series={[tokyo, frankfurt]} />)
    const firstPlot = plotState.instances[0]

    act(() => firstPlot?.triggerCursor(1))
    const taskList = screen.getByRole('list', { name: 'Ping 线路' })
    expect(taskList).toHaveTextContent('任务 7—')
    expect(taskList).toHaveTextContent('任务 831 ms')

    act(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await waitFor(() => expect(plotState.instances).toHaveLength(2))
    expect(firstPlot?.destroy).toHaveBeenCalledOnce()

    const secondPlot = plotState.instances[1]
    unmount()
    expect(secondPlot?.destroy).toHaveBeenCalledOnce()
  })

  it('toggles individual Ping lines without losing their stable colors', async () => {
    const user = userEvent.setup()
    render(
      <PingProbeChart
        metricLabels={{
          '["ping.latency_ms","node-a",[["task_id","7"]]]': '东京线路',
          '["ping.latency_ms","node-a",[["task_id","8"]]]': '法兰克福线路',
        }}
        series={[tokyo, frankfurt]}
      />,
    )

    const tokyoToggle = screen.getByRole('button', {
      name: '东京线路，已显示',
    })
    const frankfurtToggle = screen.getByRole('button', {
      name: '法兰克福线路，已显示',
    })
    await user.click(tokyoToggle)

    expect(tokyoToggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1/2 条线路')).toBeInTheDocument()
    await waitFor(() => expect(plotState.instances).toHaveLength(2))
    expect(plotState.instances[1]?.data).toEqual([
      [startTimeMs / 1_000 + 60, startTimeMs / 1_000 + 120],
      [31, 29],
    ])
    expect(plotState.instances[1]?.options.series[1]?.stroke).toBe(
      plotState.instances[0]?.options.series[2]?.stroke,
    )

    await user.click(frankfurtToggle)
    expect(screen.getByText('未选线路')).toBeInTheDocument()
    expect(screen.getByText('0/2 条线路')).toBeInTheDocument()

    await user.click(tokyoToggle)
    await waitFor(() => expect(plotState.instances).toHaveLength(3))
    expect(screen.getByText('1/2 条线路')).toBeInTheDocument()
  })

  it('does not render a card without Ping series', () => {
    const cpu = { ...tokyo, metricKey: 'cpu.usage', tags: {} }
    const { container } = render(<PingProbeChart series={[cpu]} />)

    expect(container).toBeEmptyDOMElement()
    expect(plotState.instances).toHaveLength(0)
  })
})
