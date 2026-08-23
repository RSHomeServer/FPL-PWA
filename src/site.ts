import { defineSite, SITE_CAPABILITY } from '@songara/pwa-base'
import { ComparePage } from './pages/ComparePage'
import { FixturesPage } from './pages/FixturesPage'
import { FlagsReviewPage } from './pages/FlagsReviewPage'
import { GameweekPage } from './pages/GameweekPage'
import { Gw0SquadPage, Gw0VisualPage } from './pages/Gw0SquadPage'
import { HomePage } from './pages/HomePage'
import { PlayerDetailPage } from './pages/PlayerDetailPage'
import { PerfectTeamPage } from './pages/PerfectTeamPage'
import { PlayersPage } from './pages/PlayersPage'
import { TeamsPage } from './pages/TeamsPage'
import { TeamSettingsPage } from './pages/TeamSettingsPage'

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
    { path: '/team/settings', component: TeamSettingsPage },
    { path: '/gw0', component: Gw0VisualPage },
    { path: '/gw0-data', component: Gw0SquadPage },
    { path: '/gw0-flags', component: FlagsReviewPage },
    { path: '/perfect-team/dynamic', component: PerfectTeamPage },
    { path: '/perfect-team', component: PerfectTeamPage },
  ],
})
