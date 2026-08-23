import { latestPlayedRound, maxRound } from '../data/queries'
import type { SeasonSnapshot } from '../data/types'
import { BUDGET_TENTHS, SQUAD_POSITIONS, type FormationId } from './gw0Squad'
import { positionPool, type PositionPool } from './metrics'
import {
  bestLineupAcrossFormations,
  buildHindsightPool,
  isLegalSquadCodes,
  openingCostByPlayer,
  orderBenchByPoints,
  playerValueAtGw,
  solvePerfectGwTeam,
  squadSpendTenths,
  type HindsightPlayer,
} from './perfectTeam'

export type SeasonTransfer = {
  gw: number
  out: HindsightPlayer
  in: HindsightPlayer
  hit: number
}

export type ChipUse = {
  gw: number
  chip: 'triple-captain' | 'bench-boost'
  bonusPoints: number
}

export type DynamicWeekPlan = {
  gw: number
  squad: HindsightPlayer[]
  xi: HindsightPlayer[]
  bench: HindsightPlayer[]
  captain: HindsightPlayer
  viceCaptain: HindsightPlayer
  formation: FormationId
  gwPoints: number
  transfers: SeasonTransfer[]
  hits: number
  chips: ChipUse[]
}

export type DynamicStrategy = {
  id: number
  label: string
  openingSquad: HindsightPlayer[]
  weeks: DynamicWeekPlan[]
  totalPoints: number
  totalHits: number
  chipBonus: number
  /** Distinct opening fingerprint for diversity UI. */
  openingKey: string
  /** Transfer-path fingerprint. */
  pathKey: string
}

export type DynamicSearchOptions = {
  beamWidth?: number
  maxStrategies?: number
  maxTransferCandidates?: number
  /** Force all strategies to start from this squad (e.g. GW0 model short-term). */
  lockedOpening?: readonly HindsightPlayer[]
  onProgress?: (progress: { gw: number; lastGw: number; message: string }) => void
}

const DEFAULT_OPTIONS: Required<Omit<DynamicSearchOptions, 'lockedOpening' | 'onProgress'>> = {
  beamWidth: 40,
  maxStrategies: 5,
  maxTransferCandidates: 12,
}

type SearchState = {
  key: string
  openingSquad: HindsightPlayer[]
  openingKey: string
  squad: HindsightPlayer[]
  bankTenths: number
  freeTransfers: number
  totalPoints: number
  totalHits: number
  transfers: SeasonTransfer[]
}

type SeasonIndex = {
  byCode: Map<number, HindsightPlayer>
  gwPointsByRound: Map<number, Map<number, number>>
  poolByRound: Map<number, Map<number, HindsightPlayer>>
  openingCosts: Map<number, number>
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(resolve, 0)
    } else {
      resolve()
    }
  })
}

