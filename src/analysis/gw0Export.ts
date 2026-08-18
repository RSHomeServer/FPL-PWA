import { poundsFromTenths } from '../data/prices'
import type { PlayerPosition } from '../data/types'
import { epNextDelta, summariseEpNext } from './gw0EpNext'
import type { FormationId, SquadObjectiveName } from './gw0Squad'
import { positionPool } from './metrics'

export const GW0_EXPORT_DISCLAIMER =
  'ep_next is a reference column from the official API, not the LP objective. GW2–GW6 do not condition on post-GW1 events. Phase 0 GW1 RMSE is about 2.7 pts per player. Squad totals are sums of noisy player EPs.'

export type Gw0ExportablePlayer = {
  code: number
  current: { webName: string; firstName: string; secondName: string }
  position: PlayerPosition
  teamShortName: string
  nowCostTenths: number
  ePtsGw1: number
  ePtsGw16: number
  epNext: number | null
}

export type Gw0ExportableSquad = {
  objective: SquadObjectiveName
  formation: FormationId
  xi: readonly Gw0ExportablePlayer[]
  bench: readonly Gw0ExportablePlayer[]
  diagnostics: {
    spendTenths: number
    remainingTenths: number
    ePtsGw1: number
    ePtsGw16: number
  }
}

export type Gw0ExportPlayerRow = {
  code: number
  webName: string
  firstName: string
  secondName: string
  position: string
  club: string
  priceGbp: number
  eGw1: number
  eGw16: number
  epNext: number | null
  epNextDelta: number | null
  role: 'XI' | 'bench'
  benchOrder: number | null
}

export type Gw0ExportSquadBlock = {
  objective: SquadObjectiveName
  formation: FormationId
  spendGbp: number
  remainingBudgetGbp: number
  eGw1: number
  eGw16: number
  epNextSum: number
  epNextCompared: number
  epNextMissing: number
  epNextDelta: number | null
  xi: Gw0ExportPlayerRow[]
  bench: Gw0ExportPlayerRow[]
}

export type Gw0ExportPayload = {
  generatedAt: string
  source: '/gw0'
  disclaimer: string
  shortTerm: Gw0ExportSquadBlock
  longTerm: Gw0ExportSquadBlock
}

export function buildGw0ExportPayload(
  shortTerm: Gw0ExportableSquad,
  longTerm: Gw0ExportableSquad,
  generatedAt: string,
): Gw0ExportPayload {
  return {
    generatedAt,
    source: '/gw0',
    disclaimer: GW0_EXPORT_DISCLAIMER,
    shortTerm: exportSquad(shortTerm),
    longTerm: exportSquad(longTerm),
  }
}

export function gw0ExportJson(payload: Gw0ExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function gw0ExportCsv(payload: Gw0ExportPayload): string {
  const summaryHeader = [
    'squad',
    'formation',
    'spendGbp',
    'remainingBudgetGbp',
    'eGw1',
    'eGw16',
    'epNextSum',
    'epNextCompared',
    'epNextMissing',
    'epNextDelta',
  ]
  const playerHeader = [
    'squad',
    'role',
    'benchOrder',
    'webName',
    'firstName',
    'secondName',
    'code',
    'position',
    'club',
    'priceGbp',
    'eGw1',
    'eGw16',
    'epNext',
    'epNextDelta',
  ]
  const lines = [
    `# generatedAt,${csvCell(payload.generatedAt)}`,
    `# source,${csvCell(payload.source)}`,
    `# disclaimer,${csvCell(payload.disclaimer)}`,
    summaryHeader.join(','),
    summaryCsvRow('shortTerm', payload.shortTerm),
    summaryCsvRow('longTerm', payload.longTerm),
    '',
    playerHeader.join(','),
    ...playerCsvRows('shortTerm', payload.shortTerm),
    ...playerCsvRows('longTerm', payload.longTerm),
    '',
  ]
  return lines.join('\n')
}

export function gw0ExportFilename(generatedAt: string, ext: 'json' | 'csv'): string {
  const stamp = generatedAt.replace(/[:.]/g, '-').replace(/Z$/, 'Z')
  return `gw0-squads-${stamp}.${ext}`
}

function exportSquad(squad: Gw0ExportableSquad): Gw0ExportSquadBlock {
  const all = [...squad.xi, ...squad.bench]
  const summary = summariseEpNext(all)
  return {
    objective: squad.objective,
    formation: squad.formation,
    spendGbp: gbp(squad.diagnostics.spendTenths),
    remainingBudgetGbp: gbp(squad.diagnostics.remainingTenths),
    eGw1: squad.diagnostics.ePtsGw1,
    eGw16: squad.diagnostics.ePtsGw16,
    epNextSum: summary.epNextSum,
    epNextCompared: summary.compared,
    epNextMissing: summary.missing,
    epNextDelta: summary.delta,
    xi: squad.xi.map((player) => exportPlayer(player, 'XI', null)),
    bench: squad.bench.map((player, index) => exportPlayer(player, 'bench', index + 1)),
  }
}

function exportPlayer(
  player: Gw0ExportablePlayer,
  role: 'XI' | 'bench',
  benchOrder: number | null,
): Gw0ExportPlayerRow {
  return {
    code: player.code,
    webName: player.current.webName,
    firstName: player.current.firstName,
    secondName: player.current.secondName,
    position: positionPool(player.position),
    club: player.teamShortName,
    priceGbp: gbp(player.nowCostTenths),
    eGw1: player.ePtsGw1,
    eGw16: player.ePtsGw16,
    epNext: player.epNext,
    epNextDelta: epNextDelta(player.ePtsGw1, player.epNext),
    role,
    benchOrder,
  }
}

function gbp(tenths: number): number {
  return Number(poundsFromTenths(tenths).toFixed(1))
}

function summaryCsvRow(squad: 'shortTerm' | 'longTerm', block: Gw0ExportSquadBlock): string {
  return [
    csvCell(squad),
    csvCell(block.formation),
    csvNum(block.spendGbp),
    csvNum(block.remainingBudgetGbp),
    csvNum(block.eGw1),
    csvNum(block.eGw16),
    csvNum(block.epNextSum),
    String(block.epNextCompared),
    String(block.epNextMissing),
    block.epNextDelta == null ? '' : csvNum(block.epNextDelta),
  ].join(',')
}

function playerCsvRows(squad: 'shortTerm' | 'longTerm', block: Gw0ExportSquadBlock): string[] {
  return [...block.xi, ...block.bench].map((player) =>
    [
      csvCell(squad),
      csvCell(player.role),
      player.benchOrder == null ? '' : String(player.benchOrder),
      csvCell(player.webName),
      csvCell(player.firstName),
      csvCell(player.secondName),
      String(player.code),
      csvCell(player.position),
      csvCell(player.club),
      csvNum(player.priceGbp),
      csvNum(player.eGw1),
      csvNum(player.eGw16),
      player.epNext == null ? '' : csvNum(player.epNext),
      player.epNextDelta == null ? '' : csvNum(player.epNextDelta),
    ].join(','),
  )
}

function csvNum(value: number): string {
  return String(value)
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
