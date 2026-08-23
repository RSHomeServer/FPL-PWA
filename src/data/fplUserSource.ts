import {
  fetchOfficialJson,
  FplLiveFetchError,
  officialApiUrl,
  type FetchLike,
} from './fplLiveSource'
import type {
  ManagerAutomaticSub,
  ManagerChipPlay,
  ManagerEntrySummary,
  ManagerGameweekEntryHistory,
  ManagerGameweekPicks,
  ManagerHistory,
  ManagerHistoryGameweek,
  ManagerIdentity,
  ManagerSnapshot,
  ManagerTransfer,
  SquadPick,
} from './types'

export function managerEntryPath(entryId: number): string {
  return `/api/entry/${entryId}/`
}

export function managerPicksPath(entryId: number, event: number): string {
  return `/api/entry/${entryId}/event/${event}/picks/`
}

export function managerHistoryPath(entryId: number): string {
  return `/api/entry/${entryId}/history/`
}

export function managerTransfersPath(entryId: number): string {
  return `/api/entry/${entryId}/transfers/`
}

export function parseManagerEntry(payload: unknown, entryId?: number): ManagerEntrySummary {
  const root = asObject(payload, 'entry')
  const id = parseRequiredInt(root.id, 'entry.id')
  if (entryId != null && id !== entryId) {
    throw new Error(`Manager entry id mismatch: expected ${entryId}, got ${id}`)
  }
  const identity: ManagerIdentity = {
    entryId: id,
    teamName: parseRequiredString(root.name, 'entry.name'),
    playerFirstName: parseRequiredString(root.player_first_name, 'entry.player_first_name'),
    playerLastName: parseRequiredString(root.player_last_name, 'entry.player_last_name'),
  }
  return {
    identity,
    startedEvent: parseRequiredInt(root.started_event, 'entry.started_event'),
    currentEvent: parseRequiredInt(root.current_event, 'entry.current_event'),
    summaryOverallPoints: parseRequiredInt(root.summary_overall_points, 'entry.summary_overall_points'),
    summaryOverallRank: parseRequiredInt(root.summary_overall_rank, 'entry.summary_overall_rank'),
    lastDeadlineBankTenths: parseRequiredInt(root.last_deadline_bank, 'entry.last_deadline_bank'),
    lastDeadlineValueTenths: parseRequiredInt(root.last_deadline_value, 'entry.last_deadline_value'),
  }
}

export function parseManagerPicks(payload: unknown, entryId: number, event: number): ManagerGameweekPicks {
  const root = asObject(payload, 'picks')
  const picks = arrayOfObjects(root.picks)
    .map((row) => parseSquadPick(row))
    .filter((row): row is SquadPick => row !== null)
  if (picks.length !== 15) {
    throw new Error(`Manager picks for entry ${entryId} GW${event}: expected 15 picks, got ${picks.length}`)
  }
  return {
    entryId,
    event,
    picks,
    entryHistory: parseGameweekEntryHistory(asObject(root.entry_history, 'picks.entry_history')),
    activeChip: parseOptionalString(root.active_chip),
    automaticSubs: arrayOfObjects(root.automatic_subs)
      .map((row) => parseAutomaticSub(row))
      .filter((row): row is ManagerAutomaticSub => row !== null),
  }
}

export function parseManagerHistory(payload: unknown): ManagerHistory {
  const root = asObject(payload, 'history')
  return {
    current: arrayOfObjects(root.current)
      .map((row) => parseHistoryGameweek(row))
      .filter((row): row is ManagerHistoryGameweek => row !== null),
    chips: arrayOfObjects(root.chips)
      .map((row) => parseChipPlay(row))
      .filter((row): row is ManagerChipPlay => row !== null),
  }
}

export function parseManagerTransfers(payload: unknown): ManagerTransfer[] {
  if (!Array.isArray(payload)) {
    throw new Error('Manager transfers payload was not a JSON array')
  }
  return payload
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => parseManagerTransfer(row))
    .filter((row): row is ManagerTransfer => row !== null)
}

/**
 * Join bootstrap `elements[].code` onto picks. The picks API only exposes `element` id.
 * Returns picks with `code` set to 0 when the element is missing from the map.
 */
export function joinSquadPickCodes(
  picks: SquadPick[],
  codeByElementId: ReadonlyMap<number, number>,
): SquadPick[] {
  return picks.map((pick) => ({
    ...pick,
    code: codeByElementId.get(pick.elementId) ?? 0,
  }))
}

export async function fetchManagerEntry(
  entryId: number,
  fetchImpl: FetchLike = fetch,
): Promise<ManagerEntrySummary> {
  const payload = await fetchManagerJson(managerEntryPath(entryId), fetchImpl)
  return parseManagerEntry(payload, entryId)
}

export async function fetchManagerPicks(
  entryId: number,
  event: number,
  fetchImpl: FetchLike = fetch,
): Promise<ManagerGameweekPicks> {
  const payload = await fetchManagerJson(managerPicksPath(entryId, event), fetchImpl)
  return parseManagerPicks(payload, entryId, event)
}

export async function fetchManagerHistory(
  entryId: number,
  fetchImpl: FetchLike = fetch,
): Promise<ManagerHistory> {
  const payload = await fetchManagerJson(managerHistoryPath(entryId), fetchImpl)
  return parseManagerHistory(payload)
}

export async function fetchManagerTransfers(
  entryId: number,
  fetchImpl: FetchLike = fetch,
): Promise<ManagerTransfer[]> {
  const payload = await fetchManagerJson(managerTransfersPath(entryId), fetchImpl)
  return parseManagerTransfers(payload)
}

