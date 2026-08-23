import { formatGbpFromTenths } from '../data/prices'
import { scoreParts } from '../data/scoring'
import { teamById } from '../data/queries'
import type { FplPerformance, SeasonSnapshot } from '../data/types'
import { loadGw0Highs } from './gw0Solver'
import {
  BUDGET_TENTHS,
  FORMATIONS,
  FORMATION_IDS,
  MAX_PER_CLUB,
  SQUAD_POSITIONS,
  type FormationId,
} from './gw0Squad'
import { positionPool, type PositionPool } from './metrics'

export type HindsightPlayer = {
  code: number
  playerId: number
  webName: string
  position: string
  teamId: number
  teamCode: number
  teamShortName: string
  costTenths: number
  gwPoints: number
  performance: FplPerformance | null
}

export type PerfectGwTeam = {
  round: number
  formation: FormationId
  squad: HindsightPlayer[]
  xi: HindsightPlayer[]
  bench: HindsightPlayer[]
  captain: HindsightPlayer
  viceCaptain: HindsightPlayer
  /** Starting XI plus captain bonus (double). */
  totalPoints: number
  spendTenths: number
}

export type PerfectTeamCostMode = 'gw-price' | 'opening'

/** Build the hindsight player pool for one gameweek. */
export function buildHindsightPool(
  snapshot: SeasonSnapshot,
  round: number,
  costMode: PerfectTeamCostMode = 'gw-price',
): HindsightPlayer[] {
  const teams = teamById(snapshot.teams)
  const perfByPlayer = new Map<number, FplPerformance>()
  for (const row of snapshot.performances) {
    if (row.round === round) perfByPlayer.set(row.playerId, row)
  }
  const openingByPlayer = openingCostByPlayer(snapshot)

  const pool: HindsightPlayer[] = []
  for (const player of snapshot.players) {
    const perf = perfByPlayer.get(player.id) ?? null
    const team = teams.get(player.teamId)
    const costTenths =
      costMode === 'opening'
        ? (openingByPlayer.get(player.id) ?? player.nowCostTenths)
        : (perf?.valueTenths ?? openingByPlayer.get(player.id) ?? player.nowCostTenths)
    pool.push({
      code: player.code,
      playerId: player.id,
      webName: player.webName,
      position: player.position,
      teamId: player.teamId,
      teamCode: team?.code ?? 0,
      teamShortName: team?.shortName ?? team?.name ?? '?',
      costTenths,
      gwPoints: perf?.totalPoints ?? 0,
      performance: perf,
    })
  }
  return pool
}

export function openingCostByPlayer(snapshot: SeasonSnapshot): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of snapshot.performances) {
    if (row.round !== 1) continue
    map.set(row.playerId, row.valueTenths)
  }
  for (const player of snapshot.players) {
    if (!map.has(player.id)) map.set(player.id, player.nowCostTenths)
  }
  return map
}

export function playerValueAtGw(snapshot: SeasonSnapshot, playerId: number, gw: number): number {
  const perf = snapshot.performances.find((row) => row.playerId === playerId && row.round === gw)
  if (perf?.valueTenths) return perf.valueTenths
  return openingCostByPlayer(snapshot).get(playerId) ?? 0
}

export function scoreBreakdown(player: HindsightPlayer): ReturnType<typeof scoreParts> {
  if (!player.performance) return []
  return scoreParts(player.performance, player.position as Parameters<typeof scoreParts>[1])
}

/** Legal FPL 15 maximising GW points with optimal XI, formation, and captain. */
export async function solvePerfectGwTeam(
  snapshot: SeasonSnapshot,
  round: number,
  costMode: PerfectTeamCostMode = 'gw-price',
): Promise<PerfectGwTeam> {
  const pool = buildHindsightPool(snapshot, round, costMode)
  if (pool.length < 15) {
    throw new Error(`Only ${pool.length} players in pool for GW${round}`)
  }

  let best: PerfectGwTeam | null = null
  for (const formation of FORMATION_IDS) {
    const candidate = await solvePerfectGwFormation(pool, round, formation)
    if (!best || candidate.totalPoints > best.totalPoints) best = candidate
  }
  if (!best) throw new Error(`Could not solve perfect team for GW${round}`)
  return best
}

export async function solvePerfectGwFormation(
  pool: readonly HindsightPlayer[],
  round: number,
  formation: FormationId,
): Promise<PerfectGwTeam> {
  const highs = await loadGw0Highs()
  const lp = buildPerfectGwLp(pool, formation)
  const result = highs.solve(lp, {
    output_flag: false,
    log_to_console: false,
    presolve: 'on',
    time_limit: 45,
    random_seed: 1,
  })
  if (result.Status !== 'Optimal') {
    throw new Error(`HiGHS ${result.Status} for perfect GW${round} (${formation})`)
  }
  return extractPerfectTeam(pool, round, formation, result.Columns)
}

