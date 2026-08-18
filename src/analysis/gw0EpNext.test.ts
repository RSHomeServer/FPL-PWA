import { describe, expect, it } from 'vitest'
import {
  epNextDelta,
  formatSigned,
  largestEpNextDisagreements,
  summariseEpNext,
} from './gw0EpNext'
import type { PlayerPosition } from '../data/types'

describe('ep_next delta helpers', () => {
  it('subtracts official ep_next from E[pts GW1] and skips missing values', () => {
    expect(epNextDelta(4.2, 3.5)).toBeCloseTo(0.7)
    expect(epNextDelta(2, 4)).toBe(-2)
    expect(epNextDelta(3, null)).toBeNull()
    expect(epNextDelta(3, Number.NaN)).toBeNull()
  })

  it('sums squad EP vs ep_next on the compared set only', () => {
    const summary = summariseEpNext([
      { ePtsGw1: 5, epNext: 4 },
      { ePtsGw1: 3, epNext: 3.5 },
      { ePtsGw1: 2, epNext: null },
    ])
    expect(summary).toMatchObject({
      n: 3,
      ourGw1: 10,
      ourGw1Compared: 8,
      epNextSum: 7.5,
      compared: 2,
      missing: 1,
      delta: 0.5,
    })
    expect(summariseEpNext([]).delta).toBeNull()
  })

  it('ranks the largest |delta| in the pool, stable by name then code', () => {
    const rows = largestEpNextDisagreements(
      [
        row(1, 'Alpha', 6, 3),
        row(2, 'Beta', 2, 5),
        row(3, 'Gamma', 4, 4.1),
        row(4, 'Delta', 3, null),
        row(5, 'Aaa', 6, 3),
      ],
      3,
    )
    expect(rows.map((item) => item.webName)).toEqual(['Aaa', 'Alpha', 'Beta'])
    expect(rows[0]).toMatchObject({ ePtsGw1: 6, epNext: 3, delta: 3, absDelta: 3, position: 'MID' })
    expect(rows[2]).toMatchObject({ webName: 'Beta', delta: -3, absDelta: 3 })
  })

  it('formats signed deltas for the table', () => {
    expect(formatSigned(1.234)).toBe('+1.23')
    expect(formatSigned(-0.4)).toBe('-0.40')
    expect(formatSigned(0)).toBe('0.00')
  })
})

function row(
  code: number,
  webName: string,
  ePtsGw1: number,
  epNext: number | null,
  position: PlayerPosition = 'MID',
) {
  return {
    code,
    current: { webName },
    teamShortName: 'T',
    position,
    ePtsGw1,
    epNext,
  }
}
