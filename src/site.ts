import { defineSite, SITE_CAPABILITY } from '@songara/pwa-base'
import { ComparePage } from './pages/ComparePage'
import { FixturesPage } from './pages/FixturesPage'
import { FlagsReviewPage } from './pages/FlagsReviewPage'
import { GameweekPage } from './pages/GameweekPage'
import { HomePage } from './pages/HomePage'
import { PlayerDetailPage } from './pages/PlayerDetailPage'
import { PlayersPage } from './pages/PlayersPage'
import { TeamsPage } from './pages/TeamsPage'

/** FPL decision-support shell — routes mounted by SoloSiteApp. */
export const fplSite = defineSite({
  id: 'fpl',
  basePath: '/',
  title: 'FPL Decision Support',
  capabilities: [SITE_CAPABILITY.offline, SITE_CAPABILITY.fullBleed],
  routes: [
    { path: '', component: HomePage },
    { path: '/gameweek', component: GameweekPage },
    { path: '/players', component: PlayersPage },
    { path: '/players/:id', component: PlayerDetailPage },
    { path: '/compare', component: ComparePage },
    { path: '/fixtures', component: FixturesPage },
    { path: '/teams', component: TeamsPage },
    { path: '/gw0-flags', component: FlagsReviewPage },
  ],
})