export function lineupFromSquad(
  squad: readonly HindsightPlayer[],
  gwPoints: ReadonlyMap<number, number>,
  formation: FormationId,
): { xi: HindsightPlayer[]; captain: HindsightPlayer; viceCaptain: HindsightPlayer; points: number } {
  const scored = squad.map((player) => ({
    ...player,
    gwPoints: gwPoints.get(player.code) ?? player.gwPoints,
  }))
  let bestXi: HindsightPlayer[] | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  const counts = FORMATIONS[formation]
  const grouped: Record<PositionPool, HindsightPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const player of scored) grouped[positionPool(player.position)].push(player)

  for (const gk of combinations(grouped.GK, counts.GK)) {
    for (const def of combinations(grouped.DEF, counts.DEF)) {
      for (const mid of combinations(grouped.MID, counts.MID)) {
        for (const fwd of combinations(grouped.FWD, counts.FWD)) {
          const xi = [...gk, ...def, ...mid, ...fwd]
          if (xi.length !== 11) continue
          const base = xi.reduce((sum, player) => sum + player.gwPoints, 0)
          const captain = [...xi].sort((a, b) => b.gwPoints - a.gwPoints || a.webName.localeCompare(b.webName))[0]
          const score = base + captain.gwPoints
          if (score > bestScore) {
            bestScore = score
            bestXi = xi
          }
        }
      }
    }
  }
  if (!bestXi) throw new Error(`No legal ${formation} XI`)
  const sortedXi = [...bestXi].sort((a, b) => b.gwPoints - a.gwPoints || a.webName.localeCompare(b.webName))
  const captain = sortedXi[0]
  const viceCaptain = sortedXi[1] ?? captain
  const base = sortedXi.reduce((sum, player) => sum + player.gwPoints, 0)
  return { xi: sortedXi, captain, viceCaptain, points: base + captain.gwPoints }
}

export function bestLineupAcrossFormations(
  squad: readonly HindsightPlayer[],
  gwPoints: ReadonlyMap<number, number>,
): { formation: FormationId; xi: HindsightPlayer[]; captain: HindsightPlayer; viceCaptain: HindsightPlayer; points: number } {
  let best: ReturnType<typeof lineupFromSquad> & { formation: FormationId } | null = null
  for (const formation of FORMATION_IDS) {
    const row = lineupFromSquad(squad, gwPoints, formation)
    if (!best || row.points > best.points) best = { ...row, formation }
  }
  if (!best) throw new Error('No legal XI')
  return best
}

export function orderBenchByPoints(
  squad: readonly HindsightPlayer[],
  xi: readonly HindsightPlayer[],
  gwPoints: ReadonlyMap<number, number>,
): HindsightPlayer[] {
  const xiCodes = new Set(xi.map((player) => player.code))
  const bench = squad.filter((player) => !xiCodes.has(player.code))
  const score = (player: HindsightPlayer) => gwPoints.get(player.code) ?? player.gwPoints
  const outfield = bench.filter((player) => positionPool(player.position) !== 'GK').sort((a, b) => score(b) - score(a))
  const keepers = bench.filter((player) => positionPool(player.position) === 'GK').sort((a, b) => score(b) - score(a))
  return [...outfield, ...keepers]
}

export function squadSpendTenths(squad: readonly HindsightPlayer[]): number {
  return squad.reduce((sum, player) => sum + player.costTenths, 0)
}

export function isLegalSquadCodes(
  squad: readonly HindsightPlayer[],
  byCode: ReadonlyMap<number, HindsightPlayer>,
): boolean {
  if (squad.length !== 15) return false
  if (squadSpendTenths(squad) > BUDGET_TENTHS) return false
  const byClub = new Map<number, number>()
  const byPos: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const player of squad) {
    if (!byCode.has(player.code)) return false
    byClub.set(player.teamId, (byClub.get(player.teamId) ?? 0) + 1)
    byPos[positionPool(player.position)] += 1
  }
  for (const n of byClub.values()) if (n > MAX_PER_CLUB) return false
  for (const pool of Object.keys(SQUAD_POSITIONS) as PositionPool[]) {
    if (byPos[pool] !== SQUAD_POSITIONS[pool]) return false
  }
  return true
}

function buildPerfectGwLp(candidates: readonly HindsightPlayer[], formation: FormationId): string {
  const counts = FORMATIONS[formation]
  const objTerms: string[] = []
  for (const player of candidates) {
    if (player.gwPoints <= 0) continue
    const pts = fmtCoeff(player.gwPoints)
    objTerms.push(`${pts} s${player.code}`, `${pts} c${player.code}`)
  }
  const objective = objTerms.length ? objTerms.join(' + ') : '0 x0'

  const lines = [
    'Maximize',
    ` obj: ${objective}`,
    'Subject To',
    ` n15: ${sumVars(candidates, 'x')} = 15`,
    ` budget: ${candidates.map((row) => `${row.costTenths} x${row.code}`).join(' + ')} <= ${BUDGET_TENTHS}`,
    ` n11: ${sumVars(candidates, 's')} = 11`,
    ` cap1: ${sumVars(candidates, 'c')} = 1`,
    ...positionRows(candidates, 'x'),
    ...clubRows(candidates),
    ...starterPositionRows(candidates, counts),
    ...linkRows(candidates),
    'Binaries',
    candidates.flatMap((row) => [`x${row.code}`, `s${row.code}`, `c${row.code}`]).join(' '),
    'End',
  ]
  return `${lines.join('\n')}\n`
}

