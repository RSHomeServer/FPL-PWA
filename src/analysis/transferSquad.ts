/**
 * Transfer MILP squad model (discovery §6).
 * Final-15 legality only; simultaneous transfers; sell/buy budget linearisation.
 */

import { HIT_COST_PER_TRANSFER } from '../data/freeTransfers'
import { formatGbpFromTenths } from '../data/prices'
import type { SquadPins } from './gw0Squad'
import {
  MAX_PER_CLUB,
  SQUAD_POSITIONS,
  SQUAD_SIZE,
  uniquePinCodes,
  type PinViolation,
} from './gw0Squad'
import { positionPool, type PositionPool } from './metrics'
import type { LiveProjection } from './liveProject'
import { topFractionCutoff } from './gw0Funnel'

export type TransferStrategyId = 'immediate' | 'balanced' | 'longTerm'

export const TRANSFER_STRATEGIES: ReadonlyArray<{
  id: TransferStrategyId
  label: string
  formula: string
}> = [
  { id: 'immediate', label: 'Immediate', formula: 'max Σ x·EP_next − 4h' },
  { id: 'balanced', label: 'Balanced', formula: 'max Σ x·EP_next3 − 4h' },
  { id: 'longTerm', label: 'Long-term', formula: 'max Σ x·EP_next5 − 4h' },
]

/** Extra transfers beyond FT to enumerate (discovery §6.5). */
export const DEFAULT_HIT_ENUM_CAP = 3

/** Soft retention weight for balanced — never dominates EP. */
export const BALANCED_RETENTION_LAMBDA = 0.05

export type TransferLpCandidate = {
  projection: LiveProjection
  varName: string
  /** In the manager's current 15. */
  owned: boolean
  /** Sell proceeds if owned (tenths); 0 if not owned. */
  sellPriceTenths: number
}

export type TransferMove = {
  code: number
  webName: string
  teamShortName: string
  position: string
  priceTenths: number
  ep: number
}

export type TransferSolution = {
  strategy: TransferStrategyId
  transferCount: number
  hits: number
  hitCost: number
  freeTransfers: number
  finalCodes: number[]
  players: LiveProjection[]
  outs: TransferMove[]
  ins: TransferMove[]
  /** Buy-price spend of the final 15 (now_cost sum). */
  spendTenths: number
  remainingBankTenths: number
  totalEp: number
  currentEp: number
  netEpVsCurrent: number
  objectiveValue: number
}

export type BuildTransferPoolOptions = {
  /** Keep top fraction within position by next-GW EP (default 0.35 → ~150–250). */
  epKeepTopFraction?: number
  /** Absolute floor on next-GW EP by position. */
  positionFloors?: Partial<Record<PositionPool, number>>
}

const DEFAULT_LIVE_FLOORS: Record<PositionPool, number> = {
  GK: 2.5,
  DEF: 2.8,
  MID: 3.0,
  FWD: 3.0,
}

export function lpTransferVarName(code: number): string {
  return `x${code}`
}

export function sellVarName(code: number): string {
  return `s${code}`
}

export function buyVarName(code: number): string {
  return `b${code}`
}

/**
 * Universe = current owned codes (always) ∪ funnel-filtered live pool.
 * Fitness-zero owned players stay in the pool so they can be forced out (x=0).
 */
