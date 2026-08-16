import { useId, useState } from 'react'
import type { GameweekEventRow } from '../data/queries'
import { teamTintColor } from '../data/teamColors'
import { PlayerPhoto, TeamCrest } from './FplMedia'

export function GameweekPointsChart({
  round,
  rows,
}: {
  round: number
  rows: readonly GameweekEventRow[]
}) {
  const labelId = useId()
  const [active, setActive] = useState<number | null>(null)
  const maxPts = Math.max(1, ...rows.map((row) => row.points))
  const plotHeight = 160
  const focused = active != null ? rows[active] : null

  return (
    <figure className="fpl-explorer__chart fpl-gw-bars" aria-labelledby={labelId}>
      <figcaption id={labelId}>GW {round} points</figcaption>
      {rows.length === 0 ? (
        <p className="fpl-explorer__chart-note">No published appearances to chart for this gameweek.</p>
      ) : (
        <>
          <div className="fpl-gw-bars__scroller">
            <div className="fpl-gw-bars__track" style={{ minWidth: `${rows.length * 3.15}rem` }}>
              {rows.map((row, index) => {
                const color = teamTintColor(row.team) ?? 'var(--fpl-lime)'
                const ratio = Math.max(0, row.points) / maxPts
                const height = Math.max(row.points > 0 ? 8 : 3, ratio * plotHeight)
                const open = active === index
                const opponent = `${row.wasHome ? 'H' : 'A'} ${row.opponent?.shortName || row.opponent?.name || '—'}`
                return (
                  <div
                    key={`${row.who}-${row.minutes}-${index}`}
                    className={`fpl-gw-bars__col${open ? ' fpl-gw-bars__col--active' : ''}`}
                    style={{ ['--fpl-bar' as string]: color }}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    tabIndex={0}
                    aria-label={`${row.who}, ${row.points} points`}
                  >
                    <span className="fpl-gw-bars__value">{row.points}</span>
                    <span
                      className="fpl-gw-bars__bar"
                      style={{ height }}
                      aria-hidden
                    />
                    <span className="fpl-gw-bars__faces">
                      <PlayerPhoto code={row.player?.code ?? 0} name={row.who} size={28} />
                      <TeamCrest
                        code={row.team?.code ?? 0}
                        name={row.team?.shortName || row.team?.name || ''}
                        size={16}
                      />
                    </span>
                    {open ? (
                      <div className="fpl-gw-bars__tip" role="tooltip">
                        <p className="fpl-gw-bars__tip-name">{row.who}</p>
                        <p>
                          {row.team?.shortName || row.team?.name || '—'} · {row.position} · {opponent} ·{' '}
                          {row.costTenths ? `£${(row.costTenths / 10).toFixed(1)}m` : '—'}
                        </p>
                        <p>
                          <strong>{row.points} pts</strong>
                        </p>
                        <p>{row.event}</p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="fpl-explorer__chart-note" role="status">
            {focused
              ? `${focused.who} · ${focused.team?.shortName || focused.team?.name || '—'} · ${focused.position} · ${focused.wasHome ? 'H' : 'A'} ${focused.opponent?.shortName || focused.opponent?.name || '—'} · ${focused.costTenths ? `£${(focused.costTenths / 10).toFixed(1)}m` : '—'} · ${focused.points} pts · ${focused.event}`
              : 'Same players as the table, ordered by published points. Scroll sideways. Hover or focus a bar for name, team, position, opponent, points, and the Event breakdown.'}
          </p>
        </>
      )}
    </figure>
  )
}
