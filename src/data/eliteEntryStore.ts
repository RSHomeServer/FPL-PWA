import { getFplCacheDb } from './db'
import type { EliteEntryRecord, EliteSampleMeta } from './types'

export async function readEliteSampleMeta(): Promise<EliteSampleMeta | null> {
  return (await getFplCacheDb().eliteSampleMeta.get('current')) ?? null
}

export async function readAllEliteEntries(): Promise<EliteEntryRecord[]> {
  return getFplCacheDb().eliteEntries.toArray()
}

export async function readEliteEntry(entryId: number): Promise<EliteEntryRecord | null> {
  return (await getFplCacheDb().eliteEntries.get(entryId)) ?? null
}

export async function replaceEliteSample(
  meta: EliteSampleMeta,
  entries: readonly EliteEntryRecord[],
): Promise<void> {
  const db = getFplCacheDb()
  await db.transaction('rw', db.eliteSampleMeta, db.eliteEntries, async () => {
    await db.eliteEntries.clear()
    await db.eliteSampleMeta.put(meta)
    if (entries.length) await db.eliteEntries.bulkPut([...entries])
  })
}

export async function clearEliteSample(): Promise<void> {
  const db = getFplCacheDb()
  await db.transaction('rw', db.eliteSampleMeta, db.eliteEntries, async () => {
    await db.eliteEntries.clear()
    await db.eliteSampleMeta.delete('current')
  })
}

/** Flatten to the dictionary shape discussed for feature construction. */
export function eliteEntriesToDictionary(
  entries: readonly EliteEntryRecord[],
): Record<
  number,
  {
    teamId: number
    totalPoints: number
    leagues: Array<[number, string, number]>
    gameweeks: Record<
      number,
      {
        xi: number[]
        bench: number[]
        captain: number
        viceCaptain: number
        activeChip: string | null
        historyChips: string[]
      }
    >
  }
> {
  const out: ReturnType<typeof eliteEntriesToDictionary> = {}
  for (const entry of entries) {
    const gameweeks: (typeof out)[number]['gameweeks'] = {}
    for (const gw of entry.gameweeks) {
      gameweeks[gw.gw] = {
        xi: [...gw.xi],
        bench: [...gw.bench],
        captain: gw.captainElementId,
        viceCaptain: gw.viceCaptainElementId,
        activeChip: gw.activeChip,
        historyChips: [...gw.historyChips],
      }
    }
    out[entry.entryId] = {
      teamId: entry.entryId,
      totalPoints: entry.totalPoints,
      leagues: entry.leagues.map((row) => [row.leagueId, row.leagueName, row.position]),
      gameweeks,
    }
  }
  return out
}
