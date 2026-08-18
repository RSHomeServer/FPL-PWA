import type { FplPerformance, PlayerPosition } from '../data/types'
import {
  clubStatus,
  fixturesForTeamGw,
  gwPointsAndMinutes,
  homeAwayMultiplier,
  lookupFactor,
  poolKey,
  startFlag,
  type FdrRateTable,
  type PlayerFixture,
} from './fdr'
import type { AnalysisPlayer, LoadedSeason } from './loadSeason'
import { playerByCode } from './loadSeason'
import {
  adjP90,
  adjP90Gw0,
  blendedFixtureFactor,
  DEFAULT_SHRINKAGE,
  eventEp90,
  eventRatesPer90,
  expectedMinutes,
  expectedPointsApproachA,
  expectedPointsApproachB,
  expectedPointsApproachBSplit,
  positionalBaseline,
  rawP90,
  shrinkageC,
  shrunkStartsRate,
  startsRate,
  type EventRates,
  type PositionPool,
  type ShrinkageSpec,
} from './metrics'
import { mae, pearson, rmse, spearman, topKOverlap } from './stats'

export const TARGET_SEASONS = [
  '2018-19',
  '2019-20',
  '2020-21',
  '2021-22',
  '2022-23',
  '2023-24',
  '2024-25',
  '2025-26',
] as const

export const K_TRANS_GRID = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1] as const
export const ALPHA_GRID = [0, 0.2, 0.4, 0.6, 0.8, 1] as const

export type PriorPlayer = {
  code: number
  playerId: number
  position: PlayerPosition
  teamCode: number
  teamName: string
  teamShortName: string
  minutes: number
  points: number
  startsRate: number
  rawP90: number | null
  eventRates: EventRates | null
  eventEp90: number | null
}

export type JoinedPlayer = {
  code: number
  name: string
  position: PlayerPosition
  club: 'same' | 'transferred' | 'unknown'
  prior: PriorPlayer
  next: AnalysisPlayer
  actualGw1Points: number
  actualGw1Minutes: number
  actualGw16Points: number
}

export type ProjectionOptions = {
  shrinkage: ShrinkageSpec
  kTrans: number
  alpha: number
  useFdr: boolean
  homeAway: boolean
  defAttackWeight: number
  gkAttackWeight: number
  attackTable: FdrRateTable | null
  csTable: FdrRateTable | null
  splitEvents: boolean
}

export type Scorecard = {
  n: number
  rmse: number
  mae: number
  spearman: number
  minutesRmse: number
  top50Gw1: number
  top50Gw16: number
}

export type TransitionScore = Scorecard & {
  targetSeason: string
  priorSeason: string
}

export type BaselineTables = {
  p90: Record<PositionPool, number>
  eventEp90: Record<PositionPool, number>
  starts: Record<PositionPool, number>
}

export const DEFAULT_PROJECTION: ProjectionOptions = {
  shrinkage: DEFAULT_SHRINKAGE,
  kTrans: 1,
  alpha: 1,
  useFdr: false,
  homeAway: false,
  defAttackWeight: 0.5,
  gkAttackWeight: 0.3,
  attackTable: null,
  csTable: null,
  splitEvents: false,
}

export type ProjectedPlayer = JoinedPlayer & {
  expectedMinutesGw1: number
  predictedGw1: number
  predictedA: number
  predictedB: number
  predictedGw16: number
  predictedByGw: number[]
}

export function aggregatePriors(season: LoadedSeason): PriorPlayer[] {
  const grouped = new Map<number, FplPerformance[]>()
  for (const row of season.performances) {
    const list = grouped.get(row.playerId) ?? []
    list.push(row)
    grouped.set(row.playerId, list)
  }

  const priors: PriorPlayer[] = []
  for (const player of season.players) {
    if (player.code <= 0) continue
    const rows = grouped.get(player.id) ?? []
    const stats = summariseRows(rows, season.startsInferred, player)
    priors.push({
      code: player.code,
      playerId: player.id,
      position: player.position,
      teamCode: player.teamCode,
      teamName: player.teamName,
      teamShortName: player.teamShortName,
      minutes: stats.minutes,
      points: stats.points,
      startsRate: stats.startsRate,
      rawP90: rawP90(stats.points, stats.minutes),
      eventRates: stats.eventRates,
      eventEp90: stats.eventRates ? eventEp90(player.position, stats.eventRates) : null,
    })
  }
  return priors
}

