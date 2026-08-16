/** Official Premier League photo/badge URLs keyed by published FPL codes. */

const PLAYER_PHOTO_BASE =
  'https://resources.premierleague.com/premierleague/photos/players/110x140'
const TEAM_CREST_BASE = 'https://resources.premierleague.com/premierleague/badges/50'

export function playerPhotoUrl(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0) return null
  return `${PLAYER_PHOTO_BASE}/p${Math.trunc(code)}.png`
}

export function teamCrestUrl(code: number): string | null {
  if (!Number.isFinite(code) || code <= 0) return null
  return `${TEAM_CREST_BASE}/t${Math.trunc(code)}.png`
}

export function nameInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? ''
    const last = parts[parts.length - 1]?.[0] ?? ''
    return `${first}${last}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}
