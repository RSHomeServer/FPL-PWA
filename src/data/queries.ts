import { playerDisplayName, pointsByRound } from './parse'
import { formatGbpFromTenths } from './prices'
import type { FplFixture, FplPerformance, FplPlayer, FplTeam, SeasonSnapshot } from './types'

export function teamById(teams: readonly FplTeam[]): Map<number, FplTeam> {
  return new Map(teams.map((team) => [team.id, team]))
}

export function teamName(teams: Map<number, FplTeam>, id: number): string {
  return teams.get(id)?.shortName ?? teams.get(id)?.name ?? String(id)
}

export function playerById(players: readonly FplPlayer[]): Map<number, FplPlayer> {
  return new Map(players.map((player) => [player.id, player]))
}

export function performancesForPlayer(
  rows: readonly FplPerformance[],
  playerId: number,
): FplPerformance[] {
  return rows
    .filter((row) => row.playerId === playerId)
    .sort((a, b) => a.round - b.round || a.fixture - b.fixture)
}

export function formSparkline(
  rows: readonly FplPerformance[],
  playerId: number,
  lastN = 8,
): number[] {
  const series = pointsByRound(performancesForPlayer(rows, playerId))
  return series.slice(-lastN)
}

export function maxRound(rows: readonly FplPerformance[], fixtures: readonly FplFixture[]): number {
  let max = 0
  for (const row of rows) max = Math.max(max, row.round)
  for (const fixture of fixtures) {
    if (fixture.event) max = Math.max(max, fixture.event)
  }
  return max
}

export function latestPlayedRound(rows: readonly FplPerformance[]): number {
  let max = 0
  for (const row of rows) {
    if (row.minutes > 0 || row.totalPoints !== 0) max = Math.max(max, row.round)
  }
  return max
}

export function gameweekEvents(
  snapshot: SeasonSnapshot,
  round: number,
): {
  who: string
  event: string
  note: string
  points: number
}[] {
  const names = playerById(snapshot.players)
  const teams = teamById(snapshot.teams)
  return snapshot.performances
    .filter((row) => row.round === round && (row.minutes > 0 || row.totalPoints !== 0))
    .map((row) => {
      const player = names.get(row.playerId)
      const who = player ? playerDisplayName(player) : `Player ${row.playerId}`
      const returns = row.goalsScored + row.assists
      let event = `${row.totalPoints} pts`
      if (returns > 0) event = `${row.goalsScored}G ${row.assists}A · ${row.totalPoints} pts`
      else if (row.minutes === 0) event = 'Blank'
      const note = `${row.minutes} min · ${row.wasHome ? 'H' : 'A'} vs ${teamName(teams, row.opponentTeamId)}`
      return { who, event, note, points: row.totalPoints }
    })
    .sort((a, b) => b.points - a.points)
}

export function meanPointsByRound(rows: readonly FplPerformance[]): number[] {
  const sums = new Map<number, { total: number; count: number }>()
  for (const row of rows) {
    if (row.minutes <= 0) continue
    const bucket = sums.get(row.round) ?? { total: 0, count: 0 }
    bucket.total += row.totalPoints
    bucket.count += 1
    sums.set(row.round, bucket)
  }
  const rounds = [...sums.keys()].sort((a, b) => a - b)
  return rounds.map((round) => {
    const bucket = sums.get(round)
    if (!bucket || bucket.count === 0) return 0
    return bucket.total / bucket.count
  })
}

export function playerPriceLabel(player: FplPlayer): string {
  return formatGbpFromTenths(player.nowCostTenths)
}

export function upcomingFixturesForTeam(
  fixtures: readonly FplFixture[],
  teamId: number,
  limit = 3,
): FplFixture[] {
  return fixtures
    .filter((fixture) => !fixture.finished && (fixture.teamH === teamId || fixture.teamA === teamId))
    .sort((a, b) => (a.event ?? 99) - (b.event ?? 99) || a.kickoffTime.localeCompare(b.kickoffTime))
    .slice(0, limit)
}

export function formatKickoff(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
