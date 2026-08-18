import { appearancePoints, pointsPerGoal } from '../data/scoring'
import type { PlayerPosition } from '../data/types'
import { trimmedMean } from './stats'

export type PositionPool = 'GK' | 'DEF' | 'MID' | 'FWD'

export type ShrinkageSpec =
  | { kind: 'linear'; minutesRef: number }
  | { kind: 'exponential'; tau: number }

export const DEFAULT_SHRINKAGE: ShrinkageSpec = { kind: 'linear', minutesRef: 900 }

export const SHRINKAGE_CANDIDATES: ShrinkageSpec[] = [
  { kind: 'linear', minutesRef: 450 },
  { kind: 'linear', minutesRef: 900 },
  { kind: 'linear', minutesRef: 1800 },
  { kind: 'exponential', tau: 600 },
]

export type EventRates = {
  g90: number
  a90: number
  cs90: number
  sv90: number
  gc90: number
  bonus90: number
}

export type PlayerSeasonRates = {
  minutes: number
  points: number
  startsRate: number
  rawP90: number | null
  events: EventRates | null
}

/** Map AM into MID; unknown positions use the MID pool. */
export function positionPool(position: PlayerPosition): PositionPool {
  if (position === 'GK' || position === 'DEF' || position === 'FWD') return position
  return 'MID'
}

export function cleanSheetPts(position: PlayerPosition): number {
  const pool = positionPool(position)
  if (pool === 'GK' || pool === 'DEF') return 4
  if (pool === 'MID') return 1
  return 0
}

export function rawP90(points: number, minutes: number): number | null {
  if (minutes < 90) return null
  return (points / minutes) * 90
}

export function startsRate(starts: number, appearanceGws: number): number {
  if (appearanceGws <= 0) return 0
  return Math.min(1, Math.max(0, starts / appearanceGws))
}

export function eventRatesPer90(
  minutes: number,
  events: {
    goals: number
    assists: number
    cleanSheets: number
    saves: number
    goalsConceded: number
    bonus: number
  },
): EventRates | null {
  if (minutes < 90) return null
  const scale = 90 / minutes
  return {
    g90: events.goals * scale,
    a90: events.assists * scale,
    cs90: events.cleanSheets * scale,
    sv90: events.saves * scale,
    gc90: events.goalsConceded * scale,
    bonus90: events.bonus * scale,
  }
}

export function eventEp90(position: PlayerPosition, rates: EventRates): number {
  const pool = positionPool(position)
  const attack = rates.g90 * pointsPerGoal(position) + rates.a90 * 3
  const cs = rates.cs90 * cleanSheetPts(position)
  const saves = pool === 'GK' ? rates.sv90 / 3 : 0
  const conceded = pool === 'GK' || pool === 'DEF' ? rates.gc90 * -0.5 : 0
  return attack + cs + saves + conceded + rates.bonus90
}

export function eventAttackEp90(position: PlayerPosition, rates: EventRates): number {
  return rates.g90 * pointsPerGoal(position) + rates.a90 * 3
}

export function eventDefenceEp90(position: PlayerPosition, rates: EventRates): number {
  const pool = positionPool(position)
  const cs = rates.cs90 * cleanSheetPts(position)
  const saves = pool === 'GK' ? rates.sv90 / 3 : 0
  const conceded = pool === 'GK' || pool === 'DEF' ? rates.gc90 * -0.5 : 0
  return cs + saves + conceded
}

export function shrinkageC(minutes: number, spec: ShrinkageSpec): number {
  if (minutes <= 0) return 0
  if (spec.kind === 'exponential') return 1 - Math.exp(-minutes / spec.tau)
  if (spec.minutesRef <= 0) return 1
  return Math.min(1, minutes / spec.minutesRef)
}

export function mixTowardBaseline(value: number | null, baseline: number, c: number): number {
  if (value == null) return baseline
  const w = Math.min(1, Math.max(0, c))
  return w * value + (1 - w) * baseline
}

export function adjP90(raw: number | null, baseline: number, minutes: number, spec: ShrinkageSpec): number {
  const c = raw == null ? 0 : shrinkageC(minutes, spec)
  return mixTowardBaseline(raw, baseline, c)
}

export function adjP90Gw0(adj: number, transferred: boolean, kTrans: number): number {
  return transferred ? adj * kTrans : adj
}

/** Shrink start rate toward the positional baseline when the sample is under 450 minutes. */
export function shrunkStartsRate(
  rate: number,
  baseline: number,
  minutes: number,
  smallSampleMinutes = 450,
): number {
  if (minutes >= smallSampleMinutes) return rate
  const c = smallSampleMinutes <= 0 ? 1 : Math.min(1, Math.max(0, minutes / smallSampleMinutes))
  return mixTowardBaseline(rate, baseline, c)
}

export function expectedMinutes(starts: number, fixtureCount = 1): number {
  const perMatch = Math.min(90, Math.max(0, starts * 90))
  const n = Math.max(0, fixtureCount)
  return Math.min(180, perMatch * n)
}

export function expectedPointsApproachA(
  adjP90Value: number,
  minutes: number,
  fixtureFactor = 1,
): number {
  if (minutes <= 0) return 0
  return (adjP90Value / 90) * minutes * fixtureFactor
}

export function expectedPointsApproachB(
  eventRate: number,
  minutes: number,
  fixtureFactor = 1,
): number {
  if (minutes <= 0) return 0
  return appearancePoints(minutes) + (eventRate / 90) * minutes * fixtureFactor
}

export function expectedPointsApproachBSplit(
  position: PlayerPosition,
  rates: EventRates,
  minutes: number,
  attackFactor: number,
  defenceFactor: number,
): number {
  if (minutes <= 0) return 0
  const attack = eventAttackEp90(position, rates)
  const defence = eventDefenceEp90(position, rates)
  const bonus = rates.bonus90
  return (
    appearancePoints(minutes) +
    (attack / 90) * minutes * attackFactor +
    (defence / 90) * minutes * defenceFactor +
    (bonus / 90) * minutes
  )
}

export function blendedFixtureFactor(
  position: PlayerPosition,
  attackFactor: number,
  csFactor: number,
  defAttackWeight = 0.5,
  gkAttackWeight = 0.3,
): number {
  const pool = positionPool(position)
  if (pool === 'FWD' || pool === 'MID') return attackFactor
  if (pool === 'DEF') return defAttackWeight * attackFactor + (1 - defAttackWeight) * csFactor
  return gkAttackWeight * attackFactor + (1 - gkAttackWeight) * csFactor
}

export function positionalBaseline(
  values: readonly number[],
  minN = 1,
): number {
  if (values.length < minN) return meanOr(values, 0)
  return trimmedMean(values, 0.05)
}

function meanOr(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function formatShrinkage(spec: ShrinkageSpec): string {
  if (spec.kind === 'exponential') return `1-exp(-m/${spec.tau})`
  return `linear/${spec.minutesRef}`
}
