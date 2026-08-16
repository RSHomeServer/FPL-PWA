import { EmptyState, Sparkline, Stack } from '@songara/pwa-base/ui'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ExplorerNav } from '../components/ExplorerNav'
import { SeasonBar } from '../components/SeasonBar'
import type { SeriesPoint } from '../data/queries'
import './ExplorerPages.css'

type ExplorerScreenProps = {
  kicker: string
  title: string
  question: string
  children: ReactNode
}

export function ExplorerScreen({
  kicker,
  title,
  question,
  children,
}: ExplorerScreenProps) {
  return (
    <div className="fpl-explorer">
      <ExplorerNav />
      <div className="fpl-explorer__body">
        <Stack gap="lg">
          <header>
            <p className="fpl-explorer__kicker">{kicker}</p>
            <h1 className="fpl-explorer__title">{title}</h1>
            <p className="fpl-explorer__question">{question}</p>
          </header>
          <SeasonBar />
          {children}
        </Stack>
      </div>
    </div>
  )
}

export function ExplorerEmpty({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <EmptyState
      className="fpl-explorer__empty"
      title={title}
      description={description}
      action={action}
    />
  )
}

export type SortDirection = 'asc' | 'desc'

export type DataTableColumn<T> = {
  id: string
  label: string
  sortValue?: (row: T) => string | number | null
  render: (row: T) => ReactNode
}

