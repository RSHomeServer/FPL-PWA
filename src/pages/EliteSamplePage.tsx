import { Button } from '@songara/pwa-base/ui'
import { useEffect, useMemo, useState } from 'react'
import { eliteEntriesToDictionary, readAllEliteEntries, readEliteSampleMeta } from '../data/eliteEntryStore'
import {
  collectEliteTopNSample,
  resetEliteTopNSample,
  type EliteSampleProgress,
} from '../data/eliteTopNSample'
import { useFplData } from '../data/fplDataContext'
import type { EliteEntryRecord, EliteSampleMeta } from '../data/types'
import { EliteClusterPanel } from './EliteClusterPanel'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'

export function EliteSamplePage() {
  const { snapshot } = useFplData()
  const [meta, setMeta] = useState<EliteSampleMeta | null>(null)
  const [entries, setEntries] = useState<EliteEntryRecord[]>([])
  const [progress, setProgress] = useState<EliteSampleProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [nextMeta, nextEntries] = await Promise.all([readEliteSampleMeta(), readAllEliteEntries()])
      if (cancelled) return
      setMeta(nextMeta)
      setEntries(nextEntries)
      if (nextEntries[0]) setSelectedId(nextEntries[0].entryId)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const dictionary = useMemo(() => eliteEntriesToDictionary(entries), [entries])
  const playersById = useMemo(() => {
    const map = new Map((snapshot?.players ?? []).map((player) => [player.id, player]))
    return map
  }, [snapshot])
  const teamsById = useMemo(() => {
    const map = new Map((snapshot?.teams ?? []).map((team) => [team.id, team]))
    return map
  }, [snapshot])
  const selected = entries.find((row) => row.entryId === selectedId) ?? entries[0] ?? null
  const overlapCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const entry of entries) {
      const n = entry.leagues.length
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0])
  }, [entries])

  async function runCollect() {
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const result = await collectEliteTopNSample({
        topN: 200,
        leagueCount: 4,
        concurrency: 6,
        onProgress: setProgress,
      })
      setMeta(result.meta)
      setEntries(result.entries)
      setSelectedId(result.entries[0]?.entryId ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Elite sample collection failed')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function runClear() {
    setBusy(true)
    try {
      await resetEliteTopNSample()
      setMeta(null)
      setEntries([])
      setSelectedId(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ExplorerScreen
      kicker="Elite sample"
      title="Top-N league clusters"
      question="Pull the top 200 from the largest classic leagues, then cluster 15-man squads each gameweek and inspect transitions."
    >
      <p className="fpl-explorer__meta">
        Leagues default to Overall, Gameweek 1, Sky Sports, and England when present. Each unique team stores total
        points, league memberships, and per-GW XI / bench / captain / vice / chips. Clustering uses Jaccard distance on
        those 15-man sets (k-medoids, k≈6).
      </p>

      <div className="fpl-explorer__toolbar">
        <Button variant="primary" disabled={busy} onClick={() => void runCollect()}>
          {busy ? 'Collecting…' : entries.length ? 'Refresh top-200 sample' : 'Collect top-200 sample'}
        </Button>
        <Button variant="secondary" disabled={busy || entries.length === 0} onClick={() => void runClear()}>
          Clear cache
        </Button>
      </div>

      {progress ? <p className="fpl-explorer__meta">{progress.message}</p> : null}
      {error ? <ExplorerEmpty title="Collection failed" description={error} /> : null}

      {meta ? (
        <section className="fpl-perfect-summary">
          <h2 className="fpl-explorer__title">Sample meta</h2>
          <ul className="fpl-explorer__meta">
            <li>
              Season <strong>{meta.seasonId}</strong> · unique entries <strong>{meta.uniqueEntries}</strong> · topN{' '}
              <strong>{meta.topN}</strong>
            </li>
            <li>
              Gameweeks stored: <strong>{meta.gameweeks.join(', ') || '—'}</strong>
            </li>
            <li>
              Fetched <strong>{new Date(meta.fetchedAt).toLocaleString()}</strong>
            </li>
            <li>
              Dictionary keys: <strong>{Object.keys(dictionary).length}</strong>
            </li>
          </ul>
          <ul className="fpl-explorer__meta">
            {meta.leagues.map((league) => (
              <li key={league.leagueId}>
                {league.leagueName} ({league.leagueId}) · rank_count {league.rankCount ?? '—'} · fetched{' '}
                {league.fetchedEntryCount}
              </li>
            ))}
          </ul>
          <p className="fpl-explorer__meta">
            Overlap depth:{' '}
            {overlapCounts.map(([depth, count]) => `${count} in ${depth} league(s)`).join(' · ') || '—'}
          </p>
        </section>
      ) : null}

      {entries.length === 0 && !busy ? (
        <ExplorerEmpty
          title="No elite sample yet"
          description="Collect top 200 from the largest classic leagues. This takes a few minutes (standings + per-entry picks)."
        />
      ) : null}

      {entries.length > 0 ? (
        <EliteClusterPanel entries={entries} playersById={playersById} teamsById={teamsById} />
      ) : null}

      {entries.length > 0 ? (
        <>
          <DataTable
            caption="Merged elite entries (sorted by total points)"
            defaultSort={{ id: 'pts', direction: 'desc' }}
            rowKey={(row) => row.entryId}
            columns={[
              {
                id: 'id',
                label: 'Team ID',
                sortValue: (row) => row.entryId,
                render: (row) => (
                  <button type="button" className="fpl-gw0-route-link" onClick={() => setSelectedId(row.entryId)}>
                    {row.entryId}
                  </button>
                ),
              },
              {
                id: 'name',
                label: 'Team',
                sortValue: (row) => row.entryName,
                render: (row) => row.entryName,
              },
              {
                id: 'pts',
                label: 'Pts',
                sortValue: (row) => row.totalPoints,
                render: (row) => row.totalPoints,
              },
              {
                id: 'leagues',
                label: 'Leagues',
                sortValue: (row) => row.leagues.length,
                render: (row) =>
                  row.leagues.map((league) => `${league.leagueName}#${league.position}`).join(' · '),
              },
              {
                id: 'gws',
                label: 'GWs stored',
                sortValue: (row) => row.gameweeks.length,
                render: (row) => row.gameweeks.length,
              },
            ]}
            rows={entries.slice(0, 100)}
            empty="No rows"
          />
          <p className="fpl-explorer__meta">Showing first 100 of {entries.length} for the table.</p>

          {selected ? (
            <section className="fpl-perfect-summary">
              <h2 className="fpl-explorer__title">
                Dictionary preview · {selected.entryName} ({selected.entryId})
              </h2>
              <pre className="fpl-elite-dict-preview">{JSON.stringify(dictionary[selected.entryId], null, 2)}</pre>
            </section>
          ) : null}
        </>
      ) : null}
    </ExplorerScreen>
  )
}
