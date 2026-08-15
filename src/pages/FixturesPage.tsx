import { Button } from '@songara/pwa-base/ui'
import { useNavigate } from 'react-router-dom'
import {
  EmptyTable,
  ExplorerEmpty,
  ExplorerScreen,
} from './ExplorerScreen'

export function FixturesPage() {
  const navigate = useNavigate()

  return (
    <ExplorerScreen
      kicker="Fixtures"
      title="Upcoming fixtures"
      question="Which fixtures make a player or team more (or less) attractive this week?"
    >
      <ExplorerEmpty
        title="No fixture list yet"
        description="Upcoming matches will land with published data. Difficulty and kick-off times are not guessed here."
        action={
          <Button
            variant="secondary"
            onClick={() => navigate('/teams', { viewTransition: true })}
          >
            Team comparison
          </Button>
        }
      />
      <EmptyTable
        caption="Fixture grid (placeholder)"
        columns={['Kick-off', 'Home', 'Away', 'Notes']}
      />
    </ExplorerScreen>
  )
}