export function buildTransferPool(
  projected: readonly LiveProjection[],
  ownedCodes: ReadonlySet<number>,
  sellPriceTenthsByCode: ReadonlyMap<number, number>,
  options: BuildTransferPoolOptions = {},
): TransferLpCandidate[] {
  const epKeep = options.epKeepTopFraction ?? 0.35
  const floors = { ...DEFAULT_LIVE_FLOORS, ...options.positionFloors }
  const byCode = new Map(projected.map((row) => [row.code, row]))

  const available = projected.filter(
    (row) => row.current.canSelect && row.mFitness > 0 && !ownedCodes.has(row.code),
  )
  const cutoffs: Record<PositionPool, number> = {
    GK: Number.POSITIVE_INFINITY,
    DEF: Number.POSITIVE_INFINITY,
    MID: Number.POSITIVE_INFINITY,
    FWD: Number.POSITIVE_INFINITY,
  }
  for (const pool of Object.keys(floors) as PositionPool[]) {
    cutoffs[pool] = topFractionCutoff(
      available.filter((row) => positionPool(row.position) === pool).map((row) => row.ePtsNext),
      epKeep,
    )
  }

  const selected = new Map<number, LiveProjection>()
  for (const code of ownedCodes) {
    const row = byCode.get(code)
    if (row) selected.set(code, row)
  }
  for (const row of available) {
    const pool = positionPool(row.position)
    if (row.ePtsNext >= floors[pool] || row.ePtsNext >= cutoffs[pool]) {
      selected.set(row.code, row)
    }
  }

  return [...selected.values()]
    .sort((a, b) => a.code - b.code)
    .map((projection) => {
      const owned = ownedCodes.has(projection.code)
      return {
        projection,
        varName: lpTransferVarName(projection.code),
        owned,
        sellPriceTenths: owned
          ? (sellPriceTenthsByCode.get(projection.code) ?? projection.nowCostTenths)
          : 0,
      }
    })
}

/** EP used in the named strategy objective (before hit penalty). */
export function transferObjectiveEp(
  player: LiveProjection,
  strategy: TransferStrategyId,
): number {
  if (strategy === 'immediate') return player.ePtsNext
  if (strategy === 'balanced') {
    return player.ePtsByGw.slice(0, 3).reduce((sum, v) => sum + v, 0)
  }
  // Prefer explicit horizon sum; fall back to first 5 GW slots.
  if (player.ePtsHorizon > 0) return player.ePtsHorizon
  return player.ePtsByGw.slice(0, 5).reduce((sum, v) => sum + v, 0)
}

export function hitCountForTransfers(
  transferCount: number,
  freeTransfers: number,
  wildcard = false,
): number {
  if (wildcard) return 0
  return Math.max(0, transferCount - freeTransfers)
}

export function hitCostForTransfers(
  transferCount: number,
  freeTransfers: number,
  wildcard = false,
): number {
  return hitCountForTransfers(transferCount, freeTransfers, wildcard) * HIT_COST_PER_TRANSFER
}

export function transferCountsToEnumerate(
  freeTransfers: number,
  options: { hitCap?: number; wildcard?: boolean; freeHit?: boolean } = {},
): number[] {
  if (options.freeHit) {
    // Surface-only stub: still enumerate small T for UI, no special FH maths.
    const hitCap = options.hitCap ?? DEFAULT_HIT_ENUM_CAP
    return rangeInclusive(0, Math.min(15, freeTransfers + hitCap))
  }
  if (options.wildcard) {
    return rangeInclusive(0, 15)
  }
  const hitCap = options.hitCap ?? DEFAULT_HIT_ENUM_CAP
  const maxT = Math.min(15, Math.max(0, freeTransfers) + hitCap)
  return rangeInclusive(0, maxT)
}

/**
 * CPLEX LP for a fixed transfer count T.
 * Budget: bank + Σ P·s ≥ Σ C·b  (covers buys from sell proceeds + bank).
 */
