import { Button } from '@songara/pwa-base/ui'
import { useNavigate } from 'react-router-dom'
import {
  EmptyTable,
  ExplorerEmpty,
  ExplorerScreen,
  FormSlot,
} from './ExplorerScreen'

export function GameweekPage() {
  const navigate = useNavigate()

  return (
    <ExplorerScreen
      kicker="Gameweek"
      title="This gameweek"
      question="What happened this gameweek that should change who you keep, sell, or captain?"
    >
      <ExplorerEmpty
        title="No gameweek events yet"
        description="When published data is wired in, this screen will list returns, blanks, and other events that matter for the next deadline — not a notebook dump."
        action={
          <Button
            variant="secondary"
            onClick={() => navigate('/fixtures', { viewTransition: true })}
          >
            Check fixtures
          </Button>
        }
      />
      <EmptyTable
        caption="Event table (placeholder)"
        columns={['Event', 'Who', 'Decision note']}
      />
      <FormSlot label="Gameweek score trend" />
    </ExplorerScreen>
  )
}
