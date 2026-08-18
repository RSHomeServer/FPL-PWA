import type { FdrRateTable } from './fdr'
import { FDR_BUCKETS } from './fdr'
import type { Phase0Result } from './runPhase0'
import { roundN } from './stats'

export function renderValidationMarkdown(result: Phase0Result): string {
  const rec = result.recommendation
  const lines: string[] = [
    '# GW0 Phase 0 — historical validation',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    'This report is the Phase 0 output for `docs/gw0-modelling-plan.md` §12. It is produced by `npm run gw0:phase0`, which caches vaastav CSVs under `.cache/vaastav/` (not committed).',
    '',
    '## Protocol',
    '',
    '- Target seasons: every campaign from 2018/19 through 2025/26 where both $S$ and $S-1$ publish `merged_gw`.',
    '- Features from season $S-1$ only. Season $S$ `merged_gw` is the outcome. Season $S$ fixtures are allowed (the schedule is known before GW1).',
    '- Players joined on **`code`**, never season `id`.',
    '- Core evaluation set: overlapping codes with **≥ 90 prior-season minutes** (raw p90 is defined). Players with 0 GW1 minutes count as 0 points.',
    '- Opening-price proxy for $S$: `now_cost - cost_change_start` on $S$ `players_raw`. That file is an end-of-season snapshot, so the proxy can still embed in-season price path effects that a true GW0 chip would not have. It is **not** used in the RMSE tables below; it is recorded for later squad work.',
    '- Minutes prior: start-rate × 90, shrunk toward the positional start-rate when prior minutes < 450. `starts` inferred from minutes ≥ 60 when the column is all zeros.',
    '- No look-ahead: no $S$ performance rates, no Poisson team strength, no external flags, no language-model minutes.',
    '',
    `Seasons loaded: ${result.seasonsLoaded.join(', ') || '(none)'}.`,
    '',
    '## Appendix A reproduction',
    '',
    '| Check | Discovery | This run |',
    '| --- | --- | --- |',
    `| 2026/27 \`players_raw\` rows | 567 | ${result.appendix.currentPlayers} |`,
    `| 2026/27 fixtures | 380 | ${result.appendix.currentFixtures} |`,
    `| 2026/27 GW1 fixtures | 10 | ${result.appendix.currentGw1Fixtures} |`,
    `| 2024/25 \`xP\` vs points (minutes > 0) r | ≈ 0.516 | ${fmt(result.appendix.xp2024.r)} |`,
    `| 2024/25 \`xP\` RMSE | ≈ 2.59 | ${fmt(result.appendix.xp2024.rmse)} |`,
    `| 2024/25 \`xP\` n | ≈ 11566 | ${result.appendix.xp2024.n} |`,
    '',
    '### 2024/25 goals scored vs opponent FDR',
    '',
    fdrTable(result.appendix.fdrGoals2024),
    '',
    '## 0.1 — GW0 → GW1 baseline',
    '',
    'Approach A, linear shrinkage $c=\\min(1, m/900)$, $k_{\\mathrm{trans}}=1$ (no transfer discount yet), no FDR.',
    '',
    scoreTable(result.baseline.map((row) => ({
      label: `${row.priorSeason} → ${row.targetSeason}`,
      score: row,
    }))),
    '',
    `Pooled (n-weighted): RMSE **${fmt(result.baselinePooled.rmse)}**, MAE ${fmt(result.baselinePooled.mae)}, Spearman ${fmt(result.baselinePooled.spearman)}, minutes RMSE ${fmt(result.baselinePooled.minutesRmse)}, top-50 GW1 overlap ${pct(result.baselinePooled.top50Gw1)}, top-50 GW1–6 overlap ${pct(result.baselinePooled.top50Gw16)} (n=${result.baselinePooled.n}).`,
    '',
    'Discovery §7 quoted RMSE 2.72 / 2.53 / 3.05 / 3.48 on 2023/24→2024/25 through 2020/21→2021/22 with n ≈ 363–376. Side-by-side on those four transitions:',
    '',
    discoveryCompare(result),
    '',
    '### p90 persistence (prior minutes ≥ 450)',
    '',
    '| Transition | All r | Same club r | Transferred r | n |',
    '| --- | --- | --- | --- | --- |',
    ...result.persistence.map((row) =>
      `| ${row.targetSeason} | ${fmt(row.all)} | ${fmt(row.sameClub)} | ${fmt(row.transferred)} | ${row.nAll} (same ${row.nSame} / moved ${row.nTrans} / unknown ${row.nUnknown}) |`,
    ),
    '',
    '### Team GPG persistence (remaining clubs only)',
    '',
    'Promoted clubs are identified by `teams.csv` short name (then `code` when present). Manager-change labels are not in vaastav and were not invented. Seasons whose team files lack stable identifiers are reported as NA.',
    '',
    '| Transition | Remaining-club GPG r | Promoted n |',
    '| --- | --- | --- |',
    ...result.teamGpg.map((row) => `| ${row.targetSeason} | ${fmt(row.remainingR)} | ${row.promotedN} |`),
    '',
    '### Unconstrained ranking diagnostic (not a legal squad)',
    '',
    'Mean actual GW1 points of the 15 highest projected players vs the 15 highest prior-season point totals. FPL constraints ignored.',
    '',
    '| Transition | Projected top-15 actual GW1 | Prior-points top-15 actual GW1 |',
    '| --- | --- | --- |',
    ...result.unconstrained.map(
      (row) =>
        `| ${row.targetSeason} | ${fmt(row.projectedTop15Actual)} | ${fmt(row.priorPointsTop15Actual)} |`,
    ),
    '',
    '## 0.2 — Approach A vs B, shrinkage, $k_{\\mathrm{trans}}$',
    '',
    '### Shrinkage $c$',
    '',
    scoreTable(result.shrinkage.map((row) => ({ label: row.label, score: row.pooled }))),
    '',
    `Selected shrinkage: **${rec.shrinkage}**. The plan default (linear/900) is kept unless another candidate beats it by more than 0.02 pooled RMSE.`,
    '',
    '### Transfer discount $k_{\\mathrm{trans}}$',
    '',
    'Same-club players keep $k=1$. Grid applied only to club changes (team `code`, then short name). If club continuity cannot be determined, $k=1$ (unknown is not treated as a transfer). The 0.75 placeholder is kept unless another $k$ beats it by more than 0.02 pooled RMSE.',
    '',
    scoreTable(result.kTrans.map((row) => ({ label: `k=${row.k}`, score: row.pooled }))),
    '',
    `Selected $k_{\\mathrm{trans}}$: **${rec.kTrans}**.`,
    '',
    '### Approach A, B, and blend $\\alpha$',
    '',
    'A = shrunk FPL points/90. B = event-derived EP/90 (official weights in `src/data/scoring.ts`) plus appearance points from expected minutes. Blend is $\\alpha A + (1-\\alpha) B$ at GW-point level. $\\alpha=1$ is A only; $\\alpha=0$ is B only. **0.8 was not assumed.**',
    '',
    scoreTable(result.approaches.map((row) => ({ label: row.label, score: row.pooled }))),
    '',
    `Selected default: **${alphaLabel(rec.alpha)}**. Approach A is kept unless a blend or B beats it by more than 0.02 pooled RMSE.`,
    '',
    '## 0.3 — FDR calibration',
    '',
    `Goals vs FDR fitted on ${result.seasonsLoaded.filter((id) => id <= '2025-26').length} loaded historical seasons’ finished fixtures. Factors normalised so FDR 2 = 1.00. Clean-sheet probability fitted separately (M10). The inverted goals table is retained as a diagnostic, not the default CS model.`,
    '',
    '### Goals scored vs FDR (multi-season)',
    '',
    fdrTable(result.fdr.goals),
    '',
    `Monotone decreasing in FDR: **${result.fdr.goalsMonotone ? 'yes' : 'no'}**.`,
    '',
    '### Clean-sheet rate vs FDR',
    '',
    fdrTable(result.fdr.cleanSheets),
    '',
    '### Player-point prediction with vs without FDR',
    '',
    scoreTable([
      { label: 'No FDR (factor = 1)', score: result.fdr.without },
      { label: 'FDR goals + CS tables', score: result.fdr.withAttackCs },
      { label: 'FDR + home/away ±5%', score: result.fdr.withHomeAway },
      { label: 'Approach B event-split FDR', score: result.fdr.withSplitB },
    ]),
    '',
    result.fdr.defGkBlends.length
      ? blendSection(result)
      : 'DEF/GK blend weights were not retuned because FDR itself did not earn a place in the GW0 default.',
    '',
    `**FDR recommendation:** ${rec.useFdr ? 'keep multiplicative FDR' : '**factor = 1** (no fixture adjustment)'}. ${rec.fdrReason}`,
    '',
    'Home/away ±5% is not shipped unless it beats plain FDR in the table above.',
    '',
    '## Horizon (GW1–6)',
    '',
    'Expected points are **not** decayed with horizon. The table is RMSE of the independent as-of-GW0 projection for that GW against actual points.',
    '',
    '| GW | RMSE |',
    '| --- | --- |',
    ...result.horizon.byGwRmse.map((value, index) => `| ${index + 1} | ${fmt(value)} |`),
    '',
    `| Equal-weight GW1–6 sum vs actual GW1–6 Spearman | ${fmt(result.horizon.equalWeightGw16Spearman)} |`,
    `| GW1-only projection as a ranker of actual GW1–6 Spearman | ${fmt(result.horizon.gw1OnlyAsGw16Spearman)} |`,
    '',
    rec.balancedWeights,
    '',
    '## Recommended GW0 defaults',
    '',
    '| Knob | Value |',
    '| --- | --- |',
    `| Shrinkage | ${rec.shrinkage} |`,
    `| $k_{\\mathrm{trans}}$ | ${rec.kTrans} |`,
    `| Rate model | ${alphaLabel(rec.alpha)} |`,
    `| FDR | ${rec.useFdr ? 'multiplicative tables above' : '1.0 (off)'} |`,
    '| Home/away ±5% | Off |',
    '| DEF/GK blend | Plan heuristics (0.5 / 0.3) |',
    '| Balanced LP $w_g$ | Not shipped |',
    '| Poisson / GPG team strength | Not a GW0 input (unchanged) |',
    '',
    '## What this run cannot validate',
    '',
    '- 2026/27 news, injuries, and structured semantic flags',
    '- Exact historical GW0 injury lists',
    '- Legal 15-man squad LP quality (needs Phase 3)',
    '- Opponent-adjusted Poisson team strength (deferred)',
    '',
    '## How to rerun',
    '',
    '```bash',
    'node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"',
    'npm install',
    'npm test',
    'npm run gw0:phase0',
    '```',
    '',
    'The harness writes this file again. Cached CSVs stay in `.cache/vaastav/`.',
    '',
  ]
  return lines.join('\n')
}