/**
 * Load manager entry, picks, and season history. When `event` is omitted it defaults to
 * `entry.currentEvent` (entry and history still fetch in parallel; picks follow once the
 * event is known). When `event` is supplied, all three requests run in parallel.
 */
export async function fetchManagerState(
  entryId: number,
  event?: number,
  fetchImpl: FetchLike = fetch,
): Promise<ManagerSnapshot> {
  const fetchedAt = Date.now()
  if (event != null) {
    const [entry, picks, history] = await Promise.all([
      fetchManagerEntry(entryId, fetchImpl),
      fetchManagerPicks(entryId, event, fetchImpl),
      fetchManagerHistory(entryId, fetchImpl),
    ])
    return { entry, picks, history, event, fetchedAt }
  }

  const [entry, history] = await Promise.all([
    fetchManagerEntry(entryId, fetchImpl),
    fetchManagerHistory(entryId, fetchImpl),
  ])
  const resolvedEvent = entry.currentEvent
  const picks = await fetchManagerPicks(entryId, resolvedEvent, fetchImpl)
  return { entry, picks, history, event: resolvedEvent, fetchedAt }
}

async function fetchManagerJson(path: string, fetchImpl: FetchLike): Promise<unknown> {
  const url = officialApiUrl(path)
  try {
    return await fetchOfficialJson(url, fetchImpl)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new FplLiveFetchError(
        `Manager API ${path} returned invalid JSON`,
        url,
        null,
        false,
      )
    }
    throw error
  }
}

function parseSquadPick(row: Record<string, unknown>): SquadPick | null {
  const elementId = parseRequiredInt(row.element, 'pick.element')
  const position = parseRequiredInt(row.position, 'pick.position')
  if (position < 1 || position > 15) return null
  return {
    elementId,
    code: 0,
    position,
    isCaptain: Boolean(row.is_captain),
    isViceCaptain: Boolean(row.is_vice_captain),
    multiplier: parseRequiredInt(row.multiplier, 'pick.multiplier'),
  }
}

function parseGameweekEntryHistory(row: Record<string, unknown>): ManagerGameweekEntryHistory {
  return {
    event: parseRequiredInt(row.event, 'entry_history.event'),
    points: parseRequiredInt(row.points, 'entry_history.points'),
    totalPoints: parseRequiredInt(row.total_points, 'entry_history.total_points'),
    bankTenths: parseRequiredInt(row.bank, 'entry_history.bank'),
    squadValueTenths: parseRequiredInt(row.value, 'entry_history.value'),
    eventTransfers: parseRequiredInt(row.event_transfers, 'entry_history.event_transfers'),
    eventTransfersCost: parseRequiredInt(row.event_transfers_cost, 'entry_history.event_transfers_cost'),
    pointsOnBench: parseOptionalInt(row.points_on_bench),
  }
}

function parseAutomaticSub(row: Record<string, unknown>): ManagerAutomaticSub | null {
  const elementIn = parseRequiredInt(row.element_in, 'automatic_sub.element_in')
  const elementOut = parseRequiredInt(row.element_out, 'automatic_sub.element_out')
  const event = parseRequiredInt(row.event, 'automatic_sub.event')
  return { elementIn, elementOut, event }
}

function parseHistoryGameweek(row: Record<string, unknown>): ManagerHistoryGameweek | null {
  const event = parseRequiredInt(row.event, 'history.event')
  if (event <= 0) return null
  return {
    event,
    points: parseRequiredInt(row.points, 'history.points'),
    totalPoints: parseRequiredInt(row.total_points, 'history.total_points'),
    bankTenths: parseRequiredInt(row.bank, 'history.bank'),
    squadValueTenths: parseRequiredInt(row.value, 'history.value'),
    eventTransfers: parseRequiredInt(row.event_transfers, 'history.event_transfers'),
    eventTransfersCost: parseRequiredInt(row.event_transfers_cost, 'history.event_transfers_cost'),
    overallRank: parseOptionalInt(row.overall_rank),
  }
}

function parseChipPlay(row: Record<string, unknown>): ManagerChipPlay | null {
  const name = parseOptionalString(row.name)
  if (!name) return null
  return {
    name,
    event: parseRequiredInt(row.event, 'chip.event'),
    time: parseRequiredString(row.time, 'chip.time'),
  }
}

function parseManagerTransfer(row: Record<string, unknown>): ManagerTransfer | null {
  const elementIn = parseRequiredInt(row.element_in, 'transfer.element_in')
  const elementOut = parseRequiredInt(row.element_out, 'transfer.element_out')
  const entryId = parseRequiredInt(row.entry, 'transfer.entry')
  const event = parseRequiredInt(row.event, 'transfer.event')
  return {
    elementIn,
    elementInCostTenths: parseRequiredInt(row.element_in_cost, 'transfer.element_in_cost'),
    elementOut,
    elementOutCostTenths: parseRequiredInt(row.element_out_cost, 'transfer.element_out_cost'),
    entryId,
    event,
    time: parseRequiredString(row.time, 'transfer.time'),
  }
}

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error(`Manager API ${context} payload was not a JSON object`)
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
}

function parseRequiredInt(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Manager API field ${field} was not a finite number`)
  }
  return parsed
}

function parseOptionalInt(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRequiredString(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (!text) throw new Error(`Manager API field ${field} was empty`)
  return text
}

function parseOptionalString(value: unknown): string | null {
  if (value == null) return null
  const text = typeof value === 'string' ? value.trim() : String(value).trim()
  return text || null
}
