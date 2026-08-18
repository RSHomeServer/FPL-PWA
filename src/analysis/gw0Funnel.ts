import { positionPool, type PositionPool } from './metrics'
import type { Gw0Projection } from './gw0Project'

export const AUTO_FLAG_REASONS = ['newClub', 'lowMinutes', 'doubtful', 'newToPl', 'promotedClub'] as const
export type AutoFlagReason = (typeof AUTO_FLAG_REASONS)[number]

export const GW0_FULL_SEASON_MINUTES = 38 * 90

/**
 * Funnel knobs (modelling plan §13). Counts are retuned; the three OR
 * inclusion ideas and the auto-flag reasons are not.
 *
 * Live 2026/27 (514 available): a literal “EPPM top 60% of the whole pool”
 * plus 20% of 38×90 minutes (684) produced LP ≈ 416 and flags ≈ 188.
 * Shipped retune — same OR shape:
 * - E_pts_gw1 ≥ position floor
 * - EPPM in the top 25% **within position** among available players
 * - prior minutes ≥ 50% of a 38×90 season (1710)
 */
export type Gw0FunnelThresholds = {
  positionFloors: Record<PositionPool, number>
  eppmKeepTopFraction: number
  minutesShareOfSeason: number
  lowMinutes: number
}

export const DEFAULT_FUNNEL_THRESHOLDS: Gw0FunnelThresholds = {
  positionFloors: { GK: 3.5, DEF: 3.4, MID: 3.6, FWD: 3.6 },
  eppmKeepTopFraction: 0.25,
  minutesShareOfSeason: 0.5,
  lowMinutes: 450,
}

export type FunnelLpReason = 'epFloor' | 'eppm' | 'minutesShare'

export type Gw0FunnelRow = {
  projection: Gw0Projection
  selectable: boolean
  available: boolean
  inLp: boolean
  lpReasons: FunnelLpReason[]
  autoFlag: boolean
  autoFlagReasons: AutoFlagReason[]
}

export type Gw0FunnelResult = {
  thresholds: Gw0FunnelThresholds
  eppmCutoffByPosition: Record<PositionPool, number>
  minutesFloor: number
  counts: {
    all: number
    selectable: number
    excludedUnavailable: number
    available: number
    lpPool: number
    autoFlag: number
    lpByReason: Record<FunnelLpReason, number>
    flagByReason: Record<AutoFlagReason, number>
  }
  rows: Gw0FunnelRow[]
}

export function minutesFloorFromShare(share: number, fullSeason = GW0_FULL_SEASON_MINUTES): number {
  return share * fullSeason
}

/** Inclusive cutoff: keep the top `keepTopFraction` by descending score. */
export function topFractionCutoff(values: readonly number[], keepTopFraction: number): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY
  const keep = Math.min(1, Math.max(0, keepTopFraction))
  const sorted = [...values].sort((a, b) => a - b)
  const drop = Math.floor(sorted.length * (1 - keep))
  return sorted[Math.min(drop, sorted.length - 1)] ?? Number.POSITIVE_INFINITY
}

export function autoFlagReasons(
  row: Gw0Projection,
  thresholds: Gw0FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS,
): AutoFlagReason[] {
  const reasons: AutoFlagReason[] = []
  if (row.club === 'transferred') reasons.push('newClub')
  if ((row.prior?.minutes ?? 0) < thresholds.lowMinutes) reasons.push('lowMinutes')
  if (isDoubtful(row)) reasons.push('doubtful')
  if (row.newToPl) reasons.push('newToPl')
  if (row.promotedClub) reasons.push('promotedClub')
  return reasons
}

export function isDoubtful(row: Gw0Projection): boolean {
  const status = row.current.status.trim().toLowerCase()
  if (status === 'd') return true
  if (row.mFitness > 0 && row.mFitness < 1) return true
  return false
}

export function runGw0Funnel(
  projected: readonly Gw0Projection[],
  thresholds: Gw0FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS,
): Gw0FunnelResult {
  const minutesFloor = minutesFloorFromShare(thresholds.minutesShareOfSeason)
  const available = projected.filter((row) => row.current.canSelect && row.mFitness > 0)
  const eppmCutoffByPosition: Record<PositionPool, number> = {
    GK: Number.POSITIVE_INFINITY,
    DEF: Number.POSITIVE_INFINITY,
    MID: Number.POSITIVE_INFINITY,
    FWD: Number.POSITIVE_INFINITY,
  }
  const pools: PositionPool[] = ['GK', 'DEF', 'MID', 'FWD']
  for (const pool of pools) {
    eppmCutoffByPosition[pool] = topFractionCutoff(
      available.filter((row) => positionPool(row.position) === pool).map((row) => row.eppmGw1),
      thresholds.eppmKeepTopFraction,
    )
  }

  const lpByReason: Record<FunnelLpReason, number> = { epFloor: 0, eppm: 0, minutesShare: 0 }
  const flagByReason: Record<AutoFlagReason, number> = {
    newClub: 0,
    lowMinutes: 0,
    doubtful: 0,
    newToPl: 0,
    promotedClub: 0,
  }

  const rows: Gw0FunnelRow[] = projected.map((projection) => {
    const selectable = projection.current.canSelect
    const availableRow = selectable && projection.mFitness > 0
    const lpReasons: FunnelLpReason[] = []
    if (availableRow) {
      const pool = positionPool(projection.position)
      if (projection.ePtsGw1 >= thresholds.positionFloors[pool]) lpReasons.push('epFloor')
      if (projection.eppmGw1 >= eppmCutoffByPosition[pool]) lpReasons.push('eppm')
      if ((projection.prior?.minutes ?? 0) >= minutesFloor) lpReasons.push('minutesShare')
    }
    const inLp = lpReasons.length > 0
    const flags = inLp ? autoFlagReasons(projection, thresholds) : []
    const autoFlag = flags.length > 0
    for (const reason of lpReasons) lpByReason[reason] += 1
    for (const reason of flags) flagByReason[reason] += 1
    return {
      projection,
      selectable,
      available: availableRow,
      inLp,
      lpReasons,
      autoFlag,
      autoFlagReasons: flags,
    }
  })

  const selectableN = rows.filter((row) => row.selectable).length
  const availableN = rows.filter((row) => row.available).length
  return {
    thresholds,
    eppmCutoffByPosition,
    minutesFloor,
    counts: {
      all: projected.length,
      selectable: selectableN,
      excludedUnavailable: selectableN - availableN,
      available: availableN,
      lpPool: rows.filter((row) => row.inLp).length,
      autoFlag: rows.filter((row) => row.autoFlag).length,
      lpByReason,
      flagByReason,
    },
    rows,
  }
}

export function lpPool(result: Gw0FunnelResult): Gw0FunnelRow[] {
  return result.rows.filter((row) => row.inLp)
}

export function autoFlagged(result: Gw0FunnelResult): Gw0FunnelRow[] {
  return result.rows.filter((row) => row.autoFlag)
}
