import { poundsFromTenths } from '../data/prices'
import type { PlayerPosition } from '../data/types'
import { positionPool } from './metrics'
import { auditLine, type Gw0Projection } from './gw0Project'
import { roundN } from './stats'

export type Phase1Result = {
  generatedAt: string
  priorSeasonId: string
  live: {
    seasonId: string
    playerCount: number
    teamCount: number
    fixtureCount: number
    gw1Fixtures: number
    nextEventId: number | null
    nextEventDeadline: string
  }
  pool: {
    n: number
    withRate: number
    newToPl: number
    transferred: number
    unknownClub: number
    unfit: number
  }
  sample: Gw0Projection[]
}

export function renderPhase1Markdown(result: Phase1Result): string {
  const lines: string[] = [
    '# GW0 Phase 1 — official API ingest and as-of-GW0 projections',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    'Prototype output of `docs/gw0-modelling-plan.md` §18 table 1.1–1.5. Produced by `npm run gw0:phase1`.',
    '',
    'This is **not** a recommended 15-player squad. There is no optimiser in this ticket. Rows below are a small sample across positions so the join, rates, FDR, fitness, and audit trail can be inspected against live 2026/27 data.',
    '',
    '## Sources',
    '',
    `- Official FPL bootstrap + fixtures (${result.live.playerCount} elements, ${result.live.fixtureCount} fixtures). Prices are \`now_cost\` from this API, not vaastav.`,
    `- Prior rates: vaastav **${result.priorSeasonId}** \`players_raw\` + \`merged_gw\` (join key **\`code\`**, never season \`id\`).`,
    `- Next event: GW${result.live.nextEventId ?? '?'} (${result.live.nextEventDeadline || 'unknown deadline'}).`,
    `- Live season id: \`${result.live.seasonId}\`.`,
    '',
    '## Defaults (Phase 0 — not re-fit here)',
    '',
    '| Knob | Value |',
    '| --- | --- |',
    '| Shrinkage | linear / 900 |',
    '| $k_{\\mathrm{trans}}$ | 0.75 (unknown club continuity ⇒ 1) |',
    '| Rate model | Approach A only (α = 1). Approach B is diagnostic. |',
    '| FDR | Frozen multi-season multiplicative tables from Phase 0 |',
    '| Home/away ±5% | Off |',
    '| DEF/GK blend | 0.5 / 0.3 |',
    '| $m_{\\mathrm{sem}}$ | 1.0 |',
    '| horizon_factor | 1.0 |',
    '',
    'Honest GW1 accuracy remains about **2.7 pts RMSE per player**. Do not read the table as a claim of better skill.',
    '',
    '## Horizon',
    '',
    '> GW2–GW6 projections do not condition on unknown future events that may occur after GW1.',
    '',
    'Each GW uses the same as-of-GW0 rate prior; only that GW’s official fixtures (FDR) change.',
    '',
    '## Pool',
    '',
    `| Check | n |`,
    `| --- | --- |`,
    `| Official elements with \`code\` | ${result.pool.n} |`,
    `| Joined with ≥90 prior minutes | ${result.pool.withRate} |`,
    `| New-to-PL / <90 prior minutes | ${result.pool.newToPl} |`,
    `| Transferred | ${result.pool.transferred} |`,
    `| Unknown club continuity | ${result.pool.unknownClub} |`,
    `| $m_{\\mathrm{fitness}}=0$ | ${result.pool.unfit} |`,
    `| GW1 fixtures | ${result.live.gw1Fixtures} |`,
    '',
    '## Sample (not a best 15)',
    '',
    '| Player | Pos | Club | Price | adj_p90 | E min GW1 | FDR GW1 | E pts GW1 | E pts GW1–6 | Conf | ep_next | Audit (GW1) |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | --- |',
    ...result.sample.map(sampleRow),
    '',
    '`ep_next` is a **reference column** from the official API, not the projection objective. EPPM is computed in the engine as a diagnostic and is not shown as a ranking.',
    '',
    '## How to rerun',
    '',
    '```bash',
    'node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"',
    'npm install',
    'npm test',
    'npm run gw0:phase1',
    '```',
    '',
    'Vaastav CSVs cache under `.cache/vaastav/`. Official JSON is fetched live (6h Dexie TTL in the browser source).',
    '',
  ]
  return lines.join('\n')
}

function sampleRow(row: Gw0Projection): string {
  const gw1 = row.auditByGw[0]
  const fdr = gw1 ? gw1.fdrBuckets.map((bucket) => (bucket == null ? '?' : String(bucket))).join('/') : '—'
  const name = row.current.webName || `${row.current.firstName} ${row.current.secondName}`.trim()
  const pos = positionPool(row.position) as PlayerPosition
  return `| ${name} | ${pos} | ${row.teamShortName || row.teamName} | ${poundsFromTenths(row.nowCostTenths).toFixed(1)} | ${fmt(row.adjP90)} | ${fmt(row.expectedMinutesGw1)} | ${fdr} | ${fmt(row.ePtsGw1)} | ${fmt(row.ePtsGw16)} | ${row.confidence.label} | ${row.epNext == null ? '—' : fmt(row.epNext)} | ${gw1 ? auditLine(gw1) : ''} |`
}

function fmt(value: number): string {
  return String(roundN(value, 2))
}
