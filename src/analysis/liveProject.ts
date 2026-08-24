/**
 * In-season projection engine (LT-4 / discovery §3 IS1–IS5).
 * Extends GW0 — keeps Price / Expected contribution / Value separate.
 */
import {
  fixturesForTeamGw,
  lookupFactor,
  startFlag,
  type PlayerFixture,
} from './fdr'
import {
  aggregatePriors,
  buildBaselines,
  type BaselineTables,
} from './backtest'
import type { LoadedSeason } from './loadSeason'
import {
  adjP90,
  adjP90Gw0,
  blendedFixtureFactor,
  eventEp90,
  eventRatesPer90,
  expectedMinutes,
  expectedPointsApproachA,
  expectedPointsApproachB,
  mixTowardBaseline,
  positionPool,
  rawP90,
  shrinkageC,
  shrunkStartsRate,
  startsRate,
  type EventRates,
} from './metrics'
import type {
  FplFixture,
  FplLivePlayer,
  FplPerformance,
  FplTeam,
  PlayerPosition,
  RoleEvidence,
} from '../data/types'
import {
  DEFAULT_GW0_OPTIONS,
  auditLine as gw0AuditLine,
  confidenceLabel,
  fitnessMultiplier,
  joinGw0Pool,
  resolveGw0Fitness,
  type ConfidenceLabel,
  type Gw0Confidence,
  type Gw0JoinedPlayer,
  type Gw0Options,
  type GwFixtureAudit,
  type GwPointsAudit,
} from './gw0Project'
import { enumSummary, mSemForPlayer } from './roleEvidence'

/** Default next-X horizon for retention (discovery §5). */
export const LIVE_DEFAULT_HORIZON = 5

/** Apply k_trans to the prior rate only while current-season minutes are below this. */
export const LIVE_K_TRANS_MINUTES = 450

export type LiveFitnessMode = 'before_deadline' | 'mid_gw'

export type LiveOptions = Gw0Options & {
  /** Number of GWs in the horizon aggregate (default 5). */
  horizon: number
  /** Prefer this-round chance mid-GW; next-round before deadline. */
  fitnessMode: LiveFitnessMode
}

export const DEFAULT_LIVE_OPTIONS: LiveOptions = {
  ...DEFAULT_GW0_OPTIONS,
  horizon: LIVE_DEFAULT_HORIZON,
  fitnessMode: 'before_deadline',
}

/** Current-season sample used for IS1–IS2 (rounds strictly before `asOfEvent`). */
export type CurrentSeasonSample = {
  minutes: number
  points: number
  startsRate: number
  rawP90: number | null
  eventRates: EventRates | null
  eventEp90: number | null
  appearanceGws: number
  starts: number
}

export type LiveJoinedPlayer = Gw0JoinedPlayer & {
  currentSample: CurrentSeasonSample
}

export type LiveGwPointsAudit = GwPointsAudit & {
  /** Current-season minutes feeding the live blend. */
  currentMinutes: number
  rawP90Cur: number | null
  /** Shrinkage weight on current-season raw p90. */
  wCur: number
  adjP90Gw0: number
  adjP90Live: number
  startsRateCur: number
  startsRatePrior: number
  startsLive: number
  ePtsB: number
}

export type LiveConfidence = Gw0Confidence & {
  currentMinutes: number
  priorMinutes: number
}

export type LiveProjection = LiveJoinedPlayer & {
  position: PlayerPosition
  nowCostTenths: number
  asOfEvent: number
  adjP90Gw0: number
  adjP90Live: number
  mSem: number
  roleEvidence: RoleEvidence | null
  mFitness: number
  expectedMinutesNext: number
  ePtsNext: number
  ePtsByGw: number[]
  /** Sum of next-X GW EP (IS4); omits GWs with no fixture rows. */
  ePtsHorizon: number
  horizonGws: number[]
  horizonEffective: number
  eppmNext: number
  epNext: number | null
  confidence: LiveConfidence
  auditByGw: LiveGwPointsAudit[]
  eventRates: EventRates | null
  ePtsBNext: number
}

/**
 * Aggregate vaastav (or API history) performances for rounds strictly before `asOfEvent`.
 * Join to live players via current-season player `code` → `id`.
 */
