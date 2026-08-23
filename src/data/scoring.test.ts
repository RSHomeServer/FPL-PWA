import { describe, expect, it } from 'vitest'
import { formatEvent, formatMetric, formatScoreLines, scoreParts } from './scoring'
import type { FplPerformance } from './types'

function row(partial: Partial<FplPerformance> = {}): FplPerformance {
  return {
    seasonId: '2025-26',
    playerId: 1,
    round: 1,
    fixture: 1,
    minutes: 90,
    totalPoints: 0,
    goalsScored: 0,
    assists: 0,
    cleanSheets: 0,
    saves: 0,
    bonus: 0,
    bps: 0,
    goalsConceded: 0,
    ownGoals: 0,
    penaltiesMissed: 0,
    penaltiesSaved: 0,
    yellowCards: 0,
    redCards: 0,
    starts: 1,
    expectedGoals: 0,
    expectedAssists: 0,
    expectedGoalInvolvements: 0,
    expectedPoints: null,
    defensiveContribution: null,
    gwPosition: 'DEF',
    wasHome: true,
    opponentTeamId: 2,
    valueTenths: 50,
    kickoffTime: '',
    teamName: 'Arsenal',
    ...partial,
  }
}

describe('scoreParts', () => {
  it('builds a defender clean sheet with appearance and omits zeros', () => {
    const parts = scoreParts(
      row({ minutes: 90, cleanSheets: 1, totalPoints: 6 }),
      'DEF',
    )
    expect(formatEvent(parts)).toBe('60+ (+2) · CS (+4)')
    expect(formatScoreLines(parts)).toEqual(['60+ (+2)', 'CS (+4)'])
  })

  it('uses 10/6/5/4 goal weights and 3 per assist', () => {
    expect(formatEvent(scoreParts(row({ minutes: 90, goalsScored: 1, totalPoints: 12 }), 'GK'))).toBe(
      '60+ (+2) · 1G (+10)',
    )
    expect(formatEvent(scoreParts(row({ minutes: 90, goalsScored: 1, totalPoints: 8 }), 'DEF'))).toBe(
      '60+ (+2) · 1G (+6)',
    )
    expect(formatEvent(scoreParts(row({ minutes: 90, goalsScored: 1, totalPoints: 7 }), 'MID'))).toBe(
      '60+ (+2) · 1G (+5)',
    )
    expect(formatEvent(scoreParts(row({ minutes: 90, goalsScored: 1, totalPoints: 6 }), 'FWD'))).toBe(
      '60+ (+2) · 1G (+4)',
    )
  })

  it('includes assists, saves, and FPL bonus points (1–3), not BPS', () => {
    const parts = scoreParts(
      row({
        minutes: 90,
        goalsScored: 1,
        assists: 1,
        saves: 6,
        bonus: 2,
        totalPoints: 2 + 10 + 3 + 2 + 2,
      }),
      'GK',
    )
    expect(formatEvent(parts)).toBe('60+ (+2) · 1G (+10) · 1A (+3) · 6 sv (+2) · Bonus (+2)')
  })

  it('omits clean sheets for forwards even when the flag is set', () => {
    const parts = scoreParts(row({ minutes: 90, cleanSheets: 1, totalPoints: 2 }), 'FWD')
    expect(formatEvent(parts)).toBe('60+ (+2)')
  })

  it('applies defensive contribution when the published count meets the threshold', () => {
    const parts = scoreParts(
      row({ minutes: 90, defensiveContribution: 12, totalPoints: 4 }),
      'MID',
    )
    expect(formatEvent(parts)).toBe('60+ (+2) · DC (+2)')
  })
})

describe('formatMetric', () => {
  it('renders NA when a stat does not apply', () => {
    expect(formatMetric(0, false)).toBe('NA')
    expect(formatMetric(1, true)).toBe('1')
  })
})
