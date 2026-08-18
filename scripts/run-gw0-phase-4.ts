import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePhase0Bands, renderPhase4Markdown, serializePhase0Bands } from '../src/analysis/gw0Phase0Bands'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = resolve(root, 'docs/gw0-phase-0-validation.md')
const jsonPath = resolve(root, 'src/analysis/gw0Phase0Bands.json')
const docPath = resolve(root, 'docs/gw0-phase-4.md')

const markdown = readFileSync(reportPath, 'utf8')
const bands = parsePhase0Bands(markdown)
writeFileSync(jsonPath, serializePhase0Bands(bands))
writeFileSync(docPath, renderPhase4Markdown(bands))

console.log(
  JSON.stringify(
    {
      generatedAt: bands.generatedAt,
      shippedGw1: bands.shippedGw1,
      transitionRmseMin: bands.transitionRmseMin,
      transitionRmseMax: bands.transitionRmseMax,
      horizonByGw: bands.horizonByGw,
      jsonPath,
      docPath,
    },
    null,
    2,
  ),
)
console.log(
  `Wrote Phase 4 summary from ${bands.generatedAt} (RMSE ${bands.shippedGw1.rmse}, range ${bands.transitionRmseMin}–${bands.transitionRmseMax})`,
)
