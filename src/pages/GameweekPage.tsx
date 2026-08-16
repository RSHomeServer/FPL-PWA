import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerLabel, TeamLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { gameweekEvents, latestPlayedRound, maxRound, meanPointsSeries } from '../data/queries'
import { teamRowStyle } from '../data/teamColors'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

function metricSort(value: string | number): number | null {
  if (value === 'NA') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function GameweekPage() {
  const navigate = useNavigate()
  const { snapshot, status } = useFplData()
  const max = snapshot ? maxRound(snapshot.performances, snapshot.fixtures) : 0
  const latest = snapshot ? latestPlayedRound(snapshot.performances) : 0
  const [round, setRound] = useState(0)
  const selected = round || latest || max || 1

  const events = useMemo(
    () => (snapshot ? gameweekEvents(snapshot, selected) : []),
    [snapshot, selected],
  )
  const trend = useMemo(
    () => (snapshot ? meanPointsSeries(snapshot.performances) : []),
    [snapshot],
  )

  return (
    <ExplorerScreen
      kicker="Gameweek"
      title="This gameweek"
      question="What happened this gameweek that should change who you keep, sell, or captain?"
    >
      {max > 0 ? (
        <Label className="fpl-explorer__field">
          Gameweek
          <Select value={String(selected)} onChange={(event) => setRound(Number(event.target.value))}>
            {Array.from({ length: max }, (_, index) => index + 1).map((gw) => (
              <option key={gw} value={gw}>
                GW {gw}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}

      {status !== 'loading' && events.length === 0 ? (
        <ExplorerEmpty
          title="No gameweek rows in this snapshot"
          description="Vaastav has not published merged_gw.csv for this season yet. Switch season or refresh after they post a gameweek file."
          action={
            <Button variant="secondary" onClick={() => navigate('/fixtures', { viewTransition: true })}>
              Check fixtures
            </Button>
          }
        />
      ) : null}

      <DataTable
        caption={`GW ${selected} returns (published points)`}
        defaultSort={{ id: 'pts', direction: 'desc' }}
        rowStyle={(row) => teamRowStyle(row.team)}
        columns={[
          {
            id: 'who',
            label: 'Who',
            sortValue: (row) => row.who,
            render: (row) => <PlayerLabel player={row.player} name={row.who} />,
          },
          {
            id: 'team',
            label: 'Team',
            sortValue: (row) => row.team?.shortName ?? row.team?.name ?? '',
            render: (row) => <TeamLabel team={row.team} />,
          },
          {
            id: 'pos',
            label: 'Pos',
            sortValue: (row) => row.position,
            render: (row) => row.position,
          },
          {
            id: 'pts',
            label: 'Pts',
            sortValue: (row) => row.points,
            render: (row) => row.points,
          },
          {
            id: 'event',
            label: 'Event',
            sortValue: (row) => row.points,
            render: (row) => row.event,
          },
          {
            id: 'g',
            label: 'G',
            sortValue: (row) => row.goals,
            render: (row) => row.goals,
          },
          {
            id: 'a',
            label: 'A',
            sortValue: (row) => row.assists,
            render: (row) => row.assists,
          },
          {
            id: 'cs',
            label: 'CS',
            sortValue: (row) => metricSort(row.cleanSheet),
            render: (row) => row.cleanSheet,
          },
          {
            id: 'saves',
            label: 'Saves',
            sortValue: (row) => metricSort(row.saves),
            render: (row) => row.saves,
          },
          {
            id: 'bonus',
            label: 'Bonus',
            sortValue: (row) => row.bonus,
            render: (row) => row.bonus,
          },
          {
            id: 'mins',
            label: 'Mins',
            sortValue: (row) => row.minutes,
            render: (row) => row.minutes,
          },
          {
            id: 'opp',
            label: 'Opp',
            sortValue: (row) => row.opponent?.shortName ?? '',
            render: (row) =>
              `${row.wasHome ? 'H' : 'A'} ${row.opponent?.shortName || row.opponent?.name || '—'}`,
          },
          {
            id: 'gc',
            label: 'GC',
            sortValue: (row) => metricSort(row.goalsConceded),
            render: (row) => row.goalsConceded,
          },
          {
            id: 'xgi',
            label: 'xGI',
            sortValue: (row) => metricSort(row.expectedInvolvement),
            render: (row) => row.expectedInvolvement,
          },
          {
            id: 'xp',
            label: 'xP',
            sortValue: (row) => metricSort(row.expectedPoints),
            render: (row) => row.expectedPoints,
          },
          {
            id: 'dc',
            label: 'DC',
            sortValue: (row) => metricSort(row.defensiveContribution),
            render: (row) => row.defensiveContribution,
          },
          {
            id: 'bps',
            label: 'BPS',
            sortValue: (row) => row.bps,
            render: (row) => row.bps,
          },
        ]}
        rows={events}
        rowKey={(row, index) => `${row.who}-${row.points}-${index}`}
        empty="No published appearances for this gameweek."
      />
      <FormSlot label="Mean points (players with minutes)" data={trend} />
    </ExplorerScreen>
  )
}
