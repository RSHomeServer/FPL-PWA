import type { FplFixture, FplPerformance, PlayerPosition } from '../data/types'
import type { LoadedSeason } from './loadSeason'
import { positionPool, type PositionPool } from './metrics'

export type FdrBucket = 1 | 2 | 3 | 4 | 5

export type FdrRateTable = Record<FdrBucket, { mean: number; n: number; factor: number }>

export const FDR_BUCKETS: FdrBucket[] = [1, 2, 3, 4, 5]

export type PlayerFixture = {
  fixtureId: number
  event: number
  fdr: FdrBucket | null
  home: boolean
  opponentTeamId: number
}

export function asFdrBucket(value: number | null | undefined): FdrBucket | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value
  return null
}

export function fixturesForTeamGw(
  fixtures: readonly FplFixture[],
  teamId: number,
  event: number,
): PlayerFixture[] {
  const rows: PlayerFixture[] = []
  for (const fixture of fixtures) {
    if (fixture.event !== event) continue
    if (fixture.teamH === teamId) {
      rows.push({
        fixtureId: fixture.id,
        event,
        fdr: asFdrBucket(fixture.teamHDifficulty),
        home: true,
        opponentTeamId: fixture.teamA,
      })
    } else if (fixture.teamA === teamId) {
      rows.push({
        fixtureId: fixture.id,
        event,
        fdr: asFdrBucket(fixture.teamADifficulty),
        home: false,
        opponentTeamId: fixture.teamH,
      })
    }
  }
  return rows
}

export function fitGoalsByFdr(seasons: readonly LoadedSeason[]): FdrRateTable {
  const sums = emptySums()
  for (const season of seasons) {
    for (const fixture of season.fixtures) {
      if (!fixture.finished) continue
      if (fixture.teamHScore == null || fixture.teamAScore == null) continue
      add(sums, asFdrBucket(fixture.teamHDifficulty), fixture.teamHScore)
      add(sums, asFdrBucket(fixture.teamADifficulty), fixture.teamAScore)
    }
  }
  return toTable(sums, 2)
}

export function fitCleanSheetsByFdr(seasons: readonly LoadedSeason[]): FdrRateTable {
  const sums = emptySums()
  for (const season of seasons) {
    for (const fixture of season.fixtures) {
      if (!fixture.finished) continue
      if (fixture.teamHScore == null || fixture.teamAScore == null) continue
      add(sums, asFdrBucket(fixture.teamHDifficulty), fixture.teamAScore === 0 ? 1 : 0)
      add(sums, asFdrBucket(fixture.teamADifficulty), fixture.teamHScore === 0 ? 1 : 0)
    }
  }
  return toTable(sums, 2)
}

export function invertAttackTable(attack: FdrRateTable): FdrRateTable {
  const out = emptyTable()
  for (const bucket of FDR_BUCKETS) {
    const factor = attack[bucket].factor
    out[bucket] = {
      mean: attack[bucket].mean,
      n: attack[bucket].n,
      factor: factor > 0 ? 1 / factor : 1,
    }
  }
  const ref = out[2].factor || 1
  for (const bucket of FDR_BUCKETS) {
    out[bucket] = { ...out[bucket], factor: ref === 0 ? 1 : out[bucket].factor / ref }
  }
  return out
}

export function isMonotoneDecreasing(table: FdrRateTable): boolean {
  for (let i = 1; i < FDR_BUCKETS.length; i += 1) {
    const prev = table[FDR_BUCKETS[i - 1]]
    const next = table[FDR_BUCKETS[i]]
    if (prev.n === 0 || next.n === 0) continue
    if (next.mean > prev.mean + 1e-9) return false
  }
  return true
}

export function isMonotoneIncreasing(table: FdrRateTable): boolean {
  for (let i = 1; i < FDR_BUCKETS.length; i += 1) {
    const prev = table[FDR_BUCKETS[i - 1]]
    const next = table[FDR_BUCKETS[i]]
    if (prev.n === 0 || next.n === 0) continue
    if (next.mean + 1e-9 < prev.mean) return false
  }
  return true
}

export function lookupFactor(table: FdrRateTable | null, fdr: FdrBucket | null): number {
  if (!table || fdr == null) return 1
  const row = table[fdr]
  return row.n > 0 && Number.isFinite(row.factor) ? row.factor : 1
}

export function homeAwayMultiplier(home: boolean, enabled: boolean): number {
  if (!enabled) return 1
  return home ? 1.05 : 0.95
}

export function gwPointsAndMinutes(
  performances: readonly FplPerformance[],
  playerId: number,
  fromGw: number,
  toGw: number,
): { points: number; minutes: number } {
  let points = 0
  let minutes = 0
  for (const row of performances) {
    if (row.playerId !== playerId) continue
    if (row.round < fromGw || row.round > toGw) continue
    points += row.totalPoints
    minutes += row.minutes
  }
  return { points, minutes }
}

export function gwXpPairs(
  performances: readonly FplPerformance[],
): Array<{ xp: number; points: number }> {
  const pairs: Array<{ xp: number; points: number }> = []
  for (const row of performances) {
    if (row.minutes <= 0) continue
    if (row.expectedPoints == null) continue
    pairs.push({ xp: row.expectedPoints, points: row.totalPoints })
  }
  return pairs
}

