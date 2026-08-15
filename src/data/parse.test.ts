import { describe, expect, it } from 'vitest'
import { parseCsv, parseIntField } from './csv'
import { gameweekFromRow, parsePerformanceRow, parsePlayerRow, positionFromElementType } from './parse'
import { formatGbpFromTenths, poundsFromTenths } from './prices'

describe('parseCsv', () => {
  it('parses quoted commas and headers', () => {
    const rows = parseCsv('id,name\n1,"Haaland, Erling"\n')
    expect(rows).toEqual([{ id: '1', name: 'Haaland, Erling' }])
  })
})

describe('prices', () => {
  it('converts tenths of a million to pounds', () => {
    expect(poundsFromTenths(100)).toBe(10)
    expect(formatGbpFromTenths(62)).toBe('£6.2m')
  })
})

describe('IDs and positions', () => {
  it('keeps FPL element ids and maps element_type', () => {
    const player = parsePlayerRow('2025-26', {
      id: '1',
      code: '154561',
      first_name: 'David',
      second_name: 'Raya Martín',
      web_name: 'Raya',
      team: '1',
      element_type: '1',
      now_cost: '60',
      total_points: '162',
      minutes: '3330',
      goals_scored: '0',
      assists: '0',
      form: '0.0',
      selected_by_percent: '30.7',
    })
    expect(player?.id).toBe(1)
    expect(player?.position).toBe('GK')
    expect(player?.nowCostTenths).toBe(60)
    expect(positionFromElementType('MID')).toBe('MID')
  })

  it('rejects rows without a player id', () => {
    expect(parsePlayerRow('2025-26', { id: '', web_name: 'Nobody' })).toBeNull()
  })
})

describe('gameweek alignment', () => {
  it('prefers round over GW', () => {
    expect(gameweekFromRow({ round: '12', GW: '99' })).toBe(12)
    expect(gameweekFromRow({ GW: '3' })).toBe(3)
  })

  it('parses merged_gw element + round', () => {
    const row = parsePerformanceRow('2018-19', {
      element: '54',
      round: '',
      GW: '7',
      fixture: '',
      id: '9001',
      minutes: '90',
      total_points: '6',
      goals_scored: '1',
      assists: '0',
      was_home: 'True',
      opponent_team: '4',
      value: '85',
      kickoff_time: '2018-10-01T19:00:00Z',
      team: 'Arsenal',
    })
    expect(row?.playerId).toBe(54)
    expect(row?.round).toBe(7)
    expect(row?.fixture).toBe(9001)
    expect(row?.valueTenths).toBe(85)
  })
})

describe('parseIntField', () => {
  it('treats None as missing', () => {
    expect(parseIntField('None', 0)).toBe(0)
    expect(parseIntField('12')).toBe(12)
  })
})
