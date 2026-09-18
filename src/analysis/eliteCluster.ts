import type { EliteEntryRecord, EliteGameweekSquad } from '../data/types'

export type EliteClusterElementShare = {
  elementId: number
  count: number
  ownership: number
}

export type EliteGwCluster = {
  id: number
  label: string
  gw: number
  medoidEntryId: number
  memberEntryIds: number[]
  size: number
  avgPoints: number
  avgOverallRank: number | null
  chipCounts: Record<string, number>
  topElements: EliteClusterElementShare[]
}

export type EliteGwClustering = {
  gw: number
  k: number
  entryIds: number[]
  assignment: Record<number, number>
  clusters: EliteGwCluster[]
}

export type EliteClusterTransition = {
  fromGw: number
  toGw: number
  fromClusterId: number
  toClusterId: number
  count: number
  entryIds: number[]
}

export type EliteClusteringResult = {
  byGw: EliteGwClustering[]
  transitions: EliteClusterTransition[]
}

export type ClusterEliteOptions = {
  /** Target clusters per gameweek (default 6). */
  k?: number
  /** Only cluster these GWs (default: all present). */
  gameweeks?: number[]
  /** Min members with a squad for that GW. */
  minMembers?: number
}

/**
 * Cluster elite entries independently each GW (Jaccard on 15-man sets + k-medoids),
 * then build transition flows between consecutive GWs.
 */
export function clusterEliteEntries(
  entries: readonly EliteEntryRecord[],
  options: ClusterEliteOptions = {},
): EliteClusteringResult {
  const k = Math.max(2, options.k ?? 6)
  const minMembers = options.minMembers ?? 8
  const available = sortedGameweeks(entries)
  const gameweeks = (options.gameweeks ?? available).filter((gw) => available.includes(gw))

  const byGw: EliteGwClustering[] = []
  for (const gw of gameweeks) {
    const points = entries
      .map((entry) => {
        const squad = entry.gameweeks.find((row) => row.gw === gw)
        if (!squad || squad.xi.length + squad.bench.length < 11) return null
        return { entry, squad }
      })
      .filter((row): row is { entry: EliteEntryRecord; squad: EliteGameweekSquad } => row != null)

    if (points.length < minMembers) continue

    const clustering = clusterGameweek(
      points.map((row) => row.entry),
      points.map((row) => row.squad),
      gw,
      Math.min(k, Math.max(2, Math.floor(points.length / 4))),
    )
    byGw.push(clustering)
  }

  const transitions: EliteClusterTransition[] = []
  for (let i = 0; i < byGw.length - 1; i += 1) {
    transitions.push(...buildTransitions(byGw[i]!, byGw[i + 1]!))
  }

  return { byGw, transitions }
}

export function squadElementSet(squad: EliteGameweekSquad): number[] {
  return [...new Set([...squad.xi, ...squad.bench])].sort((a, b) => a - b)
}

export function jaccardDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const left = new Set(a)
  const right = new Set(b)
  let inter = 0
  for (const id of left) {
    if (right.has(id)) inter += 1
  }
  const union = left.size + right.size - inter
  return union === 0 ? 0 : 1 - inter / union
}

function clusterGameweek(
  entries: readonly EliteEntryRecord[],
  squads: readonly EliteGameweekSquad[],
  gw: number,
  k: number,
): EliteGwClustering {
  const sets = squads.map((squad) => squadElementSet(squad))
  const n = sets.length
  const dist = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = jaccardDistance(sets[i]!, sets[j]!)
      dist[i]![j] = d
      dist[j]![i] = d
    }
  }

  const medoidIdx = initialiseMedoids(dist, k)
  let assignment = assignToMedoids(dist, medoidIdx)
  for (let iter = 0; iter < 12; iter += 1) {
    const nextMedoids = updateMedoids(dist, assignment, k)
    const nextAssign = assignToMedoids(dist, nextMedoids)
    const same =
      nextMedoids.length === medoidIdx.length &&
      nextMedoids.every((idx, i) => idx === medoidIdx[i]) &&
      nextAssign.every((c, i) => c === assignment[i])
    medoidIdx.splice(0, medoidIdx.length, ...nextMedoids)
    assignment = nextAssign
    if (same) break
  }

  const clusters: EliteGwCluster[] = []
  for (let clusterId = 0; clusterId < k; clusterId += 1) {
    const members = assignment
      .map((c, index) => (c === clusterId ? index : -1))
      .filter((index) => index >= 0)
    if (members.length === 0) continue

    let medoidLocal = members[0]!
    let best = Number.POSITIVE_INFINITY
    for (const candidate of members) {
      let sum = 0
      for (const other of members) sum += dist[candidate]![other]!
      if (sum < best) {
        best = sum
        medoidLocal = candidate
      }
    }

    const memberSquads = members.map((index) => squads[index]!)
    const memberEntryIds = members.map((index) => entries[index]!.entryId)

    const topElements = ownershipShares(memberSquads).slice(0, 12)
    const chipCounts: Record<string, number> = {}
    let pointsSum = 0
    let rankSum = 0
    let rankN = 0
    for (const squad of memberSquads) {
      pointsSum += squad.points ?? 0
      if (squad.overallRank != null) {
        rankSum += squad.overallRank
        rankN += 1
      }
      const chip = squad.activeChip ?? (squad.historyChips[0] ?? 'none')
      chipCounts[chip] = (chipCounts[chip] ?? 0) + 1
    }

    clusters.push({
      id: clusterId,
      label: `C${clusterId + 1}`,
      gw,
      medoidEntryId: entries[medoidLocal]!.entryId,
      memberEntryIds,
      size: members.length,
      avgPoints: members.length ? pointsSum / members.length : 0,
      avgOverallRank: rankN ? rankSum / rankN : null,
      chipCounts,
      topElements,
    })
  }

  clusters.sort((a, b) => b.size - a.size || a.id - b.id)
  const relabeled = clusters.map((cluster, index) => ({
    ...cluster,
    id: index,
    label: `C${index + 1}`,
  }))

  const finalAssignment: Record<number, number> = {}
  for (const cluster of relabeled) {
    for (const entryId of cluster.memberEntryIds) finalAssignment[entryId] = cluster.id
  }

  return {
    gw,
    k: relabeled.length,
    entryIds: entries.map((entry) => entry.entryId),
    assignment: finalAssignment,
    clusters: relabeled,
  }
}

