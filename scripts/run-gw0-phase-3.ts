import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SeasonCache } from '../src/analysis/loadSeason'
import { runPhase3 } from '../src/analysis/runPhase3'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(root, '.cache/vaastav')
const docPath = resolve(root, 'docs/gw0-phase-3-squads.md')
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
  /* seed is optional; unreviewed players keep m_sem = 1 */
}

const result = await runPhase3({
  cache,
  seedRaw,
  writeMarkdown: (markdown) => writeFileSync(docPath, markdown),
})

console.log(
  JSON.stringify(
    {
      live: result.live,
      lpPoolSize: result.lpPoolSize,
      formation: result.formation,
      overlap: result.overlap.shared.length,
      shortOnly: result.overlap.onlyShort.map((row) => row.current.webName),
      longOnly: result.overlap.onlyLong.map((row) => row.current.webName),
      shortGw1: result.overlap.shortGw1,
      longGw16: result.overlap.longGw16,
      short: result.shortTerm.players.map((row) => row.current.webName),
      long: result.longTerm.players.map((row) => row.current.webName),
    },
    null,
    2,
  ),
)
console.log(
  `Wrote docs/gw0-phase-3-squads.md (LP=${result.lpPoolSize}, shared=${result.overlap.shared.length})`,
)
