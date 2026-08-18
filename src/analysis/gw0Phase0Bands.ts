/** Committed Phase 0 RMSE summary for `/gw0`. Do not re-fit defaults here. */

export const PHASE0_BANDS_SOURCE = 'docs/gw0-phase-0-validation.md' as const

export const SQUAD_RMSE_NOTE =
  "Squad totals are sums of noisy per-player EPs. Phase 0's unconstrained top-15 diagnostic is mean actual GW1 points of the 15 highest projected players versus prior-points leaders, with FPL constraints ignored — not a legal-squad RMSE, so none is shown."

export type Phase0ScoreRow = {
  label: string
  n: number
  rmse: number
  mae: number
  spearman: number
}

export type Phase0HorizonRow = {
  gw: number
  rmse: number
}

export type Gw0Phase0Bands = {
  source: typeof PHASE0_BANDS_SOURCE
  generatedAt: string
  shippedGw1: Phase0ScoreRow
  baselinePooled: Phase0ScoreRow
  transitions: Phase0ScoreRow[]
  transitionRmseMin: number
  transitionRmseMax: number
  horizonByGw: Phase0HorizonRow[]
  squadRmse: null
  squadRmseNote: string
}

const SCORE_HEADER = '| Set | n | RMSE |'

export function parsePhase0Bands(markdown: string): Gw0Phase0Bands {
  const generatedAt = markdown.match(/^Generated:\s*(\S+)/m)?.[1]
  if (!generatedAt) throw new Error('Phase 0 report missing Generated timestamp')

  const section01 = sliceUntilNextH2(markdown, '## 0.1')
  const transitions = parseScoreTable(section01).filter((row) => row.label.includes('→'))
  if (transitions.length < 4) {
    throw new Error(`Phase 0.1 table: need ≥4 transitions, got ${transitions.length}`)
  }

  const baselinePooled = parsePooledLine(section01)
  const fdrBlock = sliceUntilNextH3(
    markdown,
    '### Player-point prediction with vs without FDR',
  )
  const shipped = parseScoreTable(fdrBlock).find((row) => row.label === 'FDR goals + CS tables')
  if (!shipped) throw new Error('Missing FDR goals + CS tables row')

  const horizonByGw = parseHorizonTable(sliceUntilNextH2(markdown, '## Horizon'))
  if (horizonByGw.length !== 6) {
    throw new Error(`Horizon table: need GW1–6, got ${horizonByGw.length}`)
  }

  const rmses = transitions.map((row) => row.rmse)
  return {
    source: PHASE0_BANDS_SOURCE,
    generatedAt,
    shippedGw1: shipped,
    baselinePooled,
    transitions,
    transitionRmseMin: Math.min(...rmses),
    transitionRmseMax: Math.max(...rmses),
    horizonByGw,
    squadRmse: null,
    squadRmseNote: SQUAD_RMSE_NOTE,
  }
}

export function asPhase0Bands(raw: unknown): Gw0Phase0Bands {
  if (!raw || typeof raw !== 'object') throw new Error('Phase 0 bands JSON is not an object')
  const row = raw as Gw0Phase0Bands
  if (row.source !== PHASE0_BANDS_SOURCE) throw new Error(`Unexpected bands source: ${String(row.source)}`)
  if (row.squadRmse !== null) throw new Error('squadRmse must be null')
  if (!Array.isArray(row.transitions) || row.transitions.length < 4) {
    throw new Error('Phase 0 bands JSON missing transitions')
  }
  if (!Array.isArray(row.horizonByGw) || row.horizonByGw.length !== 6) {
    throw new Error('Phase 0 bands JSON missing GW1–6 horizon')
  }
  assertScore(row.shippedGw1, 'shippedGw1')
  assertScore(row.baselinePooled, 'baselinePooled')
  const min = Math.min(...row.transitions.map((item) => item.rmse))
  const max = Math.max(...row.transitions.map((item) => item.rmse))
  if (row.transitionRmseMin !== min || row.transitionRmseMax !== max) {
    throw new Error('transition RMSE min/max does not match the table')
  }
  if (typeof row.squadRmseNote !== 'string' || row.squadRmseNote.length < 20) {
    throw new Error('squadRmseNote missing')
  }
  return row
}

export function serializePhase0Bands(bands: Gw0Phase0Bands): string {
  return `${JSON.stringify(bands, null, 2)}\n`
}

