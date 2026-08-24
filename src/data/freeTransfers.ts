/**
 * Free-transfer and hit derivation (discovery §7.2–§7.4).
 *
 * v1 banking rule: unused FT banks as `min(FT + 1, 2)` after each completed GW
 * (classic pre-wildcard bank cap of 2). The bootstrap field
 * `max_extra_free_transfers = 4` applies to special / chip periods and is **not**
 * used as the v1 bank cap — document in `notes` so callers know which rule applies.
 */

import type {
  FreeTransferState,
  ManagerChipPlay,
  ManagerHistoryGameweek,
} from './types'

/** FT available at the start of GW1. */
export const GW1_STARTING_FT = 1

/** Classic banked-FT cap used by v1 (not API `max_extra_free_transfers`). */
export const FREE_TRANSFER_BANK_CAP_V1 = 2

/** API `max_extra_free_transfers` — documented only; unused by v1 banking. */
export const MAX_EXTRA_FREE_TRANSFERS_API = 4

export const HIT_COST_PER_TRANSFER = 4

const WILDCARD_CHIP = 'wildcard'
const FREE_HIT_CHIP = 'freehit'

export type DeriveFreeTransfersArgs = {
  historyCurrent: readonly ManagerHistoryGameweek[]
  chips?: readonly ManagerChipPlay[]
  currentEvent: number
  eventTransfers: number
  activeChip: string | null
}

/**
 * After a completed GW with `ftAvailable` free transfers and `transfersMade` moves,
 * return FT available at the start of the next GW.
 */
export function bankedFreeTransfersAfterGameweek(
  ftAvailable: number,
  transfersMade: number,
  bankCap = FREE_TRANSFER_BANK_CAP_V1,
): number {
  const unused = Math.max(0, ftAvailable - transfersMade)
  return Math.min(unused + 1, bankCap)
}

function normalizeChip(chip: string | null | undefined): string | null {
  if (!chip) return null
  return chip.trim().toLowerCase()
}

function chipPlayedInEvent(
  chips: readonly ManagerChipPlay[] | undefined,
  event: number,
): string | null {
  if (!chips?.length) return null
  for (const row of chips) {
    if (row.event === event) return normalizeChip(row.name)
  }
  return null
}

/**
 * Walk completed gameweeks before `currentEvent` to derive FT available now.
 * Wildcard in a completed GW resets the next GW to 1 FT (unlimited during that GW).
 */
export function freeTransfersAtEventStart(
  historyCurrent: readonly ManagerHistoryGameweek[],
  currentEvent: number,
  chips?: readonly ManagerChipPlay[],
): number {
  let ft = GW1_STARTING_FT
  if (currentEvent <= 1) return ft

  const byEvent = new Map(historyCurrent.map((row) => [row.event, row]))

  for (let gw = 1; gw < currentEvent; gw++) {
    const chip = chipPlayedInEvent(chips, gw)
    if (chip === WILDCARD_CHIP) {
      // Unlimited during WC week; next GW starts with the standard 1 FT.
      ft = GW1_STARTING_FT
      continue
    }
    const transfersMade = byEvent.get(gw)?.eventTransfers ?? 0
    ft = bankedFreeTransfersAfterGameweek(ft, transfersMade)
  }

  return ft
}

export function deriveFreeTransfers(args: DeriveFreeTransfersArgs): FreeTransferState {
  const notes: string[] = [
    `v1 FT bank cap is ${FREE_TRANSFER_BANK_CAP_V1} (classic). API max_extra_free_transfers=${MAX_EXTRA_FREE_TRANSFERS_API} is not applied.`,
  ]

  const freeTransfers = freeTransfersAtEventStart(
    args.historyCurrent,
    args.currentEvent,
    args.chips,
  )
  const chip = normalizeChip(args.activeChip)
  const eventTransfers = Math.max(0, args.eventTransfers)

  let hits = Math.max(0, eventTransfers - freeTransfers)
  let hitCost = hits * HIT_COST_PER_TRANSFER

  if (chip === WILDCARD_CHIP) {
    hits = 0
    hitCost = 0
    notes.push('Wildcard active: unlimited free transfers; hits ignored.')
  } else if (chip === FREE_HIT_CHIP) {
    notes.push('Free Hit active: surfaced only — FT/hit maths not fully modelled for FH.')
  } else if (chip === 'bboost' || chip === '3xc') {
    notes.push(`${chip} active: no change to FT banking or hit costing.`)
  }

  return {
    freeTransfers,
    eventTransfers,
    hits,
    hitCost,
    chip,
    notes,
  }
}