export type ClubStatus = 'same' | 'transferred' | 'unknown'

export function clubStatus(
  prior: { teamCode: number; teamName: string; teamShortName?: string },
  next: { teamCode: number; teamName: string; teamShortName?: string },
): ClubStatus {
  if (prior.teamCode > 0 && next.teamCode > 0) {
    return prior.teamCode === next.teamCode ? 'same' : 'transferred'
  }
  const priorKey = clubKey(prior)
  const nextKey = clubKey(next)
  if (!priorKey || !nextKey) return 'unknown'
  return priorKey === nextKey ? 'same' : 'transferred'
}

export function sameClub(
  prior: { teamCode: number; teamName: string; teamShortName?: string },
  next: { teamCode: number; teamName: string; teamShortName?: string },
): boolean {
  return clubStatus(prior, next) === 'same'
}

export function promotedTeamKeys(prior: LoadedSeason, next: LoadedSeason): Set<string> {
  const priorKeys = new Set(prior.teams.map(teamKey).filter((key) => key.length > 0))
  const promoted = new Set<string>()
  for (const team of next.teams) {
    const key = teamKey(team)
    if (key && !priorKeys.has(key)) promoted.add(key)
  }
  return promoted
}

export function teamGoalsPerGame(season: LoadedSeason): Map<string, number> {
  const scored = new Map<number, { goals: number; games: number }>()
  for (const fixture of season.fixtures) {
    if (!fixture.finished || fixture.teamHScore == null || fixture.teamAScore == null) continue
    addTeam(scored, fixture.teamH, fixture.teamHScore)
    addTeam(scored, fixture.teamA, fixture.teamAScore)
  }
  const byCode = new Map<string, number>()
  const teamById = new Map(season.teams.map((team) => [team.id, team]))
  for (const [teamId, row] of scored) {
    const team = teamById.get(teamId)
    const key = team ? teamKey(team) : ''
    if (key && row.games > 0) byCode.set(key, row.goals / row.games)
  }
  return byCode
}

export function startFlag(row: FplPerformance, inferFromMinutes: boolean): number {
  if (!inferFromMinutes) return row.starts > 0 ? 1 : 0
  return row.minutes >= 60 ? 1 : 0
}

export function poolKey(position: PlayerPosition): PositionPool {
  return positionPool(position)
}

type BucketSums = Record<FdrBucket, { sum: number; n: number }>

function emptySums(): BucketSums {
  return {
    1: { sum: 0, n: 0 },
    2: { sum: 0, n: 0 },
    3: { sum: 0, n: 0 },
    4: { sum: 0, n: 0 },
    5: { sum: 0, n: 0 },
  }
}

function emptyTable(): FdrRateTable {
  return {
    1: { mean: NaN, n: 0, factor: 1 },
    2: { mean: NaN, n: 0, factor: 1 },
    3: { mean: NaN, n: 0, factor: 1 },
    4: { mean: NaN, n: 0, factor: 1 },
    5: { mean: NaN, n: 0, factor: 1 },
  }
}

function add(sums: BucketSums, bucket: FdrBucket | null, value: number): void {
  if (bucket == null) return
  sums[bucket].sum += value
  sums[bucket].n += 1
}

function toTable(sums: BucketSums, reference: FdrBucket): FdrRateTable {
  const table = emptyTable()
  for (const bucket of FDR_BUCKETS) {
    const n = sums[bucket].n
    const mean = n > 0 ? sums[bucket].sum / n : NaN
    table[bucket] = { mean, n, factor: 1 }
  }
  const refMean = table[reference].n > 0 ? table[reference].mean : fallbackMean(table)
  for (const bucket of FDR_BUCKETS) {
    const mean = table[bucket].mean
    table[bucket] = {
      ...table[bucket],
      factor: table[bucket].n > 0 && refMean > 0 && Number.isFinite(mean) ? mean / refMean : 1,
    }
  }
  return table
}

function fallbackMean(table: FdrRateTable): number {
  let sum = 0
  let n = 0
  for (const bucket of FDR_BUCKETS) {
    if (table[bucket].n > 0 && Number.isFinite(table[bucket].mean)) {
      sum += table[bucket].mean * table[bucket].n
      n += table[bucket].n
    }
  }
  return n > 0 ? sum / n : 1
}

function clubKey(club: { teamName: string; teamShortName?: string }): string {
  const short = (club.teamShortName ?? '').trim().toLowerCase()
  if (short && !/^\d+$/.test(short)) return short
  return club.teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function teamKey(team: { code: number; name: string; shortName: string }): string {
  const short = team.shortName.trim().toLowerCase()
  if (short && !/^\d+$/.test(short)) return `short:${short}`
  if (team.code > 0) return `code:${team.code}`
  const name = team.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return name ? `name:${name}` : ''
}

function addTeam(map: Map<number, { goals: number; games: number }>, teamId: number, goals: number): void {
  const prev = map.get(teamId) ?? { goals: 0, games: 0 }
  map.set(teamId, { goals: prev.goals + goals, games: prev.games + 1 })
}
