import { upcomingFixturesForTeam } from '../data/queries'
import { formatGbpFromTenths } from '../data/prices'
import type { FplFixture, FplPerformance, FplPlayer, FplTeam } from '../data/types'
import type { PitchFdrChip, PitchPlayer } from '../components/FplPitch'

export type ElitePitchEnrichment = {
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
  fixtures: readonly FplFixture[]
  performances: readonly FplPerformance[]
  /** How many upcoming fixtures to show (default 4). */
  upcomingLimit?: number
  /** Cap history to recent GWs (default 6). */
  historyLimit?: number
}

/**
 * Attach price, form, recent GW points, and upcoming FDR chips onto a pitch card.
 */
export function enrichElitePitchPlayer(
  base: PitchPlayer,
  elementId: number,
  ctx: ElitePitchEnrichment,
): PitchPlayer {
  const player = ctx.playersById.get(elementId)
  const team = player ? ctx.teamsById.get(player.teamId) : undefined
  const history = playerGwPointHistory(ctx.performances, elementId, ctx.historyLimit ?? 6)
  const fdrChips = team
    ? teamUpcomingFdrChips(ctx.fixtures, ctx.teamsById, team.id, ctx.upcomingLimit ?? 4)
    : []
  const lastPts = history.length ? history[history.length - 1]!.points : null

  return {
    ...base,
    name: player?.webName ?? base.name,
    photoCode: player?.code ?? base.photoCode,
    teamCode: team?.code ?? base.teamCode,
    teamShortName: team?.shortName ?? base.teamShortName,
    position: player?.position ?? base.position,
    costLabel: player ? formatGbpFromTenths(player.nowCostTenths) : base.costLabel,
    formLabel: player != null ? `F ${player.form.toFixed(1)}` : undefined,
    historyLabel: history.length
      ? history.map((row) => `${row.points}`).join('·')
      : undefined,
    historyTitle: history.length
      ? history.map((row) => `GW${row.gw}: ${row.points}`).join(' · ')
      : undefined,
    fdrChips,
    points: lastPts,
    pointsUnscored: base.pointsUnscored,
    scoreLines: [
      ...(player != null ? [`Form ${player.form.toFixed(1)}`] : []),
      ...(history.length
        ? [`Pts ${history.map((row) => `GW${row.gw}:${row.points}`).join(' ')}`]
        : []),
      ...(fdrChips.length
        ? [`FDR ${fdrChips.map((chip) => `${chip.label}${chip.fdr}`).join(' ')}`]
        : ['FDR —']),
    ],
  }
}

export function teamUpcomingFdrChips(
  fixtures: readonly FplFixture[],
  teamsById: Map<number, FplTeam>,
  teamId: number,
  limit = 4,
): PitchFdrChip[] {
  return upcomingFixturesForTeam(fixtures, teamId, limit).map((fixture) => {
    const home = fixture.teamH === teamId
    const oppId = home ? fixture.teamA : fixture.teamH
    const opp = teamsById.get(oppId)
    const fdr = (home ? fixture.teamHDifficulty : fixture.teamADifficulty) ?? 3
    return {
      label: `${opp?.shortName ?? '?'}${home ? 'H' : 'A'}`,
      fdr,
      event: fixture.event,
    }
  })
}

export function playerGwPointHistory(
  performances: readonly FplPerformance[],
  elementId: number,
  limit = 6,
): Array<{ gw: number; points: number }> {
  const byGw = new Map<number, number>()
  for (const row of performances) {
    if (row.playerId !== elementId) continue
    byGw.set(row.round, (byGw.get(row.round) ?? 0) + row.totalPoints)
  }
  return [...byGw.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-limit)
    .map(([gw, points]) => ({ gw, points }))
}

/** Mean FDR across upcoming chips — lower is easier. */
export function meanUpcomingFdr(chips: readonly PitchFdrChip[]): number | null {
  if (chips.length === 0) return null
  return chips.reduce((sum, chip) => sum + chip.fdr, 0) / chips.length
}
