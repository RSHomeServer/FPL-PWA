import { getFplCacheDb } from './db'
import type { PerfectTeamPinsRecord } from './types'

export const EMPTY_PERFECT_TEAM_PINS: Omit<PerfectTeamPinsRecord, 'id' | 'seasonId'> = {
  lockedCodes: [],
  excludedCodes: [],
  updatedAt: 0,
}

export function emptyPerfectTeamPins(seasonId: string): PerfectTeamPinsRecord {
  return {
    id: seasonId,
    seasonId,
    lockedCodes: [],
    excludedCodes: [],
    updatedAt: 0,
  }
}

export async function readPerfectTeamPins(seasonId: string): Promise<PerfectTeamPinsRecord> {
  const db = getFplCacheDb()
  const stored = await db.perfectTeamPins.get(seasonId)
  return stored ? normalisePerfectPins(stored, seasonId) : emptyPerfectTeamPins(seasonId)
}

export async function writePerfectTeamPins(record: PerfectTeamPinsRecord): Promise<void> {
  const db = getFplCacheDb()
  const normalised = normalisePerfectPins({ ...record, updatedAt: Date.now() }, record.seasonId)
  await db.perfectTeamPins.put(normalised)
}

export function normalisePerfectPins(
  record: Partial<PerfectTeamPinsRecord> | null | undefined,
  seasonId: string,
): PerfectTeamPinsRecord {
  const locked = unique(record?.lockedCodes)
  const excluded = unique(record?.excludedCodes).filter((code) => !locked.includes(code))
  return {
    id: seasonId,
    seasonId,
    lockedCodes: locked,
    excludedCodes: excluded,
    updatedAt: typeof record?.updatedAt === 'number' ? record.updatedAt : 0,
  }
}

export function perfectPinsWithLock(record: PerfectTeamPinsRecord, code: number): PerfectTeamPinsRecord {
  return normalisePerfectPins(
    {
      ...record,
      lockedCodes: [...record.lockedCodes, code],
      excludedCodes: record.excludedCodes.filter((item) => item !== code),
    },
    record.seasonId,
  )
}

export function perfectPinsWithExclude(record: PerfectTeamPinsRecord, code: number): PerfectTeamPinsRecord {
  return normalisePerfectPins(
    {
      ...record,
      excludedCodes: [...record.excludedCodes, code],
      lockedCodes: record.lockedCodes.filter((item) => item !== code),
    },
    record.seasonId,
  )
}

export function perfectPinsWithoutCode(record: PerfectTeamPinsRecord, code: number): PerfectTeamPinsRecord {
  return normalisePerfectPins(
    {
      ...record,
      lockedCodes: record.lockedCodes.filter((item) => item !== code),
      excludedCodes: record.excludedCodes.filter((item) => item !== code),
    },
    record.seasonId,
  )
}

function unique(codes: readonly number[] | undefined): number[] {
  return [...new Set((codes ?? []).filter((code) => Number.isInteger(code) && code > 0))].sort((a, b) => a - b)
}
