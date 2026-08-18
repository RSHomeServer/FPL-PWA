import { describe, expect, it } from 'vitest'
import { appearancePoints } from '../data/scoring'
import {
  adjP90,
  adjP90Gw0,
  blendedFixtureFactor,
  eventEp90,
  eventRatesPer90,
  expectedMinutes,
  expectedPointsApproachA,
  expectedPointsApproachB,
  rawP90,
  shrinkageC,
  shrunkStartsRate,
  startsRate,
} from './metrics'

describe('M2–M6 shrinkage (hand-calculated MID season)', () => {
  const minutes = 225
  const points = 9
  const starts = 2
  const appearanceGws = 3
  const baseline = 4

  it('computes raw p90, start rate, and linear c', () => {
    expect(rawP90(points, minutes)).toBeCloseTo(3.6, 10)
    expect(startsRate(starts, appearanceGws)).toBeCloseTo(2 / 3, 10)
    expect(shrinkageC(minutes, { kind: 'linear', minutesRef: 900 })).toBeCloseTo(0.25, 10)
  })

  it('mixes toward the positional baseline and applies k_trans', () => {
    const adj = adjP90(3.6, baseline, minutes, { kind: 'linear', minutesRef: 900 })
    expect(adj).toBeCloseTo(3.9, 10)
    expect(adjP90Gw0(adj, true, 0.75)).toBeCloseTo(3.9 * 0.75, 10)
    expect(adjP90Gw0(adj, false, 0.75)).toBeCloseTo(3.9, 10)
  })

  it('falls back to the baseline when minutes < 90', () => {
    expect(rawP90(8, 80)).toBeNull()
    expect(adjP90(null, baseline, 80, { kind: 'linear', minutesRef: 900 })).toBe(4)
  })

  it('uses exponential 1-exp(-m/600) when asked', () => {
    expect(shrinkageC(600, { kind: 'exponential', tau: 600 })).toBeCloseTo(1 - Math.exp(-1), 10)
  })
})

describe('M7 event EP/90 and M8 minutes', () => {
  it('rebuilds event EP/90 from per-90 rates with official weights', () => {
    const rates = eventRatesPer90(225, {
      goals: 1,
      assists: 0,
      cleanSheets: 0,
      saves: 0,
      goalsConceded: 0,
      bonus: 0,
    })
    expect(rates?.g90).toBeCloseTo(0.4, 10)
    expect(eventEp90('MID', rates!)).toBeCloseTo(2, 10)
  })

  it('adds appearance points outside the per-90 rate for Approach B', () => {
    const minutes = expectedMinutes(2 / 3, 1)
    expect(minutes).toBeCloseTo(60, 10)
    expect(appearancePoints(minutes)).toBe(2)
    expect(expectedPointsApproachB(2.75, minutes, 1)).toBeCloseTo(2 + (2.75 / 90) * 60, 10)
  })

  it('caps double-GW minutes at 180', () => {
    expect(expectedMinutes(1, 2)).toBe(180)
    expect(expectedMinutes(1, 3)).toBe(180)
  })
})

describe('M11 Approach A', () => {
  it('is adj_p90/90 × expected minutes', () => {
    expect(expectedPointsApproachA(3.9, 60, 1)).toBeCloseTo(2.6, 10)
  })

  it('blends FDR for DEF/GK using the plan heuristics', () => {
    expect(blendedFixtureFactor('MID', 1.25, 0.8)).toBe(1.25)
    expect(blendedFixtureFactor('DEF', 1.2, 0.8, 0.5, 0.3)).toBeCloseTo(1.0, 10)
    expect(blendedFixtureFactor('GK', 1.2, 0.8, 0.5, 0.3)).toBeCloseTo(0.3 * 1.2 + 0.7 * 0.8, 10)
  })
})

describe('shrunk start rate', () => {
  it('does not shrink a 900-minute regular', () => {
    expect(shrunkStartsRate(0.9, 0.7, 900)).toBeCloseTo(0.9, 10)
  })

  it('mixes a 225-minute sample toward the positional start baseline', () => {
    expect(shrunkStartsRate(1, 0.6, 225, 450)).toBeCloseTo(0.5 * 1 + 0.5 * 0.6, 10)
  })
})
