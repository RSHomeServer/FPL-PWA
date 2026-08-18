import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SeasonCache } from '../src/analysis/loadSeason'
import { runPhase0 } from '../src/analysis/runPhase0'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = resolve(root, '.cache/vaastav')
const docPath = resolve(root, 'docs/gw0-phase-0-validation.md')
mkdirSync(cacheDir, { recursive: true })

const cache: SeasonCache = {
  read(path: string) {
    try {
      return readFileSync(resolve(cacheDir, path), 'utf8')
    } catch {
      return null
    }
  },
  write(path: string, text: string) {
    const full = resolve(cacheDir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  },
}

const result = await runPhase0({
  cache,
  writeMarkdown: (markdown: string) => writeFileSync(docPath, markdown),
})
const rec = result.recommendation
console.log(
  JSON.stringify(
    {
      seasonsLoaded: result.seasonsLoaded,
      baselinePooled: result.baselinePooled,
      recommendation: rec,
      appendix: {
        currentPlayers: result.appendix.currentPlayers,
        currentFixtures: result.appendix.currentFixtures,
        currentGw1Fixtures: result.appendix.currentGw1Fixtures,
        xp2024: result.appendix.xp2024,
      },
    },
    null,
    2,
  ),
)
console.log(
  `Wrote docs/gw0-phase-0-validation.md (${rec.shrinkage}, k=${rec.kTrans}, α=${rec.alpha}, FDR=${rec.useFdr})`,
)
