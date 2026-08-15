import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TeamLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { formatKickoff, latestPlayedRound, maxRound, teamById } from '../data/queries'
import type { FplFixture } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'

export function FixturesPage() {
  const navigate = useNavigate()
  const { snapshot, status } = useFplData()
  const max = snapshot ? maxRound(snapshot.performances, snapshot.fixtures) : 0
  const latest = snapshot ? latestPlayedRound(snapshot.performances) : 0
  const [round, setRound] = useState(0)
  const selected = round || Math.min(max, (latest || 0) + 1) || max
  const teams = useMemo(() => teamById(snapshot?.teams ?? []), [snapshot])

  const rows = useMemo(() => {
    if (!snapshot) return []
    return snapshot.fixtures
      .filter((fixture) => (selected ? fixture.event === selected : true))
      .sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime))
  }, [selected, snapshot])

  return (
    <ExplorerScreen
      kicker="Fixtures"
      title="Upcoming fixtures"
      question="Which fixtures make a player or team more (or less) attractive this week?"
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

      {status !== 'loading' && (!snapshot || snapshot.fixtures.length === 0) ? (
        <ExplorerEmpty
          title="No fixture list in this snapshot"
          description="This season folder has no fixtures.csv on the CDN. Older campaigns only have gameweek files."
          action={
            <Button variant="secondary" onClick={() => navigate('/teams', { viewTransition: true })}>
              Team comparison
            </Button>
          }
        />
      ) : null}

      <DataTable
        caption={`Fixture grid${selected ? ` · GW ${selected}` : ''}`}
        defaultSort={{ id: 'kickoff', direction: 'asc' }}
        columns={[
          {
            id: 'kickoff',
            label: 'Kick-off',
            sortValue: (fixture) => fixture.kickoffTime,
            render: (fixture) => formatKickoff(fixture.kickoffTime),
          },
          {
            id: 'home',
            label: 'Home',
            sortValue: (fixture) => teams.get(fixture.teamH)?.shortName ?? String(fixture.teamH),
            render: (fixture) => <TeamLabel team={teams.get(fixture.teamH)} />,
          },
          {
            id: 'away',
            label: 'Away',
            sortValue: (fixture) => teams.get(fixture.teamA)?.shortName ?? String(fixture.teamA),
            render: (fixture) => <TeamLabel team={teams.get(fixture.teamA)} />,
          },
          {
            id: 'notes',
            label: 'Notes',
            sortValue: (fixture) => (fixture.finished ? 1 : 0),
            render: (fixture) =>
              fixture.finished
                ? `${fixture.teamHScore ?? '—'}–${fixture.teamAScore ?? '—'}`
                : `FDR ${fixture.teamHDifficulty ?? '—'} / ${fixture.teamADifficulty ?? '—'}`,
          },
        ]}
        rows={rows}
        rowKey={(fixture: FplFixture) => fixture.id}
        empty="No published fixtures for this gameweek."
      />
    </ExplorerScreen>
  )
}
