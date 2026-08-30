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
}))

vi.mock('uplot', () => {
  class FakeUPlot implements FakePlotInstance {
    width: number
    cursor = { idx: null as number | null }
    data: Array<Array<number | null>>

    constructor(
      options: {
        width: number
        hooks?: {
          setCursor?: Array<(self: FakePlotInstance) => void>
        }
      },
      data: Array<Array<number | null>>,
    ) {
      this.width = options.width
      this.data = data
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
    expect(
      screen.getByText('时间').parentElement?.querySelector('time'),
    ).toHaveAttribute('datetime', '2026-08-30T03:02:00.000Z')

    act(() => plotState.triggerCursor?.(0))
    expect(screen.getByText('12%')).toBeInTheDocument()
    expect(
      screen.getByText('时间').parentElement?.querySelector('time'),
    ).toHaveAttribute('datetime', '2026-08-30T03:00:00.000Z')
  })
})
