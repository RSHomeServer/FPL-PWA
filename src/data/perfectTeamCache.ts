import { getFplCacheDb } from './db'
import type { DynamicStrategy } from '../analysis/perfectSeason'
import type { PerfectGwTeam } from '../analysis/perfectTeam'

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

const DYNAMIC_VERSION = 'v3'
const STATIC_VERSION = 'v2'

export function dynamicCacheId(seasonId: string, sourceRevision: string): string {
  return `dynamic:${DYNAMIC_VERSION}:${seasonId}:${sourceRevision}`
}

export function staticCacheId(seasonId: string, round: number, sourceRevision: string): string {
  return `static:${STATIC_VERSION}:${seasonId}:gw${round}:${sourceRevision}`
}

export async function readDynamicStrategiesCache(
  seasonId: string,
  sourceRevision: string,
): Promise<DynamicStrategy[] | null> {
  const row = await getFplCacheDb().perfectDynamic.get(dynamicCacheId(seasonId, sourceRevision))
  return row?.strategies?.length ? row.strategies : null
}

export async function writeDynamicStrategiesCache(
  seasonId: string,
  sourceRevision: string,
  strategies: DynamicStrategy[],
): Promise<void> {
  await getFplCacheDb().perfectDynamic.put({
    id: dynamicCacheId(seasonId, sourceRevision),
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
): Promise<PerfectGwTeam | null> {
  const row = await getFplCacheDb().perfectStatic.get(staticCacheId(seasonId, round, sourceRevision))
  return row?.team ?? null
}

export async function writeStaticTeamCache(
  seasonId: string,
  round: number,
  sourceRevision: string,
  team: PerfectGwTeam,
): Promise<void> {
  await getFplCacheDb().perfectStatic.put({
    id: staticCacheId(seasonId, round, sourceRevision),
    seasonId,
    round,
    sourceRevision,
    computedAt: Date.now(),
    team,
  })
}
