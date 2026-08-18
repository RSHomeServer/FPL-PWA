import {
  ALPHA_GRID,
  aggregatePriors,
  buildBaselines,
  coreSet,
  DEFAULT_PROJECTION,
  joinTransition,
  K_TRANS_GRID,
  persistenceP90,
  pooledScore,
  projectJoined,
  scoreTransition,
  TARGET_SEASONS,
  unconstrainedTop15Mean,
  type ProjectionOptions,
  type Scorecard,
  type TransitionScore,
} from './backtest'
import {
  fitCleanSheetsByFdr,
  fitGoalsByFdr,
  gwXpPairs,
  invertAttackTable,
  isMonotoneDecreasing,
  isMonotoneIncreasing,
  promotedTeamKeys,
  teamGoalsPerGame,
  type FdrRateTable,
} from './fdr'
import { loadSeason, priorSeasonId, type LoadedSeason, type SeasonCache } from './loadSeason'
import { formatShrinkage, SHRINKAGE_CANDIDATES, type ShrinkageSpec } from './metrics'
import { pearson, rmse, spearman } from './stats'
import { renderValidationMarkdown } from './report'

export type Phase0Result = {
  generatedAt: string
  seasonsLoaded: string[]
  appendix: {
    currentPlayers: number
    currentFixtures: number
    currentGw1Fixtures: number
    xp2024: { r: number; rmse: number; n: number }
    fdrGoals2024: FdrRateTable
  }
  persistence: Array<{
    targetSeason: string
    all: number
    sameClub: number
    transferred: number
    nAll: number
    nSame: number
    nTrans: number
    nUnknown: number
  }>
  teamGpg: Array<{
    targetSeason: string
    remainingR: number
    promotedN: number
  }>
  baseline: TransitionScore[]
  baselinePooled: Scorecard
  unconstrained: Array<{
    targetSeason: string
    projectedTop15Actual: number
    priorPointsTop15Actual: number
  }>
  shrinkage: Array<{ label: string; pooled: Scorecard }>
  kTrans: Array<{ k: number; pooled: Scorecard }>
  approaches: Array<{ label: string; alpha: number; pooled: Scorecard }>
  fdr: {
    goals: FdrRateTable
    cleanSheets: FdrRateTable
    invertedAttack: FdrRateTable
    goalsMonotone: boolean
    csMonotone: boolean
    without: Scorecard
    withAttackCs: Scorecard
    withHomeAway: Scorecard
    withSplitB: Scorecard
    defGkBlends: Array<{ defW: number; gkW: number; pooled: Scorecard }>
  }
  horizon: {
    byGwRmse: number[]
    equalWeightGw16Spearman: number
    gw1OnlyAsGw16Spearman: number
  }
  recommendation: {
    shrinkage: string
    kTrans: number
    alpha: number
    useFdr: boolean
    fdrReason: string
    balancedWeights: string
  }
}

