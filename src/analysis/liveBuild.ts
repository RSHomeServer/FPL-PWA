import type { FplLiveSnapshot, ManagerSnapshot, RoleEvidence, SeasonSnapshot } from '../data/types'
import { GW0_PRIOR_SEASON_ID } from './gw0Build'
import { loadedSeasonFromSnapshot, type LoadedSeason } from './loadSeason'
import {
  DEFAULT_LIVE_OPTIONS,
  projectLiveFromSeasons,
  resolveAsOfEvent,
  type LiveOptions,
  type LiveProjection,
} from './liveProject'

export { GW0_PRIOR_SEASON_ID }

export const LIVE_CURRENT_SEASON_ID = '2026-27'

export type LiveProjectionSample = {
  asOfEvent: number
  projected: LiveProjection[]
  sample: LiveProjection[]
  source: 'squad' | 'top'
}

/**
 * Build in-season projections and return either the configured squad slice
 * or the top-N by next-GW EP for a thin debug table.
 */
export function buildLiveProjectionSample(args: {
  live: FplLiveSnapshot
  prior: LoadedSeason | SeasonSnapshot
  current: LoadedSeason | SeasonSnapshot | null
  manager?: ManagerSnapshot | null
  topN?: number
  evidenceByCode?: ReadonlyMap<number, RoleEvidence>
  options?: Partial<LiveOptions>
}): LiveProjectionSample {
  const prior =
    'hasMergedGw' in args.prior ? args.prior : loadedSeasonFromSnapshot(args.prior)
  const current = args.current
    ? 'hasMergedGw' in args.current
      ? args.current
      : loadedSeasonFromSnapshot(args.current)
    : null
  const asOfEvent = resolveAsOfEvent({
    nextEventId: args.live.meta.nextEventId,
    currentEventId: args.manager?.event ?? args.manager?.entry.currentEvent ?? null,
    events: args.live.events,
  })
  const options: LiveOptions = {
    ...DEFAULT_LIVE_OPTIONS,
    ...args.options,
    roleEvidenceByCode: args.evidenceByCode ?? args.options?.roleEvidenceByCode,
  }
  const projected = projectLiveFromSeasons(
    args.live.players,
    args.live.teams,
    args.live.fixtures,
    prior,
    current,
    asOfEvent,
    options,
  )

  const squadIds = new Set(
    (args.manager?.picks.picks ?? []).map((pick) => pick.elementId),
  )
  if (squadIds.size > 0) {
    const sample = projected
      .filter((row) => squadIds.has(row.current.id))
      .sort((a, b) => b.ePtsNext - a.ePtsNext || a.current.webName.localeCompare(b.current.webName))
    return { asOfEvent, projected, sample, source: 'squad' }
  }

  const topN = Math.max(1, args.topN ?? 15)
  const sample = [...projected]
    .filter((row) => row.mFitness > 0)
    .sort((a, b) => b.ePtsNext - a.ePtsNext || a.current.webName.localeCompare(b.current.webName))
    .slice(0, topN)
  return { asOfEvent, projected, sample, source: 'top' }
}
