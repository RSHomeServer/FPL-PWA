import { EmptyState, Sparkline, Stack } from '@songara/pwa-base/ui'
import type { ReactNode } from 'react'
import { ExplorerNav } from '../components/ExplorerNav'
import { SeasonBar } from '../components/SeasonBar'
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

export function DataTable({
  caption,
  columns,
  rows,
  empty,
}: {
  caption: string
  columns: readonly string[]
  rows: readonly ReactNode[][]
  empty: string
}) {
  return (
    <div className="fpl-explorer__table-wrap">
      <table className="fpl-explorer__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function FormSlot({
  label,
  data,
  note,
}: {
  label: string
  data: readonly number[]
  note?: string
}) {
  const series = [...data]
  return (
    <figure className="fpl-explorer__chart">
      <figcaption>{label}</figcaption>
      <Sparkline data={series} label={label} color="var(--fpl-lime)" />
      <p className="fpl-explorer__chart-note">
        {note ??
          (series.length === 0
            ? 'Sparkline stays empty until published gameweek points exist for this selection.'
            : `${series.length} published gameweek samples.`)}
      </p>
    </figure>
  )
}
