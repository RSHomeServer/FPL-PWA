import type { FplLiveSnapshot, RoleEvidence } from '../data/types'
import { aggregatePriors, buildBaselines } from './backtest'
import { runGw0Funnel, type Gw0FunnelResult } from './gw0Funnel'
import { DEFAULT_GW0_OPTIONS, joinGw0Pool, projectGw0Pool, type Gw0Projection } from './gw0Project'
import { lpVarName, type LpCandidate } from './gw0Squad'
import type { LoadedSeason } from './loadSeason'

export const GW0_PRIOR_SEASON_ID = '2025-26'

export type Gw0OptimiserPool = {
  projected: Gw0Projection[]
  funnel: Gw0FunnelResult
  candidates: LpCandidate[]
}

/**
 * Funnel membership is the Phase 2 LP pool (quantitative filters on the
 * unreviewed `m_sem = 1` projections). RoleEvidence then overwrites EP for
 * those codes; `m_fitness = 0` stays out.
 */
export function buildGw0OptimiserPool(
  live: FplLiveSnapshot,
  prior: LoadedSeason,
  evidenceByCode?: ReadonlyMap<number, RoleEvidence>,
): Gw0OptimiserPool {
  const joined = joinGw0Pool(live.players, live.teams, prior)
  const baselines = buildBaselines(aggregatePriors(prior))
  const before = projectGw0Pool(joined, live.fixtures, baselines, DEFAULT_GW0_OPTIONS)
  const funnel = runGw0Funnel(before)
  const after = projectGw0Pool(joined, live.fixtures, baselines, {
    ...DEFAULT_GW0_OPTIONS,
    roleEvidenceByCode: evidenceByCode,
  })
  const afterByCode = new Map(after.map((row) => [row.code, row]))
  const candidates: LpCandidate[] = []
  for (const row of funnel.rows) {
    if (!row.inLp) continue
    const projection = afterByCode.get(row.projection.code) ?? row.projection
    if (projection.mFitness <= 0) continue
    candidates.push({ projection, varName: lpVarName(projection.code) })
  }
  return {
    projected: after,
    funnel,
    candidates,
  }
}