export function buildTransferLp(
  candidates: readonly TransferLpCandidate[],
  strategy: TransferStrategyId,
  args: {
    bankTenths: number
    transferCount: number
    freeTransfers: number
    wildcard?: boolean
    pins?: SquadPins
    retentionLambda?: number
  },
): string {
  if (candidates.length < SQUAD_SIZE) {
    throw new Error(`Transfer LP pool has ${candidates.length} players; need at least ${SQUAD_SIZE}`)
  }
  const owned = candidates.filter((row) => row.owned)
  const external = candidates.filter((row) => !row.owned)
  const T = args.transferCount
  if (T < 0 || T > owned.length || T > external.length) {
    throw new Error(
      `Cannot make T=${T} transfers with ${owned.length} owned and ${external.length} external candidates`,
    )
  }

  const lambda =
    strategy === 'balanced' ? (args.retentionLambda ?? BALANCED_RETENTION_LAMBDA) : 0

  const epTerms = candidates.map((row) => {
    let coeff = transferObjectiveEp(row.projection, strategy)
    // Soft retention: small bonus for keeping owned players (never dominates EP).
    if (lambda > 0 && row.owned) {
      coeff += lambda
    }
    return `${fmtCoeff(coeff)} ${row.varName}`
  })

  // Hit cost (−4h) is applied in post-processing for the fixed T; omit LP constant.
  const objLine = ` obj: ${epTerms.join(' + ')}`

  const lines: string[] = [
    'Maximize',
    objLine,
    'Subject To',
    ` n15: ${sumX(candidates)} = ${SQUAD_SIZE}`,
    ...positionRows(candidates),
    ...clubRows(candidates),
    ...fitnessRows(candidates),
    ...pinRows(candidates, args.pins ?? {}),
  ]

  // Sell / buy linking
  for (const row of owned) {
    const s = sellVarName(row.projection.code)
    // s >= 1 - x  →  s + x >= 1; also s <= 1 - x → s + x <= 1 ⇒ s = 1 - x
    lines.push(` sell_ge_${row.projection.code}: ${s} + ${row.varName} >= 1`)
    lines.push(` sell_le_${row.projection.code}: ${s} + ${row.varName} <= 1`)
  }
  for (const row of external) {
    const b = buyVarName(row.projection.code)
    // b = x for non-owned
    lines.push(` buy_ge_${row.projection.code}: ${b} - ${row.varName} >= 0`)
    lines.push(` buy_le_${row.projection.code}: ${b} - ${row.varName} <= 0`)
  }

  if (owned.length > 0) {
    lines.push(` transfers_out: ${owned.map((row) => sellVarName(row.projection.code)).join(' + ')} = ${T}`)
  } else if (T !== 0) {
    throw new Error('No owned players but T > 0')
  }

  if (external.length > 0) {
    lines.push(
      ` transfers_in: ${external.map((row) => buyVarName(row.projection.code)).join(' + ')} = ${T}`,
    )
  } else if (T !== 0) {
    throw new Error('No external candidates but T > 0')
  }

  // bank + Σ P s >= Σ C b  →  Σ C b − Σ P s <= bank
  // Each sell coefficient needs its own minus (CPLEX binds unary `-` to one term).
  const budgetParts: string[] = []
  for (const row of external) {
    budgetParts.push(`${row.projection.nowCostTenths} ${buyVarName(row.projection.code)}`)
  }
  for (const row of owned) {
    budgetParts.push(`- ${row.sellPriceTenths} ${sellVarName(row.projection.code)}`)
  }
  if (budgetParts.length > 0) {
    lines.push(` budget: ${budgetParts.join(' ')} <= ${args.bankTenths}`)
  }

  const binaries = [
    ...candidates.map((row) => row.varName),
    ...owned.map((row) => sellVarName(row.projection.code)),
    ...external.map((row) => buyVarName(row.projection.code)),
  ]
  lines.push('Binaries', binaries.join(' '), 'End')
  return `${lines.join('\n')}\n`
}

