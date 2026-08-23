import { describe, expect, it, vi } from 'vitest'
import entryFixture from './__fixtures__/manager/entry-1.json'
import historyFixture from './__fixtures__/manager/history-1.json'
import picksFixture from './__fixtures__/manager/picks-gw1.json'
import transfersEmptyFixture from './__fixtures__/manager/transfers-empty.json'
import transfersSampleFixture from './__fixtures__/manager/transfers-sample.json'
import { FplLiveFetchError, officialApiUrl } from './fplLiveSource'
import {
  fetchManagerEntry,
  fetchManagerHistory,
  fetchManagerState,
  fetchManagerTransfers,
  joinSquadPickCodes,
  managerEntryPath,
  managerHistoryPath,
  managerPicksPath,
  managerTransfersPath,
  parseManagerEntry,
  parseManagerHistory,
  parseManagerPicks,
  parseManagerTransfers,
} from './fplUserSource'

describe('manager API paths', () => {
  it('builds /fpl-api/entry routes in the browser runtime', () => {
    expect(officialApiUrl(managerEntryPath(1), 'browser')).toBe('/fpl-api/api/entry/1/')
    expect(officialApiUrl(managerPicksPath(42, 3), 'browser')).toBe(
      '/fpl-api/api/entry/42/event/3/picks/',
    )
    expect(officialApiUrl(managerHistoryPath(7), 'browser')).toBe('/fpl-api/api/entry/7/history/')
    expect(officialApiUrl(managerTransfersPath(9), 'browser')).toBe('/fpl-api/api/entry/9/transfers/')
  })
})

describe('manager JSON parsing', () => {
  it('parses entry summary from Appendix A fixture', () => {
    const entry = parseManagerEntry(entryFixture, 1)
    expect(entry.identity.entryId).toBe(1)
    expect(entry.identity.teamName).toBe('Solio Moose')
    expect(entry.identity.playerFirstName).toBe('Chris')
    expect(entry.identity.playerLastName).toBe('Musson')
    expect(entry.currentEvent).toBe(1)
    expect(entry.lastDeadlineBankTenths).toBe(0)
    expect(entry.lastDeadlineValueTenths).toBe(1000)
  })

  it('parses 15 picks with captain and vice flags', () => {
    const picks = parseManagerPicks(picksFixture, 1, 1)
    expect(picks.picks).toHaveLength(15)
    expect(picks.entryHistory.bankTenths).toBe(0)
    expect(picks.entryHistory.squadValueTenths).toBe(1000)
    expect(picks.entryHistory.eventTransfers).toBe(0)
    expect(picks.activeChip).toBeNull()
    const captain = picks.picks.find((pick) => pick.isCaptain)
    const vice = picks.picks.find((pick) => pick.isViceCaptain)
    expect(captain?.elementId).toBe(426)
    expect(captain?.multiplier).toBe(2)
    expect(vice?.elementId).toBe(427)
    expect(picks.picks.every((pick) => pick.code === 0)).toBe(true)
  })

  it('parses history current rows and chips array', () => {
    const history = parseManagerHistory(historyFixture)
    expect(history.current).toHaveLength(1)
    expect(history.current[0]?.event).toBe(1)
    expect(history.current[0]?.bankTenths).toBe(0)
    expect(history.current[0]?.squadValueTenths).toBe(1000)
    expect(history.chips).toEqual([])
  })

  it('parses transfer audit rows', () => {
    expect(parseManagerTransfers(transfersEmptyFixture)).toEqual([])
    const rows = parseManagerTransfers(transfersSampleFixture)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      elementIn: 100,
      elementInCostTenths: 55,
      elementOut: 200,
      elementOutCostTenths: 60,
      entryId: 1,
      event: 2,
    })
  })

  it('joins bootstrap codes onto element ids', () => {
    const picks = parseManagerPicks(picksFixture, 1, 1)
    const codeById = new Map<number, number>([[1, 154561], [426, 999001]])
    const joined = joinSquadPickCodes(picks.picks, codeById)
    expect(joined.find((pick) => pick.elementId === 1)?.code).toBe(154561)
    expect(joined.find((pick) => pick.elementId === 426)?.code).toBe(999001)
    expect(joined.find((pick) => pick.elementId === 4)?.code).toBe(0)
  })
})

describe('manager fetch error handling', () => {
  it('surfaces HTTP 4xx for invalid entry ids', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404 }))
    await expect(fetchManagerEntry(9_999_999, fetchImpl)).rejects.toBeInstanceOf(FplLiveFetchError)
    await expect(fetchManagerEntry(9_999_999, fetchImpl)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('rejects malformed JSON bodies', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    await expect(fetchManagerHistory(1, fetchImpl)).rejects.toThrow(/invalid JSON|not valid JSON/i)
  })

  it('rejects pick payloads without 15 players', () => {
    expect(() =>
      parseManagerPicks({ ...picksFixture, picks: picksFixture.picks.slice(0, 14) }, 1, 1),
    ).toThrow(/expected 15 picks/)
  })
})

describe('fetchManagerState', () => {
  it('fetches entry, picks, and history in parallel when event is known', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('/history/')) return new Response(JSON.stringify(historyFixture), { status: 200 })
      if (url.includes('/picks/')) return new Response(JSON.stringify(picksFixture), { status: 200 })
      return new Response(JSON.stringify(entryFixture), { status: 200 })
    })

    const snapshot = await fetchManagerState(1, 1, fetchImpl)
    expect(snapshot.event).toBe(1)
    expect(snapshot.entry.identity.teamName).toBe('Solio Moose')
    expect(snapshot.picks.picks).toHaveLength(15)
    expect(snapshot.history.current).toHaveLength(1)
    expect(calls).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('defaults event to entry.current_event when omitted', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/history/')) return new Response(JSON.stringify(historyFixture), { status: 200 })
      if (url.includes('/picks/')) return new Response(JSON.stringify(picksFixture), { status: 200 })
      return new Response(JSON.stringify(entryFixture), { status: 200 })
    })

    const snapshot = await fetchManagerState(1, undefined, fetchImpl)
    expect(snapshot.event).toBe(1)
    expect(snapshot.picks.event).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe('fetchManagerTransfers', () => {
  it('fetches the transfers endpoint', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(transfersSampleFixture), { status: 200 }),
    )
    const rows = await fetchManagerTransfers(1, fetchImpl)
    expect(rows).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledWith(officialApiUrl(managerTransfersPath(1), 'node'), expect.anything())
  })
})
