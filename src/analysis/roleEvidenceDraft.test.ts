import { describe, expect, it } from 'vitest'
import { draftRoleEvidence } from './roleEvidenceDraft'

describe('conservative RoleEvidence draft', () => {
  it('never guesses HIGH startingLikelihood or confidence', () => {
    const row = draftRoleEvidence({
      reasons: ['newClub'],
      status: 'a',
      news: '',
      chanceNext: null,
    })
    expect(row.startingLikelihood).not.toBe('HIGH')
    expect(row.confidence).toBe('LOW')
    expect(row.roleChange).toBe('MINOR')
  })

  it('marks new-to-PL as LOW start, HIGH competition, MAJOR role change', () => {
    const row = draftRoleEvidence({
      reasons: ['newToPl', 'lowMinutes'],
      status: 'a',
      news: '',
      chanceNext: null,
    })
    expect(row.startingLikelihood).toBe('LOW')
    expect(row.competitionForPlace).toBe('HIGH')
    expect(row.roleChange).toBe('MAJOR')
    expect(row.roleContinuity).toBe('LOW')
  })

  it('maps official injury news onto fitnessConcern without inventing minutes', () => {
    const row = draftRoleEvidence({
      reasons: ['doubtful'],
      status: 'd',
      news: 'Shin injury - 75% chance of playing',
      chanceNext: 75,
    })
    expect(row.fitnessConcern).toBe('MEDIUM')
    expect(row.evidenceNotes).toContain('Official FPL news')
    expect(row.sources.some((url) => url.includes('fantasy.premierleague.com'))).toBe(true)
  })
})
