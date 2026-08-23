import {
  PHASE0_CS_FDR,
  PHASE0_GOALS_FDR,
  clubStatus,
  fixturesForTeamGw,
  isPromotedClub,
  lookupFactor,
  type ClubStatus,
  type FdrBucket,
  type FdrRateTable,
  type PlayerFixture,
} from './fdr'
import {
  aggregatePriors,
  buildBaselines,
  type BaselineTables,
  type PriorPlayer,
} from './backtest'
import type { LoadedSeason } from './loadSeason'
import {
  adjP90,
  adjP90Gw0,
  blendedFixtureFactor,
  DEFAULT_SHRINKAGE,
  expectedMinutes,
  expectedPointsApproachA,
  expectedPointsApproachB,
  mixTowardBaseline,
  positionPool,
  shrinkageC,
  shrunkStartsRate,
  type EventRates,
  type ShrinkageSpec,
} from './metrics'
import type { FplFixture, FplLivePlayer, FplTeam, PlayerPosition, RoleEvidence } from '../data/types'
import {
  enumSummary,
  fitnessFromConcern,
  mSemForPlayer,
} from './roleEvidence'

/** Calibrated Phase 0 defaults — do not re-litigate in Phase 1. */
export const GW0_K_TRANS = 0.75
export const GW0_M_SEM = 1
export const GW0_HORIZON_FACTOR = 1
export const GW0_DEF_ATTACK_WEIGHT = 0.5
export const GW0_GK_ATTACK_WEIGHT = 0.3
export const GW0_PROJECTION_GWS = [1, 2, 3, 4, 5, 6] as const

const CHANCE_FITNESS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [25, 0.3],
  [50, 0.6],
  [75, 0.85],
  [100, 1],
]

export type Gw0Options = {
  shrinkage: ShrinkageSpec
  kTrans: number
  /** Default m_sem for unreviewed players (Phase 1: 1). */
  mSem: number
  /** Per-player RoleEvidence; missing codes keep `mSem`. */
  roleEvidenceByCode?: ReadonlyMap<number, RoleEvidence>
  horizonFactor: number
  defAttackWeight: number
  gkAttackWeight: number
  attackTable: FdrRateTable
  csTable: FdrRateTable
}

export const DEFAULT_GW0_OPTIONS: Gw0Options = {
  shrinkage: DEFAULT_SHRINKAGE,
  kTrans: GW0_K_TRANS,
  mSem: GW0_M_SEM,
  horizonFactor: GW0_HORIZON_FACTOR,
  defAttackWeight: GW0_DEF_ATTACK_WEIGHT,
  gkAttackWeight: GW0_GK_ATTACK_WEIGHT,
  attackTable: PHASE0_GOALS_FDR,
  csTable: PHASE0_CS_FDR,
}

export type Gw0JoinedPlayer = {
  code: number
  current: FplLivePlayer
  teamName: string
  teamShortName: string
  prior: PriorPlayer | null
  /** No 2025/26 row with ≥90 minutes — positional baseline only. */
  newToPl: boolean
  club: ClubStatus
  promotedClub: boolean
}

export type ConfidenceLabel = 'HIGH' | 'MEDIUM' | 'LOW'

export type Gw0Confidence = {
  value: number
  label: ConfidenceLabel
  cMinutes: number
  cExternal: number
  cTeamStability: number
  horizonFactor: number
  drivers: string[]
}

export type GwFixtureAudit = {
  fixtureId: number
  fdr: FdrBucket | null
  home: boolean
  opponentTeamId: number
  attackFactor: number
  csFactor: number
  blendedFactor: number
}

export type GwPointsAudit = {
  gw: number
  priorMinutes: number
  rawP90: number | null
  c: number
  baselineP90: number
  kTrans: number
  transferred: boolean
  adjP90: number
  startsRate: number
  shrunkStarts: number
  mSem: number
  semSummary: string
  mFitness: number
  eMinutes: number
  fixtures: GwFixtureAudit[]
  fdrBuckets: Array<FdrBucket | null>
  blendedFactor: number
  appearancePart: number
  ratePart: number
  ePts: number
}

export type Gw0Projection = Gw0JoinedPlayer & {
  position: PlayerPosition
  nowCostTenths: number
  adjP90: number
  mSem: number
  roleEvidence: RoleEvidence | null
  mFitness: number
  expectedMinutesGw1: number
  ePtsByGw: number[]
  ePtsGw1: number
  ePtsGw16: number
  eppmGw1: number
  epNext: number | null
  confidence: Gw0Confidence
  auditByGw: GwPointsAudit[]
  eventRates: EventRates | null
  ePtsBGw1: number
}

