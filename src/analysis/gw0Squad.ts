import { formatGbpFromTenths } from '../data/prices'
import type { Gw0FunnelResult } from './gw0Funnel'
import { auditLine, type Gw0Projection } from './gw0Project'
import { positionPool, type PositionPool } from './metrics'

/** Official FPL 15-man squad size. */
export const SQUAD_SIZE = 15
/** `now_cost` tenths → £100.0m. */
export const BUDGET_TENTHS = 1000
export const MAX_PER_CLUB = 3
export const SQUAD_POSITIONS: Record<PositionPool, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
}

export type SquadObjectiveName = 'shortTerm' | 'longTerm'

export const SQUAD_OBJECTIVES: ReadonlyArray<{
  id: SquadObjectiveName
  label: string
  formula: string
}> = [
  { id: 'shortTerm', label: 'Short-term', formula: 'max Σ x_p E[pts_p,1]' },
  { id: 'longTerm', label: 'Long-term', formula: 'max Σ x_p Σ_{g=1..6} E[pts_p,g] (equal weights)' },
]

export type FormationId = '3-4-3' | '3-5-2' | '4-4-2'

export const FORMATIONS: Record<FormationId, Record<PositionPool, number>> = {
  '3-4-3': { GK: 1, DEF: 3, MID: 4, FWD: 3 },
  '3-5-2': { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2 },
}

export const DEFAULT_FORMATION: FormationId = '3-4-3'
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[]

export type LpCandidate = {
  projection: Gw0Projection
  varName: string
}

export type SquadViolation = {
  code: 'size' | 'budget' | 'club' | 'position' | 'fitness' | 'xi'
  detail: string
}

/** Lock/exclude pins applied to the next 15-man solve. */
export type SquadPinScope = 'both' | 'shortTerm' | 'longTerm'

export type SquadPins = {
  lockedCodes?: readonly number[]
  excludedCodes?: readonly number[]
}

export type PinViolationCode =
  | 'lock-exclude-conflict'
  | 'unknown-lock'
  | 'club'
  | 'budget'
  | 'position'
  | 'size'
  | 'infeasible'

export type PinViolation = {
  code: PinViolationCode
  detail: string
  lockedCodes: number[]
}

/** Thrown when locks/excludes make the official FPL 15 infeasible. Locks are never dropped. */
export class SquadInfeasibleError extends Error {
  readonly violations: readonly PinViolation[]

  constructor(message: string, violations: readonly PinViolation[]) {
    super(message)
    this.name = 'SquadInfeasibleError'
    this.violations = violations
  }
}

export function isSquadInfeasibleError(error: unknown): error is SquadInfeasibleError {
  return error instanceof SquadInfeasibleError
}

export type FixtureCliff = {
  flagged: boolean
  hardGw46: number
  detail: string
}

export type ClubConcentration = {
  teamId: number
  shortName: string
  n: number
  flagged: boolean
}

export type SquadDiagnostics = {
  spendTenths: number
  remainingTenths: number
  spendByLine: Record<PositionPool, number>
  clubs: ClubConcentration[]
  ePtsGw1: number
  ePtsGw16: number
  cliffs: Array<{ player: Gw0Projection; cliff: FixtureCliff }>
}

export type OrderedSquad = {
  objective: SquadObjectiveName
  players: Gw0Projection[]
  xi: Gw0Projection[]
  bench: Gw0Projection[]
  formation: FormationId
  diagnostics: SquadDiagnostics
}

export type SquadOverlap = {
  shared: Gw0Projection[]
  onlyShort: Gw0Projection[]
  onlyLong: Gw0Projection[]
  shortGw1: number
  longGw1: number
  shortGw16: number
  longGw16: number
}

export function lpVarName(code: number): string {
  return `x${code}`
}

export function lpCandidatesFromFunnel(funnel: Gw0FunnelResult): LpCandidate[] {
  return funnel.rows
    .filter((row) => row.inLp && row.projection.mFitness > 0)
    .map((row) => ({
      projection: row.projection,
      varName: lpVarName(row.projection.code),
    }))
}

export function objectiveValue(player: Gw0Projection, objective: SquadObjectiveName): number {
  return objective === 'shortTerm' ? player.ePtsGw1 : player.ePtsGw16
}