export type DataTableSort = {
  id: string
  direction: SortDirection
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  empty,
  rowKey,
  defaultSort,
  rowStyle,
}: {
  caption: string
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  empty: string
  rowKey?: (row: T, index: number) => string | number
  defaultSort?: DataTableSort
  rowStyle?: (row: T) => CSSProperties | undefined
}) {
  const [sort, setSort] = useState<DataTableSort | null>(defaultSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((entry) => entry.id === sort.id)
    if (!column?.sortValue) return rows
    const copy = [...rows]
    copy.sort((left, right) => compareSortValues(column.sortValue!(left), column.sortValue!(right), sort.direction))
    return copy
  }, [columns, rows, sort])

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return
    setSort((current) => {
      if (!current || current.id !== column.id) {
        const sample = rows[0]
        const numeric = sample !== undefined && typeof column.sortValue?.(sample) === 'number'
        return { id: column.id, direction: numeric ? 'desc' : 'asc' }
      }
      return { id: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  return (
    <div className="fpl-explorer__table-wrap">
      <table className="fpl-explorer__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.id === column.id
              const ariaSort = !column.sortValue
                ? undefined
                : active
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              return (
                <th key={column.id} scope="col" aria-sort={ariaSort}>
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="fpl-explorer__sort"
                      onClick={() => toggleSort(column)}
                    >
                      {column.label}
                      <span className="fpl-explorer__sort-indicator" aria-hidden>
                        {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            sorted.map((row, index) => (
              <tr
                key={rowKey ? rowKey(row, index) : index}
                className={rowStyle?.(row) ? 'fpl-explorer__row--team' : undefined}
                style={rowStyle?.(row)}
              >
                {columns.map((column) => (
                  <td key={column.id}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function compareSortValues(
  left: string | number | null,
  right: string | number | null,
  direction: SortDirection,
): number {
  const leftEmpty = left == null || left === 'NA'
  const rightEmpty = right == null || right === 'NA'
  if (leftEmpty && rightEmpty) return 0
  if (leftEmpty) return 1
  if (rightEmpty) return -1
  const factor = direction === 'asc' ? 1 : -1
  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * factor
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) * factor
}

function seriesSummary(points: readonly SeriesPoint[]): string {
  if (points.length === 0) return ''
  const values = points.map((point) => point.y)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const last = values[values.length - 1] ?? 0
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
  return `Min ${fmt(min)} · max ${fmt(max)} · last ${fmt(last)}`
}

export function FormSlot({
  label,
  data,
  note,
  xAxisLabel = 'Gameweek',
  yAxisLabel = 'Points',
}: {
  label: string
  data: readonly SeriesPoint[]
  note?: string
  xAxisLabel?: string
  yAxisLabel?: string
}) {
  const series = [...data]
  const spark = series.map((point) => point.y)
  const summary = seriesSummary(series)
  return (
    <figure className="fpl-explorer__chart">
      <figcaption>{label}</figcaption>
      <LabelledSeriesChart
        data={series}
        label={label}
        xAxisLabel={xAxisLabel}
        yAxisLabel={yAxisLabel}
      />
      {spark.length > 0 ? (
        <Sparkline data={spark} label={`${label} sparkline`} color="var(--fpl-lime)" />
      ) : null}
      <p className="fpl-explorer__chart-note">
        {note ??
          (series.length === 0
            ? 'Chart stays empty until published values exist for this selection.'
            : `${summary} · ${series.length} ${xAxisLabel === 'Gameweek' ? 'published gameweek samples' : 'samples'}.`)}
      </p>
    </figure>
  )
}

function LabelledSeriesChart({
  data,
  label,
  xAxisLabel,
  yAxisLabel,
}: {
  data: readonly SeriesPoint[]
  label: string
  xAxisLabel: string
  yAxisLabel: string
}) {
  const width = 480
  const height = 200
  const padL = 44
  const padR = 16
  const padT = 16
  const padB = 40
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const ys = data.map((point) => point.y)
  const yMin = ys.length ? Math.min(0, ...ys) : 0
  const yMax = ys.length ? Math.max(...ys, 1) : 1
  const yRange = yMax - yMin || 1
  const xMin = data[0]?.x ?? 0
  const xMax = data[data.length - 1]?.x ?? 1
  const xRange = xMax - xMin || 1

  function xPos(x: number): number {
    if (data.length <= 1) return padL + innerW / 2
    return padL + ((x - xMin) / xRange) * innerW
  }

  function yPos(y: number): number {
    return padT + innerH - ((y - yMin) / yRange) * innerH
  }

  const polyline = data.map((point) => `${xPos(point.x).toFixed(1)},${yPos(point.y).toFixed(1)}`).join(' ')
  const yTicks = [yMin, yMin + yRange / 2, yMax]
  const xTicks =
    data.length <= 6
      ? data
      : [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].filter(
          (point): point is SeriesPoint => Boolean(point),
        )

  return (
    <svg
      className="fpl-explorer__labelled-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}. ${xAxisLabel} on the x axis, ${yAxisLabel} on the y axis. ${seriesSummary(data)}`}
    >
      <line x1={padL} y1={padT} x2={padL} y2={height - padB} className="fpl-explorer__axis" />
      <line
        x1={padL}
        y1={height - padB}
        x2={width - padR}
        y2={height - padB}
        className="fpl-explorer__axis"
      />
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={padL - 4}
            y1={yPos(tick)}
            x2={padL}
            y2={yPos(tick)}
            className="fpl-explorer__axis"
          />
          <text x={padL - 8} y={yPos(tick) + 4} textAnchor="end" className="fpl-explorer__tick">
            {Number.isInteger(tick) ? tick : tick.toFixed(1)}
          </text>
        </g>
      ))}
      {xTicks.map((point) => (
        <text
          key={`x-${point.x}-${point.label ?? ''}`}
          x={xPos(point.x)}
          y={height - padB + 16}
          textAnchor="middle"
          className="fpl-explorer__tick"
        >
          {point.label ?? String(point.x)}
        </text>
      ))}
      {polyline ? (
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--fpl-lime)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {data.map((point, index) => (
        <circle
          key={`${point.x}-${index}`}
          cx={xPos(point.x)}
          cy={yPos(point.y)}
          r="3"
          fill="var(--fpl-lime)"
        />
      ))}
      <text x={width / 2} y={height - 6} textAnchor="middle" className="fpl-explorer__axis-label">
        {xAxisLabel}
      </text>
      <text
        x={14}
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90 14 ${height / 2})`}
        className="fpl-explorer__axis-label"
      >
        {yAxisLabel}
      </text>
    </svg>
  )
}
