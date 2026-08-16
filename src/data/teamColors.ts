import type { CSSProperties } from 'react'
import type { FplTeam } from './types'

/** Premier League club codes (`teams.csv` `code`) → kit primary for row tint. */
const COLOR_BY_CODE: Record<number, string> = {
  1: '#DA291C',
  2: '#FFCD00',
  3: '#EF0107',
  4: '#241F20',
  6: '#132257',
  7: '#670E36',
  8: '#034694',
  11: '#003399',
  13: '#003090',
  14: '#C8102E',
  17: '#E53233',
  20: '#D71920',
  21: '#7A263A',
  31: '#1B458F',
  36: '#0057B8',
  39: '#FDB913',
  40: '#0033A0',
  43: '#6CABDD',
  49: '#EE2737',
  54: '#9B8248',
  56: '#EB172B',
  90: '#6C1D45',
  91: '#B50E12',
  94: '#E30613',
  102: '#F78F1E',
}

const COLOR_BY_SHORT: Record<string, string> = {
  ARS: '#EF0107',
  AVL: '#670E36',
  BOU: '#B50E12',
  BRE: '#E30613',
  BHA: '#0057B8',
  BUR: '#6C1D45',
  CHE: '#034694',
  CRY: '#1B458F',
  EVE: '#003399',
  FUL: '#9B8248',
  IPS: '#0033A0',
  LEE: '#FFCD00',
  LEI: '#003090',
  LIV: '#C8102E',
  LUT: '#F78F1E',
  MCI: '#6CABDD',
  MUN: '#DA291C',
  NEW: '#241F20',
  NFO: '#E53233',
  SOU: '#D71920',
  SUN: '#EB172B',
  SHU: '#EE2737',
  TOT: '#132257',
  WHU: '#7A263A',
  WOL: '#FDB913',
}

export function teamTintColor(team?: Pick<FplTeam, 'code' | 'shortName'> | null): string | undefined {
  if (!team) return undefined
  if (team.code > 0 && COLOR_BY_CODE[team.code]) return COLOR_BY_CODE[team.code]
  const short = team.shortName.trim().toUpperCase()
  return COLOR_BY_SHORT[short]
}

export function teamRowStyle(team?: Pick<FplTeam, 'code' | 'shortName'> | null): CSSProperties | undefined {
  const color = teamTintColor(team)
  if (!color) return undefined
  return { ['--fpl-team' as string]: color }
}
