import { Label, Select, TextField } from '@songara/pwa-base/ui'
import { useId, useMemo, useState } from 'react'
import type { Gw0Projection } from '../analysis/gw0Project'
import {
  formatPoolMetric,
  poolMetricMeta,
  poolMetricValue,
  POOL_METRICS,
  type PoolMetricId,
} from '../analysis/gw0PoolCharts'
import { teamTintColor } from '../data/teamColors'
import { PlayerPhoto, TeamCrest } from './FplMedia'

type PoolMembership = 'selected' | 'other' | 'pool'

type ChartRow = {
  player: Gw0Projection
  value: number
  cost: number
  membership: PoolMembership
}

export function Gw0PoolCharts({
  pool,
  metricDefault,
  selectedCodes,
  otherCodes,
  selectedLabel,
  otherLabel,
}: {
  pool: readonly Gw0Projection[]
  metricDefault?: PoolMetricId
  selectedCodes: ReadonlySet<number>
  otherCodes: ReadonlySet<number>
  selectedLabel: string
  otherLabel: string
}) {
  const [metric, setMetric] = useState<PoolMetricId>(metricDefault ?? 'ePtsGw1')
  const meta = poolMetricMeta(metric)
  const labelId = useId()
  const [barHover, setBarHover] = useState<number | null>(null)
  const [scatterHover, setScatterHover] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const next: ChartRow[] = []
    for (const player of pool) {
      const value = poolMetricValue(player, metric)
      if (value == null || !Number.isFinite(value)) continue
      next.push({
        player,
        value,
        cost: player.nowCostTenths / 10,
        membership: membershipOf(player.code, selectedCodes, otherCodes),
      })
    }
    next.sort(
      (left, right) =>
        right.value - left.value ||
        left.player.current.webName.localeCompare(right.player.current.webName),
    )
    return next
  }, [metric, pool, selectedCodes, otherCodes])

  const matchIndex = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return null
    const index = rows.findIndex((row) => row.player.current.webName.toLowerCase().includes(needle))
    return index >= 0 ? index : null
  }, [query, rows])

  const active = query.trim() ? matchIndex : (barHover ?? scatterHover)

  const focused = active != null ? rows[active] : null

  const max = Math.max(1, ...rows.map((row) => row.value))

  return (
    <section className="fpl-gw0-charts" aria-labelledby={labelId}>
      <div className="fpl-explorer__toolbar">
        <h2 id={labelId} className="fpl-explorer__title">
          LP pool — {selectedLabel} vs other
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
        <Label className="fpl-explorer__field">
          Find player
          <TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Haaland" />
        </Label>
      </div>
      <p className="fpl-explorer__meta">
        Every player the optimiser can pick ({rows.length} with this metric). Highlighted marks belong to{' '}
        <strong>{selectedLabel}</strong>; grey marks are the rest of the LP pool.
      </p>

      <ul className="fpl-gw0-charts__legend">
        <li data-membership="selected">{selectedLabel}</li>
        <li data-membership="other">{otherLabel}</li>
        <li data-membership="pool">LP pool (other)</li>
      </ul>

      <div className="fpl-gw0-charts__grid">
        <PoolBarChart rows={rows} metric={metric} unit={meta.unit} active={barHover} onActive={setBarHover} max={max} />
        <PoolScatter
          rows={rows}
          metric={metric}
          unit={meta.unit}
          yLabel={meta.shortLabel}
          active={scatterHover}
          onActive={setScatterHover}
        />
      </div>

      <p className="fpl-explorer__chart-note" role="status">
        {focused
          ? `${focused.player.current.webName} · ${focused.player.teamShortName} · ${membershipLabel(focused.membership, selectedLabel, otherLabel)} · ${formatPoolMetric(focused.value, metric)}${
              meta.unit ? ` ${meta.unit}` : ''
            } · £${focused.cost.toFixed(1)}m`
          : query.trim()
            ? 'No matching player in the chart.'
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
  max,
}: {
  rows: readonly ChartRow[]
  metric: PoolMetricId
  unit: string
  active: number | null
  onActive: (index: number | null) => void
  max: number
}) {
  const plotHeight = 160
  const mid = max / 2
  return (
    <figure className="fpl-explorer__chart fpl-gw-bars">
      <figcaption>
        {poolMetricMeta(metric).shortLabel} — 0 → {formatPoolMetric(max, metric)}
        {unit ? ` ${unit}` : ''}
      </figcaption>
      <div className="fpl-gw-bars__plot">
        <div className="fpl-gw-bars__axis-y" aria-hidden="true">
          <span>{formatPoolMetric(max, metric)}</span>
          <span>{formatPoolMetric(mid, metric)}</span>
          <span>0</span>
        </div>
        <div className="fpl-gw-bars__scroller">
          <div
            className="fpl-gw-bars__track"
            style={{
              minWidth: `${Math.max(rows.length, 1) * 3}rem`,
              ['--fpl-bar-plot-h' as string]: `${plotHeight}px`,
            }}
          >
            {rows.map((row, index) => {
              const color = membershipColor(row.membership, row.player)
              const height = Math.max(row.value > 0 ? 8 : 3, (Math.max(0, row.value) / max) * plotHeight)
              const open = active === index
              return (
                <div
                  key={row.player.code}
                  className={`fpl-gw-bars__col${open ? ' fpl-gw-bars__col--active' : ''}${row.membership === 'selected' ? ' fpl-gw-bars__col--picked' : ''}`}
                  style={{ ['--fpl-bar' as string]: color }}
                  data-membership={row.membership}
                  onMouseEnter={() => onActive(index)}
                  onMouseLeave={() => onActive(null)}
                  onFocus={() => onActive(index)}
                  onBlur={() => onActive(null)}
                  tabIndex={0}
                  aria-label={`${row.player.current.webName}, ${formatPoolMetric(row.value, metric)} ${unit}, ${row.membership}`}
                >
                  {open ? <span className="fpl-gw-bars__value">{formatPoolMetric(row.value, metric)}</span> : null}
                  <span className="fpl-gw-bars__bar" style={{ height }} aria-hidden />
                  <span className="fpl-gw-bars__label" title={row.player.current.webName}>
                    {row.player.current.webName}
                  </span>
                  <span className="fpl-gw-bars__faces">
                    <PlayerPhoto code={row.player.code} name={row.player.current.webName} size={28} />
                    <TeamCrest code={row.player.current.teamCode} name={row.player.teamShortName} size={16} />
                  </span>
                </div>
              )
            })}
          </div>
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
  const width = 640
  const height = 280
  const padL = 48
  const padR = 16
  const padT = 14
  const padB = 40
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const xs = rows.map((row) => row.cost)
  const ys = rows.map((row) => row.value)
  const xMax = Math.max(4, ...xs, 1)
  const yMax = Math.max(...ys, 1)
  const xPos = (x: number) => padL + (x / xMax) * innerW
  const yPos = (y: number) => padT + innerH - (y / yMax) * innerH

  const xMid = xMax / 2
  const yMid = yMax / 2

  return (
    <figure className="fpl-explorer__chart fpl-gw0-scatter">
      <figcaption>{yLabel} vs price — clusters</figcaption>
      <div className="fpl-gw0-scatter__wrap">
      <svg
        className="fpl-explorer__labelled-chart fpl-gw0-scatter__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <line x1={padL} y1={padT} x2={padL} y2={height - padB} className="fpl-explorer__axis" />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} className="fpl-explorer__axis" />

        <text x={padL - 8} y={padT + 4} textAnchor="end" className="fpl-explorer__tick">
          {formatPoolMetric(yMax, metric)}
        </text>
        <text x={padL - 8} y={padT + innerH / 2} textAnchor="end" className="fpl-explorer__tick">
          {formatPoolMetric(yMid, metric)}
        </text>
        <text x={padL - 8} y={height - padB} textAnchor="end" className="fpl-explorer__tick">
          0
        </text>

        <text x={padL} y={height - 8} textAnchor="start" className="fpl-explorer__tick">
          £0m
        </text>
        <text x={xPos(xMid)} y={height - 8} textAnchor="middle" className="fpl-explorer__tick">
          £{xMid.toFixed(1)}m
        </text>
        <text x={width - padR} y={height - 8} textAnchor="end" className="fpl-explorer__tick">
          £{xMax.toFixed(0)}m
        </text>

        <text x={width / 2} y={height - 2} textAnchor="middle" className="fpl-explorer__axis-label">
          Price (£m)
        </text>
        <text
          x={padL / 2}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${padL / 2} ${height / 2})`}
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
            r={row.membership === 'pool' ? 3.5 : 5}
            className={active === index ? 'fpl-gw0-scatter__dot fpl-gw0-scatter__dot--active' : 'fpl-gw0-scatter__dot'}
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
      </div>
    </figure>
  )
}

function membershipOf(code: number, selected: ReadonlySet<number>, other: ReadonlySet<number>): PoolMembership {
  if (selected.has(code)) return 'selected'
  if (other.has(code)) return 'other'
  return 'pool'
}

function membershipLabel(membership: PoolMembership, selectedLabel: string, otherLabel: string): string {
  if (membership === 'selected') return selectedLabel
  if (membership === 'other') return otherLabel
  return 'LP pool'
}

function membershipColor(membership: PoolMembership, player: Gw0Projection): string {
  if (membership === 'selected') return 'var(--fpl-lime)'
  if (membership === 'other') return '#7ec8e3'
  return teamTintColor({ code: player.current.teamCode, shortName: player.teamShortName }) ?? 'color-mix(in srgb, var(--color-foreground) 35%, transparent)'
}
