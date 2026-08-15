import { Button } from '@songara/pwa-base/ui'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFplData } from '../data/fplDataContext'
import { playerDisplayName } from '../data/parse'
import {
  formSparkline,
  performancesForPlayer,
  playerPriceLabel,
  teamById,
  teamName,
} from '../data/queries'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function PlayerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { snapshot, status } = useFplData()
  const playerId = Number.parseInt(id ?? '', 10)
  const player = snapshot?.players.find((row) => row.id === playerId)
  const teams = useMemo(() => teamById(snapshot?.teams ?? []), [snapshot])
  const appearances = snapshot && Number.isFinite(playerId)
    ? performancesForPlayer(snapshot.performances, playerId)
    : []
  const spark = snapshot && Number.isFinite(playerId)
    ? formSparkline(snapshot.performances, playerId)
    : []

  return (
    <ExplorerScreen
      kicker="Player"
      title={player ? playerDisplayName(player) : 'Player detail'}
      question="Is this player still worth the shirt — keep, sell, or captain?"
    >
      {!player && status !== 'loading' ? (
        <ExplorerEmpty
          title="No player record loaded"
          description={`Route slot: ${id ?? 'not selected'}. IDs come from published FPL element numbers, not placeholders.`}
          action={
            <Button variant="secondary" onClick={() => navigate('/players', { viewTransition: true })}>
              Back to players
            </Button>
          }
        />
      ) : null}

      {player ? (
        <p className="fpl-explorer__meta">
          {player.position} · {teamName(teams, player.teamId)} · {playerPriceLabel(player)} ·{' '}
          {player.totalPoints} pts · {player.minutes} min
        </p>
      ) : null}

      <DataTable
        caption="Recent appearances"
        columns={['Gameweek', 'Minutes', 'Returns']}
        rows={appearances.map((row) => [
          `GW ${row.round}`,
          row.minutes,
          `${row.goalsScored}G ${row.assists}A · ${row.totalPoints} pts`,
        ])}
        empty="No published gameweek rows for this player."
      />
      <FormSlot label="Form sparkline" data={spark} />
    </ExplorerScreen>
  )
}
