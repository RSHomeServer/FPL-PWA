import { getFplCacheDb } from './db'
import type { Gw0PinScope, Gw0SquadPinsRecord } from './types'

export const EMPTY_GW0_PINS: Gw0SquadPinsRecord = {
  id: 'current',
  lockedCodes: [],
  excludedCodes: [],
  scope: 'both',
  updatedAt: 0,
}

export function emptyGw0Pins(scope: Gw0PinScope = 'both'): Gw0SquadPinsRecord {
  return { ...EMPTY_GW0_PINS, scope }
}

export async function readGw0SquadPins(): Promise<Gw0SquadPinsRecord> {
  const db = getFplCacheDb()
  const stored = await db.gw0SquadPins.get('current')
  return stored ? normalisePins(stored) : emptyGw0Pins()
}

export async function writeGw0SquadPins(record: Gw0SquadPinsRecord): Promise<void> {
  const db = getFplCacheDb()
  await db.gw0SquadPins.put(normalisePins({ ...record, id: 'current', updatedAt: Date.now() }))
}

export function normalisePins(record: Partial<Gw0SquadPinsRecord> | null | undefined): Gw0SquadPinsRecord {
  const scope: Gw0PinScope =
    record?.scope === 'shortTerm' || record?.scope === 'longTerm' ? record.scope : 'both'
  const locked = unique(record?.lockedCodes)
  const excluded = unique(record?.excludedCodes).filter((code) => !locked.includes(code))
  return {
    id: 'current',
    lockedCodes: locked,
    excludedCodes: excluded,
    scope,
    updatedAt: typeof record?.updatedAt === 'number' ? record.updatedAt : 0,
  }
}

export function pinsWithLock(record: Gw0SquadPinsRecord, code: number): Gw0SquadPinsRecord {
  return normalisePins({
    ...record,
    lockedCodes: [...record.lockedCodes, code],
    excludedCodes: record.excludedCodes.filter((item) => item !== code),
  })
}

export function pinsWithExclude(record: Gw0SquadPinsRecord, code: number): Gw0SquadPinsRecord {
  return normalisePins({
    ...record,
    excludedCodes: [...record.excludedCodes, code],
    lockedCodes: record.lockedCodes.filter((item) => item !== code),
  })
}

export function pinsWithoutCode(record: Gw0SquadPinsRecord, code: number): Gw0SquadPinsRecord {
  return normalisePins({
    ...record,
    lockedCodes: record.lockedCodes.filter((item) => item !== code),
    excludedCodes: record.excludedCodes.filter((item) => item !== code),
  })
}

function unique(codes: readonly number[] | undefined): number[] {
  return [...new Set((codes ?? []).filter((code) => Number.isInteger(code) && code > 0))].sort((a, b) => a - b)
}
