import { describe, expect, it } from 'vitest'
import { nameInitials, playerPhotoUrl, teamCrestUrl } from './media'

describe('media URLs', () => {
  it('builds Premier League player photo URLs from FPL codes', () => {
    expect(playerPhotoUrl(154561)).toBe(
      'https://resources.premierleague.com/premierleague/photos/players/110x140/p154561.png',
    )
    expect(playerPhotoUrl(0)).toBeNull()
    expect(playerPhotoUrl(-1)).toBeNull()
  })

  it('builds club crest URLs from team codes', () => {
    expect(teamCrestUrl(3)).toBe(
      'https://resources.premierleague.com/premierleague/badges/50/t3.png',
    )
    expect(teamCrestUrl(0)).toBeNull()
  })
})

describe('nameInitials', () => {
  it('uses first and last tokens, else two characters', () => {
    expect(nameInitials('David Raya Martín')).toBe('DM')
    expect(nameInitials('Raya')).toBe('RA')
    expect(nameInitials('  ')).toBe('?')
  })
})