function extractPerfectTeam(
  pool: readonly HindsightPlayer[],
  round: number,
  formation: FormationId,
  columns: Record<string, { Primal?: number }>,
): PerfectGwTeam {
  const byCode = new Map(pool.map((player) => [player.code, player]))
  const squad: HindsightPlayer[] = []
  const xi: HindsightPlayer[] = []
  let captain: HindsightPlayer | null = null
  for (const [name, column] of Object.entries(columns)) {
    if ((column.Primal ?? 0) < 0.5) continue
    const code = Number(name.slice(1))
    const player = byCode.get(code)
    if (!player) continue
    if (name.startsWith('x')) squad.push(player)
    else if (name.startsWith('s')) xi.push(player)
    else if (name.startsWith('c')) captain = player
  }
  squad.sort((a, b) => positionOrder(a) - positionOrder(b) || a.webName.localeCompare(b.webName))
  xi.sort((a, b) => positionOrder(a) - positionOrder(b) || a.webName.localeCompare(b.webName))
  if (squad.length !== 15 || xi.length !== 11 || !captain) {
    throw new Error(`Malformed perfect team GW${round}: ${squad.length}/15, XI ${xi.length}/11`)
  }
  const viceCaptain =
    [...xi].sort((a, b) => b.gwPoints - a.gwPoints || a.webName.localeCompare(b.webName)).find((p) => p.code !== captain!.code) ??
    captain
  const bench = orderBenchByPoints(squad, xi, new Map(squad.map((p) => [p.code, p.gwPoints])))
  const totalPoints = xi.reduce((sum, player) => sum + player.gwPoints, 0) + captain.gwPoints
  return {
    round,
    formation,
    squad,
    xi,
    bench,
    captain,
    viceCaptain,
    totalPoints,
    spendTenths: squadSpendTenths(squad),
  }
}

function positionRows(candidates: readonly HindsightPlayer[], prefix: 'x' | 's'): string[] {
  return (Object.keys(SQUAD_POSITIONS) as PositionPool[]).map((pool) => {
    const vars = candidates.filter((row) => positionPool(row.position) === pool)
    return ` pos_${prefix}_${pool}: ${sumVars(vars, prefix)} = ${SQUAD_POSITIONS[pool]}`
  })
}

function starterPositionRows(
  candidates: readonly HindsightPlayer[],
  counts: Record<PositionPool, number>,
): string[] {
  return (Object.keys(counts) as PositionPool[]).map((pool) => {
    const vars = candidates.filter((row) => positionPool(row.position) === pool)
    return ` xi_${pool}: ${sumVars(vars, 's')} = ${counts[pool]}`
  })
}

function clubRows(candidates: readonly HindsightPlayer[]): string[] {
  const byClub = new Map<number, HindsightPlayer[]>()
  for (const row of candidates) {
    const list = byClub.get(row.teamId) ?? []
    list.push(row)
    byClub.set(row.teamId, list)
  }
  return [...byClub.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([teamId, rows]) => ` club_${teamId}: ${sumVars(rows, 'x')} <= ${MAX_PER_CLUB}`)
}

function linkRows(candidates: readonly HindsightPlayer[]): string[] {
  const lines: string[] = []
  for (const player of candidates) {
    lines.push(` link_s_${player.code}: s${player.code} - x${player.code} <= 0`)
    lines.push(` link_c_${player.code}: c${player.code} - s${player.code} <= 0`)
  }
  return lines
}

function sumVars(rows: readonly HindsightPlayer[], prefix: 'x' | 's' | 'c'): string {
  if (rows.length === 0) return '0'
  return rows.map((row) => `${prefix}${row.code}`).join(' + ')
}

function fmtCoeff(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3)
}

function positionOrder(player: HindsightPlayer): number {
  const order: Record<PositionPool, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 }
  return order[positionPool(player.position)]
}

function combinations<T>(items: readonly T[], choose: number): T[][] {
  if (choose === 0) return [[]]
  if (choose > items.length) return []
  if (choose === items.length) return [[...items]]
  const [first, ...rest] = items
  return [...combinations(rest, choose - 1).map((row) => [first, ...row]), ...combinations(rest, choose)]
}

export function formatPerfectSpend(tenths: number): string {
  return formatGbpFromTenths(tenths)
}
