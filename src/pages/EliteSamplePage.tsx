import { Button } from '@songara/pwa-base/ui'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  clusterEliteEntries,
  eliteClusterColor,
  type EliteClusteringResult,
} from '../analysis/eliteCluster'
import {
  eliteGameweekOwnership,
  enrichOwnershipRow,
} from '../analysis/eliteOwnership'
import { PlayerLabel, TeamLabel } from '../components/FplMedia'
import { eliteEntriesToDictionary, readAllEliteEntries, readEliteSampleMeta } from '../data/eliteEntryStore'
import {
  collectEliteTopNSample,
  resetEliteTopNSample,
  type EliteSampleProgress,
} from '../data/eliteTopNSample'
import { useFplData } from '../data/fplDataContext'
import { teamRowStyle } from '../data/teamColors'
import type { EliteEntryRecord, EliteSampleMeta } from '../data/types'
import { ClusterBadge, EliteClusterPanel, EliteEntryPitch } from './EliteClusterPanel'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'

export function EliteSamplePage() {
  const { snapshot } = useFplData()
  const [meta, setMeta] = useState<EliteSampleMeta | null>(null)
  const [entries, setEntries] = useState<EliteEntryRecord[]>([])
  const [progress, setProgress] = useState<EliteSampleProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeGw, setActiveGw] = useState<number | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [dictOpen, setDictOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [nextMeta, nextEntries] = await Promise.all([readEliteSampleMeta(), readAllEliteEntries()])
      if (cancelled) return
      setMeta(nextMeta)
      setEntries(nextEntries)
      if (nextEntries[0]) setSelectedId(nextEntries[0].entryId)
      if (nextMeta?.gameweeks[0]) setActiveGw(nextMeta.gameweeks[0])
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

  const clustering = useMemo(
    () => (entries.length ? clusterEliteEntries(entries, { k: 6, minMembers: 8 }) : emptyClustering()),
    [entries],
  )

  const ownershipBoard = useMemo(() => {
    if (!entries.length || activeGw == null) return null
    return eliteGameweekOwnership(entries, activeGw, 30)
  }, [entries, activeGw])

  const ownershipRows = useMemo(() => {
    if (!ownershipBoard || !snapshot) return []
    return ownershipBoard.rows.map((row, index) => ({
      ...enrichOwnershipRow(row, playersById.get(row.elementId), snapshot.performances, ownershipBoard.gw),
      rank: index + 1,
    }))
  }, [ownershipBoard, playersById, snapshot])

  const selected = entries.find((row) => row.entryId === selectedId) ?? null
  const overlapCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const entry of entries) {
      const n = entry.leagues.length
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0])
  }, [entries])

  const clusterGameweeks = clustering.byGw.map((row) => row.gw)

  function clusterLabel(clusterId: number | undefined, gw: number): string | undefined {
    if (clusterId == null) return undefined
    const cluster = clustering.byGw
      .find((row) => row.gw === gw)
      ?.clusters.find((row) => row.id === clusterId)
    if (!cluster) return undefined
    return cluster.signatureElementIds
      .map((id) => playersById.get(id)?.webName ?? `#${id}`)
      .slice(0, 3)
      .join(' · ')
  }

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
      setActiveGw(result.meta.gameweeks[0] ?? null)
      setMetaOpen(false)
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
      setActiveGw(null)
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
        Leagues default to Overall, Gameweek 1, Sky Sports, and England when present. Clustering uses Jaccard distance
        on 15-man sets (k-medoids, k≈6). Ownership % on cluster cards is within that cluster. Transition ribbons appear
        under the cluster cards (scroll to <a href="#elite-transitions">Transition diagram</a>).
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
        <Collapsible
          title={`Sample data · ${meta.uniqueEntries} entries · GW ${meta.gameweeks.join(', ') || '—'}`}
          open={metaOpen}
          onToggle={() => setMetaOpen((value) => !value)}
        >
          <ul className="fpl-explorer__meta">
            <li>
              Season <strong>{meta.seasonId}</strong> · unique entries <strong>{meta.uniqueEntries}</strong> · topN{' '}
              <strong>{meta.topN}</strong>
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
        </Collapsible>
      ) : null}

      {entries.length === 0 && !busy ? (
        <ExplorerEmpty
          title="No elite sample yet"
          description="Collect top 200 from the largest classic leagues. This takes a few minutes (standings + per-entry picks)."
        />
      ) : null}

      {entries.length > 0 ? (
        <EliteClusterPanel
          entries={entries}
          clustering={clustering}
          playersById={playersById}
          teamsById={teamsById}
          onSelectEntry={setSelectedId}
          activeGw={activeGw}
          onActiveGwChange={setActiveGw}
        />
      ) : null}

      {ownershipBoard && ownershipRows.length > 0 ? (
        <section className="fpl-elite-ownership">
          <h2 className="fpl-explorer__title">Elite ownership · GW{ownershipBoard.gw}</h2>
          <p className="fpl-explorer__meta">
            Top 30 players by ownership across {ownershipBoard.sampleSize} elite sample teams with a stored squad this
            week. Elite % is within this sample (not overall FPL). Official Sel% is bootstrap selected_by_percent.
            GW pts / Prev GW pts come from the season performance snapshot.
          </p>
          <DataTable
            caption={`Top 30 elite ownership · GW${ownershipBoard.gw}`}
            defaultSort={{ id: 'own', direction: 'desc' }}
            rowKey={(row) => row.elementId}
            rowStyle={(row) => teamRowStyle(row.player ? teamsById.get(row.player.teamId) : null)}
            columns={[
              {
                id: 'rank',
                label: '#',
                sortValue: (row) => row.rank,
                render: (row) => row.rank,
              },
              {
                id: 'player',
                label: 'Player',
                sortValue: (row) => row.player?.webName ?? String(row.elementId),
                render: (row) => (
                  <PlayerLabel
                    player={
                      row.player
                        ? {
                            code: row.player.code,
                            webName: row.player.webName,
                            firstName: row.player.firstName,
                            secondName: row.player.secondName,
                          }
                        : undefined
                    }
                    name={row.player?.webName ?? `#${row.elementId}`}
                  />
                ),
              },
              {
                id: 'pos',
                label: 'Pos',
                sortValue: (row) => row.player?.position ?? '',
                render: (row) => row.player?.position ?? '—',
              },
              {
                id: 'team',
                label: 'Team',
                sortValue: (row) => {
                  const team = row.player ? teamsById.get(row.player.teamId) : undefined
                  return team?.shortName ?? ''
                },
                render: (row) => {
                  const team = row.player ? teamsById.get(row.player.teamId) : undefined
                  return <TeamLabel team={team} name={team?.shortName} />
                },
              },
              {
                id: 'own',
                label: 'Elite %',
                sortValue: (row) => row.ownership,
                render: (row) => `${(row.ownership * 100).toFixed(1)}%`,
              },
              {
                id: 'n',
                label: 'Owned',
                sortValue: (row) => row.count,
                render: (row) => `${row.count}/${row.sampleSize}`,
              },
              {
                id: 'xi',
                label: 'XI',
                sortValue: (row) => row.xiCount,
                render: (row) => row.xiCount,
              },
              {
                id: 'cap',
                label: 'Cap %',
                sortValue: (row) => row.captaincy,
                render: (row) => `${(row.captaincy * 100).toFixed(1)}%`,
              },
              {
                id: 'sel',
                label: 'Sel %',
                sortValue: (row) => row.player?.selectedByPercent ?? -1,
                render: (row) =>
                  row.player != null ? `${row.player.selectedByPercent.toFixed(1)}%` : '—',
              },
              {
                id: 'form',
                label: 'Form',
                sortValue: (row) => row.player?.form ?? -1,
                render: (row) => (row.player != null ? row.player.form.toFixed(1) : '—'),
              },
              {
                id: 'total',
                label: 'Total',
                sortValue: (row) => row.player?.totalPoints ?? -1,
                render: (row) => row.player?.totalPoints ?? '—',
              },
              {
                id: 'gwpts',
                label: `GW${ownershipBoard.gw}`,
                sortValue: (row) => row.gwPoints ?? -1,
                render: (row) => row.gwPoints ?? '—',
              },
              {
                id: 'prev',
                label: ownershipBoard.gw > 1 ? `GW${ownershipBoard.gw - 1}` : 'Prev',
                sortValue: (row) => row.prevGwPoints ?? -1,
                render: (row) => row.prevGwPoints ?? '—',
              },
              {
                id: 'price',
                label: 'Price',
                sortValue: (row) => row.player?.nowCostTenths ?? -1,
                render: (row) =>
                  row.player != null ? `£${(row.player.nowCostTenths / 10).toFixed(1)}` : '—',
              },
            ]}
            rows={ownershipRows}
            empty="No ownership rows"
          />
        </section>
      ) : null}

      {entries.length > 0 ? (
        <>
          <DataTable
            caption="Merged elite entries (sorted by total points)"
            defaultSort={{ id: 'pts', direction: 'desc' }}
            rowKey={(row) => row.entryId}
            rowStyle={(row) => entryClusterRowStyle(row, clustering, activeGw)}
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
                render: (row) => (
                  <button type="button" className="fpl-gw0-route-link" onClick={() => setSelectedId(row.entryId)}>
                    {row.entryName}
                  </button>
                ),
              },
              {
                id: 'pts',
                label: 'Pts',
                sortValue: (row) => row.totalPoints,
                render: (row) => row.totalPoints,
              },
              ...clusterGameweeks.map((gw) => ({
                id: `gw${gw}`,
                label: `GW${gw}`,
                sortValue: (row: EliteEntryRecord) =>
                  clustering.byGw.find((g) => g.gw === gw)?.assignment[row.entryId] ?? -1,
                render: (row: EliteEntryRecord) => {
                  const id = clustering.byGw.find((g) => g.gw === gw)?.assignment[row.entryId]
                  return <ClusterBadge clusterId={id} label={clusterLabel(id, gw)} />
                },
              })),
            ]}
            rows={entries.slice(0, 100)}
            empty="No rows"
          />
          <p className="fpl-explorer__meta">
            Showing first 100 of {entries.length}. Click a team to open its pitch below. Row tint follows the selected
            GW cluster colour.
          </p>

          {selected ? (
            <EliteEntryPitch
              key={selected.entryId}
              entry={selected}
              playersById={playersById}
              teamsById={teamsById}
              clustering={clustering}
              initialGw={activeGw}
            />
          ) : null}

          {selected ? (
            <Collapsible
              title={`Dictionary JSON · ${selected.entryName} (${selected.entryId})`}
              open={dictOpen}
              onToggle={() => setDictOpen((value) => !value)}
            >
              <pre className="fpl-elite-dict-preview">{JSON.stringify(dictionary[selected.entryId], null, 2)}</pre>
            </Collapsible>
          ) : null}
        </>
      ) : null}
    </ExplorerScreen>
  )
}

function emptyClustering(): EliteClusteringResult {
  return { byGw: [], transitions: [] }
}

function entryClusterRowStyle(
  entry: EliteEntryRecord,
  clustering: EliteClusteringResult,
  activeGw: number | null,
): CSSProperties | undefined {
  if (activeGw == null) return undefined
  const clusterId = clustering.byGw.find((row) => row.gw === activeGw)?.assignment[entry.entryId]
  if (clusterId == null) return undefined
  return { ['--fpl-team' as string]: eliteClusterColor(clusterId) }
}

function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="fpl-elite-collapse">
      <button type="button" className="fpl-elite-collapse__toggle" onClick={onToggle} aria-expanded={open}>
        <span aria-hidden>{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {open ? <div className="fpl-elite-collapse__body">{children}</div> : null}
    </section>
  )
}
