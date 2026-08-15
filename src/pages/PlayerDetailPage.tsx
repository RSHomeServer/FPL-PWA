import { Button } from '@songara/pwa-base/ui'
import { useNavigate, useParams } from 'react-router-dom'
import {
  EmptyTable,
  ExplorerEmpty,
  ExplorerScreen,
  FormSlot,
} from './ExplorerScreen'

export function PlayerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const slot = id && id !== 'pending' ? id : 'not selected'

  return (
    <ExplorerScreen
      kicker="Player"
      title="Player detail"
      question="Is this player still worth the shirt — keep, sell, or captain?"
    >
      <ExplorerEmpty
        title="No player record loaded"
        description={`Route slot: ${slot}. Stats and prices are not invented here; they arrive with the data ticket.`}
        action={
          <Button
            variant="secondary"
            onClick={() => navigate('/players', { viewTransition: true })}
          >
            Back to players
          </Button>
        }
      />
      <EmptyTable
        caption="Recent appearances (placeholder)"
        columns={['Gameweek', 'Minutes', 'Returns']}
      />
      <FormSlot label="Form sparkline" />
    </ExplorerScreen>
  )
}
