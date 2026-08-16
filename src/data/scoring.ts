import type { FplPerformance, PlayerPosition } from './types'

export type ScorePart = {
  label: string
  points: number
}

function isDefensiveLine(position: PlayerPosition): boolean {
  return position === 'GK' || position === 'DEF'
}

function isMidfield(position: PlayerPosition): boolean {
  return position === 'MID' || position === 'AM'
}

/** FPL appearance: 1 pt for 1–59 minutes, 2 pts for 60+. */
export function appearancePoints(minutes: number): number {
  if (minutes <= 0) return 0
  return minutes >= 60 ? 2 : 1
}

export function goalPoints(position: PlayerPosition, goals: number): number {
  if (goals <= 0) return 0
  const perGoal = position === 'FWD' ? 4 : isMidfield(position) ? 5 : 6
  return perGoal * goals
}

export function cleanSheetPoints(
  position: PlayerPosition,
  minutes: number,
  cleanSheets: number,
): number {
  if (cleanSheets <= 0 || minutes < 60) return 0
  if (isDefensiveLine(position)) return 4
  if (isMidfield(position)) return 1
  return 0
}

export function concededPoints(position: PlayerPosition, goalsConceded: number): number {
  if (!isDefensiveLine(position) || goalsConceded <= 0) return 0
  return -Math.floor(goalsConceded / 2)
}

export function savePoints(position: PlayerPosition, saves: number): number {
  if (position !== 'GK' || saves <= 0) return 0
  return Math.floor(saves / 3)
}

/**
 * 2025-26 defensive contribution: 2 pts when the published count meets the
 * position threshold (DEF 10 CBI, MID/FWD 12 CBIT). Older seasons omit the field.
 */
export function defensiveContributionPoints(
  position: PlayerPosition,
  defensiveContribution: number | null,
): number {
  if (defensiveContribution == null || position === 'GK' || position === 'UNK') return 0
  const threshold = position === 'DEF' ? 10 : 12
  return defensiveContribution >= threshold ? 2 : 0
}

export function scoreParts(
  row: Pick<
    FplPerformance,
    | 'minutes'
    | 'totalPoints'
    | 'goalsScored'
    | 'assists'
    | 'cleanSheets'
    | 'saves'
    | 'bonus'
    | 'goalsConceded'
    | 'ownGoals'
    | 'penaltiesMissed'
    | 'penaltiesSaved'
    | 'yellowCards'
    | 'redCards'
    | 'defensiveContribution'
  >,
  position: PlayerPosition,
): ScorePart[] {
  const parts: ScorePart[] = []
  const appearance = appearancePoints(row.minutes)
  if (appearance) parts.push({ label: `${row.minutes} min`, points: appearance })
  if (row.goalsScored > 0) parts.push({ label: `${row.goalsScored}G`, points: goalPoints(position, row.goalsScored) })
  if (row.assists > 0) parts.push({ label: `${row.assists}A`, points: 3 * row.assists })
  const cleanSheet = cleanSheetPoints(position, row.minutes, row.cleanSheets)
  if (cleanSheet) parts.push({ label: 'CS', points: cleanSheet })
  const conceded = concededPoints(position, row.goalsConceded)
  if (conceded) parts.push({ label: `${row.goalsConceded} GC`, points: conceded })
  const saves = savePoints(position, row.saves)
  if (saves) parts.push({ label: `${row.saves} sv`, points: saves })
  if (row.penaltiesSaved > 0) parts.push({ label: `${row.penaltiesSaved} pen save`, points: 5 * row.penaltiesSaved })
  if (row.penaltiesMissed > 0) parts.push({ label: `${row.penaltiesMissed} pen miss`, points: -2 * row.penaltiesMissed })
  if (row.ownGoals > 0) parts.push({ label: `${row.ownGoals} OG`, points: -2 * row.ownGoals })
  if (row.yellowCards > 0) parts.push({ label: `${row.yellowCards} YC`, points: -1 * row.yellowCards })
  if (row.redCards > 0) parts.push({ label: `${row.redCards} RC`, points: -3 * row.redCards })
  const dc = defensiveContributionPoints(position, row.defensiveContribution)
  if (dc) parts.push({ label: 'DC', points: dc })
  if (row.bonus > 0) parts.push({ label: `${row.bonus} bonus`, points: row.bonus })

  const accounted = parts.reduce((sum, part) => sum + part.points, 0)
  const residual = row.totalPoints - accounted
  if (residual !== 0) parts.push({ label: 'other', points: residual })
  return parts
}

export function formatEvent(parts: readonly ScorePart[]): string {
  if (parts.length === 0) return 'Did not play'
  return parts
    .map((part) => `${part.label} (${part.points > 0 ? '+' : ''}${part.points})`)
    .join(' · ')
}

export function formatMetric(value: number | null, applicable: boolean): string {
  if (!applicable || value == null) return 'NA'
  return String(value)
}

export function cleanSheetApplicable(position: PlayerPosition): boolean {
  return position === 'GK' || position === 'DEF' || position === 'MID' || position === 'AM'
}

export function savesApplicable(position: PlayerPosition): boolean {
  return position === 'GK'
}

export function concededApplicable(position: PlayerPosition): boolean {
  return position === 'GK' || position === 'DEF'
}

export function defensiveContributionApplicable(
  position: PlayerPosition,
  defensiveContribution: number | null,
): boolean {
  return defensiveContribution != null && position !== 'GK' && position !== 'UNK'
}