/**
 * M8 fitness from official `status` / `chance_of_playing_*`.
 * `i` / `u` / `s` → 0 (exclude). Chance buckets from the modelling plan.
 * `d` with no chance published → 0.70.
 */
export function fitnessMultiplier(
  status: string,
  chanceNext: number | null,
  chanceThis: number | null = null,
): number {
  const code = status.trim().toLowerCase()
  if (code === 'i' || code === 'u' || code === 's' || code === 'n') return 0
  const chance = chanceNext ?? chanceThis
  if (chance != null) return fitnessFromChance(chance)
  if (code === 'd') return 0.7
  return 1
}

export function fitnessFromChance(chance: number): number {
  if (chance <= 0) return 0
  if (chance >= 100) return 1
  for (let i = 1; i < CHANCE_FITNESS.length; i += 1) {
    const [x1, y1] = CHANCE_FITNESS[i]
    const [x0, y0] = CHANCE_FITNESS[i - 1]
    if (chance <= x1) {
      const span = x1 - x0
      const t = span === 0 ? 1 : (chance - x0) / span
      return y0 + t * (y1 - y0)
    }
  }
  return 1
}

export function joinGw0Pool(
  currentPlayers: readonly FplLivePlayer[],
  currentTeams: readonly FplTeam[],
  priorSeason: LoadedSeason,
): Gw0JoinedPlayer[] {
  const priors = aggregatePriors(priorSeason)
  const priorByCode = new Map<number, PriorPlayer>()
  for (const prior of priors) {
    if (prior.code > 0) priorByCode.set(prior.code, prior)
  }
  const teamById = new Map(currentTeams.map((team) => [team.id, team]))
  const joined: Gw0JoinedPlayer[] = []
  for (const current of currentPlayers) {
    if (current.code <= 0) continue
    const team = teamById.get(current.teamId)
    const teamName = team?.name ?? ''
    const teamShortName = team?.shortName ?? ''
    const teamCode = current.teamCode || team?.code || 0
    const prior = priorByCode.get(current.code) ?? null
    const newToPl = prior == null || prior.minutes < 90
    const club: ClubStatus = prior
      ? clubStatus(prior, { teamCode, teamName, teamShortName })
      : 'unknown'
    const promotedClub = isPromotedClub(priorSeason.teams, {
      code: teamCode,
      name: teamName,
      shortName: teamShortName,
    })
    joined.push({
      code: current.code,
      current: { ...current, teamCode },
      teamName,
      teamShortName,
      prior,
      newToPl,
      club,
      promotedClub,
    })
  }
  return joined
}

export function projectGw0Pool(
  joined: readonly Gw0JoinedPlayer[],
  fixtures: readonly FplFixture[],
  baselines: BaselineTables,
  options: Gw0Options = DEFAULT_GW0_OPTIONS,
): Gw0Projection[] {
  return joined.map((player) => projectOne(player, fixtures, baselines, options))
}

export function projectGw0FromPrior(
  currentPlayers: readonly FplLivePlayer[],
  currentTeams: readonly FplTeam[],
  fixtures: readonly FplFixture[],
  priorSeason: LoadedSeason,
  options: Gw0Options = DEFAULT_GW0_OPTIONS,
): Gw0Projection[] {
  const joined = joinGw0Pool(currentPlayers, currentTeams, priorSeason)
  const baselines = buildBaselines(aggregatePriors(priorSeason))
  return projectGw0Pool(joined, fixtures, baselines, options)
}

export function auditLine(audit: GwPointsAudit): string {
  const fdr = audit.fdrBuckets.map((bucket) => (bucket == null ? '?' : String(bucket))).join('/') || '—'
  const raw = audit.rawP90 == null ? 'na' : audit.rawP90.toFixed(2)
  return [
    `prior ${Math.round(audit.priorMinutes)}m`,
    `raw_p90=${raw}`,
    `c=${audit.c.toFixed(2)}`,
    `baseline=${audit.baselineP90.toFixed(2)}`,
    `k_trans=${audit.transferred ? audit.kTrans.toFixed(2) : '1'}`,
    `E_min=${audit.eMinutes.toFixed(1)}`,
    `FDR=${fdr}`,
    `f=${audit.blendedFactor.toFixed(2)}`,
    `m_sem=${audit.mSem.toFixed(2)}`,
    audit.semSummary,
    `m_fit=${audit.mFitness.toFixed(2)}`,
    `rate=${audit.ratePart.toFixed(2)}`,
    `E_pts=${audit.ePts.toFixed(2)}`,
  ].join(' ')
}

