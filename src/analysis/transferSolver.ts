/**
 * Multi-transfer MILP optimiser (LT-5 / discovery §6).
 * Reuses HiGHS WASM loader from gw0Solver.
 */

import { SquadInfeasibleError, formatPinInfeasibility, type SquadPins } from './gw0Squad'
import { loadGw0Highs } from './gw0Solver'
import type { LiveProjection } from './liveProject'
import {
  assembleTransferSolution,
  buildTransferLp,
  buildTransferPool,
  diagnoseTransferPins,
  hitCostForTransfers,
  selectedFromTransferColumns,
  transferCountsToEnumerate,
  transferObjectiveEp,
  type BuildTransferPoolOptions,
  type TransferSolution,
  type TransferStrategyId,
  type TransferLpCandidate,
} from './transferSquad'

export type SolveTransfersArgs = {
  projected: readonly LiveProjection[]
  /** Current squad projections (must be subset of / joinable to projected). */
  currentSquad: readonly LiveProjection[]
  bankTenths: number
  freeTransfers: number
  sellPriceTenthsByCode: ReadonlyMap<number, number>
  strategy: TransferStrategyId
  /** Enumerate these T values; default 0..FT+3 (or 0..15 on wildcard). */
  transferCounts?: readonly number[]
  hitCap?: number
  wildcard?: boolean
  freeHit?: boolean
  pins?: SquadPins
  poolOptions?: BuildTransferPoolOptions
  retentionLambda?: number
  timeLimitSec?: number
}

export type TransferSolveResult = {
  strategy: TransferStrategyId
  poolSize: number
  /** Best solution across enumerated T (max objectiveValue). */
  best: TransferSolution | null
  /** One row per feasible T (ascending). */
  byTransferCount: TransferSolution[]
  infeasibleCounts: number[]
}

export type SolveAllStrategiesResult = {
  immediate: TransferSolveResult
  balanced: TransferSolveResult
  longTerm: TransferSolveResult
}

/**
 * Enumerate transfer counts and solve a MILP per T for one strategy.
 * Never writes Dexie / user stores.
 */
export async function solveTransfers(args: SolveTransfersArgs): Promise<TransferSolveResult> {
  const currentCodes = new Set(args.currentSquad.map((row) => row.code))
  if (currentCodes.size !== 15) {
    throw new Error(`Current squad must have 15 distinct codes, got ${currentCodes.size}`)
  }

  const candidates = buildTransferPool(
    args.projected,
    currentCodes,
    args.sellPriceTenthsByCode,
    args.poolOptions,
  )
  // Ensure every current player is present even if missing from projected join.
  ensureCurrentInPool(candidates, args.currentSquad, args.sellPriceTenthsByCode)

  const pins = args.pins ?? {}
  const diagnosed = diagnoseTransferPins(candidates, pins)
  if (diagnosed.length) {
    throw new SquadInfeasibleError(formatPinInfeasibility(diagnosed), diagnosed)
  }

  const counts =
    args.transferCounts ??
    transferCountsToEnumerate(args.freeTransfers, {
      hitCap: args.hitCap,
      wildcard: args.wildcard,
      freeHit: args.freeHit,
    })

  const highs = await loadGw0Highs()
  const byTransferCount: TransferSolution[] = []
  const infeasibleCounts: number[] = []

  for (const T of counts) {
    const ownedN = candidates.filter((row) => row.owned).length
    const externalN = candidates.filter((row) => !row.owned).length
    if (T > ownedN || T > externalN) {
      infeasibleCounts.push(T)
      continue
    }

    let lp: string
    try {
      lp = buildTransferLp(candidates, args.strategy, {
        bankTenths: args.bankTenths,
        transferCount: T,
        freeTransfers: args.freeTransfers,
        wildcard: args.wildcard,
        pins,
        retentionLambda: args.retentionLambda,
      })
    } catch {
      infeasibleCounts.push(T)
      continue
    }

    const result = highs.solve(lp, {
      output_flag: false,
      log_to_console: false,
      presolve: 'on',
      time_limit: args.timeLimitSec ?? 30,
      random_seed: 1,
    })

    if (result.Status !== 'Optimal') {
      infeasibleCounts.push(T)
      continue
    }

    const picked = selectedFromTransferColumns(result.Columns, candidates)
    try {
      const solution = assembleTransferSolution({
        strategy: args.strategy,
        transferCount: T,
        freeTransfers: args.freeTransfers,
        wildcard: args.wildcard,
        players: picked,
        currentCodes,
        currentPlayers: args.currentSquad,
        bankTenths: args.bankTenths,
        sellPriceTenthsByCode: args.sellPriceTenthsByCode,
      })
      byTransferCount.push(solution)
    } catch {
      infeasibleCounts.push(T)
    }
  }

  let best: TransferSolution | null = null
  for (const row of byTransferCount) {
    if (!best || row.objectiveValue > best.objectiveValue) best = row
  }

  return {
    strategy: args.strategy,
    poolSize: candidates.length,
    best,
    byTransferCount,
    infeasibleCounts,
  }
}

export async function solveAllTransferStrategies(
  args: Omit<SolveTransfersArgs, 'strategy'>,
): Promise<SolveAllStrategiesResult> {
  const immediate = await solveTransfers({ ...args, strategy: 'immediate' })
  const balanced = await solveTransfers({ ...args, strategy: 'balanced' })
  const longTerm = await solveTransfers({ ...args, strategy: 'longTerm' })
  return { immediate, balanced, longTerm }
}

/** Convenience: objective EP for a squad under a strategy (no hits). */
export function squadTransferEp(
  players: readonly LiveProjection[],
  strategy: TransferStrategyId,
): number {
  return players.reduce((sum, row) => sum + transferObjectiveEp(row, strategy), 0)
}

export { hitCostForTransfers, transferObjectiveEp }

function ensureCurrentInPool(
  candidates: TransferLpCandidate[],
  currentSquad: readonly LiveProjection[],
  sellPriceTenthsByCode: ReadonlyMap<number, number>,
): void {
  const have = new Set(candidates.map((row) => row.projection.code))
  for (const player of currentSquad) {
    if (have.has(player.code)) continue
    candidates.push({
      projection: player,
      varName: `x${player.code}`,
      owned: true,
      sellPriceTenths: sellPriceTenthsByCode.get(player.code) ?? player.nowCostTenths,
    })
    have.add(player.code)
  }
  candidates.sort((a, b) => a.projection.code - b.projection.code)
}
