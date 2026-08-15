import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFplData } from '../data/fplDataContext'
import { gameweekEvents, latestPlayedRound, maxRound, meanPointsByRound } from '../data/queries'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function GameweekPage() {
  const navigate = useNavigate()
  const { snapshot, status } = useFplData()
  const max = snapshot ? maxRound(snapshot.performances, snapshot.fixtures) : 0
  const latest = snapshot ? latestPlayedRound(snapshot.performances) : 0
  const [round, setRound] = useState(0)
  const selected = round || latest || max || 1

  const events = useMemo(
    () => (snapshot ? gameweekEvents(snapshot, selected).slice(0, 40) : []),
    [snapshot, selected],
  )
  const trend = useMemo(
    () => (snapshot ? meanPointsByRound(snapshot.performances) : []),
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
        columns={['Who', 'Event', 'Decision note']}
        rows={events.map((row) => [row.who, row.event, row.note])}
        empty="No published appearances for this gameweek."
      />
      <FormSlot label="Mean points (players with minutes)" data={trend} />
    </ExplorerScreen>
  )
}
