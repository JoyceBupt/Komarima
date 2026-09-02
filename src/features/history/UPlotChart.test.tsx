import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedMetricSeries } from '../../domain'
import { UPlotChart } from './UPlotChart'

interface FakePlotInstance {
  cursor: { idx: number | null }
  data: Array<Array<number | null>>
}

const plotState = vi.hoisted(() => ({
  triggerCursor: null as ((index: number) => void) | null,
  options: null as {
    axes?: Array<{
      space?: unknown
      values?: (
        self: FakePlotInstance,
        splits: number[],
      ) => Array<string | number>
    }>
    series?: Array<{ points?: { show?: boolean; size?: number } }>
  } | null,
}))

vi.mock('uplot', () => {
  class FakeUPlot implements FakePlotInstance {
    width: number
    cursor = { idx: null as number | null }
    data: Array<Array<number | null>>

    constructor(
      options: {
        width: number
        axes?: Array<{
          space?: unknown
          values?: (
            self: FakePlotInstance,
            splits: number[],
          ) => Array<string | number>
        }>
        series?: Array<{ points?: { show?: boolean; size?: number } }>
        hooks?: {
          setCursor?: Array<(self: FakePlotInstance) => void>
        }
      },
      data: Array<Array<number | null>>,
    ) {
      this.width = options.width
      this.data = data
      plotState.options = options
      plotState.triggerCursor = (index: number) => {
        this.cursor.idx = index
        options.hooks?.setCursor?.forEach((hook) => hook(this))
      }
    }

    setSize({ width }: { width: number; height: number }) {
      this.width = width
    }

    destroy() {}
  }

  return { default: FakeUPlot }
})

afterEach(() => {
  cleanup()
  plotState.triggerCursor = null
  plotState.options = null
})

const series: NormalizedMetricSeries = {
  metricKey: 'cpu.usage',
  entityId: 'node-a',
  type: 'gauge',
  unit: '%',
  tags: {},
  downsampled: false,
  downsampleAlgorithm: null,
  intervalSeconds: 60,
  count: 3,
  points: [
    { timeMs: Date.parse('2026-08-30T03:00:00Z'), value: 12, count: 1 },
    { timeMs: Date.parse('2026-08-30T03:01:00Z'), value: null, count: 0 },
    { timeMs: Date.parse('2026-08-30T03:02:00Z'), value: 42, count: 1 },
  ],
}

describe('UPlotChart cursor readout', () => {
  it('starts at the latest sample and announces cursor time and value', () => {
    render(<UPlotChart label="CPU" series={series} />)

    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(typeof plotState.options?.axes?.[0]?.space).toBe('function')
    expect(
      screen.getByText('时间').parentElement?.querySelector('time'),
    ).toHaveAttribute('datetime', '2026-08-30T03:02:00.000Z')

    act(() => plotState.triggerCursor?.(0))
    expect(screen.getByText('12%')).toBeInTheDocument()
    expect(
      screen.getByText('时间').parentElement?.querySelector('time'),
    ).toHaveAttribute('datetime', '2026-08-30T03:00:00.000Z')
  })

  it('shows an explicit marker when only one usable point is available', () => {
    render(
      <UPlotChart
        label="CPU"
        series={{
          ...series,
          unit: 'bytes',
          points: [
            { timeMs: series.points[0]!.timeMs, value: null, count: 0 },
            series.points[2]!,
          ],
        }}
      />,
    )

    expect(plotState.options?.series?.[1]?.points).toMatchObject({
      show: true,
      size: 8,
    })
    expect(
      plotState.options?.axes?.[1]?.values?.(
        { cursor: { idx: null }, data: [] },
        [0, 1_048_576],
      ),
    ).toEqual(['0 B', '1 MB'])
  })
})