export function aggregateCurrentSeasonSample(
  currentSeason: LoadedSeason,
  code: number,
  asOfEvent: number,
): CurrentSeasonSample {
  const empty: CurrentSeasonSample = {
    minutes: 0,
    points: 0,
    startsRate: 0,
    rawP90: null,
    eventRates: null,
    eventEp90: null,
    appearanceGws: 0,
    starts: 0,
  }
  if (code <= 0 || asOfEvent <= 1) return empty

  const player = currentSeason.players.find((row) => row.code === code)
  if (!player) return empty

  const rows = currentSeason.performances.filter(
    (row) => row.playerId === player.id && row.round > 0 && row.round < asOfEvent,
  )
  if (rows.length === 0) return empty

  return summariseCurrentRows(rows, currentSeason.startsInferred, player.position)
}

export function joinLivePool(
  currentPlayers: readonly FplLivePlayer[],
  currentTeams: readonly FplTeam[],
  priorSeason: LoadedSeason,
  currentSeason: LoadedSeason | null,
  asOfEvent: number,
): LiveJoinedPlayer[] {
  const gw0 = joinGw0Pool(currentPlayers, currentTeams, priorSeason)
  return gw0.map((row) => ({
    ...row,
    currentSample: currentSeason
      ? aggregateCurrentSeasonSample(currentSeason, row.code, asOfEvent)
      : {
          minutes: 0,
          points: 0,
          startsRate: 0,
          rawP90: null,
          eventRates: null,
          eventEp90: null,
          appearanceGws: 0,
          starts: 0,
        },
  }))
}

/**
 * IS1 — blend current-season raw p90 with prior adj_p90_gw0.
 * `k_trans` hits the prior component only when `m_cur < 450`.
 */
export function adjP90Live(
  rawP90Cur: number | null,
  mCur: number,
  adjGw0WithKTrans: number,
  adjGw0WithoutKTrans: number,
  shrinkage: LiveOptions['shrinkage'],
): { adj: number; wCur: number; priorComponent: number } {
  const wCur = rawP90Cur == null ? 0 : shrinkageC(mCur, shrinkage)
  const priorComponent = mCur < LIVE_K_TRANS_MINUTES ? adjGw0WithKTrans : adjGw0WithoutKTrans
  if (rawP90Cur == null || wCur <= 0) {
    return { adj: priorComponent, wCur: 0, priorComponent }
  }
  return {
    adj: wCur * rawP90Cur + (1 - wCur) * priorComponent,
    wCur,
    priorComponent,
  }
}

/**
 * IS2 — blend current/prior starts via shrunkStartsRate, then ×90 × m_sem × m_fitness.
 * Fixture count applied by `expectedMinutes` (max 180).
 */
export function liveStartsRate(
  startsCur: number,
  mCur: number,
  priorStartsShrunk: number,
): number {
  return shrunkStartsRate(startsCur, priorStartsShrunk, mCur)
}

/** Mid-GW prefers this-round chance; before deadline prefers next-round. */
export function resolveLiveFitness(
  player: Pick<Gw0JoinedPlayer, 'current'>,
  evidence: RoleEvidence | null | undefined,
  mode: LiveFitnessMode,
): number {
  const status = player.current.status
  const thisRound = player.current.chanceOfPlayingThisRound
  const nextRound = player.current.chanceOfPlayingNextRound
  const preferred = mode === 'mid_gw' ? thisRound : nextRound
  const fallback = mode === 'mid_gw' ? nextRound : thisRound

  if (preferred != null || fallback != null) {
    return fitnessMultiplier(status, preferred, fallback)
  }
  return resolveGw0Fitness(player, evidence)
}

export function projectLivePool(
  joined: readonly LiveJoinedPlayer[],
  fixtures: readonly FplFixture[],
  baselines: BaselineTables,
  asOfEvent: number,
  options: LiveOptions = DEFAULT_LIVE_OPTIONS,
): LiveProjection[] {
  const event = Math.max(1, Math.floor(asOfEvent))
  return joined.map((player) => projectLiveOne(player, fixtures, baselines, event, options))
}

export function projectLiveFromSeasons(
  currentPlayers: readonly FplLivePlayer[],
  currentTeams: readonly FplTeam[],
  fixtures: readonly FplFixture[],
  priorSeason: LoadedSeason,
  currentSeason: LoadedSeason | null,
  asOfEvent: number,
  options: LiveOptions = DEFAULT_LIVE_OPTIONS,
): LiveProjection[] {
  const joined = joinLivePool(currentPlayers, currentTeams, priorSeason, currentSeason, asOfEvent)
  const baselines = buildBaselines(aggregatePriors(priorSeason))
  return projectLivePool(joined, fixtures, baselines, asOfEvent, options)
}

