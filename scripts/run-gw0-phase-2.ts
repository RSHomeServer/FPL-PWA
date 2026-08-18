import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SeasonCache } from '../src/analysis/loadSeason'
import { runPhase2 } from '../src/analysis/runPhase2'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(root, '.cache/vaastav')
const docPath = resolve(root, 'docs/gw0-phase-2-funnel.md')
const seedPath = resolve(root, 'src/analysis/gw0RoleEvidence.seed.json')
mkdirSync(cacheDir, { recursive: true })

const cache: SeasonCache = {
  read(path) {
    try {
      return readFileSync(resolve(cacheDir, path), 'utf8')
    } catch {
      return null
    }
  },
  write(path, text) {
    const full = resolve(cacheDir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  },
}

let seedRaw: unknown = { generatedAt: '', seasonId: '2026-27', records: [] }
try {
  seedRaw = JSON.parse(readFileSync(seedPath, 'utf8'))
} catch {
  /* seed file is created on the first fill */
}

const result = await runPhase2({
  cache,
  seedRaw,
  writeMarkdown: (markdown) => writeFileSync(docPath, markdown),
})
console.log(
  JSON.stringify(
    {
      live: result.live,
      counts: result.funnel.counts,
      eppmCutoffByPosition: result.funnel.eppmCutoffByPosition,
      minutesFloor: result.funnel.minutesFloor,
      seedCount: result.seedCount,
      unreviewed: result.unreviewedCodes.length,
      flagged: result.reviewed.map((row) => ({
        code: row.before.code,
        liveId: row.before.current.id,
        webName: row.before.current.webName,
        team: row.before.teamShortName,
        pos: row.before.position,
        price: row.before.nowCostTenths / 10,
        status: row.before.current.status,
        news: row.before.current.news,
        chanceNext: row.before.current.chanceOfPlayingNextRound,
        minutes: row.before.prior?.minutes ?? 0,
        reasons: row.autoFlagReasons,
        epBefore: row.before.ePtsGw1,
        epAfter: row.after.ePtsGw1,
        mSem: row.after.mSem,
        seeded: Boolean(row.seed),
      })),
    },
    null,
    2,
  ),
)
console.log(
  `Wrote docs/gw0-phase-2-funnel.md (LP=${result.lpCount}, flags=${result.funnel.counts.autoFlag}, seed=${result.seedCount})`,
)
