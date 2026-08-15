import { useMemo } from 'react'
import { useFplData } from '../data/fplDataContext'
import { upcomingFixturesForTeam, teamById, teamName as formatTeam } from '../data/queries'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function TeamsPage() {
  const { snapshot, status } = useFplData()
  const teams = useMemo(() => snapshot?.teams ?? [], [snapshot])
  const lookup = useMemo(() => teamById(teams), [teams])
  const attackSeries = teams.map(
    (team) => (team.strengthAttackHome + team.strengthAttackAway) / 2 || team.strength,
  )

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
        columns={['Team', 'Attack', 'Defence', 'Next fixtures']}
        rows={teams.map((team) => {
          const next = snapshot
            ? upcomingFixturesForTeam(snapshot.fixtures, team.id)
                .map((fixture) => {
                  const opp = fixture.teamH === team.id ? fixture.teamA : fixture.teamH
                  const place = fixture.teamH === team.id ? 'H' : 'A'
                  return `${place} ${formatTeam(lookup, opp)}`
                })
                .join(', ')
            : ''
          return [
            team.shortName || team.name,
            (team.strengthAttackHome + team.strengthAttackAway) / 2 || team.strength || '—',
            (team.strengthDefenceHome + team.strengthDefenceAway) / 2 || '—',
            next || '—',
          ]
        })}
        empty="No published teams for this season."
      />
      <FormSlot label="Attack strength (home/away mean)" data={attackSeries.filter((n) => n > 0)} />
    </ExplorerScreen>
  )
}