export function liveAuditLine(audit: LiveGwPointsAudit): string {
  const base = gw0AuditLine(audit)
  const rawCur = audit.rawP90Cur == null ? 'na' : audit.rawP90Cur.toFixed(2)
  return [
    `m_cur=${Math.round(audit.currentMinutes)}`,
    `raw_p90_cur=${rawCur}`,
    `w_cur=${audit.wCur.toFixed(2)}`,
    `adj_gw0=${audit.adjP90Gw0.toFixed(2)}`,
    `adj_live=${audit.adjP90Live.toFixed(2)}`,
    `starts_cur=${audit.startsRateCur.toFixed(2)}`,
    `starts_live=${audit.startsLive.toFixed(2)}`,
    base,
  ].join(' ')
}

function projectLiveOne(
  player: LiveJoinedPlayer,
  fixtures: readonly FplFixture[],
  baselines: BaselineTables,
  asOfEvent: number,
  options: LiveOptions,
): LiveProjection {
  const position =
    player.current.position === 'UNK' && player.prior ? player.prior.position : player.current.position
  const pool = positionPool(position)
  const priorMinutes = player.prior?.minutes ?? 0
  const rawPrior = player.newToPl ? null : (player.prior?.rawP90 ?? null)
  const cPrior = rawPrior == null ? 0 : shrinkageC(priorMinutes, options.shrinkage)
  const baselineP90 = baselines.p90[pool]
  const transferred = !player.newToPl && player.club === 'transferred'
  const adjWithoutK = adjP90(rawPrior, baselineP90, priorMinutes, options.shrinkage)
  const adjWithK = adjP90Gw0(adjWithoutK, transferred, options.kTrans)

  const sample = player.currentSample
  const mCur = sample.minutes
  const liveRate = adjP90Live(sample.rawP90, mCur, adjWithK, adjWithoutK, options.shrinkage)

  const priorStarts = player.prior?.startsRate ?? 0
  const priorStartsShrunk = shrunkStartsRate(priorStarts, baselines.starts[pool], priorMinutes)
  const startsLive = liveStartsRate(sample.startsRate, mCur, priorStartsShrunk)

  const evidence = options.roleEvidenceByCode?.get(player.code) ?? null
  const mSem = evidence ? mSemForPlayer(evidence) : options.mSem
  const mFitness = resolveLiveFitness(player, evidence, options.fitnessMode)
  const eventRate = mixLiveEventRate(player, baselines.eventEp90[pool], options)

  const horizon = Math.max(1, Math.floor(options.horizon))
  const horizonGws = Array.from({ length: horizon }, (_, i) => asOfEvent + i)
  const auditByGw: LiveGwPointsAudit[] = []
  for (const gw of horizonGws) {
    const audit = projectLiveGw(player, {
      gw,
      position,
      adjLive: liveRate.adj,
      adjGw0: liveRate.priorComponent,
      rawPrior,
      cPrior,
      baselineP90,
      transferred,
      kTrans: options.kTrans,
      priorMinutes,
      mCur,
      rawP90Cur: sample.rawP90,
      wCur: liveRate.wCur,
      priorStarts,
      startsCur: sample.startsRate,
      startsLive,
      mSem,
      mFitness,
      semSummary: enumSummary(evidence),
      eventRate,
      fixtures,
      options,
    })
    // §5.1: omit GWs with no published fixture rows (blank / not scheduled yet).
    if (audit.fixtures.length === 0 || audit.fixtures.every((row) => row.fixtureId === 0)) {
      continue
    }
    auditByGw.push(audit)
  }

  const next = auditByGw[0]
  const ePtsByGw = auditByGw.map((row) => row.ePts)
  const ePtsHorizon = ePtsByGw.reduce((sum, value) => sum + value, 0)
  const ePtsNext = next?.ePts ?? 0
  const price = player.current.nowCostTenths / 10
  const confidence = liveConfidence(player, mFitness, mCur, { ...options, mSem })

  return {
    ...player,
    position,
    nowCostTenths: player.current.nowCostTenths,
    asOfEvent,
    adjP90Gw0: liveRate.priorComponent,
    adjP90Live: liveRate.adj,
    mSem,
    roleEvidence: evidence,
    mFitness,
    expectedMinutesNext: next?.eMinutes ?? 0,
    ePtsNext,
    ePtsByGw,
    ePtsHorizon,
    horizonGws: auditByGw.map((row) => row.gw),
    horizonEffective: auditByGw.length,
    eppmNext: price > 0 ? ePtsNext / price : 0,
    epNext: player.current.epNext,
    confidence,
    auditByGw,
    eventRates: sample.eventRates ?? player.prior?.eventRates ?? null,
    ePtsBNext: next?.ePtsB ?? 0,
  }
}

