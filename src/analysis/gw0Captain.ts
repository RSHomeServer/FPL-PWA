import type { Gw0Projection } from './gw0Project'
import type { OrderedSquad } from './gw0Squad'

/** If the top two XI E[pts GW1] differ by this much or less, surface a toss-up. */
export const CAPTAIN_TOSS_UP_GW1 = 0.2

export const CAPTAIN_HINT =
  'Captaincy is a suggestion from as-of-GW0 expected GW1 points among the XI, not an in-season form model. RMSE is still about 2.7 pts on the underlying EP. The 15-man objective does not double the captain.'

export type CaptainSuggestion = {
  captain: Gw0Projection
  vice: Gw0Projection
  captainDoubledGw1: number
  squadGw1: number
  squadGw1WithCaptain: number
  tossUp: boolean
  tossUpDetail: string | null
}

/**
 * Captain = highest E[pts GW1] in the XI. Vice = second-highest, a different
 * player. Not a second MILP and not folded into the 15-man objective.
 */
export function suggestCaptain(
  xi: readonly Gw0Projection[],
  squad: readonly Gw0Projection[] = xi,
): CaptainSuggestion {
  if (xi.length < 2) {
    throw new Error('Captain suggestion needs at least two XI players (captain and vice)')
  }
  const ranked = [...xi].sort(byGw1Desc)
  const captain = ranked[0]
  if (!captain) {
    throw new Error('Captain suggestion needs two different XI players')
  }
  const vice = ranked.find((player) => player.code !== captain.code)
  if (!vice) {
    throw new Error('Captain suggestion needs two different XI players')
  }
  const squadGw1 = squad.reduce((sum, player) => sum + player.ePtsGw1, 0)
  const gap = captain.ePtsGw1 - vice.ePtsGw1
  const tossUp = gap <= CAPTAIN_TOSS_UP_GW1
  return {
    captain,
    vice,
    captainDoubledGw1: 2 * captain.ePtsGw1,
    squadGw1,
    squadGw1WithCaptain: squadGw1 + captain.ePtsGw1,
    tossUp,
    tossUpDetail: tossUp
      ? `${captain.current.webName} ${captain.ePtsGw1.toFixed(2)} vs ${vice.current.webName} ${vice.ePtsGw1.toFixed(2)} (within ${CAPTAIN_TOSS_UP_GW1} EP)`
      : null,
  }
}

export function suggestCaptainForSquad(squad: OrderedSquad): CaptainSuggestion {
  return suggestCaptain(squad.xi, squad.players)
}

function byGw1Desc(left: Gw0Projection, right: Gw0Projection): number {
  return right.ePtsGw1 - left.ePtsGw1 || left.current.webName.localeCompare(right.current.webName)
}
