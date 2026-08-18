import { describe, expect, it } from 'vitest'
import { mae, pearson, rmse, spearman, topKOverlap, trimmedMean } from './stats'

describe('error metrics', () => {
  it('matches hand-calculated RMSE and MAE', () => {
    const predicted = [2, 4]
    const actual = [1, 1]
    expect(rmse(predicted, actual)).toBeCloseTo(Math.sqrt(5), 10)
    expect(mae(predicted, actual)).toBe(2)
  })
})

describe('rank correlation', () => {
  it('gives Spearman 1 / -1 on perfect monotone pairs', () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 10)
    expect(spearman([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1, 10)
  })

  it('uses average ranks for ties (Spearman of [1,1,2] vs [3,3,9])', () => {
    // ranks: 1.5, 1.5, 3 vs 1.5, 1.5, 3 → Pearson 1
    expect(spearman([1, 1, 2], [3, 3, 9])).toBeCloseTo(1, 10)
  })

  it('matches hand-calculated Pearson on a 3-point example', () => {
    // x=[1,2,3], y=[2,2,5]; mx=2 my=3; num=3; dx=2 dy=6; r=3/sqrt(12)=0.866025...
    expect(pearson([1, 2, 3], [2, 2, 5])).toBeCloseTo(3 / Math.sqrt(12), 10)
  })
})

describe('summaries', () => {
  it('trims 5% from each tail of twenty values', () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 100]
    const inner = values.slice(1, 19)
    expect(trimmedMean(values, 0.05)).toBeCloseTo(
      inner.reduce((sum, value) => sum + value, 0) / inner.length,
      10,
    )
  })

  it('scores top-k overlap', () => {
    const predicted = [
      { id: 'a', score: 10 },
      { id: 'b', score: 9 },
      { id: 'c', score: 1 },
    ]
    const actual = [
      { id: 'b', score: 8 },
      { id: 'a', score: 7 },
      { id: 'c', score: 0 },
    ]
    expect(topKOverlap(predicted, actual, 2)).toBe(1)
    expect(topKOverlap(predicted, actual, 1)).toBe(0)
  })
})
