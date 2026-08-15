import { EmptyState, Sparkline, Stack } from '@songara/pwa-base/ui'
import type { ReactNode } from 'react'
import { ExplorerNav } from '../components/ExplorerNav'
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

export function EmptyTable({
  caption,
  columns,
}: {
  caption: string
  columns: readonly string[]
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
          <tr>
            <td colSpan={columns.length}>
              No rows yet — season data arrives in a later ticket.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function FormSlot({ label }: { label: string }) {
  return (
    <figure className="fpl-explorer__chart">
      <figcaption>{label}</figcaption>
      <Sparkline data={[]} label={label} />
      <p className="fpl-explorer__chart-note">
        Sparkline is empty until form samples are loaded. No invented points.
      </p>
    </figure>
  )
}