export function squadViolations(players: readonly Gw0Projection[]): SquadViolation[] {
  const violations: SquadViolation[] = []
  if (players.length !== SQUAD_SIZE) {
    violations.push({ code: 'size', detail: `Need ${SQUAD_SIZE} players, got ${players.length}` })
  }
  const spend = players.reduce((sum, player) => sum + player.nowCostTenths, 0)
  if (spend > BUDGET_TENTHS) {
    violations.push({
      code: 'budget',
      detail: `Spend ${formatGbpFromTenths(spend)} exceeds ${formatGbpFromTenths(BUDGET_TENTHS)}`,
    })
  }
  const byClub = new Map<number, number>()
  for (const player of players) {
    const teamId = player.current.teamId
    byClub.set(teamId, (byClub.get(teamId) ?? 0) + 1)
  }
  for (const [teamId, n] of byClub) {
    if (n > MAX_PER_CLUB) {
      const name = players.find((player) => player.current.teamId === teamId)?.teamShortName ?? String(teamId)
      violations.push({ code: 'club', detail: `${name} has ${n} (>${MAX_PER_CLUB})` })
    }
  }
  const byPos: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const player of players) byPos[positionPool(player.position)] += 1
  for (const pool of Object.keys(SQUAD_POSITIONS) as PositionPool[]) {
    if (byPos[pool] !== SQUAD_POSITIONS[pool]) {
      violations.push({
        code: 'position',
        detail: `${pool} need ${SQUAD_POSITIONS[pool]}, got ${byPos[pool]}`,
      })
    }
  }
  for (const player of players) {
    if (player.mFitness <= 0) {
      violations.push({
        code: 'fitness',
        detail: `${player.current.webName} has m_fitness=${player.mFitness}`,
      })
    }
  }
  return violations
}

export function isLegalSquad(players: readonly Gw0Projection[]): boolean {
  return squadViolations(players).length === 0
}

/**
 * CPLEX LP text for HiGHS. Binary x_p on the LP pool; maximise the named
 * objective. Constraints match modelling plan §14.
 * Optional pins: lock → x_p = 1, exclude → x_p = 0. Unknown lock codes are
 * omitted here; `diagnosePins` / the solver refuse them instead of dropping a lock.
 */
export function buildSquadLp(
  candidates: readonly LpCandidate[],
  objective: SquadObjectiveName,
  pins: SquadPins = {},
): string {
  if (candidates.length < SQUAD_SIZE) {
    throw new Error(`LP pool has ${candidates.length} players; need at least ${SQUAD_SIZE}`)
  }
  const terms = candidates
    .map((row) => `${fmtCoeff(objectiveValue(row.projection, objective))} ${row.varName}`)
    .join(' + ')
  const lines = [
    'Maximize',
    ` obj: ${terms}`,
    'Subject To',
    ` n15: ${sumVars(candidates)} = ${SQUAD_SIZE}`,
    ` budget: ${candidates.map((row) => `${row.projection.nowCostTenths} ${row.varName}`).join(' + ')} <= ${BUDGET_TENTHS}`,
    ...positionRows(candidates),
    ...clubRows(candidates),
    ...pinRows(candidates, pins),
    'Binaries',
    candidates.map((row) => row.varName).join(' '),
    'End',
  ]
  return `${lines.join('\n')}\n`
}

export function uniquePinCodes(codes: readonly number[] | undefined): number[] {
  return [...new Set(codes ?? [])].filter((code) => Number.isInteger(code) && code > 0).sort((a, b) => a - b)
}

/**
 * Explain why the current lock/exclude set cannot be a legal FPL 15.
 * Never suggests dropping a lock.
 */
