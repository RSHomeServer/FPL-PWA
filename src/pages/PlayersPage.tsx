import { Label, TextField } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayerLabel, TeamLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { playerDisplayName } from '../data/parse'
import { formSeries, playerPriceLabel, teamById } from '../data/queries'
import { teamRowStyle } from '../data/teamColors'
import type { FplPlayer } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function PlayersPage() {
  const { snapshot, status } = useFplData()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const teams = useMemo(() => teamById(snapshot?.teams ?? []), [snapshot])

  const players = useMemo(() => {
    const list = [...(snapshot?.players ?? [])]
    const needle = query.trim().toLowerCase()
    if (!needle) return list
    return list.filter((player) => {
      const hay = `${playerDisplayName(player)} ${player.firstName} ${player.secondName}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [query, snapshot])

  const selected = players.find((player) => player.id === selectedId) ?? players[0]
  const spark = snapshot && selected ? formSeries(snapshot.performances, selected.id) : []

  return (
    <ExplorerScreen
      kicker="Players"
      title="Who is performing"
      question="Who is in form, and who is cooling off, ahead of this week's transfers?"
    >
      <Label className="fpl-explorer__field">
        Filter
        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search published names"
        />
      </Label>

      {status !== 'loading' && players.length === 0 ? (
        <ExplorerEmpty
          title="No player list yet"
          description="Published players_raw.csv did not yield rows for this season."
        />
      ) : null}

      <DataTable
        caption="Players by season points"
        defaultSort={{ id: 'pts', direction: 'desc' }}
        columns={[
          {
            id: 'player',
            label: 'Player',
            hint: 'Published web name. Click to select; open the name below for the player page.',
            sortValue: (player) => playerDisplayName(player),
            render: (player) => (
              <button
                type="button"
                className="fpl-explorer__row-link"
                onClick={() => setSelectedId(player.id)}
              >
                <PlayerLabel player={player} />
              </button>
            ),
          },
          {
            id: 'pos',
            label: 'Pos',
            hint: 'FPL position from players_raw.csv (GK, DEF, MID, FWD).',
            sortValue: (player) => player.position,
            render: (player) => player.position,
          },
          {
            id: 'team',
            label: 'Team',
            hint: 'Club short name and crest from the published team code.',
            sortValue: (player) => teams.get(player.teamId)?.shortName ?? String(player.teamId),
            render: (player) => <TeamLabel team={teams.get(player.teamId)} />,
          },
          {
            id: 'price',
            label: 'Price',
            hint: 'now_cost from players_raw, in tenths of a million (shown as £m).',
            sortValue: (player) => player.nowCostTenths,
            render: (player) => playerPriceLabel(player),
          },
          {
            id: 'pts',
            label: 'Pts',
            hint: 'Season total_points from the published player file.',
            sortValue: (player) => player.totalPoints,
            render: (player) => player.totalPoints,
          },
          {
            id: 'mins',
            label: 'Mins',
            hint: 'Season minutes from the published player file.',
            sortValue: (player) => player.minutes,
            render: (player) => player.minutes,
          },
        ]}
        rows={players}
        rowKey={(player: FplPlayer) => player.id}
        rowStyle={(player) => teamRowStyle(teams.get(player.teamId))}
        empty="No published players match this filter."
      />
      {selected ? (
        <p className="fpl-explorer__meta">
          Selected:{' '}
          <Link to={`/players/${selected.id}`} viewTransition>
            {playerDisplayName(selected)}
          </Link>
        </p>
      ) : null}
      <FormSlot
        label={selected ? `${playerDisplayName(selected)} form` : 'Selected player form'}
        data={spark}
      />
    </ExplorerScreen>
  )
}