function projectLiveGw(
  player: LiveJoinedPlayer,
  args: {
    gw: number
    position: PlayerPosition
    adjLive: number
    adjGw0: number
    rawPrior: number | null
    cPrior: number
    baselineP90: number
    transferred: boolean
    kTrans: number
    priorMinutes: number
    mCur: number
    rawP90Cur: number | null
    wCur: number
    priorStarts: number
    startsCur: number
    startsLive: number
    mSem: number
    mFitness: number
    semSummary: string
    eventRate: number
    fixtures: readonly FplFixture[]
    options: LiveOptions
  },
): LiveGwPointsAudit {
  const gwFixtures = fixturesForTeamGw(args.fixtures, player.current.teamId, args.gw)
  const n = Math.max(1, gwFixtures.length)
  const startsAfterFlags = args.startsLive * args.mSem * args.mFitness
  const eMinutes = args.mFitness <= 0 ? 0 : expectedMinutes(startsAfterFlags, gwFixtures.length)
  const perMatch = n > 0 ? eMinutes / n : 0
  const targets = gwFixtures.length > 0 ? gwFixtures : [null]
  const fixtureAudits: GwFixtureAudit[] = []
  let ratePart = 0
  let ePtsB = 0
  for (const fixture of targets) {
    const attack = fixtureFactor(fixture, args.options.attackTable)
    const cs = fixtureFactor(fixture, args.options.csTable)
    const blended = blendedFixtureFactor(
      args.position,
      attack,
      cs,
      args.options.defAttackWeight,
      args.options.gkAttackWeight,
    )
    fixtureAudits.push({
      fixtureId: fixture?.fixtureId ?? 0,
      fdr: fixture?.fdr ?? null,
      home: fixture?.home ?? true,
      opponentTeamId: fixture?.opponentTeamId ?? 0,
      attackFactor: attack,
      csFactor: cs,
      blendedFactor: blended,
    })
    ratePart += expectedPointsApproachA(args.adjLive, perMatch, blended)
    ePtsB += expectedPointsApproachB(args.eventRate, perMatch, blended)
  }
  const ePts = args.mFitness <= 0 || gwFixtures.length === 0 ? 0 : ratePart
  const ePtsBFinal = args.mFitness <= 0 || gwFixtures.length === 0 ? 0 : ePtsB
  const blendedFactor =
    fixtureAudits.length === 1
      ? fixtureAudits[0].blendedFactor
      : fixtureAudits.length === 0
        ? 1
        : eMinutes > 0 && args.adjLive > 0
          ? ePts / ((args.adjLive / 90) * eMinutes)
          : 1

  return {
    gw: args.gw,
    priorMinutes: args.priorMinutes,
    rawP90: args.rawPrior,
    c: args.cPrior,
    baselineP90: args.baselineP90,
    kTrans: args.kTrans,
    transferred: args.transferred && args.mCur < LIVE_K_TRANS_MINUTES,
    adjP90: args.adjLive,
    startsRate: args.priorStarts,
    shrunkStarts: args.startsLive,
    mSem: args.mSem,
    semSummary: args.semSummary,
    mFitness: args.mFitness,
    eMinutes: gwFixtures.length === 0 ? 0 : eMinutes,
    fixtures: fixtureAudits,
    fdrBuckets: fixtureAudits.map((row) => row.fdr),
    blendedFactor,
    appearancePart: 0,
    ratePart: ePts,
    ePts,
    currentMinutes: args.mCur,
    rawP90Cur: args.rawP90Cur,
    wCur: args.wCur,
    adjP90Gw0: args.adjGw0,
    adjP90Live: args.adjLive,
    startsRateCur: args.startsCur,
    startsRatePrior: args.priorStarts,
    startsLive: args.startsLive,
    ePtsB: ePtsBFinal,
  }
}

function fixtureFactor(
  fixture: PlayerFixture | null,
  table: LiveOptions['attackTable'],
): number {
  if (!fixture) return 1
  return lookupFactor(table, fixture.fdr)
}

