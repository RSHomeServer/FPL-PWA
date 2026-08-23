import { NavLink } from 'react-router-dom'
import './ExplorerNav.css'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/gameweek', label: 'Gameweek', end: true },
  { to: '/players', label: 'Players', end: false },
  { to: '/compare', label: 'Compare', end: true },
  { to: '/fixtures', label: 'Fixtures', end: true },
  { to: '/teams', label: 'Teams', end: true },
  { to: '/gw0', label: 'GW0 visuals', end: true },
  { to: '/gw0-data', label: 'GW0 data', end: true },
  { to: '/perfect-team', label: 'Perfect team', end: false },
  { to: '/gw0-flags', label: 'GW0 flags', end: true },
] as const

export function ExplorerNav() {
  return (
    <nav className="explorer-nav" aria-label="Explorers">
      <ul className="explorer-nav__list">
        {LINKS.map(({ to, label, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              viewTransition
              className={({ isActive }) =>
                ['explorer-nav__link', isActive ? 'explorer-nav__link--active' : '']
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