export function diagnoseTransferPins(
  candidates: readonly TransferLpCandidate[],
  pins: SquadPins = {},
): PinViolation[] {
  const lockedCodes = uniquePinCodes(pins.lockedCodes)
  const excludedCodes = uniquePinCodes(pins.excludedCodes)
  const excluded = new Set(excludedCodes)
  const byCode = new Map(candidates.map((row) => [row.projection.code, row]))
  const violations: PinViolation[] = []

  const both = lockedCodes.filter((code) => excluded.has(code))
  if (both.length) {
    violations.push({
      code: 'lock-exclude-conflict',
      detail: `Locked and excluded: ${both.join(', ')}`,
      lockedCodes: both,
    })
  }

  const unknown = lockedCodes.filter((code) => !byCode.has(code))
  if (unknown.length) {
    violations.push({
      code: 'unknown-lock',
      detail: `Locked codes not in transfer pool: ${unknown.join(', ')}`,
      lockedCodes: unknown,
    })
  }

  const lockedRows = lockedCodes
    .map((code) => byCode.get(code))
    .filter((row): row is TransferLpCandidate => row != null)

  if (lockedRows.length > SQUAD_SIZE) {
    violations.push({
      code: 'size',
      detail: `${lockedRows.length} locked exceeds 15`,
      lockedCodes: lockedRows.map((row) => row.projection.code),
    })
  }

  const byClub = new Map<number, TransferLpCandidate[]>()
  for (const row of lockedRows) {
    const teamId = row.projection.current.teamId
    const list = byClub.get(teamId) ?? []
    list.push(row)
    byClub.set(teamId, list)
  }
  for (const rows of byClub.values()) {
    if (rows.length > MAX_PER_CLUB) {
      violations.push({
        code: 'club',
        detail: `${rows[0]?.projection.teamShortName ?? 'club'} has ${rows.length} locked (max ${MAX_PER_CLUB})`,
        lockedCodes: rows.map((row) => row.projection.code),
      })
    }
  }

  const byPos: Record<PositionPool, TransferLpCandidate[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const row of lockedRows) byPos[positionPool(row.projection.position)].push(row)
  for (const pool of Object.keys(SQUAD_POSITIONS) as PositionPool[]) {
    if (byPos[pool].length > SQUAD_POSITIONS[pool]) {
      violations.push({
        code: 'position',
        detail: `${byPos[pool].length} locked ${pool} exceeds ${SQUAD_POSITIONS[pool]}`,
        lockedCodes: byPos[pool].map((row) => row.projection.code),
      })
    }
  }

  const remaining = candidates.filter((row) => !excluded.has(row.projection.code))
  if (remaining.length < SQUAD_SIZE) {
    violations.push({
      code: 'size',
      detail: `After excludes, ${remaining.length} remain (need ${SQUAD_SIZE})`,
      lockedCodes,
    })
  }

  return violations
}

export function selectedFromTransferColumns(
  columns: Record<string, { Primal?: number }>,
  candidates: readonly TransferLpCandidate[],
): LiveProjection[] {
  const byVar = new Map(candidates.map((row) => [row.varName, row.projection]))
  const picked: LiveProjection[] = []
  for (const [name, column] of Object.entries(columns)) {
    if (!name.startsWith('x')) continue
    if ((column.Primal ?? 0) < 0.5) continue
    const player = byVar.get(name)
    if (player) picked.push(player)
  }
  picked.sort(
    (a, b) =>
      positionOrder(a) - positionOrder(b) || a.current.webName.localeCompare(b.current.webName),
  )
  return picked
}