export function buildBaselines(priors: readonly PriorPlayer[]): BaselineTables {
  const p90: Record<PositionPool, number[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  const event: Record<PositionPool, number[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  const starts: Record<PositionPool, number[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const prior of priors) {
    const pool = poolKey(prior.position)
    if (prior.minutes >= 900 && prior.rawP90 != null) p90[pool].push(prior.rawP90)
    if (prior.minutes >= 900 && prior.eventEp90 != null) event[pool].push(prior.eventEp90)
    if (prior.minutes >= 900) starts[pool].push(prior.startsRate)
  }
  return {
    p90: {
      GK: positionalBaseline(p90.GK),
      DEF: positionalBaseline(p90.DEF),
      MID: positionalBaseline(p90.MID),
      FWD: positionalBaseline(p90.FWD),
    },
    eventEp90: {
      GK: positionalBaseline(event.GK),
      DEF: positionalBaseline(event.DEF),
      MID: positionalBaseline(event.MID),
      FWD: positionalBaseline(event.FWD),
    },
    starts: {
      GK: positionalBaseline(starts.GK),
      DEF: positionalBaseline(starts.DEF),
      MID: positionalBaseline(starts.MID),
      FWD: positionalBaseline(starts.FWD),
    },
  }
}

export function joinTransition(prior: LoadedSeason, next: LoadedSeason): JoinedPlayer[] {
  const priors = aggregatePriors(prior)
  const nextByCode = playerByCode(next)
  const joined: JoinedPlayer[] = []
  for (const row of priors) {
    const nextPlayer = nextByCode.get(row.code)
    if (!nextPlayer) continue
    const gw1 = gwPointsAndMinutes(next.performances, nextPlayer.id, 1, 1)
    const gw16 = gwPointsAndMinutes(next.performances, nextPlayer.id, 1, 6)
    joined.push({
      code: row.code,
      name: nextPlayer.webName,
      position: nextPlayer.position === 'UNK' ? row.position : nextPlayer.position,
      club: clubStatus(row, nextPlayer),
      prior: row,
      next: nextPlayer,
      actualGw1Points: gw1.points,
      actualGw1Minutes: gw1.minutes,
      actualGw16Points: gw16.points,
    })
  }
  return joined
}

export function projectJoined(
  joined: readonly JoinedPlayer[],
  next: LoadedSeason,
  baselines: BaselineTables,
  options: ProjectionOptions,
): ProjectedPlayer[] {
  return joined.map((player) => {
    const pool = poolKey(player.position)
    const adj = adjP90Gw0(
      adjP90(player.prior.rawP90, baselines.p90[pool], player.prior.minutes, options.shrinkage),
      player.club === 'transferred',
      options.kTrans,
    )
    const eventRate = mixEvent(player, baselines.eventEp90[pool], options)
    const starts = shrunkStartsRate(
      player.prior.startsRate,
      baselines.starts[pool],
      player.prior.minutes,
    )
    const gw1 = projectGws(player, adj, eventRate, starts, next, options, 1, 1)
    const gw16 = projectGws(player, adj, eventRate, starts, next, options, 1, 6)
    const predictedByGw = [1, 2, 3, 4, 5, 6].map(
      (gw) => projectGws(player, adj, eventRate, starts, next, options, gw, gw).points,
    )
    return {
      ...player,
      expectedMinutesGw1: gw1.minutes,
      predictedGw1: gw1.points,
      predictedA: gw1.pointsA,
      predictedB: gw1.pointsB,
      predictedGw16: gw16.points,
      predictedByGw,
    }
  })
}

export function scorePredictions(rows: readonly ProjectedPlayer[]): Scorecard {
  const predicted = rows.map((row) => row.predictedGw1)
  const actual = rows.map((row) => row.actualGw1Points)
  return {
    n: rows.length,
    rmse: rmse(predicted, actual),
    mae: mae(predicted, actual),
    spearman: spearman(predicted, actual),
    minutesRmse: rmse(
      rows.map((row) => row.expectedMinutesGw1),
      rows.map((row) => row.actualGw1Minutes),
    ),
    top50Gw1: topKOverlap(
      rows.map((row) => ({ id: String(row.code), score: row.predictedGw1 })),
      rows.map((row) => ({ id: String(row.code), score: row.actualGw1Points })),
      50,
    ),
    top50Gw16: topKOverlap(
      rows.map((row) => ({ id: String(row.code), score: row.predictedGw16 })),
      rows.map((row) => ({ id: String(row.code), score: row.actualGw16Points })),
      50,
    ),
  }
}

export function coreSet(rows: readonly JoinedPlayer[]): JoinedPlayer[] {
  return rows.filter((row) => row.prior.minutes >= 90)
}

export function scoreTransition(
  prior: LoadedSeason,
  next: LoadedSeason,
  options: ProjectionOptions = DEFAULT_PROJECTION,
  filter: (rows: readonly JoinedPlayer[]) => JoinedPlayer[] = coreSet,
): TransitionScore {
  const joined = filter(joinTransition(prior, next))
  const baselines = buildBaselines(aggregatePriors(prior))
  const projected = projectJoined(joined, next, baselines, options)
  return {
    targetSeason: next.seasonId,
    priorSeason: prior.seasonId,
    ...scorePredictions(projected),
  }
}

export function pooledScore(scores: readonly Scorecard[]): Scorecard {
  const n = scores.reduce((sum, row) => sum + row.n, 0)
  if (n === 0) {
    return { n: 0, rmse: NaN, mae: NaN, spearman: NaN, minutesRmse: NaN, top50Gw1: NaN, top50Gw16: NaN }
  }
  const wavg = (key: keyof Scorecard) =>
    scores.reduce((sum, row) => sum + (row.n / n) * (row[key] as number), 0)
  return {
    n,
    rmse: wavg('rmse'),
    mae: wavg('mae'),
    spearman: wavg('spearman'),
    minutesRmse: wavg('minutesRmse'),
    top50Gw1: wavg('top50Gw1'),
    top50Gw16: wavg('top50Gw16'),
  }
}

export function persistenceP90(joined: readonly JoinedPlayer[]): {
  all: number
  sameClub: number
  transferred: number
  nAll: number
  nSame: number
  nTrans: number
  nUnknown: number
} {
  const qualified = joined.filter((row) => row.prior.minutes >= 450 && row.prior.rawP90 != null)
  const pairs = qualified
    .map((row) => ({ row, next: rawP90(row.next.totalPoints, row.next.minutes) }))
    .filter((item): item is { row: JoinedPlayer; next: number } => item.next != null)
  const same = pairs.filter((item) => item.row.club === 'same')
  const moved = pairs.filter((item) => item.row.club === 'transferred')
  return {
    all: pearson(
      pairs.map((item) => item.row.prior.rawP90 as number),
      pairs.map((item) => item.next),
    ),
    sameClub: pearson(
      same.map((item) => item.row.prior.rawP90 as number),
      same.map((item) => item.next),
    ),
    transferred: pearson(
      moved.map((item) => item.row.prior.rawP90 as number),
      moved.map((item) => item.next),
    ),
    nAll: pairs.length,
    nSame: same.length,
    nTrans: moved.length,
    nUnknown: pairs.length - same.length - moved.length,
  }
}

export function unconstrainedTop15Mean(rows: readonly ProjectedPlayer[]): {
  projectedTop15Actual: number
  priorPointsTop15Actual: number
} {
  const byPred = [...rows].sort((a, b) => b.predictedGw1 - a.predictedGw1).slice(0, 15)
  const byPrior = [...rows].sort((a, b) => b.prior.points - a.prior.points).slice(0, 15)
  const meanActual = (list: readonly ProjectedPlayer[]) =>
    list.length === 0 ? NaN : list.reduce((sum, row) => sum + row.actualGw1Points, 0) / list.length
  return {
    projectedTop15Actual: meanActual(byPred),
    priorPointsTop15Actual: meanActual(byPrior),
  }
}

function summariseRows(
  rows: readonly FplPerformance[],
  inferStarts: boolean,
  player: AnalysisPlayer,
): {
  minutes: number
  points: number
  startsRate: number
  eventRates: EventRates | null
} {
  if (rows.length === 0) {
    return {
      minutes: player.minutes,
      points: player.totalPoints,
      startsRate: player.minutes >= 900 ? 1 : startsRate(Math.round(player.minutes / 90), 38),
      eventRates: null,
    }
  }
  const appearanceRounds = new Set<number>()
  let minutes = 0
  let points = 0
  let starts = 0
  let goals = 0
  let assists = 0
  let cleanSheets = 0
  let saves = 0
  let goalsConceded = 0
  let bonus = 0
  for (const row of rows) {
    minutes += row.minutes
    points += row.totalPoints
    if (row.minutes > 0) appearanceRounds.add(row.round)
    starts += startFlag(row, inferStarts)
    goals += row.goalsScored
    assists += row.assists
    cleanSheets += row.cleanSheets
    saves += row.saves
    goalsConceded += row.goalsConceded
    bonus += row.bonus
  }
  return {
    minutes,
    points,
    startsRate: startsRate(starts, appearanceRounds.size),
    eventRates: eventRatesPer90(minutes, {
      goals,
      assists,
      cleanSheets,
      saves,
      goalsConceded,
      bonus,
    }),
  }
}

function mixEvent(player: JoinedPlayer, baseline: number, options: ProjectionOptions): number {
  const raw = player.prior.eventEp90
  const c = raw == null ? 0 : shrinkageC(player.prior.minutes, options.shrinkage)
  const shrunk = raw == null ? baseline : c * raw + (1 - c) * baseline
  return player.club === 'transferred' ? shrunk * options.kTrans : shrunk
}

function projectGws(
  player: JoinedPlayer,
  adj: number,
  eventRate: number,
  starts: number,
  next: LoadedSeason,
  options: ProjectionOptions,
  fromGw: number,
  toGw: number,
): { points: number; minutes: number; pointsA: number; pointsB: number } {
  let pointsA = 0
  let pointsB = 0
  let minutesGw1 = 0
  const scheduleMissing = next.fixtures.length === 0
  for (let gw = fromGw; gw <= toGw; gw += 1) {
    const gwFixtures = fixturesForTeamGw(next.fixtures, player.next.teamId, gw)
    const fallback = scheduleMissing && gw === 1
    if (gwFixtures.length === 0 && !fallback) continue
    const n = Math.max(1, gwFixtures.length)
    const mins = expectedMinutes(starts, n)
    if (gw === 1) minutesGw1 += mins
    const perMatch = mins / n
    const targets = gwFixtures.length > 0 ? gwFixtures : [null]
    for (const fixture of targets) {
      const attack = factorFor(player.position, fixture, options, 'attack')
      const cs = factorFor(player.position, fixture, options, 'cs')
      const blended = options.useFdr
        ? blendedFixtureFactor(
            player.position,
            attack,
            cs,
            options.defAttackWeight,
            options.gkAttackWeight,
          )
        : 1
      pointsA += expectedPointsApproachA(adj, perMatch, blended)
      if (options.splitEvents && options.useFdr && player.prior.eventRates) {
        pointsB += expectedPointsApproachBSplit(
          player.position,
          player.prior.eventRates,
          perMatch,
          attack,
          cs,
        )
      } else {
        pointsB += expectedPointsApproachB(eventRate, perMatch, blended)
      }
    }
  }
  const points = options.alpha * pointsA + (1 - options.alpha) * pointsB
  return { points, minutes: minutesGw1, pointsA, pointsB }
}

function factorFor(
  position: PlayerPosition,
  fixture: PlayerFixture | null,
  options: ProjectionOptions,
  kind: 'attack' | 'cs',
): number {
  void position
  if (!options.useFdr || !fixture) return 1
  const table = kind === 'attack' ? options.attackTable : options.csTable
  return lookupFactor(table, fixture.fdr) * homeAwayMultiplier(fixture.home, options.homeAway)
}