export async function runPhase0(options: {
  cache: SeasonCache
  writeMarkdown?: (markdown: string) => void
}): Promise<Phase0Result> {
  const cache = options.cache

  const needed = new Set<string>(['2024-25', '2026-27'])
  for (const target of TARGET_SEASONS) {
    needed.add(target)
    const prior = priorSeasonId(target)
    if (prior) needed.add(prior)
  }

  const seasons = new Map<string, LoadedSeason>()
  for (const seasonId of [...needed].sort()) {
    try {
      const loaded = await loadSeason(seasonId, cache)
      seasons.set(seasonId, loaded)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`skip ${seasonId}: ${message}`)
    }
  }

  const pairs = usablePairs(seasons)
  if (pairs.length < 4) {
    throw new Error(`Need ≥4 season transitions with merged_gw; got ${pairs.length}`)
  }

  const current = seasons.get('2026-27')
  const s2425 = seasons.get('2024-25')
  if (!current || !s2425) throw new Error('Need 2024-25 and 2026-27 for Appendix A')

  const xpPairs = gwXpPairs(s2425.performances)
  const appendix = {
    currentPlayers: current.players.length,
    currentFixtures: current.fixtures.length,
    currentGw1Fixtures: current.fixtures.filter((row) => row.event === 1).length,
    xp2024: {
      r: pearson(
        xpPairs.map((row) => row.xp),
        xpPairs.map((row) => row.points),
      ),
      rmse: rmse(
        xpPairs.map((row) => row.xp),
        xpPairs.map((row) => row.points),
      ),
      n: xpPairs.length,
    },
    fdrGoals2024: fitGoalsByFdr([s2425]),
  }

  const baselineOpts: ProjectionOptions = { ...DEFAULT_PROJECTION }
  const baseline: TransitionScore[] = []
  const persistence: Phase0Result['persistence'] = []
  const teamGpg: Phase0Result['teamGpg'] = []
  const unconstrained: Phase0Result['unconstrained'] = []

  for (const { prior, next } of pairs) {
    baseline.push(scoreTransition(prior, next, baselineOpts))
    const joined = coreSet(joinTransition(prior, next))
    persistence.push({ targetSeason: next.seasonId, ...persistenceP90(joined) })
    teamGpg.push(gpgPersistence(prior, next))
    const projected = projectJoined(
      joined,
      next,
      buildBaselines(aggregatePriors(prior)),
      baselineOpts,
    )
    unconstrained.push({ targetSeason: next.seasonId, ...unconstrainedTop15Mean(projected) })
  }

  const shrinkage = SHRINKAGE_CANDIDATES.map((spec) => ({
    label: formatShrinkage(spec),
    pooled: poolPairs(pairs, { ...baselineOpts, shrinkage: spec }),
  }))
  const nineHundred = shrinkage.find((row) => row.label === 'linear/900') ?? shrinkage[0]
  const bestShrink = pickLowestRmse(shrinkage)
  const bestShrinkage =
    bestShrink.pooled.rmse < nineHundred.pooled.rmse - 0.02 ? bestShrink : nineHundred

  const kTrans = K_TRANS_GRID.map((k) => ({
    k,
    pooled: poolPairs(pairs, { ...baselineOpts, shrinkage: specFromLabel(bestShrinkage.label), kTrans: k }),
  }))
  const kPlaceholder = kTrans.find((row) => row.k === 0.75) ?? kTrans[0]
  const bestKRow = pickLowestRmse(kTrans.map((row) => ({ label: String(row.k), pooled: row.pooled, k: row.k })))
  const bestK =
    bestKRow.pooled.rmse < kPlaceholder.pooled.rmse - 0.02
      ? bestKRow
      : { label: String(kPlaceholder.k), pooled: kPlaceholder.pooled, k: kPlaceholder.k }

  const fittedShrink = specFromLabel(bestShrinkage.label)
  const fittedK = Number(bestK.label)
  const approaches = ALPHA_GRID.map((alpha) => ({
    label: alpha === 1 ? 'A only' : alpha === 0 ? 'B only' : `blend α=${alpha}`,
    alpha,
    pooled: poolPairs(pairs, {
      ...baselineOpts,
      shrinkage: fittedShrink,
      kTrans: fittedK,
      alpha,
    }),
  }))
  const aOnly = approaches.find((row) => row.alpha === 1) ?? approaches[0]
  const bestBlend = pickLowestRmse(approaches)
  const bestAlpha = bestBlend.pooled.rmse < aOnly.pooled.rmse - 0.02 ? bestBlend : aOnly

  const fitSeasons = pairs.map((pair) => pair.next).filter((season) => season.fixtures.some((row) => row.finished))
  const goals = fitGoalsByFdr(fitSeasons)
  const cleanSheets = fitCleanSheetsByFdr(fitSeasons)
  const invertedAttack = invertAttackTable(goals)

  const afterFit: ProjectionOptions = {
    ...baselineOpts,
    shrinkage: fittedShrink,
    kTrans: fittedK,
    alpha: bestAlpha.alpha,
  }
  const without = poolPairs(pairs, { ...afterFit, useFdr: false })
  const withAttackCs = poolPairs(pairs, {
    ...afterFit,
    useFdr: true,
    attackTable: goals,
    csTable: cleanSheets,
  })
  const withHomeAway = poolPairs(pairs, {
    ...afterFit,
    useFdr: true,
    homeAway: true,
    attackTable: goals,
    csTable: cleanSheets,
  })
  const withSplitB = poolPairs(pairs, {
    ...afterFit,
    useFdr: true,
    splitEvents: true,
    alpha: 0,
    attackTable: goals,
    csTable: cleanSheets,
  })

  const fdrHelps =
    Number.isFinite(withAttackCs.rmse) &&
    Number.isFinite(without.rmse) &&
    (withAttackCs.rmse < without.rmse - 0.02 || withAttackCs.spearman > without.spearman + 0.02)

  const defGkBlends = fdrHelps
    ? [
        {
          defW: 0.5,
          gkW: 0.3,
          pooled: withAttackCs,
        },
        {
          defW: 1,
          gkW: 1,
          pooled: poolPairs(pairs, {
            ...afterFit,
            useFdr: true,
            attackTable: goals,
            csTable: cleanSheets,
            defAttackWeight: 1,
            gkAttackWeight: 1,
          }),
        },
        {
          defW: 0,
          gkW: 0,
          pooled: poolPairs(pairs, {
            ...afterFit,
            useFdr: true,
            attackTable: goals,
            csTable: cleanSheets,
            defAttackWeight: 0,
            gkAttackWeight: 0,
          }),
        },
      ]
    : []

  const horizon = horizonDiagnostics(pairs, {
    ...afterFit,
    useFdr: fdrHelps,
    attackTable: fdrHelps ? goals : null,
    csTable: fdrHelps ? cleanSheets : null,
  })

  const recommendation = {
    shrinkage: bestShrinkage.label,
    kTrans: fittedK,
    alpha: bestAlpha.alpha,
    useFdr: fdrHelps,
    fdrReason: fdrHelps
      ? 'FDR adjustment improved RMSE or Spearman enough to keep.'
      : 'FDR did not improve player-point RMSE / rank correlation; ship factor = 1.',
    balancedWeights:
      horizon.equalWeightGw16Spearman >= horizon.gw1OnlyAsGw16Spearman - 0.01
        ? 'Ship short-term (GW1) and long-term (equal-weight GW1–6 sum) only. No fitted balanced w_g.'
        : 'Equal-weight GW1–6 still recommended; GW1-only is not a better long-term ranker.',
  }

  const result: Phase0Result = {
    generatedAt: new Date().toISOString(),
    seasonsLoaded: [...seasons.keys()],
    appendix,
    persistence,
    teamGpg,
    baseline,
    baselinePooled: pooledScore(baseline),
    unconstrained,
    shrinkage,
    kTrans,
    approaches,
    fdr: {
      goals,
      cleanSheets,
      invertedAttack,
      goalsMonotone: isMonotoneDecreasing(goals),
      csMonotone: isMonotoneDecreasing(cleanSheets) || isMonotoneIncreasing(cleanSheets),
      without,
      withAttackCs,
      withHomeAway,
      withSplitB,
      defGkBlends,
    },
    horizon,
    recommendation,
  }

  if (options.writeMarkdown) {
    options.writeMarkdown(renderValidationMarkdown(result))
  }
  return result
}

