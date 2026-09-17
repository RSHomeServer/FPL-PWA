import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { PlayerLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { countByRound } from '../data/fplEventLive'
import { latestPlayedRound, maxRound, teamById } from '../data/queries'
import { formatGbpFromTenths } from '../data/prices'
import { teamRowStyle } from '../data/teamColors'
import type { FplPerformance, FplPlayer, FplTeam } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'

type RoundRow = {
  round: number
  rows: number
  withMinutes: number
  totalPoints: number
}

type SampleRow = {
  player: FplPlayer
  performance: FplPerformance
  team: FplTeam | undefined
}

export function SeasonDataPage() {
  const { snapshot, status, catalog, seasonId, refresh } = useFplData()
  const kind = catalog.find((entry) => entry.seasonId === seasonId)?.kind
  const [sampleGw, setSampleGw] = useState(0)

  const rounds = useMemo(() => (snapshot ? countByRound(snapshot.performances) : []), [snapshot])
  const latest = snapshot ? latestPlayedRound(snapshot.performances) : 0
  const maxGw = snapshot ? maxRound(snapshot.performances, snapshot.fixtures) : 0
  const selectedGw = sampleGw || latest || maxGw || 1

  const roundRows: RoundRow[] = useMemo(() => {
    if (!snapshot) return []
    return rounds.map((row) => {
      const totalPoints = snapshot.performances
        .filter((perf) => perf.round === row.round)
        .reduce((sum, perf) => sum + perf.totalPoints, 0)
      return { ...row, totalPoints }
    })
  }, [rounds, snapshot])

  const teams = useMemo(() => (snapshot ? teamById(snapshot.teams) : new Map()), [snapshot])
  const playersById = useMemo(() => {
    const map = new Map<number, FplPlayer>()
    for (const player of snapshot?.players ?? []) map.set(player.id, player)
    return map
  }, [snapshot])

  const sampleRows: SampleRow[] = useMemo(() => {
    if (!snapshot) return []
    return snapshot.performances
      .filter((row) => row.round === selectedGw && row.minutes > 0)
      .map((performance) => ({
        performance,
        player: playersById.get(performance.playerId),
        team: playersById.get(performance.playerId)
          ? teams.get(playersById.get(performance.playerId)!.teamId)
          : undefined,
      }))
      .filter((row): row is SampleRow => row.player != null)
      .sort((a, b) => b.performance.totalPoints - a.performance.totalPoints)
      .slice(0, 25)
  }, [playersById, selectedGw, snapshot, teams])

  const dataSource =
    snapshot?.meta.dataSource ??
    (kind === 'current' ? 'fpl-api (expected)' : kind === 'historical' ? 'vaastav (expected)' : 'unknown')

  return (
    <ExplorerScreen
      kicker="Season data"
      title="Validate published / live snapshots"
      question="Where did this season’s rows come from, which gameweeks are present, and do sample points look right?"
    >
      <p className="fpl-explorer__meta">
        Historical seasons load from Vaastav CDN. The <strong>current</strong> season loads from the official FPL API
        (bootstrap, fixtures, and per-gameweek <code>/api/event/{'{gw}'}/live/</code> for finished + current GWs). Use
        the season bar Refresh to force a re-pull. Perfect Team and Gameweek explorers read the same Dexie snapshot.
      </p>

      {status === 'loading' ? <p className="fpl-explorer__meta">Loading season data…</p> : null}
      {status === 'error' || !snapshot ? (
        <ExplorerEmpty
          title="No season snapshot"
          description="Pick a season above and wait for load, or hit Refresh."
        />
      ) : (
        <>
          <section className="fpl-perfect-summary">
            <h2 className="fpl-explorer__title">Snapshot meta</h2>
            <ul className="fpl-explorer__meta">
              <li>
                Season <strong>{snapshot.meta.seasonId}</strong> · kind <strong>{snapshot.meta.kind}</strong>
              </li>
              <li>
                Data source <strong>{String(dataSource)}</strong>
              </li>
              <li>
                Revision <strong>{snapshot.meta.sourceRevision}</strong>
              </li>
              <li>
                Fetched <strong>{new Date(snapshot.meta.fetchedAt).toLocaleString()}</strong>
              </li>
              <li>
                Players <strong>{snapshot.players.length}</strong> · teams <strong>{snapshot.teams.length}</strong> ·
                fixtures <strong>{snapshot.fixtures.length}</strong> · performances{' '}
                <strong>{snapshot.performances.length}</strong>
              </li>
              <li>
                Latest played GW <strong>{latest || '—'}</strong> · max GW in data <strong>{maxGw || '—'}</strong>
              </li>
            </ul>
            {snapshot.meta.dataSource === 'fpl-api' ? (
              <p className="fpl-explorer__meta">
                API note: per-GW <code>value</code> is not on event live rows — costs use bootstrap{' '}
                <code>now_cost</code>. Opponent / home / kickoff are joined from fixtures.
              </p>
            ) : null}
            {snapshot.meta.kind === 'current' && snapshot.meta.dataSource !== 'fpl-api' ? (
              <p className="fpl-explorer__meta">
                This current-season cache still looks like an older Vaastav pull.{' '}
                <Button variant="secondary" size="sm" onClick={() => void refresh()}>
                  Refresh from FPL API
                </Button>
              </p>
            ) : null}
          </section>

          <DataTable
            caption="Gameweeks in this snapshot"
            defaultSort={{ id: 'round', direction: 'asc' }}
            rowKey={(row) => row.round}
            columns={[
              {
                id: 'round',
                label: 'GW',
                sortValue: (row) => row.round,
                render: (row) => `GW ${row.round}`,
              },
              {
                id: 'rows',
                label: 'Rows',
                sortValue: (row) => row.rows,
                render: (row) => row.rows,
              },
              {
                id: 'mins',
                label: 'With minutes',
                sortValue: (row) => row.withMinutes,
                render: (row) => row.withMinutes,
              },
              {
                id: 'pts',
                label: 'Sum pts',
                sortValue: (row) => row.totalPoints,
                render: (row) => row.totalPoints,
              },
            ]}
            rows={roundRows}
            empty="No performance rounds yet — Refresh the current season from the FPL API."
          />

          <div className="fpl-explorer__toolbar">
            <Label className="fpl-explorer__field">
              Sample gameweek
              <Select value={String(selectedGw)} onChange={(event) => setSampleGw(Number(event.target.value))}>
                {(rounds.length ? rounds.map((row) => row.round) : [selectedGw]).map((gw) => (
                  <option key={gw} value={gw}>
                    GW {gw}
                  </option>
                ))}
              </Select>
            </Label>
          </div>

          <DataTable
            caption={`Top scorers with minutes — GW${selectedGw}`}
            defaultSort={{ id: 'pts', direction: 'desc' }}
            rowKey={(row) => row.player.id}
            rowStyle={(row) => teamRowStyle(row.team)}
            columns={[
              {
                id: 'who',
                label: 'Player',
                sortValue: (row) => row.player.webName,
                render: (row) => (
                  <PlayerLabel
                    player={{
                      code: row.player.code,
                      webName: row.player.webName,
                      firstName: row.player.firstName,
                      secondName: row.player.secondName,
                    }}
                    name={row.player.webName}
                  />
                ),
              },
              {
                id: 'team',
                label: 'Team',
                sortValue: (row) => row.team?.shortName ?? '',
                render: (row) => row.team?.shortName ?? '—',
              },
              {
                id: 'pos',
                label: 'Pos',
                sortValue: (row) => row.player.position,
                render: (row) => row.player.position,
              },
              {
                id: 'mins',
                label: 'Mins',
                sortValue: (row) => row.performance.minutes,
                render: (row) => row.performance.minutes,
              },
              {
                id: 'pts',
                label: 'Pts',
                sortValue: (row) => row.performance.totalPoints,
                render: (row) => row.performance.totalPoints,
              },
              {
                id: 'cost',
                label: 'Cost',
                sortValue: (row) => row.performance.valueTenths,
                render: (row) => formatGbpFromTenths(row.performance.valueTenths),
              },
              {
                id: 'opp',
                label: 'Opp',
                sortValue: (row) => row.performance.opponentTeamId,
                render: (row) => {
                  const opp = teams.get(row.performance.opponentTeamId)
                  if (!opp) return '—'
                  return `${row.performance.wasHome ? 'H' : 'A'} ${opp.shortName}`
                },
              },
            ]}
            rows={sampleRows}
            empty="No minutes recorded for this gameweek in the snapshot."
          />
        </>
      )}
    </ExplorerScreen>
  )
}