/** Hindsight dynamic season from a GW0 squad with weekly transfers (1 FT/week, max 2 banked, −4 hits). */
export async function searchDynamicStrategies(
  snapshot: SeasonSnapshot,
  options: DynamicSearchOptions = {},
): Promise<DynamicStrategy[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const lastGw = latestPlayedRound(snapshot.performances) || maxRound(snapshot.performances, snapshot.fixtures)
  if (lastGw < 1) return []

  opts.onProgress?.({ gw: 0, lastGw, message: 'Indexing season…' })
  const index = buildSeasonIndex(snapshot, lastGw)
  await yieldToUi()

  const seedSquads = opts.lockedOpening?.length
    ? [opts.lockedOpening.map((player) => player)]
    : await buildOpeningSeeds(snapshot, lastGw, opts.onProgress)

  let beam: SearchState[] = seedSquads.map((openingSquad) => ({
    key: squadKey(openingSquad),
    openingSquad,
    openingKey: squadKey(openingSquad),
    squad: openingSquad,
    bankTenths: BUDGET_TENTHS - squadSpendTenths(openingSquad),
    freeTransfers: 1,
    totalPoints: 0,
    totalHits: 0,
    transfers: [],
  }))

  for (let gw = 1; gw <= lastGw; gw += 1) {
    opts.onProgress?.({ gw, lastGw, message: `Searching GW${gw} of ${lastGw}…` })
    const gwPoints = index.gwPointsByRound.get(gw) ?? new Map()
    const expanded: SearchState[] = []

    for (const state of beam) {
      const points = bestLineupAcrossFormations(state.squad, gwPoints).points
      const afterGw: SearchState = {
        ...state,
        totalPoints: state.totalPoints + points,
        freeTransfers: Math.min(2, state.freeTransfers + 1),
      }
      expanded.push(afterGw)

      if (gw >= lastGw) continue

      const nextPoints = index.gwPointsByRound.get(gw + 1) ?? gwPoints
      const moves = generateTransferMoves(
        afterGw,
        gw,
        snapshot,
        index.byCode,
        index.openingCosts,
        nextPoints,
        opts.maxTransferCandidates,
      )
      for (const move of moves) {
        const nextSquad = applyTransfer(afterGw.squad, move.out, move.in)
        if (!isLegalSquadCodes(nextSquad, index.byCode)) continue
        expanded.push({
          key: `${afterGw.key}|t${gw}:${move.out.code}->${move.in.code}`,
          openingSquad: afterGw.openingSquad,
          openingKey: afterGw.openingKey,
          squad: nextSquad,
          bankTenths: BUDGET_TENTHS - squadSpendTenths(nextSquad),
          freeTransfers: Math.max(0, afterGw.freeTransfers - 1),
          totalPoints: afterGw.totalPoints,
          totalHits: afterGw.totalHits,
          transfers: [...afterGw.transfers, { gw: gw + 1, out: move.out, in: move.in, hit: move.hit }],
        })
      }
    }

    beam = diversifyBeam(dedupeStates(expanded), opts.beamWidth)
    await yieldToUi()
  }

  opts.onProgress?.({ gw: lastGw, lastGw, message: 'Building week plans…' })
  const finished = beam
    .map((state, indexNum) => buildStrategyFromState(state, lastGw, index, indexNum))
    .sort((a, b) => b.totalPoints - a.totalPoints)

  return pickDiverseStrategies(finished, opts.maxStrategies)
}

async function buildOpeningSeeds(
  snapshot: SeasonSnapshot,
  lastGw: number,
  onProgress?: DynamicSearchOptions['onProgress'],
): Promise<HindsightPlayer[][]> {
  const seeds: HindsightPlayer[][] = []
  const seen = new Set<string>()

  const add = (squad: HindsightPlayer[]) => {
    const key = squadKey(squad)
    if (seen.has(key)) return
    seen.add(key)
    seeds.push(squad)
  }

  onProgress?.({ gw: 0, lastGw, message: 'Seeding opening squads…' })
  try {
    add((await solvePerfectGwTeam(snapshot, 1, 'opening')).squad)
  } catch {
    /* ignore */
  }
  await yieldToUi()

  const seedGws = uniquePositive([
    Math.min(3, lastGw),
    Math.min(8, lastGw),
    Math.min(15, lastGw),
    Math.min(25, lastGw),
    lastGw,
  ])
  for (const gw of seedGws) {
    try {
      // Price at opening, points from seed GW — different directions.
      const gwTeam = await solvePerfectGwTeam(snapshot, gw, 'gw-price')
      const openingPool = buildHindsightPool(snapshot, 1, 'opening')
      const byCode = new Map(openingPool.map((player) => [player.code, player]))
      const mapped = gwTeam.squad
        .map((player) => byCode.get(player.code))
        .filter((player): player is HindsightPlayer => player != null)
      if (mapped.length === 15 && isLegalSquadCodes(mapped, byCode)) add(mapped)
      else add(gwTeam.squad.map((player) => ({ ...player, costTenths: byCode.get(player.code)?.costTenths ?? player.costTenths })))
    } catch {
      /* ignore */
    }
    await yieldToUi()
  }

  if (seeds.length === 0) {
    add(buildHindsightPool(snapshot, 1, 'opening').slice(0, 15))
  }
  return seeds.slice(0, 10)
}