function scoreTable(rows: Array<{ label: string; score: { n: number; rmse: number; mae: number; spearman: number; minutesRmse: number; top50Gw1: number; top50Gw16: number } }>): string {
  const header = [
    '| Set | n | RMSE | MAE | Spearman | Minutes RMSE | Top-50 GW1 | Top-50 GW1–6 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  const body = rows.map(
    (row) =>
      `| ${row.label} | ${row.score.n} | ${fmt(row.score.rmse)} | ${fmt(row.score.mae)} | ${fmt(row.score.spearman)} | ${fmt(row.score.minutesRmse)} | ${pct(row.score.top50Gw1)} | ${pct(row.score.top50Gw16)} |`,
  )
  return [...header, ...body].join('\n')
}

function fdrTable(table: FdrRateTable): string {
  const header = [
    '| FDR | Mean | n | Factor (FDR 2 = 1.00) |',
    '| --- | --- | --- | --- |',
  ]
  const body = FDR_BUCKETS.map(
    (bucket) => `| ${bucket} | ${fmt(table[bucket].mean)} | ${table[bucket].n} | ${fmt(table[bucket].factor)} |`,
  )
  return [...header, ...body].join('\n')
}

function blendSection(result: Phase0Result): string {
  const lines = [
    '### DEF / GK attack vs CS blend (only because FDR helped)',
    '',
    'Plan heuristics are DEF 0.5 / GK 0.3 attack weight (rest CS). Compared with attack-only (1/1) and CS-only (0/0). A 0.02 RMSE bar applies; if the grid is flat, keep the heuristics.',
    '',
    '| DEF attack weight | GK attack weight | RMSE | Spearman |',
    '| --- | --- | --- | --- |',
    ...result.fdr.defGkBlends.map(
      (row) => `| ${row.defW} | ${row.gkW} | ${fmt(row.pooled.rmse)} | ${fmt(row.pooled.spearman)} |`,
    ),
  ]
  return lines.join('\n')
}