export function diagnosePins(candidates: readonly LpCandidate[], pins: SquadPins = {}): PinViolation[] {
  const lockedCodes = uniquePinCodes(pins.lockedCodes)
  const excludedCodes = uniquePinCodes(pins.excludedCodes)
  const excluded = new Set(excludedCodes)
  const byCode = new Map(candidates.map((row) => [row.projection.code, row]))
  const violations: PinViolation[] = []

  const both: number[] = []
  for (const code of lockedCodes) {
    if (excluded.has(code)) both.push(code)
  }
  if (both.length) {
    violations.push({
      code: 'lock-exclude-conflict',
      detail: `Locked and excluded (cannot be both): ${labelsForCodes(both, byCode)}`,
      lockedCodes: both,
    })
  }

  const unknown = lockedCodes.filter((code) => !byCode.has(code))
  if (unknown.length) {
    violations.push({
      code: 'unknown-lock',
      detail: `Locked codes not in the LP pool (funnel / m_fitness): ${unknown.join(', ')}. Cannot force x_p = 1.`,
      lockedCodes: unknown,
    })
  }

  const lockedRows = lockedCodes
    .map((code) => byCode.get(code))
    .filter((row): row is LpCandidate => row != null)

  if (lockedRows.length > SQUAD_SIZE) {
    violations.push({
      code: 'size',
      detail: `${lockedRows.length} locked players exceeds the 15-man squad`,
      lockedCodes: lockedRows.map((row) => row.projection.code),
    })
  }

  const spend = lockedRows.reduce((sum, row) => sum + row.projection.nowCostTenths, 0)
  if (spend > BUDGET_TENTHS) {
    violations.push({
      code: 'budget',
      detail: `Locked spend ${formatGbpFromTenths(spend)} exceeds ${formatGbpFromTenths(BUDGET_TENTHS)}: ${labelsForRows(lockedRows)}`,
      lockedCodes: lockedRows.map((row) => row.projection.code),
    })
  }

  const byClub = new Map<number, LpCandidate[]>()
  for (const row of lockedRows) {
    const teamId = row.projection.current.teamId
    const list = byClub.get(teamId) ?? []
    list.push(row)
    byClub.set(teamId, list)
  }
  for (const rows of byClub.values()) {
    if (rows.length > MAX_PER_CLUB) {
      const name = rows[0]?.projection.teamShortName ?? 'club'
      violations.push({
        code: 'club',
        detail: `${name} has ${rows.length} locked players (max ${MAX_PER_CLUB}): ${labelsForRows(rows)}`,
        lockedCodes: rows.map((row) => row.projection.code),
      })
    }
  }

  const byPos: Record<PositionPool, LpCandidate[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const row of lockedRows) byPos[positionPool(row.projection.position)].push(row)
  for (const pool of Object.keys(SQUAD_POSITIONS) as PositionPool[]) {
    if (byPos[pool].length > SQUAD_POSITIONS[pool]) {
      violations.push({
        code: 'position',
        detail: `${byPos[pool].length} locked ${pool} exceeds the ${SQUAD_POSITIONS[pool]} quota: ${labelsForRows(byPos[pool])}`,
        lockedCodes: byPos[pool].map((row) => row.projection.code),
      })
    }
  }

  const remaining = candidates.filter((row) => !excluded.has(row.projection.code))
  if (remaining.length < SQUAD_SIZE) {
    violations.push({
      code: 'size',
      detail: `After excludes, ${remaining.length} LP-pool players remain (need ${SQUAD_SIZE})`,
      lockedCodes: lockedCodes,
    })
  }
  const remainPos: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const row of remaining) remainPos[positionPool(row.projection.position)] += 1
  for (const pool of Object.keys(SQUAD_POSITIONS) as PositionPool[]) {
    if (remainPos[pool] < SQUAD_POSITIONS[pool]) {
      violations.push({
        code: 'position',
        detail: `After excludes, ${remainPos[pool]} ${pool} remain (need ${SQUAD_POSITIONS[pool]})`,
        lockedCodes: byPos[pool].map((row) => row.projection.code),
      })
    }
  }

  return violations
}

export function formatPinInfeasibility(violations: readonly PinViolation[]): string {
  if (violations.length === 0) {
    return 'Could not solve with the current locks/excludes. Locks were not dropped.'
  }
  const lines = violations.map((row) => row.detail)
  return `Could not solve with the current locks/excludes. Locks were not dropped. ${lines.join(' ')}`
}

function labelsForCodes(codes: readonly number[], byCode: ReadonlyMap<number, LpCandidate>): string {
  return codes
    .map((code) => {
      const row = byCode.get(code)
      return row ? pinLabel(row.projection) : `code ${code}`
    })
    .join(', ')
}

function labelsForRows(rows: readonly LpCandidate[]): string {
  return rows.map((row) => pinLabel(row.projection)).join(', ')
}

export function pinLabel(player: Gw0Projection): string {
  return `${player.current.webName} (${player.teamShortName} ${positionPool(player.position)})`
}

