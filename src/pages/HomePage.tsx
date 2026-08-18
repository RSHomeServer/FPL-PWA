import { Button, Stack } from '@songara/pwa-base/ui'
import { useNavigate } from 'react-router-dom'
import { ExplorerNav } from '../components/ExplorerNav'
import './HomePage.css'

const EXPLORERS = [
  { to: '/gameweek', label: 'This gameweek', hint: 'What just happened?' },
  { to: '/players', label: 'Players', hint: 'Who is in form?' },
  { to: '/compare', label: 'Compare', hint: 'Which of these two?' },
  { to: '/fixtures', label: 'Fixtures', hint: 'What is coming?' },
  { to: '/teams', label: 'Teams', hint: 'Who to target?' },
  { to: '/gw0', label: 'GW0 squads', hint: 'Two legal starting 15s' },
  { to: '/gw0-flags', label: 'GW0 flags', hint: 'Review minutes enums' },
] as const

/**
 * Product home for the installable FPL shell.
 * Live numbers come from the vaastav data layer on explorer routes.
 */
export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="fpl-home">
      <div className="fpl-home__atmosphere" aria-hidden="true">
        <div className="fpl-home__pitch" />
      </div>

      <ExplorerNav />

      <section className="fpl-home__hero" aria-labelledby="fpl-brand">
        <p className="fpl-home__kicker">Installable PWA</p>
        <h1 className="fpl-home__brand" id="fpl-brand">
          FPL Decision Support
        </h1>
        <p className="fpl-home__lead">
          Weekly Fantasy Premier League decisions — who to consider, who to
          captain, keep versus sell — with the reasoning, not only the ranks.
        </p>
        <p className="fpl-home__note">
          Explorers load published history from the vaastav dataset (via CDN).
          Switch season on any explorer; refresh pulls new gameweeks after they
          are published. Nothing here is invented stats.
        </p>
        <div className="fpl-home__cta">
          <Stack direction="row" gap="sm">
            <Button
              variant="primary"
              onClick={() => navigate('/gameweek', { viewTransition: true })}
            >
              This gameweek
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/players', { viewTransition: true })}
            >
              Players
            </Button>
          </Stack>
        </div>
        <ul className="fpl-home__links">
          {EXPLORERS.map(({ to, label, hint }) => (
            <li key={to}>
              <button
                type="button"
                className="fpl-home__link"
                onClick={() => navigate(to, { viewTransition: true })}
              >
                <span className="fpl-home__link-label">{label}</span>
                <span className="fpl-home__link-hint">{hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
