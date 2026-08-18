import type { LiveCacheMeta, SeasonCacheMeta, SeasonCatalogEntry } from './types'

export const CURRENT_SEASON_TTL_MS = 6 * 60 * 60 * 1000
export const CATALOG_TTL_MS = CURRENT_SEASON_TTL_MS

export function currentSeasonId(ids: readonly string[]): string {
  return ids[ids.length - 1] ?? ''
}

export function seasonKind(
  seasonId: string,
  ids: readonly string[],
): SeasonCatalogEntry['kind'] {
  return seasonId === currentSeasonId(ids) ? 'current' : 'historical'
}

export function isSeasonFresh(
  meta: SeasonCacheMeta | undefined,
  now = Date.now(),
): boolean {
  if (!meta) return false
  if (meta.kind === 'historical') return true
  return now - meta.fetchedAt < CURRENT_SEASON_TTL_MS
}

export function isCatalogFresh(
  fetchedAt: number | undefined,
  now = Date.now(),
): boolean {
  if (!fetchedAt) return false
  return now - fetchedAt < CATALOG_TTL_MS
}

/** Official bootstrap/fixtures share the current-season TTL (6h). */
export function isLiveFresh(meta: LiveCacheMeta | undefined, now = Date.now()): boolean {
  if (!meta) return false
  return now - meta.fetchedAt < CURRENT_SEASON_TTL_MS
}
