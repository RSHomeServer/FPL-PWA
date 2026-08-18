import { describe, expect, it } from 'vitest'
import seedFile from './gw0RoleEvidence.seed.json'
import { mSemFromRoleEvidence, parseRoleEvidenceSeed } from './roleEvidence'

describe('RoleEvidence seed', () => {
  it('parses unique codes with documented m_sem and sources', () => {
    const records = parseRoleEvidenceSeed(seedFile)
    expect(records.length).toBeGreaterThan(40)
    const codes = records.map((row) => row.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const row of records) {
      const mSem = mSemFromRoleEvidence(row)
      expect(mSem).toBeGreaterThanOrEqual(0)
      expect(mSem).toBeLessThanOrEqual(1)
      expect(row.sources.length).toBeGreaterThan(0)
      expect(row.startingLikelihood).not.toBe('HIGH')
    }
  })
})
