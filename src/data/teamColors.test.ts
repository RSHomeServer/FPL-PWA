import { describe, expect, it } from 'vitest'
import { teamTintColor } from './teamColors'

describe('teamTintColor', () => {
  it('uses Premier League team codes when present', () => {
    expect(teamTintColor({ code: 3, shortName: 'ARS' })).toBe('#EF0107')
    expect(teamTintColor({ code: 14, shortName: 'LIV' })).toBe('#C8102E')
  })

  it('falls back to short name when code is missing', () => {
    expect(teamTintColor({ code: 0, shortName: 'MCI' })).toBe('#6CABDD')
  })
})
