import { Button } from '@songara/pwa-base/ui'
import { useNavigate } from 'react-router-dom'
import {
  EmptyTable,
  ExplorerEmpty,
  ExplorerScreen,
  FormSlot,
} from './ExplorerScreen'

export function PlayersPage() {
  const navigate = useNavigate()

  return (
    <ExplorerScreen
      kicker="Players"
      title="Who is performing"
      question="Who is in form, and who is cooling off, ahead of this week's transfers?"
    >
      <ExplorerEmpty
        title="No player list yet"
        description="A later ticket will bind published player files here. Detail pages live at /players/:id — open the placeholder route to confirm routing."
        action={
          <Button
            variant="secondary"
            onClick={() => navigate('/players/pending', { viewTransition: true })}
          >
            Open player detail
          </Button>
        }
      />
      <EmptyTable
        caption="Form list (placeholder)"
        columns={['Player', 'Recent form', 'Minutes']}
      />
      <FormSlot label="Selected player form" />
    </ExplorerScreen>
  )
}
