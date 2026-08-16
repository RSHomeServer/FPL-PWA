import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerLabel, TeamLabel } from '../components/FplMedia'
import { GameweekPointsChart } from '../components/GameweekPointsChart'
import { useFplData } from '../data/fplDataContext'
import { filterGameweekRows, gameweekEvents, latestPlayedRound, maxRound } from '../data/queries'
import { formatGbpFromTenths } from '../data/prices'
import { teamRowStyle } from '../data/teamColors'
import type { PlayerPosition } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'

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
  const [teamFilter, setTeamFilter] = useState<'all' | number>('all')
  const [posFilter, setPosFilter] = useState<'all' | PlayerPosition>('all')
  const [minCost, setMinCost] = useState<number | null>(null)
  const [maxCost, setMaxCost] = useState<number | null>(null)
  const selected = round || latest || max || 1

  const events = useMemo(
    () => (snapshot ? gameweekEvents(snapshot, selected) : []),
    [snapshot, selected],
  )

  const teamOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const row of events) {
      if (row.team && !seen.has(row.team.id)) seen.set(row.team.id, row.team.shortName || row.team.name)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [events])

  const costOptions = useMemo(() => {
    const values = [...new Set(events.map((row) => row.costTenths).filter((n) => n > 0))].sort((a, b) => a - b)
    return values
  }, [events])

  const filtered = useMemo(
    () =>
      filterGameweekRows(events, {
        teamId: teamFilter,
        position: posFilter,
        minCostTenths: minCost,
        maxCostTenths: maxCost,
      }),
    [events, maxCost, minCost, posFilter, teamFilter],
  )

  function changeRound(next: number) {
    setRound(next)
    setTeamFilter('all')
    setPosFilter('all')
    setMinCost(null)
    setMaxCost(null)
  }

  return (
    <ExplorerScreen
      kicker="Gameweek"
      title="This gameweek"
      question="What happened this gameweek that should change who you keep, sell, or captain?"
    >
      {max > 0 ? (
        <div className="fpl-explorer__toolbar">
          <Label className="fpl-explorer__field">
            Gameweek
            <Select value={String(selected)} onChange={(event) => changeRound(Number(event.target.value))}>
              {Array.from({ length: max }, (_, index) => index + 1).map((gw) => (
                <option key={gw} value={gw}>
                  GW {gw}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="fpl-explorer__field">
            Team
            <Select
              value={teamFilter === 'all' ? 'all' : String(teamFilter)}
              onChange={(event) =>
                setTeamFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
              }
            >
              <option value="all">All teams</option>
              {teamOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="fpl-explorer__field">
            Position
            <Select
              value={posFilter}
              onChange={(event) => setPosFilter(event.target.value as 'all' | PlayerPosition)}
            >
              <option value="all">All positions</option>
              <option value="GK">GK</option>
              <option value="DEF">DEF</option>
              <option value="MID">MID</option>
              <option value="FWD">FWD</option>
            </Select>
          </Label>
          <Label className="fpl-explorer__field">
            Min cost
            <Select
              value={minCost == null ? 'all' : String(minCost)}
              onChange={(event) =>
                setMinCost(event.target.value === 'all' ? null : Number(event.target.value))
              }
            >
              <option value="all">Any</option>
              {costOptions.map((tenths) => (
                <option key={`min-${tenths}`} value={tenths}>
                  {formatGbpFromTenths(tenths)}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="fpl-explorer__field">
            Max cost
            <Select
              value={maxCost == null ? 'all' : String(maxCost)}
              onChange={(event) =>
                setMaxCost(event.target.value === 'all' ? null : Number(event.target.value))
              }
            >
              <option value="all">Any</option>
              {costOptions.map((tenths) => (
                <option key={`max-${tenths}`} value={tenths}>
                  {formatGbpFromTenths(tenths)}
                </option>
              ))}
            </Select>
          </Label>
          <p className="fpl-explorer__meta">
            {filtered.length} of {events.length} players
          </p>
        </div>
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
            hint: 'Published FPL web name for this gameweek appearance.',
            sortValue: (row) => row.who,
            render: (row) => <PlayerLabel player={row.player} name={row.who} />,
          },
          {
            id: 'team',
            label: 'Team',
            hint: 'The player’s club this season, from vaastav teams.csv.',
            sortValue: (row) => row.team?.shortName ?? row.team?.name ?? '',
            render: (row) => <TeamLabel team={row.team} />,
          },
          {
            id: 'pos',
            label: 'Pos',
            hint: 'FPL position: GK, DEF, MID, or FWD. This sets goal, clean-sheet, save, and defensive-contribution scoring.',
            sortValue: (row) => row.position,
            render: (row) => row.position,
          },
          {
            id: 'cost',
            label: 'Cost',
            hint: 'Price in this gameweek from vaastav `value` (tenths of a million, e.g. 85 = £8.5m). This is the GW snapshot, not players_raw now_cost, so it moves with transfers.',
            sortValue: (row) => row.costTenths,
            render: (row) => (row.costTenths ? formatGbpFromTenths(row.costTenths) : '—'),
          },
          {
            id: 'pts',
            label: 'Pts',
            hint: 'Published FPL total_points for this gameweek. Event should add up to this figure.',
            sortValue: (row) => row.points,
            render: (row) => row.points,
          },
          {
            id: 'event',
            label: 'Event',
            hint: 'Scoring parts that changed the total. Goals: GK 10, DEF 6, MID 5, FWD 4. Assists 3. Playing 60+ minutes is +2, 1–59 is +1. Clean sheet: GK/DEF +4, MID +1. Saves: +1 per 3 (GK). Bonus is the 1–3 FPL bonus points, not BPS. Zero categories are omitted. “other” is any leftover vs published points.',
            sortValue: (row) => row.points,
            render: (row) => row.event,
          },
          {
            id: 'mins',
            label: 'Mins',
            hint: 'Minutes played this gameweek. 1–59 minutes scores +1; 60 or more scores +2. Those appearance points are the 60+ / <60 term in Event.',
            sortValue: (row) => row.minutes,
            render: (row) => row.minutes,
          },
          {
            id: 'g',
            label: 'G',
            hint: 'Goals scored. FPL points: GK 10, DEF 6, MID 5, FWD 4 each.',
            sortValue: (row) => row.goals,
            render: (row) => row.goals,
          },
          {
            id: 'a',
            label: 'A',
            hint: 'Assists. Each assist is +3 FPL points, any position.',
            sortValue: (row) => row.assists,
            render: (row) => row.assists,
          },
          {
            id: 'cs',
            label: 'CS',
            hint: 'Clean sheet flag (1 or 0). Points only if they played 60+ minutes: +4 GK/DEF, +1 MID. Forwards do not score for clean sheets (NA).',
            sortValue: (row) => metricSort(row.cleanSheet),
            render: (row) => row.cleanSheet,
          },
          {
            id: 'saves',
            label: 'Saves',
            hint: 'Goalkeeper saves. +1 FPL point per three saves. NA for outfield players.',
            sortValue: (row) => metricSort(row.saves),
            render: (row) => row.saves,
          },
          {
            id: 'bonus',
            label: 'Bonus',
            hint: 'FPL bonus points awarded (0–3). The three highest BPS scores in the match get 3, 2, and 1. This is not the raw BPS value.',
            sortValue: (row) => row.bonus,
            render: (row) => row.bonus,
          },
          {
            id: 'opp',
            label: 'Opp',
            hint: 'Home (H) or away (A) and the opponent’s short name.',
            sortValue: (row) => row.opponent?.shortName ?? '',
            render: (row) =>
              `${row.wasHome ? 'H' : 'A'} ${row.opponent?.shortName || row.opponent?.name || '—'}`,
          },
          {
            id: 'gc',
            label: 'GC',
            hint: 'Goals conceded. GK and DEF lose 1 point per two conceded. NA for MID/FWD.',
            sortValue: (row) => metricSort(row.goalsConceded),
            render: (row) => row.goalsConceded,
          },
          {
            id: 'xgi',
            label: 'xGI',
            hint: 'Expected goal involvements from FPL/Opta: expected_goals + expected_assists for this match. It is a shot-quality measure, not FPL points.',
            sortValue: (row) => metricSort(row.expectedInvolvement),
            render: (row) => row.expectedInvolvement,
          },
          {
            id: 'xp',
            label: 'xP',
            hint: 'Expected points copied from FPL (vaastav xP). FPL’s own pre-match model (ep_this), not a public formula from xG.',
            sortValue: (row) => metricSort(row.expectedPoints),
            render: (row) => row.expectedPoints,
          },
          {
            id: 'dc',
            label: 'DC',
            hint: 'Defensive contribution count (2025-26). +2 FPL points when DEF reach 10 CBI, or MID/FWD reach 12 CBIT. NA for GK and older seasons.',
            sortValue: (row) => metricSort(row.defensiveContribution),
            render: (row) => row.defensiveContribution,
          },
          {
            id: 'bps',
            label: 'BPS',
            hint: 'Bonus Point System raw score. The three highest BPS in the fixture receive Bonus 3/2/1. This column is the raw score, not the bonus points.',
            sortValue: (row) => row.bps,
            render: (row) => row.bps,
          },
        ]}
        rows={filtered}
        rowKey={(row, index) => `${row.who}-${row.points}-${index}`}
        empty="No published appearances match these filters."
      />
      <GameweekPointsChart round={selected} rows={filtered} />
    </ExplorerScreen>
  )
}