function buildStrategyFromState(
  state: SearchState,
  lastGw: number,
  index: SeasonIndex,
  strategyIndex: number,
): DynamicStrategy {
  const weeks: DynamicWeekPlan[] = []
  let squad = [...state.openingSquad]
  let ft = 1
  let totalPoints = 0
  let totalHits = 0
  const transfersBeforeGw = groupTransfers(state.transfers)

  for (let gw = 1; gw <= lastGw; gw += 1) {
    const incoming = transfersBeforeGw.get(gw) ?? []
    let gwHits = 0
    for (const transfer of incoming) {
      squad = applyTransfer(squad, transfer.out, transfer.in)
      if (ft > 0) ft -= 1
      else {
        gwHits += 4
        totalHits += 4
      }
    }
    ft = Math.min(2, ft + 1)

    const gwPoints = index.gwPointsByRound.get(gw) ?? new Map()
    const lineup = bestLineupAcrossFormations(squad, gwPoints)
    const bench = orderBenchByPoints(squad, lineup.xi, gwPoints)
    const enrich = (player: HindsightPlayer) => index.poolByRound.get(gw)?.get(player.code) ?? player
    const gwScore = lineup.points - gwHits
    totalPoints += gwScore

    weeks.push({
      gw,
      squad: squad.map(enrich),
      xi: lineup.xi.map(enrich),
      bench: bench.map(enrich),
      captain: enrich(lineup.captain),
      viceCaptain: enrich(lineup.viceCaptain),
      formation: lineup.formation,
      gwPoints: gwScore,
      transfers: incoming,
      hits: gwHits,
      chips: [],
    })
  }

  const chips = assignHindsightChips(weeks)
  const chipBonus = chips.reduce((sum, row) => sum + row.bonusPoints, 0)
  for (const week of weeks) {
    week.chips = chips.filter((chip) => chip.gw === week.gw)
    week.gwPoints += week.chips.reduce((sum, chip) => sum + chip.bonusPoints, 0)
  }
  totalPoints += chipBonus

  return {
    id: strategyIndex + 1,
    label: strategyIndex === 0 ? 'Highest scoring path' : `Alternative ${strategyIndex + 1}`,
    openingSquad: state.openingSquad,
    weeks,
    totalPoints,
    totalHits,
    chipBonus,
    openingKey: state.openingKey,
    pathKey: pathKey(state.transfers),
  }
}

function assignHindsightChips(weeks: DynamicWeekPlan[]): ChipUse[] {
  const chips: ChipUse[] = []
  if (weeks.length === 0) return chips

  const tcWeek = [...weeks].sort(
    (a, b) => b.captain.gwPoints * 2 - a.captain.gwPoints * 2 || a.gw - b.gw,
  )[0]
  if (tcWeek?.captain.gwPoints > 0) {
    chips.push({ gw: tcWeek.gw, chip: 'triple-captain', bonusPoints: tcWeek.captain.gwPoints * 2 })
  }

  const bbWeek = [...weeks]
    .filter((week) => week.gw !== tcWeek?.gw)
    .sort((a, b) => benchPoints(b.bench) - benchPoints(a.bench) || a.gw - b.gw)[0]
  if (bbWeek && benchPoints(bbWeek.bench) > 0) {
    chips.push({ gw: bbWeek.gw, chip: 'bench-boost', bonusPoints: benchPoints(bbWeek.bench) })
  }
  return chips
}

function benchPoints(bench: readonly HindsightPlayer[]): number {
  return bench.reduce((sum, player) => sum + player.gwPoints, 0)
}