export function assembleTransferSolution(args: {
  strategy: TransferStrategyId
  transferCount: number
  freeTransfers: number
  wildcard?: boolean
  players: readonly LiveProjection[]
  currentCodes: ReadonlySet<number>
  currentPlayers: readonly LiveProjection[]
  bankTenths: number
  sellPriceTenthsByCode: ReadonlyMap<number, number>
}): TransferSolution {
  const {
    strategy,
    transferCount,
    freeTransfers,
    wildcard = false,
    players,
    currentCodes,
    currentPlayers,
    bankTenths,
    sellPriceTenthsByCode,
  } = args

  if (players.length !== SQUAD_SIZE) {
    throw new Error(`Expected ${SQUAD_SIZE} players, got ${players.length}`)
  }

  const finalCodes = players.map((row) => row.code)
  const finalSet = new Set(finalCodes)
  const outs = currentPlayers
    .filter((row) => !finalSet.has(row.code))
    .map((row) => toMove(row, strategy, sellPriceTenthsByCode.get(row.code) ?? row.nowCostTenths))
  const ins = players
    .filter((row) => !currentCodes.has(row.code))
    .map((row) => toMove(row, strategy, row.nowCostTenths))

  if (outs.length !== transferCount || ins.length !== transferCount) {
    throw new Error(
      `Transfer count mismatch: T=${transferCount} but outs=${outs.length} ins=${ins.length}`,
    )
  }

  const sellProceeds = outs.reduce((sum, row) => sum + row.priceTenths, 0)
  const buySpend = ins.reduce((sum, row) => sum + row.priceTenths, 0)
  const remainingBankTenths = bankTenths + sellProceeds - buySpend
  if (remainingBankTenths < 0) {
    throw new Error(
      `Negative remaining bank ${formatGbpFromTenths(remainingBankTenths)} after transfers`,
    )
  }

  const hits = hitCountForTransfers(transferCount, freeTransfers, wildcard)
  const hitCost = hits * HIT_COST_PER_TRANSFER
  const totalEp = players.reduce((sum, row) => sum + transferObjectiveEp(row, strategy), 0)
  const currentEp = currentPlayers.reduce(
    (sum, row) => sum + transferObjectiveEp(row, strategy),
    0,
  )
  const spendTenths = players.reduce((sum, row) => sum + row.nowCostTenths, 0)

  return {
    strategy,
    transferCount,
    hits,
    hitCost,
    freeTransfers,
    finalCodes,
    players: [...players],
    outs: outs.sort((a, b) => a.webName.localeCompare(b.webName)),
    ins: ins.sort((a, b) => a.webName.localeCompare(b.webName)),
    spendTenths,
    remainingBankTenths,
    totalEp,
    currentEp,
    netEpVsCurrent: totalEp - hitCost - currentEp,
    objectiveValue: totalEp - hitCost,
  }
}

/**
 * Greedy sequential 1-transfer search for the constructed counterexample tests.
 * Tries each single (out,in) affordable with current bank; repeats up to maxSteps.
 * Does not look ahead — classic failure mode vs simultaneous MILP.
 */
export function greedySequentialTransfers(args: {
  current: readonly LiveProjection[]
  pool: readonly LiveProjection[]
  bankTenths: number
  sellPriceTenthsByCode: ReadonlyMap<number, number>
  strategy: TransferStrategyId
  maxTransfers: number
  freeTransfers: number
}): {
  players: LiveProjection[]
  transferCount: number
  hitCost: number
  objectiveValue: number
  bankTenths: number
} {
  let squad = [...args.current]
  let bank = args.bankTenths
  let transfers = 0

  for (let step = 0; step < args.maxTransfers; step += 1) {
    const owned = new Set(squad.map((row) => row.code))
    let best: {
      out: LiveProjection
      inn: LiveProjection
      score: number
      bankAfter: number
    } | null = null

    for (const out of squad) {
      const sell = args.sellPriceTenthsByCode.get(out.code) ?? out.nowCostTenths
      for (const inn of args.pool) {
        if (owned.has(inn.code)) continue
        if (inn.mFitness <= 0 || !inn.current.canSelect) continue
        if (positionPool(out.position) !== positionPool(inn.position)) continue
        const bankAfter = bank + sell - inn.nowCostTenths
        if (bankAfter < 0) continue
        const next = squad.map((row) => (row.code === out.code ? inn : row))
        if (!isLegalTransferSquad(next)) continue
        const totalEp = next.reduce((sum, row) => sum + transferObjectiveEp(row, args.strategy), 0)
        const hits = hitCountForTransfers(transfers + 1, args.freeTransfers)
        const score = totalEp - hits * HIT_COST_PER_TRANSFER
        if (!best || score > best.score) {
          best = { out, inn, score, bankAfter }
        }
      }
    }

    if (!best) break
    const currentScore =
      squad.reduce((sum, row) => sum + transferObjectiveEp(row, args.strategy), 0) -
      hitCountForTransfers(transfers, args.freeTransfers) * HIT_COST_PER_TRANSFER
    if (best.score <= currentScore) break

    squad = squad.map((row) => (row.code === best!.out.code ? best!.inn : row))
    bank = best.bankAfter
    transfers += 1
  }

  const hitCost = hitCostForTransfers(transfers, args.freeTransfers)
  const totalEp = squad.reduce((sum, row) => sum + transferObjectiveEp(row, args.strategy), 0)
  return {
    players: squad,
    transferCount: transfers,
    hitCost,
    objectiveValue: totalEp - hitCost,
    bankTenths: bank,
  }
}

