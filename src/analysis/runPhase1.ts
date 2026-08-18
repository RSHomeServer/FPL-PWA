import { fetchOfficialLiveSnapshot } from '../data/fplLiveSource'
import { aggregatePriors, buildBaselines } from './backtest'
import { renderPhase1Markdown, type Phase1Result } from './phase1Report'
import {
  DEFAULT_GW0_OPTIONS,
  joinGw0Pool,
  projectGw0Pool,
  type Gw0Projection,
} from './gw0Project'
import { loadSeason, type SeasonCache } from './loadSeason'
import { positionPool, type PositionPool } from './metrics'

const PRIOR_SEASON_ID = '2025-26'

export async function runPhase1(options: {
  cache: SeasonCache
  fetchImpl?: typeof fetch
  writeMarkdown: (markdown: string) => void
  now?: Date
}): Promise<Phase1Result> {
  const [live, prior] = await Promise.all([
    fetchOfficialLiveSnapshot(options.fetchImpl, (options.now ?? new Date()).getTime()),
    loadSeason(PRIOR_SEASON_ID, options.cache),
  ])
  if (!prior.hasMergedGw) {
    throw new Error(`Vaastav ${PRIOR_SEASON_ID} merged_gw is required for GW0 priors`)
  }

  const joined = joinGw0Pool(live.players, live.teams, prior)
  const projected = projectGw0Pool(
    joined,
    live.fixtures,
    buildBaselines(aggregatePriors(prior)),
    DEFAULT_GW0_OPTIONS,
  )
  const next = live.events.find((event) => event.isNext) ?? live.events.find((event) => event.id === 1)
  const result: Phase1Result = {
    generatedAt: (options.now ?? new Date()).toISOString(),
    priorSeasonId: PRIOR_SEASON_ID,
    live: {
      seasonId: live.meta.seasonId,
      playerCount: live.players.length,
      teamCount: live.teams.length,
      fixtureCount: live.fixtures.length,
      gw1Fixtures: live.fixtures.filter((fixture) => fixture.event === 1).length,
      nextEventId: live.meta.nextEventId,
      nextEventDeadline: next?.deadlineTime ?? '',
    },
    pool: {
      n: projected.length,
      withRate: projected.filter((row) => !row.newToPl).length,
      newToPl: projected.filter((row) => row.newToPl).length,
      transferred: projected.filter((row) => row.club === 'transferred').length,
      unknownClub: projected.filter((row) => row.club === 'unknown').length,
      unfit: projected.filter((row) => row.mFitness === 0).length,
    },
    sample: pickSample(projected),
  }
  options.writeMarkdown(renderPhase1Markdown(result))
  return result
}

function pickSample(rows: readonly Gw0Projection[]): Gw0Projection[] {
  const pools: PositionPool[] = ['GK', 'DEF', 'MID', 'FWD']
  const chosen: Gw0Projection[] = []
  const seen = new Set<number>()
  const take = (row: Gw0Projection | undefined) => {
    if (!row || seen.has(row.code)) return
    seen.add(row.code)
    chosen.push(row)
  }

  for (const pool of pools) {
    const group = rows.filter((row) => positionPool(row.position) === pool)
    const available = [...group].filter((row) => row.mFitness > 0).sort((a, b) => b.ePtsGw1 - a.ePtsGw1)
    take(available[0])
    take(available.find((row) => row.club === 'transferred' && !row.newToPl))
    take(group.find((row) => row.newToPl))
    take(group.find((row) => row.mFitness === 0))
  }
  return chosen
}
