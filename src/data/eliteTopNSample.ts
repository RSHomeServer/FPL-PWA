import {
  clearEliteSample,
  replaceEliteSample,
} from './eliteEntryStore'
import { fetchClassicLeagueTopN, type ClassicLeagueStandingRow } from './fplLeagueSource'
import {
  fetchOfficialJson,
  fetchOfficialLiveSnapshot,
  loadOfficialLiveSnapshot,
  officialApiUrl,
  type FetchLike,
} from './fplLiveSource'
import {
  managerHistoryPath,
  managerPicksPath,
  parseManagerHistory,
  parseManagerPicks,
} from './fplUserSource'
import type {
  EliteEntryRecord,
  EliteGameweekSquad,
  EliteLeagueMembership,
  EliteSampleLeagueMeta,
  EliteSampleMeta,
} from './types'

/** Prefer these system leagues when present on a seed entry (largest publics). */
export const PREFERRED_ELITE_LEAGUE_SHORT_NAMES = ['overall', 'event-1', 'brd-skysports', 'region-241'] as const

export type EliteSampleProgress = {
  phase: 'leagues' | 'standings' | 'squads' | 'persist' | 'done'
  message: string
  leaguesDone: number
  leaguesTotal: number
  entriesDone: number
  entriesTotal: number
}

export type CollectEliteTopNOptions = {
  topN?: number
  leagueCount?: number
  /** Finished GWs to pull picks for. Default: all finished live events. */
  gameweeks?: number[]
  seedEntryId?: number
  concurrency?: number
  fetchImpl?: FetchLike
  onProgress?: (progress: EliteSampleProgress) => void
}

type SeedLeague = {
  leagueId: number
  leagueName: string
  shortName: string | null
  rankCount: number
  leagueType: string
}

/**
 * Collect top N from the largest classic system leagues, merge overlaps, and
 * attach per-GW XI/bench/C/VC/chips. Persists to Dexie.
 */