function pinRows(candidates: readonly LpCandidate[], pins: SquadPins): string[] {
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

export function selectedFromColumns(
  columns: Record<string, { Primal?: number }>,
  candidates: readonly LpCandidate[],
): Gw0Projection[] {
  const byVar = new Map(candidates.map((row) => [row.varName, row.projection]))
  const picked: Gw0Projection[] = []
  for (const [name, column] of Object.entries(columns)) {
    if ((column.Primal ?? 0) < 0.5) continue
    const player = byVar.get(name)
    if (player) picked.push(player)
  }
  picked.sort((a, b) => positionOrder(a) - positionOrder(b) || a.current.webName.localeCompare(b.current.webName))
  return picked
}

export function pickBestXi(
  squad: readonly Gw0Projection[],
  formation: FormationId,
  objective: SquadObjectiveName,
): Gw0Projection[] {
  const counts = FORMATIONS[formation]
  const grouped: Record<PositionPool, Gw0Projection[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const player of squad) grouped[positionPool(player.position)].push(player)
  const gkChoices = combinations(grouped.GK, counts.GK)
  const defChoices = combinations(grouped.DEF, counts.DEF)
  const midChoices = combinations(grouped.MID, counts.MID)
  const fwdChoices = combinations(grouped.FWD, counts.FWD)
  let best: Gw0Projection[] | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const gk of gkChoices) {
    for (const def of defChoices) {
      for (const mid of midChoices) {
        for (const fwd of fwdChoices) {
          const xi = [...gk, ...def, ...mid, ...fwd]
          if (xi.length !== 11) continue
          const score = xi.reduce((sum, player) => sum + objectiveValue(player, objective), 0)
          if (score > bestScore) {
            bestScore = score
            best = xi
          }
        }
      }
    }
  }
  if (!best) {
    throw new Error(`No legal ${formation} XI inside this 15`)
  }
  return best.sort(
    (a, b) => positionOrder(a) - positionOrder(b) || a.current.webName.localeCompare(b.current.webName),
  )
}

export function xiViolations(
  squad: readonly Gw0Projection[],
  xi: readonly Gw0Projection[],
  formation: FormationId,
): SquadViolation[] {
  const violations: SquadViolation[] = []
  const allowed = new Set(squad.map((player) => player.code))
  if (xi.length !== 11) {
    violations.push({ code: 'xi', detail: `Need 11 starters, got ${xi.length}` })
  }
  for (const player of xi) {
    if (!allowed.has(player.code)) {
      violations.push({ code: 'xi', detail: `${player.current.webName} is not in the 15` })
    }
  }
  const counts = FORMATIONS[formation]
  const byPos: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const player of xi) byPos[positionPool(player.position)] += 1
  for (const pool of Object.keys(counts) as PositionPool[]) {
    if (byPos[pool] !== counts[pool]) {
      violations.push({
        code: 'xi',
        detail: `${formation} ${pool} need ${counts[pool]}, got ${byPos[pool]}`,
      })
    }
  }
  return violations
}

/**
 * Remaining four, outfield first by GW1 EP, GK last so a keeper is not first
 * sub ahead of outfield unless no outfield remain.
 */
export function orderBench(squad: readonly Gw0Projection[], xi: readonly Gw0Projection[]): Gw0Projection[] {
  const xiCodes = new Set(xi.map((player) => player.code))
  const bench = squad.filter((player) => !xiCodes.has(player.code))
  const byGw1 = (a: Gw0Projection, b: Gw0Projection) =>
    b.ePtsGw1 - a.ePtsGw1 || a.current.webName.localeCompare(b.current.webName)
  const outfield = bench.filter((player) => positionPool(player.position) !== 'GK').sort(byGw1)
  const keepers = bench.filter((player) => positionPool(player.position) === 'GK').sort(byGw1)
  return [...outfield, ...keepers]
}

export function assembleSquad(
  players: readonly Gw0Projection[],
  objective: SquadObjectiveName,
  formation: FormationId = DEFAULT_FORMATION,
): OrderedSquad {
  const violations = squadViolations(players)
  if (violations.length) {
    throw new Error(`Illegal 15: ${violations.map((row) => row.detail).join('; ')}`)
  }
  const xi = pickBestXi(players, formation, objective)
  const xiProblems = xiViolations(players, xi, formation)
  if (xiProblems.length) {
    throw new Error(`Illegal XI: ${xiProblems.map((row) => row.detail).join('; ')}`)
  }
  return {
    objective,
    players: [...players],
    xi,
    bench: orderBench(players, xi),
    formation,
    diagnostics: squadDiagnostics(players),
  }
}