function mixLiveEventRate(
  player: LiveJoinedPlayer,
  baseline: number,
  options: LiveOptions,
): number {
  const sample = player.currentSample
  const mCur = sample.minutes
  const priorRaw = player.newToPl ? null : (player.prior?.eventEp90 ?? null)
  const priorMinutes = player.prior?.minutes ?? 0
  const cPrior = priorRaw == null ? 0 : shrinkageC(priorMinutes, options.shrinkage)
  let priorShrunk = mixTowardBaseline(priorRaw, baseline, cPrior)
  const transferred = !player.newToPl && player.club === 'transferred'
  if (transferred && mCur < LIVE_K_TRANS_MINUTES) {
    priorShrunk *= options.kTrans
  }

  const rawCur = sample.eventEp90
  const wCur = rawCur == null ? 0 : shrinkageC(mCur, options.shrinkage)
  if (rawCur == null || wCur <= 0) return priorShrunk
  return wCur * rawCur + (1 - wCur) * priorShrunk
}

export function liveConfidence(
  player: Pick<LiveJoinedPlayer, 'newToPl' | 'club' | 'prior' | 'currentSample'>,
  mFitness: number,
  mCur: number,
  options: Pick<LiveOptions, 'shrinkage' | 'horizonFactor' | 'mSem'> = DEFAULT_LIVE_OPTIONS,
): LiveConfidence {
  const priorMinutes = player.prior?.minutes ?? 0
  const cMinutesPrior = player.newToPl ? 0 : shrinkageC(priorMinutes, options.shrinkage)
  const cMinutesCur = mCur <= 0 ? 0 : shrinkageC(mCur, options.shrinkage)
  const cMinutes = Math.max(cMinutesPrior, cMinutesCur)
  const fitnessDoubtful = mFitness < 1
  const cExternal = fitnessDoubtful ? 0.4 : 1
  const cTeamStability = player.newToPl && mCur < 450 ? 0.7 : 1
  const value = Math.min(cMinutes, cExternal, cTeamStability) * options.horizonFactor
  const drivers: string[] = []

  if (mCur >= 90) {
    const starts = player.currentSample.starts
    drivers.push(
      `Current season: ${Math.round(mCur)} min, ${starts} start${starts === 1 ? '' : 's'}`,
    )
  } else if (player.newToPl) {
    drivers.push('New to PL (no ≥90 prior minutes); prior-only / baseline')
  } else {
    drivers.push('Prior-only sample (no current-season minutes yet)')
  }

  if (!player.newToPl && priorMinutes < 450 && mCur < 450) {
    drivers.push(`${Math.round(priorMinutes)} prior minutes`)
  }
  if (player.club === 'transferred' && !player.newToPl && mCur < LIVE_K_TRANS_MINUTES) {
    drivers.push('Transferred club (k_trans on prior)')
  }
  if (player.club === 'unknown' && !player.newToPl) {
    drivers.push('Unknown club continuity (k_trans=1)')
  }
  if (mFitness === 0) drivers.push('Unavailable / injured (m_fitness=0)')
  else if (fitnessDoubtful) drivers.push(`Fitness doubtful (m_fitness=${mFitness.toFixed(2)})`)
  if (options.mSem < 0.8) drivers.push(`Semantic minutes flag m_sem=${options.mSem}`)

  const effectiveMinutes = Math.max(priorMinutes, mCur)
  const label: ConfidenceLabel = confidenceLabel({
    minutes: effectiveMinutes,
    newToPl: player.newToPl && mCur < 90,
    mSem: options.mSem,
    mFitness,
    club: player.club,
  })

  return {
    value,
    label,
    cMinutes,
    cExternal,
    cTeamStability,
    horizonFactor: options.horizonFactor,
    drivers,
    currentMinutes: mCur,
    priorMinutes,
  }
}

function summariseCurrentRows(
  rows: readonly FplPerformance[],
  inferStarts: boolean,
  position: PlayerPosition,
): CurrentSeasonSample {
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
  const events = eventRatesPer90(minutes, {
    goals,
    assists,
    cleanSheets,
    saves,
    goalsConceded,
    bonus,
  })
  return {
    minutes,
    points,
    startsRate: startsRate(starts, appearanceRounds.size),
    rawP90: rawP90(points, minutes),
    eventRates: events,
    eventEp90: events ? eventEp90(position, events) : null,
    appearanceGws: appearanceRounds.size,
    starts,
  }
}

/** Resolve next event id from live meta / events (fallback 1). */
export function resolveAsOfEvent(args: {
  nextEventId?: number | null
  currentEventId?: number | null
  events?: ReadonlyArray<{ id: number; isNext: boolean; isCurrent: boolean }>
}): number {
  if (args.nextEventId != null && args.nextEventId > 0) return args.nextEventId
  const next = args.events?.find((event) => event.isNext)
  if (next) return next.id
  if (args.currentEventId != null && args.currentEventId > 0) return args.currentEventId
  const current = args.events?.find((event) => event.isCurrent)
  if (current) return current.id
  return 1
}
