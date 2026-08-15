import {
  parseBoolField,
  parseFloatField,
  parseIntField,
  parseOptionalInt,
} from './csv'
import type {
  FplFixture,
  FplPerformance,
  FplPlayer,
  FplTeam,
  PlayerPosition,
} from './types'

const POSITION_BY_CODE: Record<number, PlayerPosition> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
  5: 'AM',
}

export function positionFromElementType(value: string | undefined): PlayerPosition {
  if (!value) return 'UNK'
  const trimmed = value.trim().toUpperCase()
  if (trimmed === 'GK' || trimmed === 'DEF' || trimmed === 'MID' || trimmed === 'FWD' || trimmed === 'AM') {
    return trimmed
  }
  const code = parseIntField(value, NaN)
  return POSITION_BY_CODE[code] ?? 'UNK'
}

export function playerDisplayName(player: Pick<FplPlayer, 'webName' | 'firstName' | 'secondName'>): string {
  if (player.webName.trim()) return player.webName.trim()
  return `${player.firstName} ${player.secondName}`.trim()
}

/** Prefer `round`, then `GW`, so older merged_gw files still align. */
export function gameweekFromRow(row: Record<string, string>): number {
  const round = parseIntField(row.round, NaN)
  if (Number.isFinite(round) && round > 0) return round
  const gw = parseIntField(row.GW ?? row.gw, NaN)
  if (Number.isFinite(gw) && gw > 0) return gw
  return 0
}

export function parsePlayerRow(seasonId: string, row: Record<string, string>): FplPlayer | null {
  const id = parseIntField(row.id, NaN)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    seasonId,
    id,
    code: parseIntField(row.code),
    firstName: row.first_name?.trim() ?? '',
    secondName: row.second_name?.trim() ?? '',
    webName: row.web_name?.trim() || row.first_name?.trim() || String(id),
    teamId: parseIntField(row.team),
    position: positionFromElementType(row.element_type),
    nowCostTenths: parseIntField(row.now_cost),
    totalPoints: parseIntField(row.total_points),
    minutes: parseIntField(row.minutes),
    goalsScored: parseIntField(row.goals_scored),
    assists: parseIntField(row.assists),
    form: parseFloatField(row.form),
    selectedByPercent: parseFloatField(row.selected_by_percent),
  }
}

export function parseTeamRow(seasonId: string, row: Record<string, string>): FplTeam | null {
  const id = parseIntField(row.id, NaN)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    seasonId,
    id,
    name: row.name?.trim() || `Team ${id}`,
    shortName: row.short_name?.trim() || String(id),
    strength: parseIntField(row.strength),
    strengthAttackHome: parseIntField(row.strength_attack_home),
    strengthAttackAway: parseIntField(row.strength_attack_away),
    strengthDefenceHome: parseIntField(row.strength_defence_home),
    strengthDefenceAway: parseIntField(row.strength_defence_away),
  }
}

export function parseFixtureRow(seasonId: string, row: Record<string, string>): FplFixture | null {
  const id = parseIntField(row.id, NaN)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    seasonId,
    id,
    event: parseOptionalInt(row.event),
    kickoffTime: row.kickoff_time?.trim() ?? '',
    teamH: parseIntField(row.team_h),
    teamA: parseIntField(row.team_a),
    teamHScore: parseOptionalInt(row.team_h_score),
    teamAScore: parseOptionalInt(row.team_a_score),
    finished: parseBoolField(row.finished),
    teamHDifficulty: parseOptionalInt(row.team_h_difficulty),
    teamADifficulty: parseOptionalInt(row.team_a_difficulty),
  }
}

export function parsePerformanceRow(
  seasonId: string,
  row: Record<string, string>,
): FplPerformance | null {
  const playerId = parseIntField(row.element, NaN)
  const round = gameweekFromRow(row)
  if (!Number.isFinite(playerId) || playerId <= 0 || round <= 0) return null
  return {
    seasonId,
    playerId,
    round,
    fixture: parseIntField(row.fixture) || parseIntField(row.id),
    minutes: parseIntField(row.minutes),
    totalPoints: parseIntField(row.total_points),
    goalsScored: parseIntField(row.goals_scored),
    assists: parseIntField(row.assists),
    wasHome: parseBoolField(row.was_home),
    opponentTeamId: parseIntField(row.opponent_team),
    valueTenths: parseIntField(row.value),
    kickoffTime: row.kickoff_time?.trim() ?? '',
    teamName: row.team?.trim() ?? '',
  }
}

export function performanceKey(row: Pick<FplPerformance, 'seasonId' | 'playerId' | 'round' | 'fixture'>): string {
  return `${row.seasonId}|${row.playerId}|${row.round}|${row.fixture}`
}

/** merged_gw can repeat the same element/round/fixture; keep the richer minutes row. */
export function dedupePerformances(rows: readonly FplPerformance[]): FplPerformance[] {
  const map = new Map<string, FplPerformance>()
  for (const row of rows) {
    const key = performanceKey(row)
    const prev = map.get(key)
    if (!prev || row.minutes > prev.minutes) map.set(key, row)
  }
  return [...map.values()]
}

export function pointsByRound(rows: readonly FplPerformance[]): number[] {
  const totals = new Map<number, number>()
  for (const row of rows) {
    totals.set(row.round, (totals.get(row.round) ?? 0) + row.totalPoints)
  }
  const rounds = [...totals.keys()].sort((a, b) => a - b)
  return rounds.map((round) => totals.get(round) ?? 0)
}
