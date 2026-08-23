import { aggregatePriors, buildBaselines, DEFAULT_PROJECTION, joinTransition, projectJoined } from './backtest'
import { PHASE0_CS_FDR, PHASE0_GOALS_FDR } from './fdr'
import { loadGw0Highs } from './gw0Solver'
import {
  BUDGET_TENTHS,
  DEFAULT_FORMATION,
  MAX_PER_CLUB,
  SQUAD_POSITIONS,
  type FormationId,
} from './gw0Squad'
import type { LoadedSeason } from './loadSeason'
import { openingPriceTenths, type AnalysisPlayer } from './loadSeason'
import { DEFAULT_SHRINKAGE, positionPool, type PositionPool } from './metrics'
import {
  buildHindsightPool,
  type HindsightPlayer,
} from './perfectTeam'
import type { SeasonSnapshot } from '../data/types'
import { teamById } from '../data/queries'

/** Convert a browser SeasonSnapshot into the analysis LoadedSeason shape. */
export function snapshotToLoadedSeason(snapshot: SeasonSnapshot): LoadedSeason {
  const teams = teamById(snapshot.teams)
  const players: AnalysisPlayer[] = snapshot.players.map((player) => {
    const team = teams.get(player.teamId)
    return {
      ...player,
      costChangeStart: 0,
      teamCode: team?.code ?? 0,
      teamName: team?.name ?? '',
      teamShortName: team?.shortName ?? '',
      status: 'a',
    }
  })
  return {
    seasonId: snapshot.meta.seasonId,
    players,
    teams: [...snapshot.teams],
    fixtures: [...snapshot.fixtures],
    performances: [...snapshot.performances],
    hasMergedGw: snapshot.performances.length > 0,
    startsInferred: snapshot.performances.length > 0 && snapshot.performances.every((row) => row.starts === 0),
  }
}

/**
 * GW0^ short-term opening for a completed season: prior-season rates + target
 * fixtures/opening prices, maximising projected GW1 points under FPL squad rules.
 */
export async function solveHistoricalGw0Opening(
  prior: SeasonSnapshot,
  target: SeasonSnapshot,
  formation: FormationId = DEFAULT_FORMATION,
): Promise<HindsightPlayer[]> {
  const priorLoaded = snapshotToLoadedSeason(prior)
  const targetLoaded = snapshotToLoadedSeason(target)
  const joined = joinTransition(priorLoaded, targetLoaded)
  const projected = projectJoined(joined, targetLoaded, buildBaselines(aggregatePriors(priorLoaded)), {
    ...DEFAULT_PROJECTION,
    shrinkage: DEFAULT_SHRINKAGE,
    kTrans: 0.75,
    useFdr: true,
    attackTable: PHASE0_GOALS_FDR,
    csTable: PHASE0_CS_FDR,
  })

  const openingPool = buildHindsightPool(target, 1, 'opening')
  const byCode = new Map(openingPool.map((player) => [player.code, player]))
  const candidates = projected
    .map((row) => {
      const player = byCode.get(row.code)
      if (!player) return null
      return { player, score: row.predictedGw1 }
    })
    .filter((row): row is { player: HindsightPlayer; score: number } => row != null && row.score > 0)

  if (candidates.length < 15) {
    throw new Error(`Historical GW0 pool too small (${candidates.length})`)
  }

  const highs = await loadGw0Highs()
  const lp = buildProjectedSquadLp(candidates, formation)
  const result = highs.solve(lp, {
    output_flag: false,
    log_to_console: false,
    presolve: 'on',
    time_limit: 45,
    random_seed: 1,
  })
  if (result.Status !== 'Optimal') {
    throw new Error(`HiGHS ${result.Status} for historical GW0 opening`)
  }

  const squad: HindsightPlayer[] = []
  for (const [name, column] of Object.entries(result.Columns)) {
    if ((column.Primal ?? 0) < 0.5 || !name.startsWith('x')) continue
    const code = Number(name.slice(1))
    const player = byCode.get(code)
    if (player) squad.push(player)
  }
  if (squad.length !== 15) {
    throw new Error(`Historical GW0 opening returned ${squad.length} players`)
  }
  return squad
}

function buildProjectedSquadLp(
  candidates: readonly { player: HindsightPlayer; score: number }[],
  formation: FormationId,
): string {
  void formation
  const terms = candidates.map((row) => `${fmt(row.score)} x${row.player.code}`).join(' + ')
  const lines = [
    'Maximize',
    ` obj: ${terms}`,
    'Subject To',
    ` n15: ${candidates.map((row) => `x${row.player.code}`).join(' + ')} = 15`,
    ` budget: ${candidates.map((row) => `${row.player.costTenths} x${row.player.code}`).join(' + ')} <= ${BUDGET_TENTHS}`,
    ...(Object.keys(SQUAD_POSITIONS) as PositionPool[]).map((pool) => {
      const vars = candidates.filter((row) => positionPool(row.player.position) === pool)
      return ` pos_${pool}: ${vars.map((row) => `x${row.player.code}`).join(' + ') || '0'} = ${SQUAD_POSITIONS[pool]}`
    }),
    ...clubConstraints(candidates),
    'Binaries',
    candidates.map((row) => `x${row.player.code}`).join(' '),
    'End',
  ]
  return `${lines.join('\n')}\n`
}

function clubConstraints(candidates: readonly { player: HindsightPlayer; score: number }[]): string[] {
  const byClub = new Map<number, typeof candidates>()
  for (const row of candidates) {
    const list = byClub.get(row.player.teamId) ?? []
    ;(list as { player: HindsightPlayer; score: number }[]).push(row)
    byClub.set(row.player.teamId, list)
  }
  return [...byClub.entries()].map(
    ([teamId, rows]) => ` club_${teamId}: ${rows.map((row) => `x${row.player.code}`).join(' + ')} <= ${MAX_PER_CLUB}`,
  )
}

function fmt(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3)
}

export function openingOverlap(
  model: readonly HindsightPlayer[],
  ideal: readonly HindsightPlayer[],
): { shared: number; onlyModel: HindsightPlayer[]; onlyIdeal: HindsightPlayer[] } {
  const idealCodes = new Set(ideal.map((player) => player.code))
  const modelCodes = new Set(model.map((player) => player.code))
  return {
    shared: model.filter((player) => idealCodes.has(player.code)).length,
    onlyModel: model.filter((player) => !idealCodes.has(player.code)),
    onlyIdeal: ideal.filter((player) => !modelCodes.has(player.code)),
  }
}

/** Prefer opening-price proxy from GW1 values when present. */
export function withOpeningPrices(players: readonly AnalysisPlayer[]): AnalysisPlayer[] {
  return players.map((player) => ({
    ...player,
    nowCostTenths: openingPriceTenths(player),
  }))
}
