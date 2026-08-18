import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import bandsFile from './gw0Phase0Bands.json'
import {
  asPhase0Bands,
  parsePhase0Bands,
  serializePhase0Bands,
  SQUAD_RMSE_NOTE,
} from './gw0Phase0Bands'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('Phase 0 RMSE bands summary', () => {
  const markdown = readFileSync(resolve(root, 'docs/gw0-phase-0-validation.md'), 'utf8')
  const parsed = parsePhase0Bands(markdown)

  it('reads pooled GW1, per-transition range, shipped FDR row, and GW1–6 horizon', () => {
    expect(parsed.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed.transitions).toHaveLength(8)
    expect(parsed.baselinePooled).toMatchObject({ n: 2992, rmse: 2.83, mae: 2.256, spearman: 0.332 })
    expect(parsed.shippedGw1).toMatchObject({
      label: 'FDR goals + CS tables',
      n: 2992,
      rmse: 2.671,
      mae: 1.954,
      spearman: 0.347,
    })
    expect(parsed.transitionRmseMin).toBe(2.473)
    expect(parsed.transitionRmseMax).toBe(3.145)
    expect(parsed.horizonByGw.map((row) => row.gw)).toEqual([1, 2, 3, 4, 5, 6])
    expect(parsed.horizonByGw[0]?.rmse).toBe(2.677)
    expect(parsed.squadRmse).toBeNull()
    expect(parsed.squadRmseNote).toBe(SQUAD_RMSE_NOTE)
  })

  it('matches the committed JSON snapshot', () => {
    const committed = asPhase0Bands(bandsFile)
    expect(committed).toEqual(parsed)
    expect(serializePhase0Bands(committed)).toBe(serializePhase0Bands(parsed))
  })
})
