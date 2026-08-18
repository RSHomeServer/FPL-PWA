import type {
  FitnessConcern,
  RoleChange,
  RoleEvidence,
  RoleEvidenceRecord,
  StartingLikelihood,
} from '../data/types'

/** Modelling plan §13 — startingLikelihood → m_sem. */
export const STARTING_LIKELIHOOD_M_SEM: Record<StartingLikelihood, number> = {
  HIGH: 1,
  MEDIUM: 0.85,
  LOW: 0.55,
}

/** Modelling plan §13 — extra roleChange multiplier. */
export const ROLE_CHANGE_M_SEM: Record<RoleChange, number> = {
  NONE: 1,
  MINOR: 0.9,
  MAJOR: 0.75,
}

/**
 * When official chance fields are empty and status is available, map
 * `fitnessConcern` onto the Phase 1 chance-table outputs (not a new scale):
 * NONE → 100% → 1.00; MEDIUM → 50% → 0.60; HIGH → 25% → 0.30.
 */
export const FITNESS_CONCERN_M: Record<FitnessConcern, number> = {
  NONE: 1,
  MEDIUM: 0.6,
  HIGH: 0.3,
}

export function mSemFromRoleEvidence(evidence: RoleEvidence): number {
  const raw =
    STARTING_LIKELIHOOD_M_SEM[evidence.startingLikelihood] * ROLE_CHANGE_M_SEM[evidence.roleChange]
  return clamp01(raw)
}

/** Unreviewed players keep m_sem = 1 (Phase 1 default). */
export function mSemForPlayer(evidence: RoleEvidence | null | undefined): number {
  if (!evidence) return 1
  return mSemFromRoleEvidence(evidence)
}

export function enumSummary(evidence: RoleEvidence | null | undefined): string {
  if (!evidence) return 'start=— change=— unreviewed'
  return `start=${evidence.startingLikelihood} change=${evidence.roleChange}`
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function fitnessFromConcern(concern: FitnessConcern): number {
  return FITNESS_CONCERN_M[concern]
}

export function evidenceFromRecord(record: RoleEvidenceRecord): RoleEvidence {
  return {
    startingLikelihood: record.startingLikelihood,
    roleContinuity: record.roleContinuity,
    competitionForPlace: record.competitionForPlace,
    fitnessConcern: record.fitnessConcern,
    roleChange: record.roleChange,
    evidenceNotes: record.evidenceNotes,
    sources: [...record.sources],
    confidence: record.confidence,
  }
}

/** Seed first, Dexie overlay wins on the same `code`. */
export function mergeRoleEvidence(
  seed: readonly RoleEvidenceRecord[],
  stored: readonly RoleEvidenceRecord[] = [],
): RoleEvidenceRecord[] {
  const byCode = new Map<number, RoleEvidenceRecord>()
  for (const row of seed) byCode.set(row.code, row)
  for (const row of stored) byCode.set(row.code, row)
  return [...byCode.values()]
}

export function roleEvidenceByCode(
  records: readonly RoleEvidenceRecord[],
): Map<number, RoleEvidence> {
  const map = new Map<number, RoleEvidence>()
  for (const record of records) {
    if (record.code > 0) map.set(record.code, evidenceFromRecord(record))
  }
  return map
}

export type RoleEvidenceSeedFile = {
  generatedAt: string
  seasonId: string
  records: RoleEvidenceRecord[]
}

export function parseRoleEvidenceSeed(raw: unknown): RoleEvidenceRecord[] {
  if (!raw || typeof raw !== 'object') return []
  const records = (raw as { records?: unknown }).records
  if (!Array.isArray(records)) return []
  const out: RoleEvidenceRecord[] = []
  for (const row of records) {
    const parsed = parseRoleEvidenceRecord(row)
    if (parsed) out.push(parsed)
  }
  return out
}

export function parseRoleEvidenceRecord(raw: unknown): RoleEvidenceRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const code = asPositiveInt(row.code)
  if (code == null) return null
  const startingLikelihood = asEnum(row.startingLikelihood, ['HIGH', 'MEDIUM', 'LOW'] as const)
  const roleContinuity = asEnum(row.roleContinuity, ['HIGH', 'MEDIUM', 'LOW'] as const)
  const competitionForPlace = asEnum(row.competitionForPlace, ['HIGH', 'MEDIUM', 'LOW'] as const)
  const fitnessConcern = asEnum(row.fitnessConcern, ['NONE', 'MEDIUM', 'HIGH'] as const)
  const roleChange = asEnum(row.roleChange, ['NONE', 'MINOR', 'MAJOR'] as const)
  const confidence = asEnum(row.confidence, ['HIGH', 'MEDIUM', 'LOW'] as const)
  if (
    !startingLikelihood ||
    !roleContinuity ||
    !competitionForPlace ||
    !fitnessConcern ||
    !roleChange ||
    !confidence
  ) {
    return null
  }
  const sources = Array.isArray(row.sources)
    ? row.sources.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  return {
    code,
    liveId: asPositiveInt(row.liveId) ?? null,
    webName: typeof row.webName === 'string' ? row.webName : '',
    updatedAt: typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
    startingLikelihood,
    roleContinuity,
    competitionForPlace,
    fitnessConcern,
    roleChange,
    evidenceNotes: typeof row.evidenceNotes === 'string' ? row.evidenceNotes : '',
    sources,
    confidence,
  }
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.trunc(value)
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}