export function squadDiagnostics(players: readonly Gw0Projection[]): SquadDiagnostics {
  const spendByLine: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  let spendTenths = 0
  const clubMap = new Map<number, ClubConcentration>()
  const cliffs: SquadDiagnostics['cliffs'] = []
  for (const player of players) {
    spendTenths += player.nowCostTenths
    spendByLine[positionPool(player.position)] += player.nowCostTenths
    const existing = clubMap.get(player.current.teamId)
    if (existing) existing.n += 1
    else {
      clubMap.set(player.current.teamId, {
        teamId: player.current.teamId,
        shortName: player.teamShortName,
        n: 1,
        flagged: false,
      })
    }
    const cliff = fixtureCliff(player)
    if (cliff.flagged) cliffs.push({ player, cliff })
  }
  const clubs = [...clubMap.values()]
    .map((row) => ({ ...row, flagged: row.n >= MAX_PER_CLUB }))
    .sort((a, b) => b.n - a.n || a.shortName.localeCompare(b.shortName))
  return {
    spendTenths,
    remainingTenths: BUDGET_TENTHS - spendTenths,
    spendByLine,
    clubs,
    ePtsGw1: players.reduce((sum, player) => sum + player.ePtsGw1, 0),
    ePtsGw16: players.reduce((sum, player) => sum + player.ePtsGw16, 0),
    cliffs,
  }
}

export function fixtureCliff(player: Gw0Projection): FixtureCliff {
  const bits: string[] = []
  let hardGw46 = 0
  for (const audit of player.auditByGw) {
    if (audit.gw < 4 || audit.gw > 6) continue
    for (const bucket of audit.fdrBuckets) {
      if (bucket != null && bucket >= 4) {
        hardGw46 += 1
        bits.push(`GW${audit.gw} FDR${bucket}`)
      }
    }
  }
  return {
    flagged: hardGw46 >= 2,
    hardGw46,
    detail: bits.join(', ') || 'no FDR 4–5 in GW4–6',
  }
}

export function overlapDiffs(shortTerm: readonly Gw0Projection[], longTerm: readonly Gw0Projection[]): SquadOverlap {
  const longByCode = new Map(longTerm.map((player) => [player.code, player]))
  const shortByCode = new Map(shortTerm.map((player) => [player.code, player]))
  const shared: Gw0Projection[] = []
  const onlyShort: Gw0Projection[] = []
  for (const player of shortTerm) {
    if (longByCode.has(player.code)) shared.push(player)
    else onlyShort.push(player)
  }
  const onlyLong = longTerm.filter((player) => !shortByCode.has(player.code))
  return {
    shared,
    onlyShort,
    onlyLong,
    shortGw1: shortTerm.reduce((sum, player) => sum + player.ePtsGw1, 0),
    longGw1: longTerm.reduce((sum, player) => sum + player.ePtsGw1, 0),
    shortGw16: shortTerm.reduce((sum, player) => sum + player.ePtsGw16, 0),
    longGw16: longTerm.reduce((sum, player) => sum + player.ePtsGw16, 0),
  }
}

export function playerAuditLine(player: Gw0Projection): string {
  const gw1 = player.auditByGw[0]
  return gw1 ? auditLine(gw1) : ''
}

function positionRows(candidates: readonly LpCandidate[]): string[] {
  return (Object.keys(SQUAD_POSITIONS) as PositionPool[]).map((pool) => {
    const vars = candidates.filter((row) => positionPool(row.projection.position) === pool)
    return ` pos_${pool}: ${sumVars(vars)} = ${SQUAD_POSITIONS[pool]}`
  })
}

function clubRows(candidates: readonly LpCandidate[]): string[] {
  const byClub = new Map<number, LpCandidate[]>()
  for (const row of candidates) {
    const teamId = row.projection.current.teamId
    const list = byClub.get(teamId) ?? []
    list.push(row)
    byClub.set(teamId, list)
  }
  return [...byClub.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([teamId, rows]) => ` club_${teamId}: ${sumVars(rows)} <= ${MAX_PER_CLUB}`)
}

function sumVars(rows: readonly LpCandidate[]): string {
  if (rows.length === 0) return '0'
  return rows.map((row) => row.varName).join(' + ')
}

function fmtCoeff(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(6)
}

export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k < 0 || k > items.length) return []
  if (k === 0) return [[]]
  const out: T[][] = []
  const acc: T[] = []
  const walk = (start: number) => {
    if (acc.length === k) {
      out.push([...acc])
      return
    }
    const need = k - acc.length
    for (let i = start; i <= items.length - need; i += 1) {
      acc.push(items[i])
      walk(i + 1)
      acc.pop()
    }
  }
  walk(0)
  return out
}

function positionOrder(player: Gw0Projection): number {
  const pool = positionPool(player.position)
  if (pool === 'GK') return 0
  if (pool === 'DEF') return 1
  if (pool === 'MID') return 2
  return 3
}
