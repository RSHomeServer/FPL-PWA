import { Label, TextField } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFplData } from '../data/fplDataContext'
import { playerDisplayName } from '../data/parse'
import { formSparkline, playerPriceLabel, teamById, teamName } from '../data/queries'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function PlayersPage() {
  const { snapshot, status } = useFplData()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const teams = useMemo(() => teamById(snapshot?.teams ?? []), [snapshot])

  const players = useMemo(() => {
    const list = [...(snapshot?.players ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
    const needle = query.trim().toLowerCase()
    if (!needle) return list
    return list.filter((player) => {
      const hay = `${playerDisplayName(player)} ${player.firstName} ${player.secondName}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [query, snapshot])

  const selected = players.find((player) => player.id === selectedId) ?? players[0]
  const spark = snapshot && selected ? formSparkline(snapshot.performances, selected.id) : []

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
        columns={['Player', 'Pos', 'Team', 'Price', 'Pts', 'Mins']}
        rows={players.slice(0, 80).map((player) => [
          <button
            type="button"
            className="fpl-explorer__row-link"
            onClick={() => setSelectedId(player.id)}
          >
            {playerDisplayName(player)}
          </button>,
          player.position,
          teamName(teams, player.teamId),
          playerPriceLabel(player),
          player.totalPoints,
          player.minutes,
        ])}
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
