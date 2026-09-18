import { teamById } from '../data/queries'
import { formatGbpFromTenths } from '../data/prices'
import type { EliteEntryRecord, SeasonSnapshot } from '../data/types'
import {
  FORMATION_IDS,
  SquadInfeasibleError,
  formatPinInfeasibility,
} from './gw0Squad'
import {
  eliteGameweekOwnership,
  playerRoundPoints,
  type EliteGwOwnershipRow,
} from './eliteOwnership'
import {
  diagnoseHindsightPins,
  solvePerfectGwFormation,
  type HindsightPlayer,
  type PerfectGwTeam,
} from './perfectTeam'

export type EliteLpObjective = 'form' | 'prevGwPoints' | 'totalPoints'

export const ELITE_LP_OBJECTIVES: ReadonlyArray<{
  id: EliteLpObjective
  label: string
  hint: string
}> = [
  { id: 'form', label: 'Form', hint: 'Bootstrap form (recent scoring rate)' },
  { id: 'prevGwPoints', label: 'Last GW points', hint: 'Points in the previous gameweek' },
  { id: 'totalPoints', label: 'Overall points', hint: 'Season total points so far' },
]

export type EliteOwnershipLpOptions = {
  /** Minimum elite ownership to enter the pool (0–1). Default 0.05. */
  minOwnership?: number
  objective?: EliteLpObjective
}

export type EliteOwnershipLpResult = {
  gw: number
  objective: EliteLpObjective
  minOwnership: number
  poolSize: number
  sampleSize: number
  team: PerfectGwTeam
  /** XI sum + captain bonus under the chosen objective. */
  objectiveScore: number
  ownershipByElementId: Record<number, number>
}

/**
 * Build an LP pool from elite-owned players and solve a legal £100m / max-3-per-club 15
 * that maximises form, previous-GW points, or overall points.
 */
export async function solveEliteOwnershipTeam(
  entries: readonly EliteEntryRecord[],
  snapshot: SeasonSnapshot,
  gw: number,
  options: EliteOwnershipLpOptions = {},
): Promise<EliteOwnershipLpResult> {
  const objective = options.objective ?? 'form'
  const minOwnership = clampOwnership(options.minOwnership ?? 0.05)
  const board = eliteGameweekOwnership(entries, gw, 0)
  const eligible = board.rows.filter((row) => row.ownership + 1e-9 >= minOwnership)
  const pool = buildEliteLpPool(eligible, snapshot, gw, objective)

  if (pool.length < 15) {
    throw new Error(
      `Elite LP pool has ${pool.length} players at ≥${Math.round(minOwnership * 100)}% ownership (need 15). Lower the ownership floor.`,
    )
  }

  const pins = {}
  const violations = diagnoseHindsightPins(pool, pins)
  if (violations.length > 0) {
    throw new SquadInfeasibleError(formatPinInfeasibility(violations), violations)
  }

  let best: PerfectGwTeam | null = null
  let lastStatus = 'Unknown'
  for (const formation of FORMATION_IDS) {
    try {
      const candidate = await solvePerfectGwFormation(pool, gw, formation, pins)
      if (!best || candidate.totalPoints > best.totalPoints) best = candidate
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('HiGHS')) {
        lastStatus = cause.message
        continue
      }
      throw cause
    }
  }

  if (!best) {
    throw new Error(
      `Could not solve elite ownership team for GW${gw} (${lastStatus}). Try lowering the ownership floor.`,
    )
  }

  const ownershipByElementId: Record<number, number> = {}
  for (const row of eligible) ownershipByElementId[row.elementId] = row.ownership

  return {
    gw,
    objective,
    minOwnership,
    poolSize: pool.length,
    sampleSize: board.sampleSize,
    team: best,
    objectiveScore: best.totalPoints,
    ownershipByElementId,
  }
}

export function buildEliteLpPool(
  ownershipRows: readonly EliteGwOwnershipRow[],
  snapshot: SeasonSnapshot,
  gw: number,
  objective: EliteLpObjective,
): HindsightPlayer[] {
  const teams = teamById(snapshot.teams)
  const playersById = new Map(snapshot.players.map((player) => [player.id, player]))
  const pool: HindsightPlayer[] = []

  for (const row of ownershipRows) {
    const player = playersById.get(row.elementId)
    if (!player) continue
    const team = teams.get(player.teamId)
    const score = objectiveScore(player, snapshot, gw, objective)
    const costTenths =
      playerRoundPoints(snapshot.performances, row.elementId, gw) != null
        ? valueAtGw(snapshot, row.elementId, gw) ?? player.nowCostTenths
        : player.nowCostTenths

    pool.push({
      code: player.code,
      playerId: player.id,
      webName: player.webName,
      position: player.position,
      teamId: player.teamId,
      teamCode: team?.code ?? 0,
      teamShortName: team?.shortName ?? team?.name ?? '?',
      costTenths,
      gwPoints: score,
      performance: null,
    })
  }

  return pool
}

export function objectiveScoreLabel(objective: EliteLpObjective): string {
  return ELITE_LP_OBJECTIVES.find((row) => row.id === objective)?.label ?? objective
}

export function formatEliteLpSummary(result: EliteOwnershipLpResult): string {
  return (
    `${objectiveScoreLabel(result.objective)} score ${result.objectiveScore.toFixed(1)} · ` +
    `${formatGbpFromTenths(result.team.spendTenths)} spent · ` +
    `pool ${result.poolSize} (≥${Math.round(result.minOwnership * 100)}% of ${result.sampleSize})`
  )
}

function objectiveScore(
  player: SeasonSnapshot['players'][number],
  snapshot: SeasonSnapshot,
  gw: number,
  objective: EliteLpObjective,
): number {
  if (objective === 'form') return Math.max(0, player.form)
  if (objective === 'totalPoints') return Math.max(0, player.totalPoints)
  const prev = gw > 1 ? playerRoundPoints(snapshot.performances, player.id, gw - 1) : null
  return Math.max(0, prev ?? 0)
}

function valueAtGw(snapshot: SeasonSnapshot, playerId: number, gw: number): number | null {
  let value: number | null = null
  for (const row of snapshot.performances) {
    if (row.playerId === playerId && row.round === gw && row.valueTenths > 0) {
      value = row.valueTenths
    }
  }
  return value
}

function clampOwnership(value: number): number {
  if (!Number.isFinite(value)) return 0.05
  return Math.min(1, Math.max(0, value))
}