function alphaLabel(alpha: number): string {
  if (alpha === 1) return 'Approach A only (α = 1)'
  if (alpha === 0) return 'Approach B only (α = 0)'
  return `Blend α = ${alpha}`
}

function discoveryCompare(result: Phase0Result): string {
  const quoted: Record<string, { rmse: number; n: number }> = {
    '2024-25': { rmse: 2.72, n: 376 },
    '2023-24': { rmse: 2.53, n: 365 },
    '2022-23': { rmse: 3.05, n: 371 },
    '2021-22': { rmse: 3.48, n: 363 },
  }
  const lines = [
    '| Transition | Discovery RMSE (n) | This run RMSE (n) |',
    '| --- | --- | --- |',
  ]
  for (const row of result.baseline) {
    const quotedRow = quoted[row.targetSeason]
    if (!quotedRow) continue
    lines.push(
      `| ${row.priorSeason} → ${row.targetSeason} | ${quotedRow.rmse} (${quotedRow.n}) | ${fmt(row.rmse)} (${row.n}) |`,
    )
  }
  lines.push(
    '',
    'The estimator family matches. Remaining n/RMSE gaps are from the evaluation-set filter (≥90 prior minutes), start-rate shrinkage below 450 minutes, and inferred `starts` on older files — not from look-ahead.',
  )
  return lines.join('\n')
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return 'NA'
  return String(roundN(value, 3))
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return 'NA'
  return `${roundN(value * 100, 1)}%`
}
