import { describe, expect, it } from 'vitest'
import {
  clusterEliteEntries,
  jaccardDistance,
  squadElementSet,
} from './eliteCluster'
import type { EliteEntryRecord, EliteGameweekSquad } from '../data/types'

function squad(gw: number, ids: number[]): EliteGameweekSquad {
  return {
    gw,
    xi: ids.slice(0, 11),
    bench: ids.slice(11, 15),
    captainElementId: ids[0]!,
    viceCaptainElementId: ids[1]!,
    activeChip: null,
    historyChips: [],
    points: 50 + ids[0]!,
    overallRank: 1000 + ids[0]!,
  }
}

function entry(id: number, gameweeks: EliteGameweekSquad[]): EliteEntryRecord {
  return {
    entryId: id,
    entryName: `Team ${id}`,
    playerName: `Manager ${id}`,
    totalPoints: 200,
    leagues: [{ leagueId: 314, leagueName: 'Overall', position: id }],
    gameweeks,
    fetchedAt: 1,
  }
}

/** Shared core + cluster-specific players so Jaccard separates templates. */
function template(core: number[], unique: number[]): number[] {
  return [...core, ...unique].slice(0, 15)
}

describe('jaccardDistance', () => {
  it('is 0 for identical sets and 1 for disjoint', () => {
    expect(jaccardDistance([1, 2, 3], [1, 2, 3])).toBe(0)
    expect(jaccardDistance([1, 2], [3, 4])).toBe(1)
  })

  it('handles partial overlap', () => {
    expect(jaccardDistance([1, 2, 3], [2, 3, 4])).toBeCloseTo(0.5)
  })
})

describe('squadElementSet', () => {
  it('unions XI and bench uniquely', () => {
    expect(squadElementSet(squad(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 11]))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ])
  })
})

describe('clusterEliteEntries', () => {
  it('separates two clear templates per GW and builds transitions', () => {
    const coreA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const coreB = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
    const entries: EliteEntryRecord[] = []

    for (let i = 0; i < 8; i += 1) {
      const ids = template(coreA, [100 + i, 101 + i, 102 + i, 103 + i, 104 + i])
      entries.push(
        entry(1000 + i, [
          squad(1, ids),
          // half of A moves toward B in GW2
          squad(2, i < 4 ? ids : template(coreB, [200 + i, 201 + i, 202 + i, 203 + i, 204 + i])),
        ]),
      )
    }
    for (let i = 0; i < 8; i += 1) {
      const ids = template(coreB, [300 + i, 301 + i, 302 + i, 303 + i, 304 + i])
      entries.push(entry(2000 + i, [squad(1, ids), squad(2, ids)]))
    }

    const result = clusterEliteEntries(entries, { k: 2, minMembers: 8 })
    expect(result.byGw).toHaveLength(2)
    expect(result.byGw[0]!.clusters.length).toBeGreaterThanOrEqual(2)
    expect(result.byGw[0]!.entryIds).toHaveLength(16)

    const gw1Sizes = result.byGw[0]!.clusters.map((c) => c.size).sort((a, b) => b - a)
    expect(gw1Sizes[0]).toBeGreaterThanOrEqual(6)
    expect(gw1Sizes[1]).toBeGreaterThanOrEqual(6)

    expect(result.transitions.length).toBeGreaterThan(0)
    const totalFlow = result.transitions.reduce((sum, row) => sum + row.count, 0)
    expect(totalFlow).toBe(16)
  })

  it('skips GWs below minMembers', () => {
    const ids = Array.from({ length: 15 }, (_, i) => i + 1)
    const entries = [entry(1, [squad(1, ids)]), entry(2, [squad(1, ids)])]
    const result = clusterEliteEntries(entries, { k: 2, minMembers: 8 })
    expect(result.byGw).toHaveLength(0)
  })
})
