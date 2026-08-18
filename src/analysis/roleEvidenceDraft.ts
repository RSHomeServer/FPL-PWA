import type { AutoFlagReason } from './gw0Funnel'
import type { RoleEvidence } from '../data/types'

const OFFICIAL_BOOTSTRAP = 'https://fantasy.premierleague.com/api/bootstrap-static/'

/**
 * Conservative enum draft for an auto-flagged player. Never assigns HIGH
 * startingLikelihood / roleContinuity / confidence. Used to seed the review
 * set; sourced upgrades may raise enums later.
 */
export function draftRoleEvidence(args: {
  reasons: readonly AutoFlagReason[]
  status: string
  news: string
  chanceNext: number | null
}): RoleEvidence {
  const reasons = new Set(args.reasons)
  const status = args.status.trim().toLowerCase()
  const news = args.news.trim()
  const chance = args.chanceNext

  let fitnessConcern: RoleEvidence['fitnessConcern'] = 'NONE'
  if (status === 'i' || status === 'u' || status === 's' || (chance != null && chance <= 25)) {
    fitnessConcern = 'HIGH'
  } else if (status === 'd' || (chance != null && chance < 100) || news.length > 0) {
    fitnessConcern = 'MEDIUM'
  }

  const newToPl = reasons.has('newToPl')
  const promoted = reasons.has('promotedClub')
  const newClub = reasons.has('newClub')
  const lowMinutes = reasons.has('lowMinutes')
  const doubtful = reasons.has('doubtful')

  const competitionForPlace: RoleEvidence['competitionForPlace'] =
    newToPl || promoted || lowMinutes ? 'HIGH' : newClub ? 'MEDIUM' : 'LOW'

  let startingLikelihood: RoleEvidence['startingLikelihood'] = 'MEDIUM'
  if (newToPl || promoted || (competitionForPlace === 'HIGH' && !newClub)) startingLikelihood = 'LOW'
  else if (doubtful && fitnessConcern === 'HIGH') startingLikelihood = 'LOW'
  else if (newClub) startingLikelihood = 'MEDIUM'

  const roleContinuity: RoleEvidence['roleContinuity'] = newToPl || promoted ? 'LOW' : newClub ? 'MEDIUM' : 'HIGH'
  const roleChange: RoleEvidence['roleChange'] = newToPl ? 'MAJOR' : newClub || promoted ? 'MINOR' : 'NONE'

  const notes: string[] = []
  notes.push(`Auto-flag: ${args.reasons.join(', ') || 'none'}.`)
  if (news) notes.push(`Official FPL news: ${news}`)
  if (chance != null) notes.push(`Official chance of playing next: ${chance}%.`)
  if (competitionForPlace === 'HIGH') {
    notes.push('Minutes look contested or unproven; startingLikelihood kept at MEDIUM or LOW.')
  }
  notes.push('No independent XI source in this draft; not guessing HIGH.')

  const sources = [OFFICIAL_BOOTSTRAP]
  return {
    startingLikelihood,
    roleContinuity,
    competitionForPlace,
    fitnessConcern,
    roleChange,
    evidenceNotes: notes.join(' '),
    sources,
    confidence: 'LOW',
  }
}
