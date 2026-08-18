import { fetchOfficialLiveSnapshot } from '../data/fplLiveSource'
import { buildGw0OptimiserPool, GW0_PRIOR_SEASON_ID } from './gw0Build'
import { overlapDiffs, type FormationId, DEFAULT_FORMATION } from './gw0Squad'
import { GW0_SOLVER_NOTE, solveBothObjectives } from './gw0Solver'
import { loadSeason, type SeasonCache } from './loadSeason'
import { parseRoleEvidenceSeed, roleEvidenceByCode } from './roleEvidence'
import { renderPhase3Markdown, type Phase3Result } from './phase3Report'

export async function runPhase3(options: {
  cache: SeasonCache
  seedRaw: unknown
  fetchImpl?: typeof fetch
  writeMarkdown: (markdown: string) => void
  now?: Date
  formation?: FormationId
}): Promise<Phase3Result> {
  const now = options.now ?? new Date()
  const formation = options.formation ?? DEFAULT_FORMATION
  const [live, prior] = await Promise.all([
    fetchOfficialLiveSnapshot(options.fetchImpl, now.getTime()),
    loadSeason(GW0_PRIOR_SEASON_ID, options.cache),
  ])
  if (!prior.hasMergedGw) {
    throw new Error(`Vaastav ${GW0_PRIOR_SEASON_ID} merged_gw is required for GW0 priors`)
  }

  const evidenceByCode = roleEvidenceByCode(parseRoleEvidenceSeed(options.seedRaw))
  const pool = buildGw0OptimiserPool(live, prior, evidenceByCode)
  const { shortTerm, longTerm } = await solveBothObjectives(pool.candidates, formation)
  const next = live.events.find((event) => event.isNext) ?? live.events.find((event) => event.id === 1)
  const result: Phase3Result = {
    generatedAt: now.toISOString(),
    priorSeasonId: GW0_PRIOR_SEASON_ID,
    solverNote: GW0_SOLVER_NOTE,
    formation,
    live: {
      seasonId: live.meta.seasonId,
      playerCount: live.players.length,
      teamCount: live.teams.length,
      fixtureCount: live.fixtures.length,
      gw1Fixtures: live.fixtures.filter((fixture) => fixture.event === 1).length,
      nextEventId: live.meta.nextEventId,
      nextEventDeadline: next?.deadlineTime ?? '',
    },
    lpPoolSize: pool.candidates.length,
    funnelCounts: pool.funnel.counts,
    shortTerm,
    longTerm,
    overlap: overlapDiffs(shortTerm.players, longTerm.players),
  }
  options.writeMarkdown(renderPhase3Markdown(result))
  return result
}
