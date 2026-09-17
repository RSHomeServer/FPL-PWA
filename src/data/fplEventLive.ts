import type {
  FplFixture,
  FplLivePlayer,
  FplPerformance,
  FplTeam,
  PlayerPosition,
} from './types'

export const FPL_EVENT_LIVE_PATH = (gw: number) => `/api/event/${gw}/live/`

export type OfficialEventLiveElement = {
  id: number
  stats: Record<string, unknown>
  explain?: Array<{
    fixture?: number
    stats?: unknown
  }>
  modified?: boolean
}

export type OfficialEventLivePayload = {
  elements?: OfficialEventLiveElement[]
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function asOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = asNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

/**
 * Map one `/api/event/{gw}/live/` element into an `FplPerformance` row.
 * Opponent / home / kickoff come from fixtures; price uses bootstrap `now_cost`
 * (API live rows do not expose per-GW value).
 */
export function performanceFromEventLive(
  seasonId: string,
  round: number,
  element: OfficialEventLiveElement,
  player: FplLivePlayer | undefined,
  team: FplTeam | undefined,
  fixturesById: ReadonlyMap<number, FplFixture>,
  eventFixtures: readonly FplFixture[],
): FplPerformance {
  const stats = element.stats ?? {}
  const explainFixtureId = element.explain?.find((row) => typeof row.fixture === 'number')?.fixture
  const fixtureFromExplain =
    explainFixtureId != null ? fixturesById.get(explainFixtureId) : undefined
  const teamId = player?.teamId ?? 0
  const fixtureFromTeam =
    eventFixtures.find((row) => row.teamH === teamId || row.teamA === teamId) ?? null
  const fixture = fixtureFromExplain ?? fixtureFromTeam

  let wasHome = false
  let opponentTeamId = 0
  if (fixture && teamId) {
    wasHome = fixture.teamH === teamId
    opponentTeamId = wasHome ? fixture.teamA : fixture.teamH
  }

  return {
    seasonId,
    playerId: element.id,
    round,
    fixture: fixture?.id ?? explainFixtureId ?? 0,
    minutes: asNumber(stats.minutes),
    totalPoints: asNumber(stats.total_points),
    goalsScored: asNumber(stats.goals_scored),
    assists: asNumber(stats.assists),
    cleanSheets: asNumber(stats.clean_sheets),
    saves: asNumber(stats.saves),
    bonus: asNumber(stats.bonus),
    bps: asNumber(stats.bps),
    goalsConceded: asNumber(stats.goals_conceded),
    ownGoals: asNumber(stats.own_goals),
    penaltiesMissed: asNumber(stats.penalties_missed),
    penaltiesSaved: asNumber(stats.penalties_saved),
    yellowCards: asNumber(stats.yellow_cards),
    redCards: asNumber(stats.red_cards),
    starts: asNumber(stats.starts),
    expectedGoals: asNumber(stats.expected_goals),
    expectedAssists: asNumber(stats.expected_assists),
    expectedGoalInvolvements: asNumber(stats.expected_goal_involvements),
    expectedPoints: null,
    defensiveContribution: asOptionalNumber(stats.defensive_contribution),
    gwPosition: (player?.position ?? 'UNK') as PlayerPosition,
    wasHome,
    opponentTeamId,
    valueTenths: player?.nowCostTenths ?? 0,
    kickoffTime: fixture?.kickoffTime ?? '',
    teamName: team?.name ?? team?.shortName ?? '',
  }
}

export function parseEventLivePayload(payload: unknown): OfficialEventLiveElement[] {
  if (!payload || typeof payload !== 'object') return []
  const elements = (payload as OfficialEventLivePayload).elements
  if (!Array.isArray(elements)) return []
  return elements.filter(
    (row): row is OfficialEventLiveElement =>
      !!row && typeof row === 'object' && typeof row.id === 'number' && row.id > 0,
  )
}

export function roundsCovered(performances: readonly FplPerformance[]): number[] {
  return [...new Set(performances.map((row) => row.round).filter((round) => round > 0))].sort(
    (a, b) => a - b,
  )
}

export function countByRound(performances: readonly FplPerformance[]): Array<{ round: number; rows: number; withMinutes: number }> {
  const map = new Map<number, { rows: number; withMinutes: number }>()
  for (const row of performances) {
    const cur = map.get(row.round) ?? { rows: 0, withMinutes: 0 }
    cur.rows += 1
    if (row.minutes > 0) cur.withMinutes += 1
    map.set(row.round, cur)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, stats]) => ({ round, rows: stats.rows, withMinutes: stats.withMinutes }))
}
