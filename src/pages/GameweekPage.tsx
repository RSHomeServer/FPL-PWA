import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { gameweekEvents, latestPlayedRound, maxRound, meanPointsSeries } from '../data/queries'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function GameweekPage() {
  const navigate = useNavigate()
  const { snapshot, status } = useFplData()
  const max = snapshot ? maxRound(snapshot.performances, snapshot.fixtures) : 0
  const latest = snapshot ? latestPlayedRound(snapshot.performances) : 0
  const [round, setRound] = useState(0)
  const selected = round || latest || max || 1

  const events = useMemo(
    () => (snapshot ? gameweekEvents(snapshot, selected).slice(0, 80) : []),
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
        columns={[
          {
            id: 'who',
            label: 'Who',
            sortValue: (row) => row.who,
            render: (row) => <PlayerLabel player={row.player} name={row.who} />,
          },
          {
            id: 'event',
            label: 'Event',
            sortValue: (row) => row.event,
            render: (row) => row.event,
          },
          {
            id: 'pts',
            label: 'Pts',
            sortValue: (row) => row.points,
            render: (row) => row.points,
          },
          {
            id: 'note',
            label: 'Decision note',
            sortValue: (row) => row.minutes,
            render: (row) => row.note,
          },
        ]}
        rows={events}
        rowKey={(row, index) => `${row.who}-${row.event}-${index}`}
        empty="No published appearances for this gameweek."
      />
      <FormSlot label="Mean points (players with minutes)" data={trend} />
    </ExplorerScreen>
  )
}