/** Keep top scorers while preserving different opening keys in the beam. */
function diversifyBeam(states: SearchState[], beamWidth: number): SearchState[] {
  const sorted = [...states].sort((a, b) => b.totalPoints - a.totalPoints || a.totalHits - b.totalHits)
  const picked: SearchState[] = []
  const openings = new Set<string>()
  const paths = new Set<string>()

  for (const state of sorted) {
    if (picked.length >= beamWidth) break
    const path = pathKey(state.transfers)
    const openingSeen = openings.has(state.openingKey)
    const pathSeen = paths.has(path)
    if (openingSeen && pathSeen && picked.length >= Math.ceil(beamWidth / 2)) continue
    picked.push(state)
    openings.add(state.openingKey)
    paths.add(path)
  }

  for (const state of sorted) {
    if (picked.length >= beamWidth) break
    if (!picked.includes(state)) picked.push(state)
  }
  return picked
}

function pickDiverseStrategies(strategies: DynamicStrategy[], max: number): DynamicStrategy[] {
  const picked: DynamicStrategy[] = []
  for (const strategy of strategies) {
    if (picked.length >= max) break
    const diverse = picked.every(
      (row) =>
        openingDifference(row, strategy) >= 4 ||
        pathDifference(row, strategy) >= 3 ||
        Math.abs(row.totalPoints - strategy.totalPoints) >= 20,
    )
    if (picked.length === 0 || diverse) {
      picked.push(strategy)
    }
  }
  return picked.map((row, index) => ({
    ...row,
    id: index + 1,
    label:
      index === 0
        ? 'Highest scoring path'
        : `Alternative ${index + 1} · ${openingDifference(picked[0]!, row)} GW0 diffs`,
  }))
}

function openingDifference(a: DynamicStrategy, b: DynamicStrategy): number {
  const aCodes = new Set(a.openingSquad.map((player) => player.code))
  let diff = 0
  for (const player of b.openingSquad) {
    if (!aCodes.has(player.code)) diff += 1
  }
  return diff
}

function pathDifference(a: DynamicStrategy, b: DynamicStrategy): number {
  const aMoves = new Set(a.weeks.flatMap((week) => week.transfers.map((t) => `${t.gw}:${t.out.code}->${t.in.code}`)))
  const bMoves = b.weeks.flatMap((week) => week.transfers.map((t) => `${t.gw}:${t.out.code}->${t.in.code}`))
  let diff = 0
  for (const move of bMoves) {
    if (!aMoves.has(move)) diff += 1
  }
  return diff
}

function groupTransfers(transfers: readonly SeasonTransfer[]): Map<number, SeasonTransfer[]> {
  const map = new Map<number, SeasonTransfer[]>()
  for (const transfer of transfers) {
    const list = map.get(transfer.gw) ?? []
    list.push(transfer)
    map.set(transfer.gw, list)
  }
  return map
}

type TransferMove = { out: HindsightPlayer; in: HindsightPlayer; hit: number }

function generateTransferMoves(
  state: SearchState,
  currentGw: number,
  snapshot: SeasonSnapshot,
  byCode: ReadonlyMap<number, HindsightPlayer>,
  openingCosts: ReadonlyMap<number, number>,
  nextGwPoints: ReadonlyMap<number, number>,
  limit: number,
): TransferMove[] {
  const squadCodes = new Set(state.squad.map((player) => player.code))
  const outs = [...state.squad].sort((a, b) => (nextGwPoints.get(a.code) ?? 0) - (nextGwPoints.get(b.code) ?? 0))
  const ins = [...byCode.values()]
    .filter((player) => !squadCodes.has(player.code))
    .sort((a, b) => (nextGwPoints.get(b.code) ?? 0) - (nextGwPoints.get(a.code) ?? 0))

  const moves: TransferMove[] = []
  for (const out of outs.slice(0, 5)) {
    const outPos = positionPool(out.position)
    for (const candidate of ins) {
      if (positionPool(candidate.position) !== outPos) continue
      if (!canAffordTransfer(state.squad, out, candidate, currentGw, snapshot, openingCosts)) continue
      moves.push({ out, in: candidate, hit: state.freeTransfers > 0 ? 0 : 4 })
      if (moves.length >= limit) return moves
    }
  }
  return moves
}