export async function collectEliteTopNSample(
  options: CollectEliteTopNOptions = {},
): Promise<{ meta: EliteSampleMeta; entries: EliteEntryRecord[]; dictionarySize: number }> {
  const topN = options.topN ?? 200
  const leagueCount = options.leagueCount ?? 4
  const concurrency = Math.max(1, options.concurrency ?? 6)
  const fetchImpl = options.fetchImpl ?? fetch
  const seedEntryId = options.seedEntryId ?? 1

  const report = (partial: Partial<EliteSampleProgress> & Pick<EliteSampleProgress, 'phase' | 'message'>) => {
    options.onProgress?.({
      leaguesDone: 0,
      leaguesTotal: leagueCount,
      entriesDone: 0,
      entriesTotal: 0,
      ...partial,
    })
  }

  report({ phase: 'leagues', message: 'Resolving largest classic leagues…' })
  const live =
    typeof document === 'undefined'
      ? await fetchOfficialLiveSnapshot(fetchImpl)
      : await loadOfficialLiveSnapshot({ fetchImpl, force: false })
  const seasonId = live.meta.seasonId
  const finishedGws =
    options.gameweeks ??
    live.events.filter((event) => event.finished || event.isCurrent).map((event) => event.id).sort((a, b) => a - b)

  const seedLeagues = await loadSeedClassicLeagues(seedEntryId, fetchImpl)
  const selected = pickLargestLeagues(seedLeagues, leagueCount)
  if (selected.length === 0) {
    throw new Error('No classic system leagues found on seed entry to sample')
  }

  const byEntry = new Map<
    number,
    {
      entryName: string
      playerName: string
      totalPoints: number
      leagues: EliteLeagueMembership[]
    }
  >()
  const leagueMetas: EliteSampleLeagueMeta[] = []

  for (let index = 0; index < selected.length; index += 1) {
    const league = selected[index]!
    report({
      phase: 'standings',
      message: `Fetching top ${topN} from ${league.leagueName}…`,
      leaguesDone: index,
      leaguesTotal: selected.length,
    })
    const page = await fetchClassicLeagueTopN(league.leagueId, topN, fetchImpl)
    leagueMetas.push({
      leagueId: league.leagueId,
      leagueName: page.leagueName || league.leagueName,
      rankCount: league.rankCount,
      topN,
      fetchedEntryCount: page.results.length,
    })
    mergeStandings(byEntry, page.leagueId, page.leagueName || league.leagueName, page.results)
  }

  const entryIds = [...byEntry.keys()]
  report({
    phase: 'squads',
    message: `Loading squads for ${entryIds.length} unique entries across GW ${finishedGws.join(', ') || '—'}…`,
    leaguesDone: selected.length,
    leaguesTotal: selected.length,
    entriesDone: 0,
    entriesTotal: entryIds.length,
  })

  const entries: EliteEntryRecord[] = []
  let done = 0
  await mapPool(entryIds, concurrency, async (entryId) => {
    const base = byEntry.get(entryId)!
    try {
      const gameweeks = await loadEntryGameweeks(entryId, finishedGws, fetchImpl)
      entries.push({
        entryId,
        entryName: base.entryName,
        playerName: base.playerName,
        totalPoints: base.totalPoints,
        leagues: [...base.leagues].sort((a, b) => a.leagueId - b.leagueId),
        gameweeks,
        fetchedAt: Date.now(),
      })
    } catch (cause) {
      // Keep standings-only shell so overlap stats remain useful.
      entries.push({
        entryId,
        entryName: base.entryName,
        playerName: base.playerName,
        totalPoints: base.totalPoints,
        leagues: [...base.leagues].sort((a, b) => a.leagueId - b.leagueId),
        gameweeks: [],
        fetchedAt: Date.now(),
      })
      console.warn(`Elite sample: failed squads for entry ${entryId}`, cause)
    }
    done += 1
    if (done % 10 === 0 || done === entryIds.length) {
      report({
        phase: 'squads',
        message: `Loaded ${done}/${entryIds.length} entry squads…`,
        leaguesDone: selected.length,
        leaguesTotal: selected.length,
        entriesDone: done,
        entriesTotal: entryIds.length,
      })
    }
  })

  entries.sort((a, b) => b.totalPoints - a.totalPoints || a.entryId - b.entryId)

  const meta: EliteSampleMeta = {
    id: 'current',
    seasonId,
    topN,
    leagueCount: selected.length,
    uniqueEntries: entries.length,
    gameweeks: finishedGws,
    leagues: leagueMetas,
    fetchedAt: Date.now(),
    status: 'ready',
    errorMessage: null,
  }

  report({
    phase: 'persist',
    message: `Persisting ${entries.length} entries…`,
    leaguesDone: selected.length,
    leaguesTotal: selected.length,
    entriesDone: entryIds.length,
    entriesTotal: entryIds.length,
  })
  await replaceEliteSample(meta, entries)

  report({
    phase: 'done',
    message: `Ready — ${entries.length} unique entries from ${selected.length} leagues`,
    leaguesDone: selected.length,
    leaguesTotal: selected.length,
    entriesDone: entryIds.length,
    entriesTotal: entryIds.length,
  })

  return { meta, entries, dictionarySize: entries.length }
}

export async function resetEliteTopNSample(): Promise<void> {
  await clearEliteSample()
}

export function pickLargestLeagues(leagues: readonly SeedLeague[], count: number): SeedLeague[] {
  const preferredShort = new Set<string>(PREFERRED_ELITE_LEAGUE_SHORT_NAMES)
  const system = leagues.filter((row) => row.leagueType === 's' || (row.shortName != null && preferredShort.has(row.shortName)))
  const preferred = PREFERRED_ELITE_LEAGUE_SHORT_NAMES.map((short) =>
    system.find((row) => row.shortName === short),
  ).filter((row): row is SeedLeague => row != null)
  if (preferred.length >= Math.min(count, PREFERRED_ELITE_LEAGUE_SHORT_NAMES.length)) {
    return preferred.slice(0, count)
  }
  const bySize = [...system].sort((a, b) => b.rankCount - a.rankCount || a.leagueId - b.leagueId)
  const out: SeedLeague[] = []
  const seen = new Set<number>()
  for (const row of [...preferred, ...bySize]) {
    if (seen.has(row.leagueId)) continue
    seen.add(row.leagueId)
    out.push(row)
    if (out.length >= count) break
  }
  return out
}

