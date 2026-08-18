import { describe, expect, it } from 'vitest'
import { poolMetricValue, squadMembership, type PoolMetricId } from './gw0PoolCharts'
import type { Gw0Projection } from './gw0Project'

describe('squad membership', () => {
  it('labels both, short-only, long-only, and pool', () => {
    const short = new Set([1, 2])
    const long = new Set([2, 3])
    expect(squadMembership(2, short, long)).toBe('both')
    expect(squadMembership(1, short, long)).toBe('short')
    expect(squadMembership(3, short, long)).toBe('long')
    expect(squadMembership(9, short, long)).toBe('pool')
  })
})

describe('pool metrics', () => {
  it('reads solver fields including price in millions', () => {
    const player = {
      ePtsGw1: 4.2,
      ePtsGw16: 20,
      eppmGw1: 0.7,
      epNext: 3.1,
      expectedMinutesGw1: 78,
      nowCostTenths: 65,
      confidence: { value: 0.8 },
    } as Gw0Projection
    const cases: Array<[PoolMetricId, number]> = [
      ['ePtsGw1', 4.2],
      ['ePtsGw16', 20],
      ['eppmGw1', 0.7],
      ['epNext', 3.1],
      ['expectedMinutesGw1', 78],
      ['price', 6.5],
      ['confidence', 0.8],
    ]
    for (const [metric, expected] of cases) {
      expect(poolMetricValue(player, metric)).toBe(expected)
    }
  })

  it('returns null when ep_next is missing', () => {
    const player = { epNext: null } as Gw0Projection
    expect(poolMetricValue(player, 'epNext')).toBeNull()
  })
})
