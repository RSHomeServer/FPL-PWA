import type { RoleEvidenceRecord } from '../data/types'
import { AUTO_FLAG_REASONS, type AutoFlagReason, type Gw0FunnelResult, type FunnelLpReason } from './gw0Funnel'
import { auditLine, type Gw0Projection } from './gw0Project'
import { positionPool } from './metrics'
import { mSemFromRoleEvidence } from './roleEvidence'
import { roundN } from './stats'

export type Phase2ReviewedRow = {
  before: Gw0Projection
  after: Gw0Projection
  seed: RoleEvidenceRecord | null
  autoFlagReasons: AutoFlagReason[]
  lpReasons: FunnelLpReason[]
}

export type Phase2Result = {
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
  funnel: Gw0FunnelResult
  lpCount: number
  seedCount: number
  reviewed: Phase2ReviewedRow[]
  unreviewedCodes: Array<{ code: number; webName: string; team: string }>
}

export function renderPhase2Markdown(result: Phase2Result): string {
  const { funnel } = result
  const t = funnel.thresholds
  const floors = t.positionFloors
  const reviewedWithSeed = result.reviewed.filter((row) => row.seed)
  const lines: string[] = [
    '# GW0 Phase 2 — quantitative funnel and RoleEvidence',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    'Prototype output of `docs/gw0-modelling-plan.md` §13 / §18 Phase 2. Produced by `npm run gw0:phase2`.',
    '',
    'This is **not** a recommended 15-player squad. There is no optimiser in this ticket.',
    '',
    '## Sources',
    '',
    `- Official FPL bootstrap + fixtures (${result.live.playerCount} elements, ${result.live.fixtureCount} fixtures).`,
    `- Prior rates: vaastav **${result.priorSeasonId}** (join key **\`code\`**).`,
    `- Next event: GW${result.live.nextEventId ?? '?'} (${result.live.nextEventDeadline || 'unknown deadline'}).`,
    `- Live season id: \`${result.live.seasonId}\`.`,
    `- RoleEvidence seed: \`src/analysis/gw0RoleEvidence.seed.json\` (${result.seedCount} records). Unreviewed LP players keep \`m_sem = 1\`.`,
    '',
    '## Shipped thresholds',
    '',
    'The modelling-plan funnel shape is unchanged (selectable → drop unavailable → quantitative OR → auto-flag). Counts on live 2026/27 with the *proposed* 60% EPPM / 20% minutes knobs were LP ≈ 416 and flags ≈ 188, so the numeric cutoffs were tightened:',
    '',
    '| Knob | Shipped value | Notes |',
    '| --- | --- | --- |',
    `| Position EP floors | GK ${floors.GK}, DEF ${floors.DEF}, MID ${floors.MID}, FWD ${floors.FWD} | GW1 Approach A expected points |`,
    `| EPPM keep-top fraction | ${(t.eppmKeepTopFraction * 100).toFixed(0)}% **within position** among available players | Retuned from 60% of the whole available pool |`,
    `| EPPM cutoffs (this run) | GK ${fmt(funnel.eppmCutoffByPosition.GK)}, DEF ${fmt(funnel.eppmCutoffByPosition.DEF)}, MID ${fmt(funnel.eppmCutoffByPosition.MID)}, FWD ${fmt(funnel.eppmCutoffByPosition.FWD)} | Inclusive; players at or above the cutoff pass |`,
    `| Prior minutes share | ${(t.minutesShareOfSeason * 100).toFixed(0)}% of 38×90 = **${funnel.minutesFloor.toFixed(0)} minutes** | Retuned from 20% (684) |`,
    `| Auto-flag low minutes | < ${t.lowMinutes} PL minutes | Unchanged from the plan |`,
    '',
    '## Funnel counts',
    '',
    '```text',
    `All with code (${funnel.counts.all})`,
    `  → selectable (${funnel.counts.selectable})`,
    `  → exclude unavailable / cannot select (−${funnel.counts.excludedUnavailable})`,
    `  → available (${funnel.counts.available})`,
    `  → quantitative LP pool (${funnel.counts.lpPool})`,
    `  → auto-flag for review (${funnel.counts.autoFlag})`,
    '```',
    '',
    '| Check | n |',
    '| --- | ---: |',
    `| Official elements with \`code\` | ${funnel.counts.all} |`,
    `| Selectable | ${funnel.counts.selectable} |`,
    `| Available (\`canSelect\` and \`m_fitness>0\`) | ${funnel.counts.available} |`,
    `| LP pool | ${funnel.counts.lpPool} |`,
    `| Auto-flag review set | ${funnel.counts.autoFlag} |`,
    `| Seeded RoleEvidence | ${result.seedCount} |`,
    `| Unreviewed in the flag set | ${result.unreviewedCodes.length} |`,
    `| GW1 fixtures | ${result.live.gw1Fixtures} |`,
    '',
    '### LP inclusion reasons (OR; a player may count in more than one)',
    '',
    `| Reason | n |`,
    `| --- | ---: |`,
    `| \`epFloor\` | ${funnel.counts.lpByReason.epFloor} |`,
    `| \`eppm\` | ${funnel.counts.lpByReason.eppm} |`,
    `| \`minutesShare\` | ${funnel.counts.lpByReason.minutesShare} |`,
    '',
    '### Auto-flag reasons (OR; machine-readable on each row)',
    '',
    `| Reason | n |`,
    `| --- | ---: |`,
    ...AUTO_FLAG_REASONS.map((reason) => `| \`${reason}\` | ${funnel.counts.flagByReason[reason]} |`),
    '',
    '## Before / after GW1 EP (reviewed flag set)',
    '',
    '`m_sem` for unreviewed flagged players stays 1.00. Seeded rows apply `startingLikelihood × roleChange`. Fitness still comes from the official API; `fitnessConcern` is audit unless both chance fields are empty.',
    '',
    '| Player | Pos | Club | Flags | start / change | m_sem | E min before | E min after | EP GW1 before | EP GW1 after |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...result.reviewed.map(reviewRow),
    '',
    result.unreviewedCodes.length
      ? [
          '## Unreviewed flagged players',
          '',
          'These codes were auto-flagged but have no seed row. They keep `m_sem = 1` until reviewed:',
          '',
          ...result.unreviewedCodes.map((row) => `- ${row.webName} (${row.team}) \`code=${row.code}\``),
          '',
        ].join('\n')
      : 'All auto-flagged players have a seed row.\n',
    '## Sample audit lines (after m_sem)',
    '',
    '| Player | Audit (GW1) |',
    '| --- | --- |',
    ...reviewedWithSeed.slice(0, 12).map((row) => {
      const name = row.after.current.webName
      const audit = row.after.auditByGw[0]
      return `| ${name} | ${audit ? auditLine(audit) : ''} |`
    }),
    '',
    '## How to rerun',
    '',
    '```bash',
    'node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"',
    'npm install',
    'npm test',
    'npm run gw0:phase2',
    '```',
    '',
    'Inspect or edit enums in the PWA at `/gw0-flags` (Dexie overlay on the committed seed).',
    '',
  ]
  return lines.join('\n')
}

function reviewRow(row: Phase2ReviewedRow): string {
  const name = row.after.current.webName
  const pos = positionPool(row.after.position)
  const flags = row.autoFlagReasons.join(',')
  const start = row.seed?.startingLikelihood ?? '—'
  const change = row.seed?.roleChange ?? '—'
  const mSem = row.seed ? mSemFromRoleEvidence(row.seed) : 1
  return `| ${name} | ${pos} | ${row.after.teamShortName} | ${flags} | ${start} / ${change} | ${fmt(mSem)} | ${fmt(row.before.expectedMinutesGw1)} | ${fmt(row.after.expectedMinutesGw1)} | ${fmt(row.before.ePtsGw1)} | ${fmt(row.after.ePtsGw1)} |`
}

function fmt(value: number): string {
  return String(roundN(value, 2))
}