export function renderPhase4Markdown(bands: Gw0Phase0Bands): string {
  const shipped = bands.shippedGw1
  const horizon = bands.horizonByGw.map((row) => `| ${row.gw} | ${row.rmse} |`).join('\n')
  return [
    '# GW0 Phase 4 — in-app validation',
    '',
    `Generated: ${bands.generatedAt}`,
    '',
    'Output of `docs/gw0-modelling-plan.md` §18 Phase 4. Produced by `npm run gw0:phase4`.',
    '',
    '`/gw0` loads a committed JSON summary of `docs/gw0-phase-0-validation.md`. It does not re-run the Phase 0 harness or re-fit defaults.',
    '',
    '## What the UI shows',
    '',
    `- Shipped GW1 pooled skill (FDR goals + CS tables): RMSE **${shipped.rmse}**, MAE ${shipped.mae}, Spearman ${shipped.spearman} (n=${shipped.n}).`,
    `- Per-transition GW1 RMSE range from the Phase 0.1 table: **${bands.transitionRmseMin}–${bands.transitionRmseMax}** (Approach A, no FDR, $k_{\\mathrm{trans}}=1$).`,
    '- Independent as-of-GW0 GW1–6 RMSE from the Horizon table.',
    '- Per-player and per-15 `E[pts GW1]` vs official `ep_next` (reference only), plus largest `|delta|` in the LP pool.',
    '- JSON and CSV download of both 15s.',
    '',
    '## Horizon RMSE (copied, not re-fit)',
    '',
    '| GW | RMSE |',
    '| --- | --- |',
    horizon,
    '',
    '## Squad RMSE',
    '',
    bands.squadRmseNote,
    '',
    '## How to regenerate',
    '',
    '```bash',
    'npm run gw0:phase4',
    '```',
    '',
    'Reads `docs/gw0-phase-0-validation.md` and writes `src/analysis/gw0Phase0Bands.json` plus this file.',
    '',
  ].join('\n')
}

function assertScore(row: Phase0ScoreRow, label: string): void {
  if (!row || typeof row.label !== 'string') throw new Error(`${label} missing`)
  for (const key of ['n', 'rmse', 'mae', 'spearman'] as const) {
    if (!Number.isFinite(row[key])) throw new Error(`${label}.${key} is not finite`)
  }
}

function sliceUntilNextH2(markdown: string, headingPrefix: string): string {
  const start = markdown.indexOf(headingPrefix)
  if (start < 0) throw new Error(`Missing heading ${headingPrefix}`)
  const after = markdown.slice(start)
  const next = after.slice(headingPrefix.length).search(/\n## /)
  return next < 0 ? after : after.slice(0, headingPrefix.length + next)
}

function sliceUntilNextH3(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading)
  if (start < 0) throw new Error(`Missing heading ${heading}`)
  const after = markdown.slice(start)
  const next = after.slice(heading.length).search(/\n### /)
  return next < 0 ? after : after.slice(0, heading.length + next)
}

function parseScoreTable(section: string): Phase0ScoreRow[] {
  const idx = section.indexOf(SCORE_HEADER)
  if (idx < 0) throw new Error('Missing score table')
  const rest = section.slice(idx)
  const blank = rest.search(/\n\n/)
  const block = blank < 0 ? rest : rest.slice(0, blank)
  const rows: Phase0ScoreRow[] = []
  for (const line of block.split('\n')) {
    const cells = splitRow(line)
    if (!cells || cells[0] === 'Set') continue
    rows.push({
      label: cells[0],
      n: num(cells[1]),
      rmse: num(cells[2]),
      mae: num(cells[3]),
      spearman: num(cells[4]),
    })
  }
  if (rows.length === 0) throw new Error('Empty score table')
  return rows
}

function parsePooledLine(section: string): Phase0ScoreRow {
  const match = section.match(
    /Pooled \(n-weighted\): RMSE \*\*([0-9.]+)\*\*, MAE ([0-9.]+), Spearman ([0-9.]+).*\(n=(\d+)\)/,
  )
  if (!match) throw new Error('Missing pooled GW1 line')
  return {
    label: 'Pooled (n-weighted, 0.1 baseline)',
    rmse: num(match[1]),
    mae: num(match[2]),
    spearman: num(match[3]),
    n: num(match[4]),
  }
}

function parseHorizonTable(section: string): Phase0HorizonRow[] {
  const idx = section.indexOf('| GW | RMSE |')
  if (idx < 0) throw new Error('Missing horizon table')
  const rest = section.slice(idx)
  const blank = rest.search(/\n\n/)
  const block = blank < 0 ? rest : rest.slice(0, blank)
  const rows: Phase0HorizonRow[] = []
  for (const line of block.split('\n')) {
    const cells = splitRow(line)
    if (!cells || cells[0] === 'GW') continue
    rows.push({ gw: num(cells[0]), rmse: num(cells[1]) })
  }
  return rows
}

function splitRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  if (/^\|[\s:|-]+\|$/.test(trimmed)) return null
  return trimmed
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function num(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Not a number: ${value ?? ''}`)
  return parsed
}
