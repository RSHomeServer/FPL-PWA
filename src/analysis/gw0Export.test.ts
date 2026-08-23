import { describe, expect, it } from 'vitest'
import {
  buildGw0ExportPayload,
  gw0ExportCsv,
  gw0ExportFilename,
  gw0ExportJson,
  GW0_EXPORT_DISCLAIMER,
  type Gw0ExportableSquad,
} from './gw0Export'

describe('GW0 export payload', () => {
  const generatedAt = '2026-08-18T12:00:00.000Z'
  const payload = buildGw0ExportPayload(shortSquad(), longSquad(), generatedAt)

  it('includes both 15s with XI, bench, prices, EP, remaining budget, formation, generated-at', () => {
    expect(payload.generatedAt).toBe(generatedAt)
    expect(payload.source).toBe('/gw0')
    expect(payload.disclaimer).toBe(GW0_EXPORT_DISCLAIMER)
    expect(payload.shortTerm).toMatchObject({
      objective: 'shortTerm',
      formation: '3-4-3',
      spendGbp: 99.5,
      remainingBudgetGbp: 0.5,
      eGw1: 6.5,
      eGw16: 30,
      epNextSum: 5,
      epNextCompared: 2,
      epNextMissing: 0,
      epNextDelta: 1.5,
    })
    expect(payload.pins).toEqual({ lockedCodes: [], excludedCodes: [], scope: 'both' })
    expect(payload.shortTerm.captain).toBeNull()
    expect(payload.shortTerm.xi).toEqual([
      {
        code: 10,
        webName: 'Saka',
        firstName: 'Bukayo',
        secondName: 'Saka',
        position: 'MID',
        club: 'ARS',
        priceGbp: 10.0,
        eGw1: 4.5,
        eGw16: 20,
        epNext: 3,
        epNextDelta: 1.5,
        role: 'XI',
        benchOrder: null,
        captaincy: null,
        pin: null,
      },
    ])
    expect(payload.shortTerm.bench).toEqual([
      {
        code: 11,
        webName: "Le Fée",
        firstName: 'Enzo',
        secondName: "Le Fée",
        position: 'MID',
        club: 'SUN',
        priceGbp: 5.5,
        eGw1: 2,
        eGw16: 10,
        epNext: 2,
        epNextDelta: 0,
        role: 'bench',
        benchOrder: 1,
        captaincy: null,
        pin: null,
      },
    ])
    expect(payload.longTerm.formation).toBe('4-4-2')
    expect(payload.longTerm.xi).toHaveLength(1)
    expect(payload.longTerm.bench).toHaveLength(1)
  })

  it('serialises JSON and CSV without a backend', () => {
    const json = gw0ExportJson(payload)
    const parsed = JSON.parse(json) as typeof payload
    expect(parsed.shortTerm.xi[0]?.webName).toBe('Saka')
    expect(parsed.longTerm.remainingBudgetGbp).toBe(1)
    expect(json.endsWith('\n')).toBe(true)

    const csv = gw0ExportCsv(payload)
    expect(csv).toContain(`# generatedAt,"${generatedAt}"`)
    expect(csv).toContain('# lockedCodes,')
    expect(csv).toContain('# pinScope,"both"')
    expect(csv).toContain('"shortTerm","3-4-3",99.5,0.5,6.5,30,5,2,0,1.5')
    expect(csv).toContain('"shortTerm","XI",,"Saka","Bukayo","Saka",10,"MID","ARS",10,4.5,20,3,1.5')
    expect(csv).toContain('"Le Fée"')
    expect(gw0ExportFilename(generatedAt, 'json')).toBe('gw0-squads-2026-08-18T12-00-00-000Z.json')
    expect(gw0ExportFilename(generatedAt, 'csv')).toBe('gw0-squads-2026-08-18T12-00-00-000Z.csv')
  })

  it('includes lock/exclude sets and the captain suggestion', () => {
    const withPins = buildGw0ExportPayload(shortSquad(), longSquad(), generatedAt, {
      pins: { lockedCodes: [10], excludedCodes: [21], scope: 'both' },
      shortCaptain: {
        captain: { code: 10, current: { webName: 'Saka' }, ePtsGw1: 4.5 },
        vice: { code: 11, current: { webName: "Le Fée" }, ePtsGw1: 2 },
        captainDoubledGw1: 9,
        squadGw1WithCaptain: 11,
        tossUp: false,
        tossUpDetail: null,
      },
    })
    expect(withPins.pins.lockedCodes).toEqual([10])
    expect(withPins.pins.excludedCodes).toEqual([21])
    expect(withPins.shortTerm.captain?.captainWebName).toBe('Saka')
    expect(withPins.shortTerm.xi[0]?.captaincy).toBe('C')
    expect(withPins.shortTerm.xi[0]?.pin).toBe('lock')
    expect(withPins.longTerm.bench[0]?.pin).toBe('exclude')
    const csv = gw0ExportCsv(withPins)
    expect(csv).toContain('# lockedCodes,10')
    expect(csv).toContain('# excludedCodes,21')
    expect(csv).toContain('"Saka","Le Fée",9,11')
    expect(csv).toContain(',C,lock')
  })
})

function shortSquad(): Gw0ExportableSquad {
  return {
    objective: 'shortTerm',
    formation: '3-4-3',
    diagnostics: { spendTenths: 995, remainingTenths: 5, ePtsGw1: 6.5, ePtsGw16: 30 },
    xi: [
      player({
        code: 10,
        webName: 'Saka',
        firstName: 'Bukayo',
        secondName: 'Saka',
        club: 'ARS',
        nowCostTenths: 100,
        ePtsGw1: 4.5,
        ePtsGw16: 20,
        epNext: 3,
      }),
    ],
    bench: [
      player({
        code: 11,
        webName: "Le Fée",
        firstName: 'Enzo',
        secondName: "Le Fée",
        club: 'SUN',
        nowCostTenths: 55,
        ePtsGw1: 2,
        ePtsGw16: 10,
        epNext: 2,
      }),
    ],
  }
}

function longSquad(): Gw0ExportableSquad {
  return {
    objective: 'longTerm',
    formation: '4-4-2',
    diagnostics: { spendTenths: 990, remainingTenths: 10, ePtsGw1: 5, ePtsGw16: 40 },
    xi: [
      player({
        code: 20,
        webName: 'Haaland',
        firstName: 'Erling',
        secondName: 'Haaland',
        club: 'MCI',
        position: 'FWD',
        nowCostTenths: 140,
        ePtsGw1: 5,
        ePtsGw16: 28,
        epNext: 4,
      }),
    ],
    bench: [
      player({
        code: 21,
        webName: 'Raya',
        firstName: 'David',
        secondName: 'Raya',
        club: 'ARS',
        position: 'GK',
        nowCostTenths: 55,
        ePtsGw1: 0,
        ePtsGw16: 12,
        epNext: null,
      }),
    ],
  }
}

function player(partial: {
  code: number
  webName: string
  firstName: string
  secondName: string
  club: string
  nowCostTenths: number
  ePtsGw1: number
  ePtsGw16: number
  epNext: number | null
  position?: 'GK' | 'DEF' | 'MID' | 'FWD'
}): Gw0ExportableSquad['xi'][number] {
  return {
    code: partial.code,
    current: {
      webName: partial.webName,
      firstName: partial.firstName,
      secondName: partial.secondName,
    },
    position: partial.position ?? 'MID',
    teamShortName: partial.club,
    nowCostTenths: partial.nowCostTenths,
    ePtsGw1: partial.ePtsGw1,
    ePtsGw16: partial.ePtsGw16,
    epNext: partial.epNext,
  }
}
