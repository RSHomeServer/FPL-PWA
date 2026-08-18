import { formatGbpFromTenths, poundsFromTenths } from '../data/prices'
import type { Gw0FunnelResult } from './gw0Funnel'
import { auditLine } from './gw0Project'
import {
  playerAuditLine,
  SQUAD_OBJECTIVES,
  type FormationId,
  type OrderedSquad,
  type SquadOverlap,
} from './gw0Squad'
import { GW0_SOLVER_PACKAGE } from './gw0Solver'
import { positionPool } from './metrics'
import { roundN } from './stats'

export type Phase3Result = {
  generatedAt: string
  priorSeasonId: string
  solverNote: string
  formation: FormationId
  live: {
    seasonId: string
    playerCount: number
    teamCount: number
    fixtureCount: number
    gw1Fixtures: number
    nextEventId: number | null
    nextEventDeadline: string
  }
  lpPoolSize: number
  funnelCounts: Gw0FunnelResult['counts']
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  overlap: SquadOverlap
}

export function renderPhase3Markdown(result: Phase3Result): string {
  const overlap = result.overlap
  const lines: string[] = [
    '# GW0 Phase 3 — starting-squad MILP',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    'Output of `docs/gw0-modelling-plan.md` §14 / §15 / §18 Phase 3. Produced by `npm run gw0:phase3`.',
    '',
    'These 15s maximise **expected FPL points** under official constraints. They are not a unique “best” squad. Phase 0 GW1 RMSE is about 2.7 pts per player. Price, expected contribution, and value stay separate; EPPM and `ep_next` are diagnostics / reference only.',
    '',
    '## Solver',
    '',
    result.solverNote,
    '',
    `Package: \`${GW0_SOLVER_PACKAGE}\`. Formulation is TypeScript (CPLEX LP text) shared by the CLI and the \`/gw0\` route.`,
    '',
    '## Sources',
    '',
    `- Official FPL bootstrap + fixtures (${result.live.playerCount} elements, ${result.live.fixtureCount} fixtures).`,
    `- Prior rates: vaastav **${result.priorSeasonId}** (join key **\`code\`**).`,
    `- Next event: GW${result.live.nextEventId ?? '?'} (${result.live.nextEventDeadline || 'unknown deadline'}).`,
    `- Live season id: \`${result.live.seasonId}\`.`,
    `- LP pool: ${result.lpPoolSize} (Phase 2 quantitative funnel; \`m_fitness = 0\` excluded). Funnel LP count ${result.funnelCounts.lpPool}.`,
    `- Default XI formation: **${result.formation}**.`,
    '',
    '## Objectives (two, not three)',
    '',
    'Phase 0 did not fit balanced weights `w_g`. Shipped:',
    '',
    '| Name | Objective |',
    '| --- | --- |',
    ...SQUAD_OBJECTIVES.map((row) => `| **${row.label}** | \`${row.formula}\` |`),
    '',
    '## EP trade-off',
    '',
    `| Squad | Σ E pts GW1 | Σ E pts GW1–6 | Spend | Remaining | Shared players |`,
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Short-term | ${fmt(overlap.shortGw1)} | ${fmt(overlap.shortGw16)} | ${money(result.shortTerm.diagnostics.spendTenths)} | ${money(result.shortTerm.diagnostics.remainingTenths)} | ${overlap.shared.length} |`,
    `| Long-term | ${fmt(overlap.longGw1)} | ${fmt(overlap.longGw16)} | ${money(result.longTerm.diagnostics.spendTenths)} | ${money(result.longTerm.diagnostics.remainingTenths)} | ${overlap.shared.length} |`,
    '',
    `Overlap **${overlap.shared.length}**. Short-term only: ${names(overlap.onlyShort) || '—'}. Long-term only: ${names(overlap.onlyLong) || '—'}.`,
    '',
    squadSection('Short-term', result.shortTerm),
    squadSection('Long-term', result.longTerm),
    '## Limitation',
    '',
    'GW2–GW6 projections do **not** condition on post-GW1 events (injuries, price changes, realised minutes). They reuse the same as-of-GW0 rates with a different FDR. Edit minutes evidence at `/gw0-flags`, then re-solve.',
    '',
    '## Transfer flexibility (v1 exposure only)',
    '',
    'Remaining budget, spend by line, 3-of-club flags, and fixture-cliff names are shown above. A future ticket can add a multi-week transfer-path MILP (hits, price changes, chip windows). That model is **not** in this phase.',
    '',
    '## How to rerun',
    '',
    '```bash',
    'node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"',
    'npm install',
    'npm test',
    'npm run gw0:phase3',
    '```',
    '',
    'Open `/gw0` in the PWA to inspect the same two squads in the browser.',
    '',
  ]
  return lines.join('\n')
}

function squadSection(title: string, squad: OrderedSquad): string {
  const d = squad.diagnostics
  const lineSpend = `GK ${money(d.spendByLine.GK)} · DEF ${money(d.spendByLine.DEF)} · MID ${money(d.spendByLine.MID)} · FWD ${money(d.spendByLine.FWD)}`
  const clubs = d.clubs
    .filter((row) => row.n >= 2)
    .map((row) => `${row.shortName}×${row.n}${row.flagged ? ' (3-of-club)' : ''}`)
    .join(', ')
  const cliffs =
    d.cliffs.length === 0
      ? 'None with two or more FDR 4–5 fixtures in GW4–6.'
      : d.cliffs.map((row) => `${row.player.current.webName} (${row.cliff.detail})`).join('; ')
  return [
    `## ${title} 15`,
    '',
    `${lineSpend}. Clubs with 2+: ${clubs || 'none'}.`,
    '',
    `Fixture cliff: ${cliffs}`,
    '',
    '| Player | Pos | Club | Price | E GW1 | E GW1–6 | Conf | ep_next | XI / bench | Audit (GW1) |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |',
    ...squad.players.map((player) => playerRow(player, squad)),
    '',
    `Best XI (${squad.formation}): ${names(squad.xi)}.`,
    '',
    `Bench order (GW1 EP; GK last among remaining): ${names(squad.bench)}.`,
    '',
  ].join('\n')
}

function playerRow(player: OrderedSquad['players'][number], squad: OrderedSquad): string {
  const pos = positionPool(player.position)
  const xiSet = new Set(squad.xi.map((row) => row.code))
  const benchIndex = squad.bench.findIndex((row) => row.code === player.code)
  const role = xiSet.has(player.code) ? 'XI' : `bench ${benchIndex + 1}`
  const epNext = player.epNext == null ? '—' : fmt(player.epNext)
  const audit = player.auditByGw[0] ? auditLine(player.auditByGw[0]) : playerAuditLine(player)
  return `| ${player.current.webName} | ${pos} | ${player.teamShortName} | ${poundsFromTenths(player.nowCostTenths).toFixed(1)} | ${fmt(player.ePtsGw1)} | ${fmt(player.ePtsGw16)} | ${player.confidence.label} | ${epNext} | ${role} | ${audit} |`
}

function names(players: ReadonlyArray<{ current: { webName: string } }>): string {
  return players.map((player) => player.current.webName).join(', ')
}

function money(tenths: number): string {
  return formatGbpFromTenths(tenths)
}

function fmt(value: number): string {
  return String(roundN(value, 2))
}