export function isLegalTransferSquad(players: readonly LiveProjection[]): boolean {
  if (players.length !== SQUAD_SIZE) return false
  const byClub = new Map<number, number>()
  const byPos: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const player of players) {
    if (player.mFitness <= 0) return false
    byClub.set(player.current.teamId, (byClub.get(player.current.teamId) ?? 0) + 1)
    byPos[positionPool(player.position)] += 1
  }
  for (const n of byClub.values()) {
    if (n > MAX_PER_CLUB) return false
  }
  for (const pool of Object.keys(SQUAD_POSITIONS) as PositionPool[]) {
    if (byPos[pool] !== SQUAD_POSITIONS[pool]) return false
  }
  return true
}

function toMove(
  row: LiveProjection,
  strategy: TransferStrategyId,
  priceTenths: number,
): TransferMove {
  return {
    code: row.code,
    webName: row.current.webName,
    teamShortName: row.teamShortName,
    position: positionPool(row.position),
    priceTenths,
    ep: transferObjectiveEp(row, strategy),
  }
}

function rangeInclusive(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i <= to; i += 1) out.push(i)
  return out
}

function fitnessRows(candidates: readonly TransferLpCandidate[]): string[] {
  return candidates
    .filter((row) => row.projection.mFitness <= 0)
    .map((row) => ` unfit_${row.projection.code}: ${row.varName} = 0`)
}

function pinRows(candidates: readonly TransferLpCandidate[], pins: SquadPins): string[] {
  const byCode = new Map(candidates.map((row) => [row.projection.code, row]))
  const lines: string[] = []
  for (const code of uniquePinCodes(pins.lockedCodes)) {
    const row = byCode.get(code)
    if (!row) continue
    lines.push(` lock_${code}: ${row.varName} = 1`)
  }
  for (const code of uniquePinCodes(pins.excludedCodes)) {
    const row = byCode.get(code)
    if (!row) continue
    lines.push(` excl_${code}: ${row.varName} = 0`)
  }
  return lines
}

function positionRows(candidates: readonly TransferLpCandidate[]): string[] {
  return (Object.keys(SQUAD_POSITIONS) as PositionPool[]).map((pool) => {
    const vars = candidates.filter((row) => positionPool(row.projection.position) === pool)
    return ` pos_${pool}: ${sumX(vars)} = ${SQUAD_POSITIONS[pool]}`
  })
}

function clubRows(candidates: readonly TransferLpCandidate[]): string[] {
  const byClub = new Map<number, TransferLpCandidate[]>()
  for (const row of candidates) {
    const teamId = row.projection.current.teamId
    const list = byClub.get(teamId) ?? []
    list.push(row)
    byClub.set(teamId, list)
  }
  return [...byClub.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([teamId, rows]) => ` club_${teamId}: ${sumX(rows)} <= ${MAX_PER_CLUB}`)
}

function sumX(rows: readonly TransferLpCandidate[]): string {
  if (rows.length === 0) return '0'
  return rows.map((row) => row.varName).join(' + ')
}

function fmtCoeff(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(6)
}

function positionOrder(player: LiveProjection): number {
  const pool = positionPool(player.position)
  if (pool === 'GK') return 0
  if (pool === 'DEF') return 1
  if (pool === 'MID') return 2
  return 3
}
