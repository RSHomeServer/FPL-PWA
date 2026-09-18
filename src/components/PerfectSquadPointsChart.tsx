import { useId, useState } from 'react'
import type { HindsightPlayer } from '../analysis/perfectTeam'
import { teamTintColor } from '../data/teamColors'
import { PlayerPhoto, TeamCrest } from './FplMedia'

export type PerfectSquadChartRow = {
  player: HindsightPlayer
  points: number
  role: 'XI' | 'BN' | 'C' | 'VC'
}

export function PerfectSquadPointsChart({
  title,
  rows,
  note,
}: {
  title: string
  rows: readonly PerfectSquadChartRow[]
  note?: string
}) {
  const labelId = useId()
  const [active, setActive] = useState<number | null>(null)
  const ordered = [...rows].sort((a, b) => b.points - a.points || a.player.webName.localeCompare(b.player.webName))
  const maxPts = Math.max(1, ...ordered.map((row) => row.points))
  const plotHeight = 160
  const focused = active != null ? ordered[active] : null

  return (
    <figure className="fpl-explorer__chart fpl-gw-bars" aria-labelledby={labelId}>
      <figcaption id={labelId}>{title}</figcaption>
      {ordered.length === 0 ? (
        <p className="fpl-explorer__chart-note">No squad to chart.</p>
      ) : (
        <>
          <div className="fpl-gw-bars__scroller">
            <div className="fpl-gw-bars__track" style={{ minWidth: `${ordered.length * 3.15}rem` }}>
              {ordered.map((row, index) => {
                const color =
                  teamTintColor({ code: row.player.teamCode, shortName: row.player.teamShortName }) ??
                  'var(--fpl-lime)'
                const ratio = Math.max(0, row.points) / maxPts
                const height = Math.max(row.points > 0 ? 8 : 3, ratio * plotHeight)
                const open = active === index
                return (
                  <div
                    key={row.player.code}
                    className={`fpl-gw-bars__col${open ? ' fpl-gw-bars__col--active' : ''}${row.role === 'BN' ? '' : ' fpl-gw-bars__col--picked'}`}
                    style={{ ['--fpl-bar' as string]: color }}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    tabIndex={0}
                    aria-label={`${row.player.webName}, ${row.points} points, ${row.role}`}
                  >
                    <span className="fpl-gw-bars__value">{formatPoints(row.points)}</span>
                    <span className="fpl-gw-bars__bar" style={{ height }} aria-hidden />
                    <span className="fpl-gw-bars__faces">
                      <PlayerPhoto code={row.player.code} name={row.player.webName} size={28} />
                      <TeamCrest
                        code={row.player.teamCode}
                        name={row.player.teamShortName}
                        size={16}
                      />
                    </span>
                    {open ? (
                      <div className="fpl-gw-bars__tip" role="tooltip">
                        <p className="fpl-gw-bars__tip-name">{row.player.webName}</p>
                        <p>
                          {row.player.teamShortName} · {row.player.position} · {row.role} · £
                          {(row.player.costTenths / 10).toFixed(1)}m
                        </p>
                        <p>
                          <strong>{formatPoints(row.points)} pts</strong>
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="fpl-explorer__chart-note" role="status">
            {focused
              ? `${focused.player.webName} · ${focused.player.teamShortName} · ${focused.player.position} · ${focused.role} · ${formatPoints(focused.points)} pts`
              : (note ??
                'Best legal 15 for the selected objective. Bars ordered by points. Hover for name, club, role, and cost.')}
          </p>
        </>
      )}
    </figure>
  )
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