function canAffordTransfer(
  squad: readonly HindsightPlayer[],
  out: HindsightPlayer,
  inn: HindsightPlayer,
  gw: number,
  snapshot: SeasonSnapshot,
  openingCosts: ReadonlyMap<number, number>,
): boolean {
  const sell = playerValueAtGw(snapshot, out.playerId, gw) || out.costTenths
  const buy = playerValueAtGw(snapshot, inn.playerId, gw + 1) || openingCosts.get(inn.playerId) || inn.costTenths
  return squadSpendTenths(squad) - sell + buy <= BUDGET_TENTHS
}

function applyTransfer(
  squad: readonly HindsightPlayer[],
  out: HindsightPlayer,
  inn: HindsightPlayer,
): HindsightPlayer[] {
  return squad.filter((player) => player.code !== out.code).concat(inn)
}

function dedupeStates(states: SearchState[]): SearchState[] {
  const best = new Map<string, SearchState>()
  for (const state of states) {
    const key = `${state.openingKey}|${squadKey(state.squad)}|${state.freeTransfers}|${pathKey(state.transfers)}`
    const existing = best.get(key)
    if (!existing || state.totalPoints > existing.totalPoints) best.set(key, state)
  }
  return [...best.values()]
}

function squadKey(squad: readonly HindsightPlayer[]): string {
  return squad
    .map((player) => player.code)
    .sort((a, b) => a - b)
    .join(',')
}

function pathKey(transfers: readonly SeasonTransfer[]): string {
  return transfers.map((transfer) => `${transfer.gw}:${transfer.out.code}->${transfer.in.code}`).join('|')
}

function buildSeasonIndex(snapshot: SeasonSnapshot, lastGw: number): SeasonIndex {
  const byCode = new Map<number, HindsightPlayer>()
  const gwPointsByRound = new Map<number, Map<number, number>>()
  const poolByRound = new Map<number, Map<number, HindsightPlayer>>()
  for (let gw = 1; gw <= lastGw; gw += 1) {
    const pool = buildHindsightPool(snapshot, gw, 'gw-price')
    const points = new Map<number, number>()
    const byPlayer = new Map<number, HindsightPlayer>()
    for (const player of pool) {
      points.set(player.code, player.gwPoints)
      byPlayer.set(player.code, player)
      if (!byCode.has(player.code)) byCode.set(player.code, player)
    }
    gwPointsByRound.set(gw, points)
    poolByRound.set(gw, byPlayer)
  }
  return {
    byCode,
    gwPointsByRound,
    poolByRound,
    openingCosts: openingCostByPlayer(snapshot),
  }
}

function uniquePositive(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => value >= 1))].sort((a, b) => a - b)
}

export function squadQuotaDetail(squad: readonly HindsightPlayer[]): string {
  const counts: Record<PositionPool, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const player of squad) counts[positionPool(player.position)] += 1
  return (Object.keys(SQUAD_POSITIONS) as PositionPool[])
    .map((pool) => `${pool} ${counts[pool]}/${SQUAD_POSITIONS[pool]}`)
    .join(' · ')
}

export function strategyWeekSeries(strategy: DynamicStrategy): Array<{ x: number; y: number; label: string; badge?: string }> {
  return strategy.weeks.map((week) => {
    const badge =
      week.chips.length === 0
        ? undefined
        : week.chips.map((chip) => (chip.chip === 'triple-captain' ? 'TC' : chip.chip === 'bench-boost' ? 'BB' : chip.chip)).join('+')
    return {
      x: week.gw,
      y: week.gwPoints,
      label: `GW ${week.gw}`,
      badge,
    }
  })
}

export function weekChipLabel(chips: readonly ChipUse[]): string | null {
  if (chips.length === 0) return null
  return chips
    .map((chip) => {
      if (chip.chip === 'triple-captain') return `Triple Captain (+${chip.bonusPoints})`
      if (chip.chip === 'bench-boost') return `Bench Boost (+${chip.bonusPoints})`
      return chip.chip
    })
    .join(' · ')
}
