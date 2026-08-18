import { describe, expect, it } from 'vitest'
import type { RoleEvidence } from '../data/types'
import {
  FITNESS_CONCERN_M,
  ROLE_CHANGE_M_SEM,
  STARTING_LIKELIHOOD_M_SEM,
  enumSummary,
  mSemForPlayer,
  mSemFromRoleEvidence,
} from './roleEvidence'

function evidence(partial: Partial<RoleEvidence> = {}): RoleEvidence {
  return {
    startingLikelihood: 'HIGH',
    roleContinuity: 'HIGH',
    competitionForPlace: 'LOW',
    fitnessConcern: 'NONE',
    roleChange: 'NONE',
    evidenceNotes: 'test',
    sources: ['https://example.test/'],
    confidence: 'HIGH',
    ...partial,
  }
}

describe('m_sem mapping (§13)', () => {
  it('maps HIGH+NONE to 1.00', () => {
    expect(STARTING_LIKELIHOOD_M_SEM.HIGH).toBe(1)
    expect(ROLE_CHANGE_M_SEM.NONE).toBe(1)
    expect(mSemFromRoleEvidence(evidence({ startingLikelihood: 'HIGH', roleChange: 'NONE' }))).toBe(1)
  })

  it('maps LOW+MAJOR to 0.55 × 0.75', () => {
    expect(STARTING_LIKELIHOOD_M_SEM.LOW).toBe(0.55)
    expect(ROLE_CHANGE_M_SEM.MAJOR).toBe(0.75)
    expect(mSemFromRoleEvidence(evidence({ startingLikelihood: 'LOW', roleChange: 'MAJOR' }))).toBeCloseTo(
      0.55 * 0.75,
      10,
    )
  })

  it('maps MEDIUM+MINOR to 0.85 × 0.90', () => {
    expect(mSemFromRoleEvidence(evidence({ startingLikelihood: 'MEDIUM', roleChange: 'MINOR' }))).toBeCloseTo(
      0.85 * 0.9,
      10,
    )
  })

  it('clamps to [0, 1]', () => {
    expect(mSemFromRoleEvidence(evidence())).toBeLessThanOrEqual(1)
    expect(mSemFromRoleEvidence(evidence({ startingLikelihood: 'LOW', roleChange: 'MAJOR' }))).toBeGreaterThanOrEqual(
      0,
    )
  })

  it('treats unreviewed players as m_sem = 1', () => {
    expect(mSemForPlayer(null)).toBe(1)
    expect(mSemForPlayer(undefined)).toBe(1)
    expect(enumSummary(null)).toContain('unreviewed')
  })

  it('reuses Phase 1 chance-table outputs for fitnessConcern', () => {
    expect(FITNESS_CONCERN_M.NONE).toBe(1)
    expect(FITNESS_CONCERN_M.MEDIUM).toBeCloseTo(0.6, 10)
    expect(FITNESS_CONCERN_M.HIGH).toBeCloseTo(0.3, 10)
  })
})
