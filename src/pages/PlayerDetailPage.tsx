import { Button } from '@songara/pwa-base/ui'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlayerLabel, TeamLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { playerDisplayName } from '../data/parse'
import {
  formSeries,
  performancesForPlayer,
  playerPriceLabel,
  teamById,
} from '../data/queries'
import { formatEvent, scoreParts } from '../data/scoring'
import { teamRowStyle } from '../data/teamColors'
import type { FplPerformance } from '../data/types'
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
    ? formSeries(snapshot.performances, playerId)
    : []
  const club = player ? teams.get(player.teamId) : undefined

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
        <p className="fpl-explorer__meta fpl-media-row">
          <PlayerLabel player={player} size={56} />
          <span>
            {player.position} · <TeamLabel team={club} /> · {playerPriceLabel(player)} ·{' '}
            {player.totalPoints} pts · {player.minutes} min
          </span>
        </p>
      ) : null}

      <DataTable
        caption="Recent appearances"
        defaultSort={{ id: 'gw', direction: 'asc' }}
        columns={[
          {
            id: 'gw',
            label: 'Gameweek',
            hint: 'Published round / GW number for this appearance.',
            sortValue: (row) => row.round,
            render: (row) => `GW ${row.round}`,
          },
          {
            id: 'mins',
            label: 'Minutes',
            hint: 'Minutes played. 1–59 scores +1 FPL point; 60+ scores +2.',
            sortValue: (row) => row.minutes,
            render: (row) => row.minutes,
          },
          {
            id: 'returns',
            label: 'Event',
            hint: 'Scoring parts for this appearance. Goals: GK 10, DEF 6, MID 5, FWD 4. Assists +3. Bonus is 1–3 FPL bonus points.',
            sortValue: (row) => row.totalPoints,
            render: (row) =>
              formatEvent(scoreParts(row, player?.position && player.position !== 'UNK' ? player.position : row.gwPosition)),
          },
        ]}
        rows={appearances}
        rowKey={(row: FplPerformance) => `${row.round}-${row.fixture}`}
        rowStyle={() => teamRowStyle(club)}
        empty="No published gameweek rows for this player."
      />
      <FormSlot label="Form by gameweek" data={spark} />
    </ExplorerScreen>
  )
}
