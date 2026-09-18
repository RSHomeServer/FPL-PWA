import { getFplCacheDb } from './db'
import type { DynamicStrategy } from '../analysis/perfectSeason'
import type { PerfectGwTeam, PerfectTeamCostMode, PerfectTeamObjective } from '../analysis/perfectTeam'

export type PerfectDynamicCacheRecord = {
  id: string
  seasonId: string
  sourceRevision: string
  computedAt: number
  strategies: DynamicStrategy[]
}

export type PerfectStaticCacheRecord = {
  id: string
  seasonId: string
  round: number
  sourceRevision: string
  computedAt: number
  team: PerfectGwTeam
}

export type PerfectCacheOptionFlags = {
  useChips?: boolean
  lockedCodes?: readonly number[]
  excludedCodes?: readonly number[]
  costMode?: PerfectTeamCostMode
  objective?: PerfectTeamObjective
}

const DYNAMIC_VERSION = 'v4'
const STATIC_VERSION = 'v4'

export function optionsFingerprint(flags: PerfectCacheOptionFlags = {}): string {
  const chips = flags.useChips ? 'chips' : 'nochips'
  const cost = flags.costMode ?? 'gw-price'
  const objective = flags.objective ?? 'gw-points'
  const locks = uniqueSorted(flags.lockedCodes).join(',')
  const excl = uniqueSorted(flags.excludedCodes).join(',')
  return `${chips}:${cost}:${objective}:L${locks}:X${excl}`
}

export function dynamicCacheId(
  seasonId: string,
  sourceRevision: string,
  flags: PerfectCacheOptionFlags = {},
): string {
  return `dynamic:${DYNAMIC_VERSION}:${seasonId}:${sourceRevision}:${optionsFingerprint(flags)}`
}

export function staticCacheId(
  seasonId: string,
  round: number,
  sourceRevision: string,
  flags: PerfectCacheOptionFlags = {},
): string {
  return `static:${STATIC_VERSION}:${seasonId}:gw${round}:${sourceRevision}:${optionsFingerprint({
    ...flags,
    useChips: false,
  })}`
}

export async function readDynamicStrategiesCache(
  seasonId: string,
  sourceRevision: string,
  flags: PerfectCacheOptionFlags = {},
): Promise<DynamicStrategy[] | null> {
  const row = await getFplCacheDb().perfectDynamic.get(dynamicCacheId(seasonId, sourceRevision, flags))
  return row?.strategies?.length ? row.strategies : null
}

export async function writeDynamicStrategiesCache(
  seasonId: string,
  sourceRevision: string,
  strategies: DynamicStrategy[],
  flags: PerfectCacheOptionFlags = {},
): Promise<void> {
  await getFplCacheDb().perfectDynamic.put({
    id: dynamicCacheId(seasonId, sourceRevision, flags),
    seasonId,
    sourceRevision,
    computedAt: Date.now(),
    strategies,
  })
}

export async function readStaticTeamCache(
  seasonId: string,
  round: number,
  sourceRevision: string,
  flags: PerfectCacheOptionFlags = {},
): Promise<PerfectGwTeam | null> {
  const row = await getFplCacheDb().perfectStatic.get(staticCacheId(seasonId, round, sourceRevision, flags))
  return row?.team ?? null
}

export async function writeStaticTeamCache(
  seasonId: string,
  round: number,
  sourceRevision: string,
  team: PerfectGwTeam,
  flags: PerfectCacheOptionFlags = {},
): Promise<void> {
  await getFplCacheDb().perfectStatic.put({
    id: staticCacheId(seasonId, round, sourceRevision, flags),
    seasonId,
    round,
    sourceRevision,
    computedAt: Date.now(),
    team,
  })
}

function uniqueSorted(codes: readonly number[] | undefined): number[] {
  return [...new Set((codes ?? []).filter((code) => Number.isInteger(code) && code > 0))].sort((a, b) => a - b)
}
