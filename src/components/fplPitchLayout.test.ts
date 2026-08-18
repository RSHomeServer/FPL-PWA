import { describe, expect, it } from 'vitest'
import { parsePitchFormation, pitchLineOf, pitchPlayersByLine } from './fplPitchLayout'

describe('parsePitchFormation', () => {
  it('treats 3-4-3 as one GK plus DEF-MID-FWD', () => {
    expect(parsePitchFormation('3-4-3')).toEqual([
      { id: 'GK', count: 1 },
      { id: 'DEF', count: 3 },
      { id: 'MID', count: 4 },
      { id: 'FWD', count: 3 },
    ])
  })

  it('keeps an explicit 1-4-4-2 keeper count', () => {
    expect(parsePitchFormation('1-4-4-2')).toEqual([
      { id: 'GK', count: 1 },
      { id: 'DEF', count: 4 },
      { id: 'MID', count: 4 },
      { id: 'FWD', count: 2 },
    ])
  })

  it('folds 4-2-3-1 middle bands into midfield', () => {
    expect(parsePitchFormation('4-2-3-1')).toEqual([
      { id: 'GK', count: 1 },
      { id: 'DEF', count: 4 },
      { id: 'MID', count: 5 },
      { id: 'FWD', count: 1 },
    ])
  })

  it('accepts count objects and clamps nonsense', () => {
    expect(parsePitchFormation({ GK: 1, DEF: 5, MID: 3, FWD: 2 })).toEqual([
      { id: 'GK', count: 1 },
      { id: 'DEF', count: 5 },
      { id: 'MID', count: 3 },
      { id: 'FWD', count: 2 },
    ])
    expect(parsePitchFormation({ DEF: 99, FWD: -2 }).map((row) => row.count)).toEqual([1, 11, 0, 0])
  })
})

describe('pitchPlayersByLine', () => {
  it('maps AM to MID and keeps extras when counts do not match', () => {
    const rows = pitchPlayersByLine(
      [
        { id: 1, position: 'GK' },
        { id: 2, position: 'DEF' },
        { id: 3, position: 'DEF' },
        { id: 4, position: 'AM' },
        { id: 5, position: 'FWD' },
      ],
      '3-4-3',
    )
    expect(rows.map((row) => [row.line.id, row.players.map((player) => player?.id)])).toEqual([
      ['GK', [1]],
      ['DEF', [2, 3]],
      ['MID', [4]],
      ['FWD', [5]],
    ])
  })

  it('pads empty slots when asked', () => {
    const rows = pitchPlayersByLine([{ id: 1, position: 'GK' }], { GK: 1, DEF: 2, MID: 0, FWD: 0 }, {
      showEmptySlots: true,
    })
    expect(rows.find((row) => row.line.id === 'DEF')?.players).toEqual([null, null])
  })

  it('normalises GKP and unknown labels', () => {
    expect(pitchLineOf('GKP')).toBe('GK')
    expect(pitchLineOf('st')).toBe('MID')
  })
})
