import { describe, expect, it } from 'vitest'
import { resolveHindsightChips, type DynamicWeekPlan } from './perfectSeason'
import type { HindsightPlayer } from './perfectTeam'

function player(code: number, gwPoints: number): HindsightPlayer {
  return {
    code,
    playerId: code,
    webName: `P${code}`,
    position: 'MID',
    teamId: 1,
    teamCode: 1,
    teamShortName: 'T',
    costTenths: 60,
    gwPoints,
    performance: null,
  }
}

function week(gw: number, captainPts: number, benchPts: number[]): DynamicWeekPlan {
  const captain = player(gw * 10, captainPts)
  const bench = benchPts.map((pts, index) => player(gw * 10 + index + 1, pts))
  return {
    gw,
    squad: [captain, ...bench],
    xi: [captain],
    bench,
    captain,
    viceCaptain: captain,
    formation: '3-4-3',
    gwPoints: captainPts,
    transfers: [],
    hits: 0,
    chips: [],
  }
}

describe('resolveHindsightChips', () => {
  it('returns no chips when useChips is false', () => {
    const weeks = [week(1, 12, [4, 3, 1]), week(2, 20, [2, 1, 0])]
    expect(resolveHindsightChips(weeks, false)).toEqual([])
  })

  it('assigns TC + BB and chipBonus when useChips is true', () => {
    const weeks = [week(1, 12, [8, 2, 1]), week(2, 20, [3, 1, 0])]
    const chips = resolveHindsightChips(weeks, true)
    expect(chips).toHaveLength(2)
    const tc = chips.find((chip) => chip.chip === 'triple-captain')
    const bb = chips.find((chip) => chip.chip === 'bench-boost')
    expect(tc?.gw).toBe(2)
    expect(tc?.bonusPoints).toBe(40)
    expect(bb?.gw).toBe(1)
    expect(bb?.bonusPoints).toBe(11)
    const chipBonus = chips.reduce((sum, chip) => sum + chip.bonusPoints, 0)
    const base = weeks.reduce((sum, row) => sum + row.gwPoints, 0)
    expect(base + chipBonus).toBe(base + 51)
  })
})
