import { describe, expect, it } from 'vitest'
import { parseCsv, parseIntField } from './csv'
import {
  dedupePerformances,
  gameweekFromRow,
  parsePerformanceRow,
  parsePlayerRow,
  parseTeamRow,
  positionFromElementType,
} from './parse'
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
    expect(player?.code).toBe(154561)
    expect(positionFromElementType('MID')).toBe('MID')
  })

  it('parses team code from teams.csv when present', () => {
    const team = parseTeamRow('2025-26', {
      id: '1',
      name: 'Arsenal',
      short_name: 'ARS',
      code: '3',
      strength: '4',
      strength_attack_home: '1350',
      strength_attack_away: '1370',
      strength_defence_home: '1330',
      strength_defence_away: '1360',
    })
    expect(team?.id).toBe(1)
    expect(team?.code).toBe(3)
    expect(team?.shortName).toBe('ARS')
  })

  it('defaults missing team code to 0', () => {
    const team = parseTeamRow('2016-17', { id: '2', name: 'Bournemouth', short_name: 'BOU' })
    expect(team?.code).toBe(0)
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
    expect(row?.bonus).toBe(0)
    expect(row?.cleanSheets).toBe(0)
    expect(row?.expectedPoints).toBeNull()
  })

  it('parses scoring and xP columns from current-season gameweek rows', () => {
    const row = parsePerformanceRow('2025-26', {
      element: '1',
      round: '1',
      minutes: '90',
      total_points: '11',
      goals_scored: '0',
      assists: '0',
      clean_sheets: '1',
      saves: '4',
      bonus: '1',
      bps: '28',
      goals_conceded: '0',
      own_goals: '0',
      penalties_missed: '0',
      penalties_saved: '0',
      yellow_cards: '0',
      red_cards: '0',
      starts: '1',
      expected_goals: '0.00',
      expected_assists: '0.01',
      expected_goal_involvements: '0.01',
      xP: '4.2',
      defensive_contribution: '0',
      position: 'GK',
      was_home: 'True',
      opponent_team: '2',
      value: '55',
      team: 'Arsenal',
    })
    expect(row?.cleanSheets).toBe(1)
    expect(row?.saves).toBe(4)
    expect(row?.bonus).toBe(1)
    expect(row?.expectedPoints).toBe(4.2)
    expect(row?.gwPosition).toBe('GK')
    expect(row?.defensiveContribution).toBe(0)
  })
})

describe('parseIntField', () => {
  it('treats None as missing', () => {
    expect(parseIntField('None', 0)).toBe(0)
    expect(parseIntField('12')).toBe(12)
  })
})

describe('dedupePerformances', () => {
  it('keeps one row per player/round/fixture', () => {
    const base = {
      seasonId: '2025-26',
      playerId: 1,
      round: 1,
      fixture: 10,
      totalPoints: 2,
      goalsScored: 0,
      assists: 0,
      cleanSheets: 0,
      saves: 0,
      bonus: 0,
      bps: 0,
      goalsConceded: 0,
      ownGoals: 0,
      penaltiesMissed: 0,
      penaltiesSaved: 0,
      yellowCards: 0,
      redCards: 0,
      starts: 1,
      expectedGoals: 0,
      expectedAssists: 0,
      expectedGoalInvolvements: 0,
      expectedPoints: null,
      defensiveContribution: null,
      gwPosition: 'DEF',
      wasHome: true,
      opponentTeamId: 2,
      valueTenths: 50,
      kickoffTime: '',
      teamName: 'Arsenal',
    }
    const rows = dedupePerformances([
      { ...base, minutes: 45 },
      { ...base, minutes: 90, totalPoints: 6 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.minutes).toBe(90)
  })
})