function ownershipShares(squads: readonly EliteGameweekSquad[]): EliteClusterElementShare[] {
  const counts = new Map<number, number>()
  for (const squad of squads) {
    for (const id of squadElementSet(squad)) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  const n = Math.max(1, squads.length)
  return [...counts.entries()]
    .map(([elementId, count]) => ({
      elementId,
      count,
      ownership: count / n,
    }))
    .sort((a, b) => b.ownership - a.ownership || a.elementId - b.elementId)
}

function initialiseMedoids(dist: number[][], k: number): number[] {
  const n = dist.length
  const medoids = [0]
  while (medoids.length < k && medoids.length < n) {
    let bestIdx = -1
    let bestScore = -1
    for (let i = 0; i < n; i += 1) {
      if (medoids.includes(i)) continue
      let nearest = Number.POSITIVE_INFINITY
      for (const m of medoids) nearest = Math.min(nearest, dist[i]![m]!)
      if (nearest > bestScore) {
        bestScore = nearest
        bestIdx = i
      }
    }
    if (bestIdx < 0) break
    medoids.push(bestIdx)
  }
  return medoids
}

function assignToMedoids(dist: number[][], medoids: readonly number[]): number[] {
  return dist.map((row) => {
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let m = 0; m < medoids.length; m += 1) {
      const d = row[medoids[m]!]!
      if (d < bestD) {
        bestD = d
        best = m
      }
    }
    return best
  })
}

function updateMedoids(dist: number[][], assignment: readonly number[], k: number): number[] {
  const next: number[] = []
  for (let c = 0; c < k; c += 1) {
    const members = assignment
      .map((a, index) => (a === c ? index : -1))
      .filter((index) => index >= 0)
    if (members.length === 0) {
      next.push(next.length < dist.length ? next.length : 0)
      continue
    }
    let best = members[0]!
    let bestSum = Number.POSITIVE_INFINITY
    for (const candidate of members) {
      let sum = 0
      for (const other of members) sum += dist[candidate]![other]!
      if (sum < bestSum) {
        bestSum = sum
        best = candidate
      }
    }
    next.push(best)
  }
  return next
}

function buildTransitions(from: EliteGwClustering, to: EliteGwClustering): EliteClusterTransition[] {
  const flows = new Map<string, { count: number; entryIds: number[] }>()
  for (const entryId of from.entryIds) {
    const a = from.assignment[entryId]
    const b = to.assignment[entryId]
    if (a == null || b == null) continue
    const key = `${a}->${b}`
    const cur = flows.get(key) ?? { count: 0, entryIds: [] }
    cur.count += 1
    cur.entryIds.push(entryId)
    flows.set(key, cur)
  }
  return [...flows.entries()]
    .map(([key, value]) => {
      const [fromClusterId, toClusterId] = key.split('->').map(Number)
      return {
        fromGw: from.gw,
        toGw: to.gw,
        fromClusterId: fromClusterId!,
        toClusterId: toClusterId!,
        count: value.count,
        entryIds: value.entryIds,
      }
    })
    .sort((a, b) => b.count - a.count)
}

function sortedGameweeks(entries: readonly EliteEntryRecord[]): number[] {
  const set = new Set<number>()
  for (const entry of entries) {
    for (const gw of entry.gameweeks) set.add(gw.gw)
  }
  return [...set].sort((a, b) => a - b)
}
