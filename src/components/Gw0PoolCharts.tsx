import { Label, Select } from '@songara/pwa-base/ui'
import { useId, useMemo, useState } from 'react'
import type { Gw0Projection } from '../analysis/gw0Project'
import {
  formatPoolMetric,
  poolMetricMeta,
  poolMetricValue,
  POOL_METRICS,
  squadMembership,
  type PoolMetricId,
  type SquadMembership,
} from '../analysis/gw0PoolCharts'
import { teamTintColor } from '../data/teamColors'
import { PlayerPhoto, TeamCrest } from './FplMedia'

type ChartRow = {
  player: Gw0Projection
  value: number
  cost: number
  membership: SquadMembership
}

const MEMBERSHIP_LABEL: Record<SquadMembership, string> = {
  both: 'Both 15s',
  short: 'Short-term only',
  long: 'Long-term only',
  pool: 'LP pool',
}

export function Gw0PoolCharts({
  pool,
  shortCodes,
  longCodes,
}: {
  pool: readonly Gw0Projection[]
  shortCodes: ReadonlySet<number>
  longCodes: ReadonlySet<number>
}) {
  const [metric, setMetric] = useState<PoolMetricId>('ePtsGw1')
  const meta = poolMetricMeta(metric)
  const labelId = useId()
  const [active, setActive] = useState<number | null>(null)

  const rows = useMemo(() => {
    const next: ChartRow[] = []
    for (const player of pool) {
      const value = poolMetricValue(player, metric)
      if (value == null || !Number.isFinite(value)) continue
      next.push({
        player,
        value,
        cost: player.nowCostTenths / 10,
        membership: squadMembership(player.code, shortCodes, longCodes),
      })
    }
    next.sort((left, right) => right.value - left.value || left.player.current.webName.localeCompare(right.player.current.webName))
    return next
  }, [metric, pool, shortCodes, longCodes])

  const focused = active != null ? rows[active] : null

  return (
    <section className="fpl-gw0-charts" aria-labelledby={labelId}>
      <div className="fpl-explorer__toolbar">
        <h2 id={labelId} className="fpl-explorer__title">
          LP pool vs the two 15s
        </h2>
        <Label className="fpl-explorer__field">
          Metric
          <Select value={metric} onChange={(event) => setMetric(event.target.value as PoolMetricId)}>
            {POOL_METRICS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      <p className="fpl-explorer__meta">
        Every player the optimiser may pick ({rows.length} with this metric). Highlighted marks are in a
        solved 15. Changing the metric does not change the LP — EPPM, ep_next, minutes, price, and confidence
        are diagnostics.
      </p>
      <ul className="fpl-gw0-charts__legend">
        {(['both', 'short', 'long', 'pool'] as const).map((key) => (
          <li key={key} data-membership={key}>
            {MEMBERSHIP_LABEL[key]}
            {key === 'pool' ? ' (club colours)' : ''}
          </li>
        ))}
      </ul>
      <div className="fpl-gw0-charts__grid">
        <PoolBarChart rows={rows} metric={metric} unit={meta.unit} active={active} onActive={setActive} />
        <PoolScatter rows={rows} metric={metric} unit={meta.unit} yLabel={meta.shortLabel} active={active} onActive={setActive} />
      </div>
      <p className="fpl-explorer__chart-note" role="status">
        {focused
          ? `${focused.player.current.webName} · ${focused.player.teamShortName} · ${MEMBERSHIP_LABEL[focused.membership]} · ${formatPoolMetric(focused.value, metric)}${meta.unit ? ` ${meta.unit}` : ''} · £${focused.cost.toFixed(1)}m`
          : 'Hover or focus a bar or point for name, membership, metric, and price.'}
      </p>
    </section>
  )
}

function PoolBarChart({
  rows,
  metric,
  unit,
  active,
  onActive,
}: {
  rows: readonly ChartRow[]
  metric: PoolMetricId
  unit: string
  active: number | null
  onActive: (index: number | null) => void
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const plotHeight = 140
  return (
    <figure className="fpl-explorer__chart fpl-gw-bars">
      <figcaption>{poolMetricMeta(metric).shortLabel} — all considered players</figcaption>
      <div className="fpl-gw-bars__scroller">
        <div className="fpl-gw-bars__track" style={{ minWidth: `${Math.max(rows.length, 1) * 2.4}rem` }}>
          {rows.map((row, index) => {
            const color = membershipColor(row.membership, row.player)
            const height = Math.max(row.value > 0 ? 8 : 3, (Math.max(0, row.value) / max) * plotHeight)
            const open = active === index
            return (
              <div
                key={row.player.code}
                className={`fpl-gw-bars__col${open ? ' fpl-gw-bars__col--active' : ''}${row.membership === 'pool' ? '' : ' fpl-gw-bars__col--picked'}`}
                style={{ ['--fpl-bar' as string]: color }}
                data-membership={row.membership}
                onMouseEnter={() => onActive(index)}
                onMouseLeave={() => onActive(null)}
                onFocus={() => onActive(index)}
                onBlur={() => onActive(null)}
                tabIndex={0}
                aria-label={`${row.player.current.webName}, ${formatPoolMetric(row.value, metric)} ${unit}, ${MEMBERSHIP_LABEL[row.membership]}`}
              >
                {open ? <span className="fpl-gw-bars__value">{formatPoolMetric(row.value, metric)}</span> : null}
                <span className="fpl-gw-bars__bar" style={{ height }} aria-hidden />
                <span className="fpl-gw-bars__faces">
                  <PlayerPhoto code={row.player.code} name={row.player.current.webName} size={24} />
                  <TeamCrest
                    code={row.player.current.teamCode}
                    name={row.player.teamShortName}
                    size={14}
                  />
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </figure>
  )
}

function PoolScatter({
  rows,
  metric,
  unit,
  yLabel,
  active,
  onActive,
}: {
  rows: readonly ChartRow[]
  metric: PoolMetricId
  unit: string
  yLabel: string
  active: number | null
  onActive: (index: number | null) => void
}) {
  const width = 480
  const height = 220
  const padL = 40
  const padR = 16
  const padT = 16
  const padB = 36
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const xs = rows.map((row) => row.cost)
  const ys = rows.map((row) => row.value)
  const xMax = Math.max(4, ...xs, 1)
  const yMax = Math.max(...ys, 1)
  const xPos = (x: number) => padL + (x / xMax) * innerW
  const yPos = (y: number) => padT + innerH - (y / yMax) * innerH

  return (
    <figure className="fpl-explorer__chart">
      <figcaption>
        {yLabel} vs price — clusters
      </figcaption>
      <svg
        className="fpl-explorer__labelled-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${yLabel} against price in millions for the LP pool`}
      >
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} className="fpl-explorer__axis" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} className="fpl-explorer__axis" />
        <text x={padL - 8} y={padT + 4} textAnchor="end" className="fpl-explorer__tick">
          {formatPoolMetric(yMax, metric)}
        </text>
        <text x={padL - 8} y={height - padB} textAnchor="end" className="fpl-explorer__tick">
          0
        </text>
        <text x={padL} y={height - 8} textAnchor="start" className="fpl-explorer__tick">
          £0m
        </text>
        <text x={width - padR} y={height - 8} textAnchor="end" className="fpl-explorer__tick">
          £{xMax.toFixed(0)}m
        </text>
        <text x={width / 2} y={height - 2} textAnchor="middle" className="fpl-explorer__axis-label">
          Price (£m)
        </text>
        <text
          x={12}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${height / 2})`}
          className="fpl-explorer__axis-label"
        >
          {yLabel}
          {unit ? ` (${unit})` : ''}
        </text>
        {rows.map((row, index) => (
          <circle
            key={row.player.code}
            cx={xPos(row.cost)}
            cy={yPos(row.value)}
            r={active === index ? 6 : row.membership === 'pool' ? 3.5 : 5}
            fill={membershipColor(row.membership, row.player)}
            opacity={row.membership === 'pool' ? 0.45 : 0.95}
            tabIndex={0}
            onMouseEnter={() => onActive(index)}
            onMouseLeave={() => onActive(null)}
            onFocus={() => onActive(index)}
            onBlur={() => onActive(null)}
          >
            <title>{`${row.player.current.webName}: ${formatPoolMetric(row.value, metric)} ${unit} · £${row.cost.toFixed(1)}m`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  )
}

function membershipColor(membership: SquadMembership, player: Gw0Projection): string {
  if (membership === 'both') return 'var(--fpl-lime)'
  if (membership === 'short') return '#7ec8e3'
  if (membership === 'long') return '#e2c36b'
  return teamTintColor({ code: player.current.teamCode, shortName: player.teamShortName }) ?? 'color-mix(in srgb, var(--color-foreground) 35%, transparent)'
}
