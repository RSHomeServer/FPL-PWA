import { describe, expect, it } from 'vitest'
import { dynamicCacheId, optionsFingerprint, staticCacheId } from './perfectTeamCache'
import { emptyPerfectTeamPins, normalisePerfectPins } from './perfectTeamPinStore'

describe('perfectTeamCache option keys', () => {
  it('keeps chips and pin combinations from colliding', () => {
    expect(optionsFingerprint({ useChips: false })).not.toBe(optionsFingerprint({ useChips: true }))
    expect(optionsFingerprint({ lockedCodes: [3, 1] })).toBe(optionsFingerprint({ lockedCodes: [1, 3] }))
    expect(dynamicCacheId('2025-26', 'r1', { useChips: false })).not.toBe(
      dynamicCacheId('2025-26', 'r1', { useChips: true }),
    )
    expect(staticCacheId('2025-26', 4, 'r1', { lockedCodes: [9], costMode: 'gw-price' })).not.toBe(
      staticCacheId('2025-26', 4, 'r1', { lockedCodes: [], costMode: 'gw-price' }),
    )
  })
})

describe('perfectTeamPinStore', () => {
  it('lets lock win over exclude on the same code', () => {
    const mixed = normalisePerfectPins(
      {
        lockedCodes: [12, 12, 5],
        excludedCodes: [5, 9],
      },
      '2025-26',
    )
    expect(mixed.lockedCodes).toEqual([5, 12])
    expect(mixed.excludedCodes).toEqual([9])
    expect(emptyPerfectTeamPins('2024-25').seasonId).toBe('2024-25')
  })
})
