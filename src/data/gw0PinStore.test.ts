import { describe, expect, it } from 'vitest'
import { normalisePins } from '../data/gw0PinStore'

describe('GW0 pin store normalisation', () => {
  it('seeds empty and lets lock win over exclude on the same code', () => {
    expect(normalisePins(null)).toMatchObject({
      id: 'current',
      lockedCodes: [],
      excludedCodes: [],
      scope: 'both',
    })
    const mixed = normalisePins({
      lockedCodes: [12, 12, 5],
      excludedCodes: [5, 9],
      scope: 'shortTerm',
    })
    expect(mixed.lockedCodes).toEqual([5, 12])
    expect(mixed.excludedCodes).toEqual([9])
    expect(mixed.scope).toBe('shortTerm')
  })
})
