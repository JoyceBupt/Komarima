import { describe, expect, it } from 'vitest'
import { formatTimeAxisTicks, minimumTimeAxisSpace } from './timeAxis'

const seconds = (isoTimestamp: string) => Date.parse(isoTimestamp) / 1_000

describe('responsive time axis', () => {
  it('keeps short ranges in 24-hour time', () => {
    expect(
      formatTimeAxisTicks(
        [seconds('2026-08-30T03:00:00Z'), seconds('2026-08-30T03:30:00Z')],
        6 * 60 * 60,
        'Asia/Shanghai',
      ),
    ).toEqual(['11:00', '11:30'])
  })

  it('uses dates only at rollovers for a 24-hour range', () => {
    expect(
      formatTimeAxisTicks(
        [
          seconds('2026-08-30T03:00:00Z'),
          seconds('2026-08-30T04:00:00Z'),
          seconds('2026-08-30T16:00:00Z'),
          seconds('2026-08-30T17:00:00Z'),
        ],
        24 * 60 * 60,
        'Asia/Shanghai',
      ),
    ).toEqual(['08-30', '12:00', '08-31', '01:00'])
  })

  it('shows one date per visible day for multi-day ranges', () => {
    expect(
      formatTimeAxisTicks(
        [
          seconds('2026-08-30T03:00:00Z'),
          seconds('2026-08-30T11:00:00Z'),
          seconds('2026-08-30T16:00:00Z'),
          seconds('2026-08-31T04:00:00Z'),
        ],
        7 * 24 * 60 * 60,
        'Asia/Shanghai',
      ),
    ).toEqual(['08-30', '', '08-31', ''])
  })

  it('uses actual plot width while preserving readable minimum spacing', () => {
    expect(minimumTimeAxisSpace(6 * 60 * 60, 1_920)).toBe(64)
    expect(minimumTimeAxisSpace(24 * 60 * 60, 1_920)).toBe(96)
    expect(minimumTimeAxisSpace(7 * 24 * 60 * 60, 72)).toBe(72)
    expect(minimumTimeAxisSpace(24 * 60 * 60, Number.NaN)).toBe(96)
  })
})
