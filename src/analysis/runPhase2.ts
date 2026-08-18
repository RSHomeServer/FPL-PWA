import { fetchOfficialLiveSnapshot } from '../data/fplLiveSource'
import { aggregatePriors, buildBaselines } from './backtest'
import {
  autoFlagged,
  lpPool,
  runGw0Funnel,
} from './gw0Funnel'
import {
  DEFAULT_GW0_OPTIONS,
  joinGw0Pool,
  projectGw0Pool,
} from './gw0Project'
import { loadSeason, type SeasonCache } from './loadSeason'
import { parseRoleEvidenceSeed, roleEvidenceByCode } from './roleEvidence'
import { renderPhase2Markdown, type Phase2Result } from './phase2Report'

const PRIOR_SEASON_ID = '2025-26'

export async function runPhase2(options: {
  cache: SeasonCache
  seedRaw: unknown
  fetchImpl?: typeof fetch
  writeMarkdown: (markdown: string) => void
  now?: Date
}): Promise<Phase2Result> {
  const now = options.now ?? new Date()
  const [live, prior] = await Promise.all([
    fetchOfficialLiveSnapshot(options.fetchImpl, now.getTime()),
    loadSeason(PRIOR_SEASON_ID, options.cache),
  ])
  if (!prior.hasMergedGw) {
    throw new Error(`Vaastav ${PRIOR_SEASON_ID} merged_gw is required for GW0 priors`)
  }

  const joined = joinGw0Pool(live.players, live.teams, prior)
  const baselines = buildBaselines(aggregatePriors(prior))
  const before = projectGw0Pool(joined, live.fixtures, baselines, DEFAULT_GW0_OPTIONS)
  const funnel = runGw0Funnel(before)

  const seedRecords = parseRoleEvidenceSeed(options.seedRaw)
  const evidenceByCode = roleEvidenceByCode(seedRecords)
  const after = projectGw0Pool(joined, live.fixtures, baselines, {
    ...DEFAULT_GW0_OPTIONS,
    roleEvidenceByCode: evidenceByCode,
  })
  const afterByCode = new Map(after.map((row) => [row.code, row]))

  const flagged = autoFlagged(funnel)
  const reviewed = flagged
    .map((row) => {
      const next = afterByCode.get(row.projection.code)
      const seed = seedRecords.find((record) => record.code === row.projection.code) ?? null
      return {
        before: row.projection,
        after: next ?? row.projection,
        seed,
        autoFlagReasons: row.autoFlagReasons,
        lpReasons: row.lpReasons,
      }
    })
    .sort((a, b) => b.after.ePtsGw1 - a.after.ePtsGw1)

  const unreviewed = reviewed.filter((row) => !row.seed)
  const next = live.events.find((event) => event.isNext) ?? live.events.find((event) => event.id === 1)
  const result: Phase2Result = {
    generatedAt: now.toISOString(),
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
    funnel,
    lpCount: lpPool(funnel).length,
    seedCount: seedRecords.length,
    reviewed,
    unreviewedCodes: unreviewed.map((row) => ({
      code: row.before.code,
      webName: row.before.current.webName,
      team: row.before.teamShortName,
    })),
  }
  options.writeMarkdown(renderPhase2Markdown(result))
  return result
}
