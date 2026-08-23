export const PITCH_LINES = ['GK', 'DEF', 'MID', 'FWD'] as const
export type PitchLineId = (typeof PITCH_LINES)[number]

export type PitchFormationCounts = Partial<Record<PitchLineId, number>>

export type PitchLine = {
  id: PitchLineId
  count: number
}

export type PitchPlayerLike = {
  id: string | number
  position: string
}

const LINE_SET = new Set<string>(PITCH_LINES)

export function pitchLineOf(position: string): PitchLineId {
  const upper = position.trim().toUpperCase()
  if (upper === 'GKP' || upper === 'GK') return 'GK'
  if (upper === 'AM' || upper === 'MID') return 'MID'
  if (LINE_SET.has(upper)) return upper as PitchLineId
  return 'MID'
}

/**
 * Parse FPL-style formations. `3-4-3` / `4-4-2` are DEF-MID-FWD with one GK.
 * `1-4-4-2` keeps the leading keeper count. Longer strings (e.g. `4-2-3-1`)
 * treat the first number as defenders, the last as forwards, and the middle as midfield.
 */
export function parsePitchFormation(formation: string | PitchFormationCounts): PitchLine[] {
  if (typeof formation !== 'string') {
    return [
      { id: 'GK', count: clampCount(formation.GK ?? 1) },
      { id: 'DEF', count: clampCount(formation.DEF ?? 0) },
      { id: 'MID', count: clampCount(formation.MID ?? 0) },
      { id: 'FWD', count: clampCount(formation.FWD ?? 0) },
    ]
  }

  const parts = formation
    .split(/[^0-9]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part >= 0)

  if (parts.length === 4 && parts[0] === 1) {
    return [
      { id: 'GK', count: 1 },
      { id: 'DEF', count: clampCount(parts[1] ?? 0) },
      { id: 'MID', count: clampCount(parts[2] ?? 0) },
      { id: 'FWD', count: clampCount(parts[3] ?? 0) },
    ]
  }

  if (parts.length >= 3) {
    const def = parts[0] ?? 0
    const fwd = parts[parts.length - 1] ?? 0
    const mid = parts.slice(1, -1).reduce((sum, value) => sum + value, 0)
    return [
      { id: 'GK', count: 1 },
      { id: 'DEF', count: clampCount(def) },
      { id: 'MID', count: clampCount(mid) },
      { id: 'FWD', count: clampCount(fwd) },
    ]
  }

  if (parts.length === 2) {
    return [
      { id: 'GK', count: 1 },
      { id: 'DEF', count: clampCount(parts[0] ?? 0) },
      { id: 'MID', count: 0 },
      { id: 'FWD', count: clampCount(parts[1] ?? 0) },
    ]
  }

  return parsePitchFormation({ GK: 1, DEF: 3, MID: 4, FWD: 3 })
}

export function pitchPlayersByLine<T extends PitchPlayerLike>(
  players: readonly T[],
  formation: string | PitchFormationCounts,
  options?: { showEmptySlots?: boolean },
): Array<{ line: PitchLine; players: Array<T | null> }> {
  const lines = parsePitchFormation(formation)
  const buckets: Record<PitchLineId, T[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const player of players) {
    buckets[pitchLineOf(player.position)].push(player)
  }

  return lines.map((line) => {
    const assigned = buckets[line.id]
    const showEmpty = options?.showEmptySlots === true
    const slots: Array<T | null> = assigned.slice()
    if (showEmpty) {
      while (slots.length < line.count) slots.push(null)
    }
    return { line, players: slots }
  })
}

function clampCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(11, Math.trunc(value))
}