function usablePairs(
  seasons: Map<string, LoadedSeason>,
): Array<{ prior: LoadedSeason; next: LoadedSeason }> {
  const pairs: Array<{ prior: LoadedSeason; next: LoadedSeason }> = []
  for (const target of TARGET_SEASONS) {
    const next = seasons.get(target)
    const priorId = priorSeasonId(target)
    const prior = priorId ? seasons.get(priorId) : undefined
    if (!next?.hasMergedGw || !prior?.hasMergedGw) continue
    pairs.push({ prior, next })
  }
  return pairs
}

function poolPairs(pairs: Array<{ prior: LoadedSeason; next: LoadedSeason }>, options: ProjectionOptions): Scorecard {
  return pooledScore(pairs.map((pair) => scoreTransition(pair.prior, pair.next, options)))
}

function pickLowestRmse<T extends { label: string; pooled: Scorecard }>(rows: T[]): T {
  return [...rows].sort((a, b) => a.pooled.rmse - b.pooled.rmse || a.label.localeCompare(b.label))[0]
}

function specFromLabel(label: string): ShrinkageSpec {
  const found = SHRINKAGE_CANDIDATES.find((spec) => formatShrinkage(spec) === label)
  return found ?? { kind: 'linear', minutesRef: 900 }
}

function gpgPersistence(
  prior: LoadedSeason,
  next: LoadedSeason,
): { targetSeason: string; remainingR: number; promotedN: number } {
  const promoted = promotedTeamKeys(prior, next)
  const priorGpg = teamGoalsPerGame(prior)
  const nextGpg = teamGoalsPerGame(next)
  const xs: number[] = []
  const ys: number[] = []
  for (const [code, gpg] of nextGpg) {
    if (promoted.has(code)) continue
    const prev = priorGpg.get(code)
    if (prev == null) continue
    xs.push(prev)
    ys.push(gpg)
  }
  return {
    targetSeason: next.seasonId,
    remainingR: pearson(xs, ys),
    promotedN: promoted.size,
  }
}

function horizonDiagnostics(
  pairs: Array<{ prior: LoadedSeason; next: LoadedSeason }>,
  options: ProjectionOptions,
): Phase0Result['horizon'] {
  const gwPred: number[][] = [[], [], [], [], [], []]
  const gwAct: number[][] = [[], [], [], [], [], []]
  const pred16: number[] = []
  const act16: number[] = []
  const predGw1: number[] = []
  for (const { prior, next } of pairs) {
    const joined = coreSet(joinTransition(prior, next))
    const baselines = buildBaselines(aggregatePriors(prior))
    const projected = projectJoined(joined, next, baselines, options)
    const actualByGw = indexGwPoints(next, 1, 6)
    for (const row of projected) {
      pred16.push(row.predictedGw16)
      act16.push(row.actualGw16Points)
      predGw1.push(row.predictedGw1)
      for (let gw = 1; gw <= 6; gw += 1) {
        gwPred[gw - 1].push(row.predictedByGw[gw - 1] ?? 0)
        gwAct[gw - 1].push(actualByGw.get(`${row.next.id}|${gw}`) ?? 0)
      }
    }
  }
  return {
    byGwRmse: gwPred.map((preds, index) => rmse(preds, gwAct[index])),
    equalWeightGw16Spearman: pred16.length < 2 ? NaN : spearman(pred16, act16),
    gw1OnlyAsGw16Spearman: predGw1.length < 2 ? NaN : spearman(predGw1, act16),
  }
}

function indexGwPoints(season: LoadedSeason, fromGw: number, toGw: number): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of season.performances) {
    if (row.round < fromGw || row.round > toGw) continue
    const key = `${row.playerId}|${row.round}`
    map.set(key, (map.get(key) ?? 0) + row.totalPoints)
  }
  return map
}