function projectOne(
  player: Gw0JoinedPlayer,
  fixtures: readonly FplFixture[],
  baselines: BaselineTables,
  options: Gw0Options,
): Gw0Projection {
  const position = player.current.position === 'UNK' && player.prior ? player.prior.position : player.current.position
  const pool = positionPool(position)
  const priorMinutes = player.prior?.minutes ?? 0
  const raw = player.newToPl ? null : (player.prior?.rawP90 ?? null)
  const c = raw == null ? 0 : shrinkageC(priorMinutes, options.shrinkage)
  const baselineP90 = baselines.p90[pool]
  const transferred = !player.newToPl && player.club === 'transferred'
  const adj = adjP90Gw0(adjP90(raw, baselineP90, priorMinutes, options.shrinkage), transferred, options.kTrans)
  const priorStarts = player.prior?.startsRate ?? 0
  const shrunkStarts = shrunkStartsRate(priorStarts, baselines.starts[pool], priorMinutes)
  const evidence = options.roleEvidenceByCode?.get(player.code) ?? null
  const mSem = evidence ? mSemForPlayer(evidence) : options.mSem
  const mFitness = resolveGw0Fitness(player, evidence)
  const eventRate = mixEventRate(player, baselines.eventEp90[pool], options)

  const auditByGw = GW0_PROJECTION_GWS.map((gw) =>
    projectGw(player, {
      gw,
      position,
      adj,
      raw,
      c,
      baselineP90,
      transferred,
      kTrans: options.kTrans,
      priorMinutes,
      priorStarts,
      shrunkStarts,
      mSem,
      mFitness,
      semSummary: enumSummary(evidence),
      fixtures,
      options,
    }),
  )
  const gw1 = auditByGw[0]
  const ePtsByGw = auditByGw.map((row) => row.ePts)
  const ePtsGw1 = gw1?.ePts ?? 0
  const ePtsGw16 = ePtsByGw.reduce((sum, value) => sum + value, 0)
  const price = player.current.nowCostTenths / 10
  const confidence = gw0Confidence(player, mFitness, { ...options, mSem })

  return {
    ...player,
    position,
    nowCostTenths: player.current.nowCostTenths,
    adjP90: adj,
    mSem,
    roleEvidence: evidence,
    mFitness,
    expectedMinutesGw1: gw1?.eMinutes ?? 0,
    ePtsByGw,
    ePtsGw1,
    ePtsGw16,
    eppmGw1: price > 0 ? ePtsGw1 / price : 0,
    epNext: player.current.epNext,
    confidence,
    auditByGw,
    eventRates: player.prior?.eventRates ?? null,
    ePtsBGw1: gw1 ? expectedPointsApproachB(eventRate, gw1.eMinutes, gw1.blendedFactor) : 0,
  }
}

function projectGw(
  player: Gw0JoinedPlayer,
  args: {
    gw: number
    position: PlayerPosition
    adj: number
    raw: number | null
    c: number
    baselineP90: number
    transferred: boolean
    kTrans: number
    priorMinutes: number
    priorStarts: number
    shrunkStarts: number
    mSem: number
    mFitness: number
    semSummary: string
    fixtures: readonly FplFixture[]
    options: Gw0Options
  },
): GwPointsAudit {
  const gwFixtures = fixturesForTeamGw(args.fixtures, player.current.teamId, args.gw)
  const n = Math.max(1, gwFixtures.length)
  const startsAfterFlags = args.shrunkStarts * args.mSem * args.mFitness
  const eMinutes = args.mFitness <= 0 ? 0 : expectedMinutes(startsAfterFlags, gwFixtures.length)
  const perMatch = n > 0 ? eMinutes / n : 0
  const targets = gwFixtures.length > 0 ? gwFixtures : [null]
  const fixtureAudits: GwFixtureAudit[] = []
  let ratePart = 0
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
    ratePart += expectedPointsApproachA(args.adj, perMatch, blended)
  }
  const ePts = args.mFitness <= 0 ? 0 : ratePart
  const blendedFactor =
    fixtureAudits.length === 1
      ? fixtureAudits[0].blendedFactor
      : fixtureAudits.length === 0
        ? 1
        : eMinutes > 0 && args.adj > 0
          ? ePts / ((args.adj / 90) * eMinutes)
          : 1

  return {
    gw: args.gw,
    priorMinutes: args.priorMinutes,
    rawP90: args.raw,
    c: args.c,
    baselineP90: args.baselineP90,
    kTrans: args.kTrans,
    transferred: args.transferred,
    adjP90: args.adj,
    startsRate: args.priorStarts,
    shrunkStarts: args.shrunkStarts,
    mSem: args.mSem,
    semSummary: args.semSummary,
    mFitness: args.mFitness,
    eMinutes,
    fixtures: fixtureAudits,
    fdrBuckets: fixtureAudits.map((row) => row.fdr),
    blendedFactor,
    appearancePart: 0,
    ratePart: ePts,
    ePts,
  }
}

