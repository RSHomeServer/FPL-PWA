import { defineSite, SITE_CAPABILITY } from '@songara/pwa-base'
import { HomePage } from './pages/HomePage'

/** FPL decision-support shell — routes mounted by SoloSiteApp. */
export const fplSite = defineSite({
  id: 'fpl',
  basePath: '/',
  title: 'FPL Decision Support',
  capabilities: [SITE_CAPABILITY.offline, SITE_CAPABILITY.fullBleed],
  routes: [{ path: '', component: HomePage }],
})
