import { useMemo } from 'react'
import { TeamLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { upcomingFixturesForTeam, teamById, teamName as formatTeam, type SeriesPoint } from '../data/queries'
import type { FplTeam } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function TeamsPage() {
  const { snapshot, status } = useFplData()
  const teams = useMemo(() => snapshot?.teams ?? [], [snapshot])
  const lookup = useMemo(() => teamById(teams), [teams])
  const attackSeries: SeriesPoint[] = teams.map((team, index) => ({
    x: index + 1,
    y: (team.strengthAttackHome + team.strengthAttackAway) / 2 || team.strength,
    label: team.shortName || team.name,
  })).filter((point) => point.y > 0)

  return (
    <ExplorerScreen
      kicker="Teams"
      title="Team comparison"
      question="Which sides look stronger to target or avoid over the next few gameweeks?"
    >
      {status !== 'loading' && teams.length === 0 ? (
        <ExplorerEmpty
          title="No team table yet"
          description="teams.csv was not published for this season and gameweek rows did not yield club names."
        />
      ) : null}

      <DataTable
        caption="Team snapshot"
        defaultSort={{ id: 'attack', direction: 'desc' }}
        columns={[
          {
            id: 'team',
            label: 'Team',
            sortValue: (team) => team.shortName || team.name,
            render: (team) => <TeamLabel team={team} />,
          },
          {
            id: 'attack',
            label: 'Attack',
            sortValue: (team) => (team.strengthAttackHome + team.strengthAttackAway) / 2 || team.strength,
            render: (team) => (team.strengthAttackHome + team.strengthAttackAway) / 2 || team.strength || '—',
          },
          {
            id: 'defence',
            label: 'Defence',
            sortValue: (team) => (team.strengthDefenceHome + team.strengthDefenceAway) / 2,
            render: (team) => (team.strengthDefenceHome + team.strengthDefenceAway) / 2 || '—',
          },
          {
            id: 'next',
            label: 'Next fixtures',
            sortValue: (team) => upcomingFixturesForTeam(snapshot?.fixtures ?? [], team.id).length,
            render: (team) => {
              const next = snapshot
                ? upcomingFixturesForTeam(snapshot.fixtures, team.id)
                    .map((fixture) => {
                      const opp = fixture.teamH === team.id ? fixture.teamA : fixture.teamH
                      const place = fixture.teamH === team.id ? 'H' : 'A'
                      return `${place} ${formatTeam(lookup, opp)}`
                    })
                    .join(', ')
                : ''
              return next || '—'
            },
          },
        ]}
        rows={teams}
        rowKey={(team: FplTeam) => team.id}
        empty="No published teams for this season."
      />
      <FormSlot
        label="Attack strength (home/away mean)"
        data={attackSeries}
        xAxisLabel="Team"
        yAxisLabel="Attack strength"
      />
    </ExplorerScreen>
  )
}
