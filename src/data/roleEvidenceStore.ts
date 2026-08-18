import { getFplCacheDb } from './db'
import type { RoleEvidenceRecord } from './types'

export async function readStoredRoleEvidence(): Promise<RoleEvidenceRecord[]> {
  const db = getFplCacheDb()
  return db.roleEvidence.toArray()
}

export async function upsertRoleEvidence(record: RoleEvidenceRecord): Promise<void> {
  const db = getFplCacheDb()
  await db.roleEvidence.put(record)
}