function fixtureFactor(fixture: PlayerFixture | null, table: FdrRateTable): number {
  if (!fixture) return 1
  return lookupFactor(table, fixture.fdr)
}

/**
 * Phase 1 API `status` / chance first. `fitnessConcern` only applies when both
 * chance fields are empty and status is not already a hard exclude (i/u/s/n).
 */
export function resolveGw0Fitness(
  player: Pick<Gw0JoinedPlayer, 'current'>,
  evidence: RoleEvidence | null | undefined,
): number {
  const fromApi = fitnessMultiplier(
    player.current.status,
    player.current.chanceOfPlayingNextRound,
    player.current.chanceOfPlayingThisRound,
  )
  if (player.current.chanceOfPlayingNextRound != null || player.current.chanceOfPlayingThisRound != null) {
    return fromApi
  }
  if (!evidence) return fromApi
  const code = player.current.status.trim().toLowerCase()
  if (code === 'i' || code === 'u' || code === 's' || code === 'n') return fromApi
  return fitnessFromConcern(evidence.fitnessConcern)
}

function mixEventRate(player: Gw0JoinedPlayer, baseline: number, options: Gw0Options): number {
  const raw = player.newToPl ? null : (player.prior?.eventEp90 ?? null)
  const minutes = player.prior?.minutes ?? 0
  const c = raw == null ? 0 : shrinkageC(minutes, options.shrinkage)
  const shrunk = mixTowardBaseline(raw, baseline, c)
  return player.club === 'transferred' && !player.newToPl ? shrunk * options.kTrans : shrunk
}

export function gw0Confidence(
  player: Pick<Gw0JoinedPlayer, 'newToPl' | 'club' | 'prior'>,
  mFitness: number,
  options: Pick<Gw0Options, 'shrinkage' | 'horizonFactor' | 'mSem'> = DEFAULT_GW0_OPTIONS,
): Gw0Confidence {
  const minutes = player.prior?.minutes ?? 0
  const cMinutes = player.newToPl ? 0 : shrinkageC(minutes, options.shrinkage)
  const fitnessDoubtful = mFitness < 1
  const cExternal = fitnessDoubtful ? 0.4 : 1
  const cTeamStability = player.newToPl ? 0.7 : 1
  const value = Math.min(cMinutes, cExternal, cTeamStability) * options.horizonFactor
  const drivers: string[] = []
  if (player.newToPl) drivers.push('New to PL (no ≥90 prior minutes)')
  else if (minutes < 450) drivers.push(`${Math.round(minutes)} prior minutes`)
  if (player.club === 'transferred' && !player.newToPl) drivers.push('Transferred club')
  if (player.club === 'unknown' && !player.newToPl) drivers.push('Unknown club continuity (k_trans=1)')
  if (mFitness === 0) drivers.push('Unavailable / injured (m_fitness=0)')
  else if (fitnessDoubtful) drivers.push(`Fitness doubtful (m_fitness=${mFitness.toFixed(2)})`)
  if (options.mSem < 0.8) drivers.push(`Semantic minutes flag m_sem=${options.mSem}`)

  const label = confidenceLabel({
    minutes,
    newToPl: player.newToPl,
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
  }
}

export function confidenceLabel(args: {
  minutes: number
  newToPl: boolean
  mSem: number
  mFitness: number
  club: ClubStatus
}): ConfidenceLabel {
  if (args.minutes < 450 || args.newToPl || args.mSem < 0.8 || args.mFitness < 1) return 'LOW'
  if (args.minutes >= 900 && args.club === 'same' && args.mFitness === 1) return 'HIGH'
  return 'MEDIUM'
}
