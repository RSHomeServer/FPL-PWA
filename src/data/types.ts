/**
 * Domain types for published FPL history and the official live GW0 snapshot.
 *
 * Source kinds:
 * - `historical` — completed season snapshot from vaastav (stable cache)
 * - `current` — latest published season folder (short TTL; refresh after new GWs)
 * - `live` — official FPL bootstrap + fixtures (short TTL; canonical GW0 prices)
 * - `user` — manager-specific squad/picks (official entry API; see `fplUserSource.ts`)
 *
 * Official live API: `fantasy.premierleague.com/api/bootstrap-static/` and
 * `/api/fixtures/`. Same element/fixture ids and tenths-of-a-million prices.
 * Per-event live endpoints are look-ahead at GW0 and are not called.
 */
export type FplSourceKind = 'historical' | 'current' | 'live' | 'user'

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
  cleanSheets: number
  saves: number
  bonus: number
  bps: number
  goalsConceded: number
  ownGoals: number
  penaltiesMissed: number
  penaltiesSaved: number
  yellowCards: number
  redCards: number
  starts: number
  expectedGoals: number
  expectedAssists: number
  expectedGoalInvolvements: number
  /** vaastav `xP` when published; null on older gameweek files. */
  expectedPoints: number | null
  /** 2025-26 defensive contribution count; null when the column is absent. */
  defensiveContribution: number | null
  gwPosition: PlayerPosition
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

/** Official API availability / news fields needed at GW0. */
export type FplLivePlayer = FplPlayer & {
  teamCode: number
  status: string
  news: string
  chanceOfPlayingThisRound: number | null
  chanceOfPlayingNextRound: number | null
  epNext: number | null
  canSelect: boolean
}

export type FplLiveEvent = {
  id: number
  name: string
  deadlineTime: string
  isNext: boolean
  isCurrent: boolean
  finished: boolean
}

export type LiveCacheMeta = {
  id: 'current'
  seasonId: string
  fetchedAt: number
  playerCount: number
  teamCount: number
  fixtureCount: number
  eventCount: number
  nextEventId: number | null
}

export type FplLiveSnapshot = {
  meta: LiveCacheMeta
  players: FplLivePlayer[]
  teams: FplTeam[]
  fixtures: FplFixture[]
  events: FplLiveEvent[]
}

/** Structured GW0 minutes flags — modelling plan §13. Never a raw expected-minutes number. */
export type StartingLikelihood = 'HIGH' | 'MEDIUM' | 'LOW'
export type RoleContinuity = 'HIGH' | 'MEDIUM' | 'LOW'
export type CompetitionForPlace = 'HIGH' | 'MEDIUM' | 'LOW'
export type FitnessConcern = 'NONE' | 'MEDIUM' | 'HIGH'
export type RoleChange = 'NONE' | 'MINOR' | 'MAJOR'
export type EvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export type RoleEvidence = {
  startingLikelihood: StartingLikelihood
  roleContinuity: RoleContinuity
  competitionForPlace: CompetitionForPlace
  fitnessConcern: FitnessConcern
  roleChange: RoleChange
  evidenceNotes: string
  sources: string[]
  confidence: EvidenceConfidence
}

/** Dexie row: RoleEvidence keyed by official player `code`. */
export type RoleEvidenceRecord = RoleEvidence & {
  code: number
  liveId: number | null
  webName: string
  updatedAt: number
}

/** Which 15-man objective(s) lock/exclude pins apply to. Default both. */
export type Gw0PinScope = 'both' | 'shortTerm' | 'longTerm'

/**
 * Dexie singleton for GW0 lock/exclude. Seed empty. Distinct from
 * vaastav / live / roleEvidence stores.
 */
export type Gw0SquadPinsRecord = {
  id: 'current'
  lockedCodes: number[]
  excludedCodes: number[]
  scope: Gw0PinScope
  updatedAt: number
}

/** Manager identity from `GET /api/entry/{entry_id}/`. */
export type ManagerIdentity = {
  entryId: number
  teamName: string
  playerFirstName: string
  playerLastName: string
}

/**
 * One pick row from `GET /api/entry/{id}/event/{gw}/picks/`.
 * The API exposes `element` id only; `code` is joined from live bootstrap (`elements[].code`).
 */
export type SquadPick = {
  elementId: number
  code: number
  position: number
  isCaptain: boolean
  isViceCaptain: boolean
  multiplier: number
}

/** Summary fields from `GET /api/entry/{entry_id}/`. */
export type ManagerEntrySummary = {
  identity: ManagerIdentity
  startedEvent: number
  currentEvent: number
  summaryOverallPoints: number
  summaryOverallRank: number
  lastDeadlineBankTenths: number
  lastDeadlineValueTenths: number
}

/** `entry_history` slice embedded in gameweek picks. */
export type ManagerGameweekEntryHistory = {
  event: number
  points: number
  totalPoints: number
  bankTenths: number
  squadValueTenths: number
  eventTransfers: number
  eventTransfersCost: number
  pointsOnBench: number | null
}

export type ManagerAutomaticSub = {
  elementIn: number
  elementOut: number
  event: number
}

/** Parsed `GET /api/entry/{id}/event/{gw}/picks/`. */
export type ManagerGameweekPicks = {
  entryId: number
  event: number
  picks: SquadPick[]
  entryHistory: ManagerGameweekEntryHistory
  activeChip: string | null
  automaticSubs: ManagerAutomaticSub[]
}

/** One row from `history.current[]`. */
export type ManagerHistoryGameweek = {
  event: number
  points: number
  totalPoints: number
  bankTenths: number
  squadValueTenths: number
  eventTransfers: number
  eventTransfersCost: number
  overallRank: number | null
}

export type ManagerChipPlay = {
  name: string
  event: number
  time: string
}

/** Parsed `GET /api/entry/{id}/history/`. */
export type ManagerHistory = {
  current: ManagerHistoryGameweek[]
  chips: ManagerChipPlay[]
}

/** One row from `GET /api/entry/{id}/transfers/`. */
export type ManagerTransfer = {
  elementIn: number
  elementInCostTenths: number
  elementOut: number
  elementOutCostTenths: number
  entryId: number
  event: number
  time: string
}

/** Aggregate returned by `fetchManagerState`. */
export type ManagerSnapshot = {
  entry: ManagerEntrySummary
  picks: ManagerGameweekPicks
  history: ManagerHistory
  event: number
  fetchedAt: number
}
