/**
 * Compose in-memory ManagerGameweekState from Dexie user stores + live prices.
 * Never writes hypothetical sell/FT values back into Dexie user picks stores.
 */

import { getFplCacheDb } from './db'
import { loadOfficialLiveSnapshot, type FetchLike } from './fplLiveSource'
import { deriveFreeTransfers } from './freeTransfers'
import { deriveSellPrices, sellPriceTenthsByCode } from './sellPrice'
import type { ManagerGameweekState, ManagerSnapshot, ManagerTransfer } from './types'
import { loadUserState, type LoadUserStateOptions } from './userStateRefresh'

export type BuildManagerGameweekStateOptions = LoadUserStateOptions & {
  /** Optional override — normally read from Dexie `userTransfers`. */
  transfers?: readonly ManagerTransfer[]
}

/**
 * Pure compose from an already-loaded snapshot (useful in tests / UI that already
 * has manager data). Does not touch Dexie.
 */
export function buildManagerGameweekStateFromSnapshot(
  snapshot: ManagerSnapshot,
  args: {
    transfers: readonly ManagerTransfer[]
    players: Parameters<typeof deriveSellPrices>[0]['players']
  },
): ManagerGameweekState {
  const sellPrices = deriveSellPrices({
    picks: snapshot.picks.picks,
    transfers: args.transfers,
    players: args.players,
    historyCurrent: snapshot.history.current,
  })
  const freeTransferDetail = deriveFreeTransfers({
    historyCurrent: snapshot.history.current,
    chips: snapshot.history.chips,
    currentEvent: snapshot.event,
    eventTransfers: snapshot.picks.entryHistory.eventTransfers,
    activeChip: snapshot.picks.activeChip,
  })

  return {
    entryId: snapshot.entry.identity.entryId,
    event: snapshot.event,
    picks: snapshot.picks.picks,
    bankTenths: snapshot.picks.entryHistory.bankTenths,
    squadValueTenths: snapshot.picks.entryHistory.squadValueTenths,
    eventTransfers: snapshot.picks.entryHistory.eventTransfers,
    eventTransfersCost: snapshot.picks.entryHistory.eventTransfersCost,
    activeChip: snapshot.picks.activeChip,
    freeTransfers: freeTransferDetail.freeTransfers,
    sellPriceTenthsByCode: sellPriceTenthsByCode(sellPrices),
    sellPrices,
    freeTransferDetail,
    fetchedAt: snapshot.fetchedAt,
  }
}

/**
 * Load persisted manager state + live bootstrap and derive sell prices / FT.
 * Read-only with respect to user Dexie stores (may refresh live cache via
 * `loadOfficialLiveSnapshot` as usual).
 */
export async function buildManagerGameweekState(
  entryId: number,
  options?: BuildManagerGameweekStateOptions,
): Promise<ManagerGameweekState | null> {
  const loaded = await loadUserState(entryId, options)
  if (!loaded) return null

  const transfers =
    options?.transfers ??
    (await getFplCacheDb().userTransfers.get(entryId))?.transfers ??
    []

  const live = await loadOfficialLiveSnapshot({
    fetchImpl: options?.fetchImpl as FetchLike | undefined,
    force: false,
    now: options?.now,
  })

  return buildManagerGameweekStateFromSnapshot(loaded.snapshot, {
    transfers,
    players: live.players,
  })
}
