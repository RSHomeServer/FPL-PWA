import { positionPool, type PositionPool } from './metrics'
import type { PlayerPosition } from '../data/types'

/** Official `ep_next` is a reference column, never the LP objective. */
export const EP_NEXT_DISCLAIMER =
  'FPL ep_next is a reference column from the official API, not the projection objective and not what the optimiser maximises.'

export const DEFAULT_DISAGREEMENT_LIMIT = 8

export type EpNextComparable = {
  ePtsGw1: number
  epNext: number | null
}

export type EpNextSummary = {
  n: number
  ourGw1: number
  ourGw1Compared: number
  epNextSum: number
  compared: number
  missing: number
  delta: number | null
}

export type EpNextDisagreement = {
  code: number
  webName: string
  teamShortName: string
  position: PositionPool
  ePtsGw1: number
  epNext: number
  delta: number
  absDelta: number
}

/** E[pts GW1] − official ep_next. Null when ep_next is missing. */
export function epNextDelta(ePtsGw1: number, epNext: number | null | undefined): number | null {
  if (epNext == null || !Number.isFinite(epNext) || !Number.isFinite(ePtsGw1)) return null
  return ePtsGw1 - epNext
}

export function summariseEpNext(players: readonly EpNextComparable[]): EpNextSummary {
  let ourGw1 = 0
  let ourGw1Compared = 0
  let epNextSum = 0
  let compared = 0
  let missing = 0
  for (const player of players) {
    ourGw1 += player.ePtsGw1
    if (player.epNext == null || !Number.isFinite(player.epNext)) {
      missing += 1
      continue
    }
    ourGw1Compared += player.ePtsGw1
    epNextSum += player.epNext
    compared += 1
  }
  return {
    n: players.length,
    ourGw1,
    ourGw1Compared,
    epNextSum,
    compared,
    missing,
    delta: compared === 0 ? null : ourGw1Compared - epNextSum,
  }
}

export function largestEpNextDisagreements(
  players: ReadonlyArray<{
    code: number
    current: { webName: string }
    teamShortName: string
    position: PlayerPosition
    ePtsGw1: number
    epNext: number | null
  }>,
  limit = DEFAULT_DISAGREEMENT_LIMIT,
): EpNextDisagreement[] {
  const cap = Math.max(0, limit)
  const rows: EpNextDisagreement[] = []
  for (const player of players) {
    const delta = epNextDelta(player.ePtsGw1, player.epNext)
    if (delta == null || player.epNext == null) continue
    rows.push({
      code: player.code,
      webName: player.current.webName,
      teamShortName: player.teamShortName,
      position: positionPool(player.position),
      ePtsGw1: player.ePtsGw1,
      epNext: player.epNext,
      delta,
      absDelta: Math.abs(delta),
    })
  }
  rows.sort((a, b) => b.absDelta - a.absDelta || a.webName.localeCompare(b.webName) || a.code - b.code)
  return rows.slice(0, cap)
}

export function formatSigned(value: number, digits = 2): string {
  const body = Math.abs(value).toFixed(digits)
  if (value > 0) return `+${body}`
  if (value < 0) return `-${body}`
  return body
}