export function buildGameweekSquadFromPicks(args: {
  gw: number
  picks: Array<{
    elementId: number
    position: number
    isCaptain: boolean
    isViceCaptain: boolean
  }>
  activeChip: string | null
  historyChips: string[]
  points: number | null
  overallRank: number | null
}): EliteGameweekSquad {
  const ordered = [...args.picks].sort((a, b) => a.position - b.position)
  const xi = ordered.filter((row) => row.position >= 1 && row.position <= 11).map((row) => row.elementId)
  const bench = ordered.filter((row) => row.position >= 12 && row.position <= 15).map((row) => row.elementId)
  const captain = ordered.find((row) => row.isCaptain)?.elementId ?? xi[0] ?? 0
  const vice = ordered.find((row) => row.isViceCaptain)?.elementId ?? xi[1] ?? captain
  return {
    gw: args.gw,
    xi,
    bench,
    captainElementId: captain,
    viceCaptainElementId: vice,
    activeChip: args.activeChip,
    historyChips: args.historyChips,
    points: args.points,
    overallRank: args.overallRank,
  }
}

async function loadSeedClassicLeagues(seedEntryId: number, fetchImpl: FetchLike): Promise<SeedLeague[]> {
  const payload = await fetchOfficialJson(officialApiUrl(`/api/entry/${seedEntryId}/`), fetchImpl)
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const leagues = root.leagues && typeof root.leagues === 'object' ? (root.leagues as Record<string, unknown>) : {}
  const classic = Array.isArray(leagues.classic) ? leagues.classic : []
  const out: SeedLeague[] = []
  for (const raw of classic) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const leagueId = Number(row.id)
    if (!Number.isFinite(leagueId) || leagueId <= 0) continue
    out.push({
      leagueId,
      leagueName: String(row.name ?? `League ${leagueId}`),
      shortName: typeof row.short_name === 'string' ? row.short_name : null,
      rankCount: Number(row.rank_count) || 0,
      leagueType: String(row.league_type ?? ''),
    })
  }
  return out
}

function mergeStandings(
  byEntry: Map<
    number,
    {
      entryName: string
      playerName: string
      totalPoints: number
      leagues: EliteLeagueMembership[]
    }
  >,
  leagueId: number,
  leagueName: string,
  rows: readonly ClassicLeagueStandingRow[],
) {
  for (const row of rows) {
    const existing = byEntry.get(row.entryId)
    const membership: EliteLeagueMembership = {
      leagueId,
      leagueName,
      position: row.rank,
    }
    if (!existing) {
      byEntry.set(row.entryId, {
        entryName: row.entryName,
        playerName: row.playerName,
        totalPoints: row.totalPoints,
        leagues: [membership],
      })
      continue
    }
    existing.totalPoints = Math.max(existing.totalPoints, row.totalPoints)
    if (row.entryName) existing.entryName = row.entryName
    if (row.playerName) existing.playerName = row.playerName
    if (!existing.leagues.some((item) => item.leagueId === leagueId)) {
      existing.leagues.push(membership)
    }
  }
}

async function loadEntryGameweeks(
  entryId: number,
  gameweeks: readonly number[],
  fetchImpl: FetchLike,
): Promise<EliteGameweekSquad[]> {
  const historyPayload = await fetchOfficialJson(officialApiUrl(managerHistoryPath(entryId)), fetchImpl)
  const history = parseManagerHistory(historyPayload)
  const historyByGw = new Map(history.current.map((row) => [row.event, row]))
  const chipsByGw = new Map<number, string[]>()
  for (const chip of history.chips) {
    const list = chipsByGw.get(chip.event) ?? []
    list.push(chip.name)
    chipsByGw.set(chip.event, list)
  }

  const squads: EliteGameweekSquad[] = []
  for (const gw of gameweeks) {
    const picksPayload = await fetchOfficialJson(officialApiUrl(managerPicksPath(entryId, gw)), fetchImpl)
    const picks = parseManagerPicks(picksPayload, entryId, gw)
    const hist = historyByGw.get(gw)
    squads.push(
      buildGameweekSquadFromPicks({
        gw,
        picks: picks.picks,
        activeChip: picks.activeChip,
        historyChips: chipsByGw.get(gw) ?? [],
        points: hist?.points ?? picks.entryHistory.points ?? null,
        overallRank: hist?.overallRank ?? null,
      }),
    )
  }
  return squads
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await worker(items[index]!, index)
    }
  })
  await Promise.all(runners)
}
