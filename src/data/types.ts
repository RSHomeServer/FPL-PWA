/**
 * Domain types for published FPL history.
 *
 * Source kinds:
 * - `historical` — completed season snapshot from vaastav (stable cache)
 * - `current` — latest published season folder (short TTL; refresh after new GWs)
 * - `user` — manager-specific squad/picks (unused; not ingested here)
 *
 * Official live API (not implemented): `fantasy.premierleague.com/api/bootstrap-static/`
 * and per-event live endpoints expose the same element/fixture ids and tenths-of-a-million
 * prices. A later ticket can implement `FplLiveSource` in `fplLiveSource.ts` without
 * changing these records.
 */
export type FplSourceKind = 'historical' | 'current' | 'user'

export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD' | 'AM' | 'UNK'

export type FplPlayer = {
  seasonId: string
  id: number
  code: number
  firstName: string
  secondName: string
  webName: string
  teamId: number
  position: PlayerPosition
  nowCostTenths: number
  totalPoints: number
  minutes: number
  goalsScored: number
  assists: number
  form: number
  selectedByPercent: number
}

export type FplTeam = {
  seasonId: string
  id: number
  /** Premier League / FPL team code from vaastav `teams.csv` (`code` column). */
  code: number
  name: string
  shortName: string
  strength: number
  strengthAttackHome: number
  strengthAttackAway: number
  strengthDefenceHome: number
  strengthDefenceAway: number
}

export type FplFixture = {
  seasonId: string
  id: number
  event: number | null
  kickoffTime: string
  teamH: number
  teamA: number
  teamHScore: number | null
  teamAScore: number | null
  finished: boolean
  teamHDifficulty: number | null
  teamADifficulty: number | null
}

export type FplPerformance = {
  seasonId: string
  playerId: number
  round: number
  fixture: number
  minutes: number
  totalPoints: number
  goalsScored: number
  assists: number
  wasHome: boolean
  opponentTeamId: number
  valueTenths: number
  kickoffTime: string
  teamName: string
}

export type SeasonCatalogEntry = {
  seasonId: string
  kind: Exclude<FplSourceKind, 'user'>
}

export type SeasonCacheMeta = {
  seasonId: string
  kind: Exclude<FplSourceKind, 'user'>
  fetchedAt: number
  sourceRevision: string
  etags: Record<string, string>
  playerCount: number
  teamCount: number
  fixtureCount: number
  performanceCount: number
}

export type SeasonSnapshot = {
  meta: SeasonCacheMeta
  players: FplPlayer[]
  teams: FplTeam[]
  fixtures: FplFixture[]
  performances: FplPerformance[]
}
