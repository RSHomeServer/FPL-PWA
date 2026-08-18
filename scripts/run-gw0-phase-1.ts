import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SeasonCache } from '../src/analysis/loadSeason'
import { runPhase1 } from '../src/analysis/runPhase1'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(root, '.cache/vaastav')
const docPath = resolve(root, 'docs/gw0-phase-1-prototype.md')
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

const result = await runPhase1({
  cache,
  writeMarkdown: (markdown: string) => writeFileSync(docPath, markdown),
})
console.log(
  JSON.stringify(
    {
      live: result.live,
      pool: result.pool,
      sample: result.sample.map((row) => ({
        name: row.current.webName,
        pos: row.position,
        price: row.nowCostTenths / 10,
        ePtsGw1: row.ePtsGw1,
        ePtsGw16: row.ePtsGw16,
        confidence: row.confidence.label,
        epNext: row.epNext,
      })),
    },
    null,
    2,
  ),
)
console.log(`Wrote docs/gw0-phase-1-prototype.md (n=${result.pool.n}, sample=${result.sample.length})`)
