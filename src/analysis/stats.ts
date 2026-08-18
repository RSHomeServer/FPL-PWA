/** Ranking, error, and summary stats for the GW0 backtest. */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function rmse(predicted: readonly number[], actual: readonly number[]): number {
  const n = alignedLength(predicted, actual)
  if (n === 0) return NaN
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    const err = predicted[i] - actual[i]
    sum += err * err
  }
  return Math.sqrt(sum / n)
}

export function mae(predicted: readonly number[], actual: readonly number[]): number {
  const n = alignedLength(predicted, actual)
  if (n === 0) return NaN
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    sum += Math.abs(predicted[i] - actual[i])
  }
  return sum / n
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = alignedLength(x, y)
  if (n < 2) return NaN
  const mx = mean(x)
  const my = mean(y)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i += 1) {
    const a = x[i] - mx
    const b = y[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return NaN
  return num / Math.sqrt(dx * dy)
}

/** Average ranks for ties, then Pearson of the ranks. */
export function spearman(x: readonly number[], y: readonly number[]): number {
  const n = alignedLength(x, y)
  if (n < 2) return NaN
  return pearson(averageRanks(x), averageRanks(y))
}

export function trimmedMean(values: readonly number[], trimEachTail = 0.05): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const drop = Math.floor(sorted.length * trimEachTail)
  const sliced = drop > 0 ? sorted.slice(drop, sorted.length - drop) : sorted
  const used = sliced.length > 0 ? sliced : sorted
  return mean(used)
}

/** Fraction of ids that appear in both top-k lists (by descending score). */
export function topKOverlap(
  predicted: ReadonlyArray<{ id: string; score: number }>,
  actual: ReadonlyArray<{ id: string; score: number }>,
  k: number,
): number {
  if (k <= 0) return NaN
  const predIds = new Set(topIds(predicted, k))
  const actualIds = topIds(actual, k)
  let hits = 0
  for (const id of actualIds) {
    if (predIds.has(id)) hits += 1
  }
  return hits / k
}

export function roundN(value: number, digits = 3): number {
  if (!Number.isFinite(value)) return value
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function alignedLength(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`paired series length mismatch: ${a.length} vs ${b.length}`)
  }
  return a.length
}

function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((a, b) => a.value - b.value)
  const ranks = Array(values.length).fill(0)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) ranks[indexed[k].index] = avg
    i = j + 1
  }
  return ranks
}

function topIds(rows: ReadonlyArray<{ id: string; score: number }>, k: number): string[] {
  return [...rows]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k)
    .map((row) => row.id)
}
