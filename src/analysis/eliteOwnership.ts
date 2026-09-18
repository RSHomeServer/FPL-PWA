import { squadElementSet } from './eliteCluster'
import type { EliteEntryRecord, FplPerformance, FplPlayer } from '../data/types'

export type EliteGwOwnershipRow = {
  elementId: number
  count: number
  /** Ownership across elite sample teams that have a squad for this GW. */
  ownership: number
  sampleSize: number
  xiCount: number
  benchCount: number
  captainCount: number
  /** Share of sample that captained this player. */
  captaincy: number
}

export type EliteGwOwnershipBoard = {
  gw: number
  sampleSize: number
  rows: EliteGwOwnershipRow[]
}

/**
 * Rank players by ownership across elite entries that have a stored squad for `gw`.
 * Pass `topN <= 0` to return every owned player (needed for LP pools).
 */
export function eliteGameweekOwnership(
  entries: readonly EliteEntryRecord[],
  gw: number,
  topN = 30,
): EliteGwOwnershipBoard {
  const squads = entries
    .map((entry) => entry.gameweeks.find((row) => row.gw === gw))
    .filter((squad): squad is NonNullable<typeof squad> => squad != null && squad.xi.length + squad.bench.length >= 11)

  const sampleSize = squads.length
  const counts = new Map<
    number,
    { count: number; xiCount: number; benchCount: number; captainCount: number }
  >()

  for (const squad of squads) {
    const xi = new Set(squad.xi)
    const bench = new Set(squad.bench)
    for (const elementId of squadElementSet(squad)) {
      const cur = counts.get(elementId) ?? { count: 0, xiCount: 0, benchCount: 0, captainCount: 0 }
      cur.count += 1
      if (xi.has(elementId)) cur.xiCount += 1
      if (bench.has(elementId)) cur.benchCount += 1
      if (squad.captainElementId === elementId) cur.captainCount += 1
      counts.set(elementId, cur)
    }
  }

  const n = Math.max(1, sampleSize)
  const rows = [...counts.entries()]
    .map(([elementId, stats]) => ({
      elementId,
      count: stats.count,
      ownership: stats.count / n,
      sampleSize,
      xiCount: stats.xiCount,
      benchCount: stats.benchCount,
      captainCount: stats.captainCount,
      captaincy: stats.captainCount / n,
    }))
    .sort((a, b) => b.ownership - a.ownership || b.captaincy - a.captaincy || a.elementId - b.elementId)

  return {
    gw,
    sampleSize,
    rows: topN > 0 ? rows.slice(0, topN) : rows,
  }
}

/** Sum performance points for a player in a single round (handles multi-fixture blanks). */
export function playerRoundPoints(
  performances: readonly FplPerformance[],
  elementId: number,
  round: number,
): number | null {
  let sum = 0
  let found = false
  for (const row of performances) {
    if (row.playerId === elementId && row.round === round) {
      sum += row.totalPoints
      found = true
    }
  }
  return found ? sum : null
}

export function enrichOwnershipRow(
  row: EliteGwOwnershipRow,
  player: FplPlayer | undefined,
  performances: readonly FplPerformance[],
  gw: number,
): EliteGwOwnershipRow & {
  player: FplPlayer | undefined
  gwPoints: number | null
  prevGwPoints: number | null
} {
  return {
    ...row,
    player,
    gwPoints: playerRoundPoints(performances, row.elementId, gw),
    prevGwPoints: gw > 1 ? playerRoundPoints(performances, row.elementId, gw - 1) : null,
  }
}
