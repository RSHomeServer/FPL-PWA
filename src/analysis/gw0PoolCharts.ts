import type { Gw0Projection } from '../analysis/gw0Project'
import { poundsFromTenths } from '../data/prices'

export const POOL_METRIC_IDS = [
  'ePtsGw1',
  'ePtsGw16',
  'eppmGw1',
  'epNext',
  'expectedMinutesGw1',
  'price',
  'confidence',
] as const

export type PoolMetricId = (typeof POOL_METRIC_IDS)[number]

export type SquadMembership = 'both' | 'short' | 'long' | 'pool'

export const POOL_METRICS: ReadonlyArray<{
  id: PoolMetricId
  label: string
  shortLabel: string
  unit: string
}> = [
  { id: 'ePtsGw1', label: 'E[GW1 points]', shortLabel: 'E GW1', unit: 'pts' },
  { id: 'ePtsGw16', label: 'E[GW1–GW6 points]', shortLabel: 'E GW1–6', unit: 'pts' },
  { id: 'eppmGw1', label: 'E[GW1 points] / £m', shortLabel: 'EPPM GW1', unit: 'pts/£m' },
  { id: 'epNext', label: 'Official ep_next', shortLabel: 'ep_next', unit: 'pts' },
  { id: 'expectedMinutesGw1', label: 'E[GW1 minutes]', shortLabel: 'E min GW1', unit: 'mins' },
  { id: 'price', label: 'Price', shortLabel: 'Price', unit: '£m' },
  { id: 'confidence', label: 'Confidence', shortLabel: 'Conf', unit: '' },
]

export function poolMetricMeta(id: PoolMetricId) {
  return POOL_METRICS.find((row) => row.id === id) ?? POOL_METRICS[0]!
}

export function poolMetricValue(player: Gw0Projection, metric: PoolMetricId): number | null {
  switch (metric) {
    case 'ePtsGw1':
      return player.ePtsGw1
    case 'ePtsGw16':
      return player.ePtsGw16
    case 'eppmGw1':
      return player.eppmGw1
    case 'epNext':
      return player.epNext
    case 'expectedMinutesGw1':
      return player.expectedMinutesGw1
    case 'price':
      return poundsFromTenths(player.nowCostTenths)
    case 'confidence':
      return player.confidence.value
  }
}

export function squadMembership(
  code: number,
  shortCodes: ReadonlySet<number>,
  longCodes: ReadonlySet<number>,
): SquadMembership {
  const short = shortCodes.has(code)
  const long = longCodes.has(code)
  if (short && long) return 'both'
  if (short) return 'short'
  if (long) return 'long'
  return 'pool'
}

export function formatPoolMetric(value: number, metric: PoolMetricId): string {
  if (metric === 'expectedMinutesGw1') return value.toFixed(0)
  if (metric === 'price') return value.toFixed(1)
  if (metric === 'confidence') return value.toFixed(2)
  return value.toFixed(2)
}
