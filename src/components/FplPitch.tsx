import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { PlayerPhoto, TeamCrest } from './FplMedia'
import {
  parsePitchFormation,
  pitchLineOf,
  pitchPlayersByLine,
  type PitchFormationCounts,
  type PitchLineId,
} from './fplPitchLayout'
import './FplPitch.css'

export type PitchPlayer = {
  id: string | number
  name: string
  photoCode?: number
  teamCode?: number
  teamShortName?: string
  position: string
  fixture?: string
  captain?: boolean
  viceCaptain?: boolean
  /** Published / scored points for this card (already multiplied for C/TC when set). */
  points?: number | null
  /** True when points are shown for information only (bench without Bench Boost). */
  pointsUnscored?: boolean
  /** Cost string shown above the head when `showCost` is on. */
  costLabel?: string
  /** Score breakdown lines when `showDetails` is on. */
  scoreLines?: readonly string[]
  /** Extra badge (e.g. TC / BB). */
  chip?: 'TC' | 'BB' | string
}

export type FplPitchProps = {
  formation: string | PitchFormationCounts
  players: readonly PitchPlayer[]
  bench?: readonly PitchPlayer[]
  width?: number | string
  height?: number | string
  showBench?: boolean
  showEmptySlots?: boolean
  className?: string
  label?: string
  compact?: boolean
  expandable?: boolean
  showCost?: boolean
  showDetails?: boolean
  /** Week-level chip banner (e.g. Triple Captain). */
  weekChip?: string | null
}

const BENCH_POS: Record<PitchLineId, string> = {
  GK: 'GKP',
  DEF: 'DEF',
  MID: 'MID',
  FWD: 'FWD',
}

export function FplPitch({
  formation,
  players,
  bench = [],
  width = '100%',
  height,
  showBench = bench.length > 0,
  showEmptySlots = false,
  className,
  label,
  compact = true,
  expandable = true,
  showCost = false,
  showDetails = false,
  weekChip = null,
}: FplPitchProps) {
  const [expanded, setExpanded] = useState(false)
  const lines = pitchPlayersByLine(players, formation, { showEmptySlots })
  const formationLabel = typeof formation === 'string' ? formation : countsLabel(formation)
  const canToggle = expandable
  const toggleLabel = expanded ? 'Collapse pitch view' : 'Expand pitch view'

  function toggleExpanded(event: ReactMouseEvent) {
    if ((event.target as HTMLElement).closest('button, a, input, label')) return
    setExpanded((value) => !value)
  }

  return (
    <section
      className={[
        'fpl-pitch',
        compact ? 'fpl-pitch--compact' : '',
        expanded ? 'fpl-pitch--expanded' : '',
        canToggle ? 'fpl-pitch--clickable' : '',
        showDetails ? 'fpl-pitch--details' : '',
        showCost ? 'fpl-pitch--show-cost' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: cssSize(width), height: cssSize(height) }}
      aria-label={label ?? `Pitch in a ${formationLabel} formation`}
      tabIndex={canToggle ? 0 : undefined}
      role={canToggle ? 'button' : undefined}
      onClick={canToggle ? toggleExpanded : undefined}
      onKeyDown={
        canToggle
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setExpanded((value) => !value)
              }
            }
          : undefined
      }
    >
      {label ? (
        <p className="fpl-pitch__label">
          <span>
            {label}
            {weekChip ? <span className="fpl-pitch__week-chip">{weekChip}</span> : null}
          </span>
          {canToggle ? <span className="fpl-pitch__toggle">{toggleLabel}</span> : null}
        </p>
      ) : weekChip ? (
        <p className="fpl-pitch__label">
          <span className="fpl-pitch__week-chip">{weekChip}</span>
        </p>
      ) : null}
      <div className="fpl-pitch__field">
        <PitchMarkings />
        <div className="fpl-pitch__lines">
          {lines.map((row) => (
            <div key={row.line.id} className="fpl-pitch__row" data-line={row.line.id}>
              {row.players.map((player, index) =>
                player ? (
                  <PitchCard
                    key={player.id}
                    player={player}
                    expanded={expanded}
                    showCost={showCost}
                    showDetails={showDetails}
                  />
                ) : (
                  <div key={`${row.line.id}-empty-${index}`} className="fpl-pitch-card fpl-pitch-card--empty" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      {showBench ? (
        <div className="fpl-pitch__bench">
          {bench.map((player, index) => (
            <div key={player.id} className="fpl-pitch__bench-slot">
              <span className="fpl-pitch__bench-pos">
                {index + 1}. {BENCH_POS[pitchLineOf(player.position)]}
              </span>
              <PitchCard
                player={player}
                expanded={expanded}
                showCost={showCost}
                showDetails={showDetails}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function PitchCard({
  player,
  expanded,
  showCost,
  showDetails,
}: {
  player: PitchPlayer
  expanded?: boolean
  showCost?: boolean
  showDetails?: boolean
}) {
  const faceSize = expanded ? 72 : 60
  const crestSize = expanded ? 20 : 18
  const hasPoints = player.points != null && Number.isFinite(player.points)
  const breakdown =
    showDetails && player.scoreLines
      ? player.scoreLines.length > 0
        ? player.scoreLines
        : ['Did not play']
      : null
  return (
    <figure className={`fpl-pitch-card${player.pointsUnscored ? ' fpl-pitch-card--unscored' : ''}`}>
      {showCost && player.costLabel ? (
        <span className="fpl-pitch-card__cost" title="Price">
          {player.costLabel}
        </span>
      ) : null}
      {player.captain ? (
        <span className="fpl-pitch-card__badge fpl-pitch-card__badge--c" title="Captain">
          C
        </span>
      ) : player.viceCaptain ? (
        <span className="fpl-pitch-card__badge fpl-pitch-card__badge--v" title="Vice-captain">
          V
        </span>
      ) : null}
      {player.chip ? (
        <span className="fpl-pitch-card__badge fpl-pitch-card__badge--chip" title={player.chip}>
          {player.chip}
        </span>
      ) : null}
      <span className="fpl-pitch-card__media">
        <PlayerPhoto
          className="fpl-pitch-card__face"
          code={player.photoCode ?? 0}
          name={player.name}
          size={faceSize}
          loading="eager"
        />
        <TeamCrest
          className="fpl-pitch-card__crest"
          code={player.teamCode ?? 0}
          name={player.teamShortName || player.name}
          size={crestSize}
        />
      </span>
      <figcaption className="fpl-pitch-card__plate">
        <span className="fpl-pitch-card__name">{player.name}</span>
        {player.fixture && !hasPoints ? (
          <span className="fpl-pitch-card__fixture">{player.fixture}</span>
        ) : null}
        {hasPoints ? (
          <span
            className="fpl-pitch-card__points"
            title={player.pointsUnscored ? 'Bench points (not counted unless Bench Boost)' : 'Gameweek points'}
          >
            {player.points}
          </span>
        ) : null}
        {breakdown ? (
          <ul className="fpl-pitch-card__breakdown">
            {breakdown.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </figcaption>
    </figure>
  )
}

function PitchMarkings() {
  return (
    <svg className="fpl-pitch__markings" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
      <rect x="1" y="1" width="98" height="138" />
      <line x1="1" y1="70" x2="99" y2="70" />
      <circle cx="50" cy="70" r="12" />
      <circle className="fpl-pitch__spot" cx="50" cy="70" r="1.1" />
      <rect x="21" y="1" width="58" height="24" />
      <rect x="34" y="1" width="32" height="10" />
      <circle className="fpl-pitch__spot" cx="50" cy="18" r="1.1" />
      <path d="M38 25 C42 33 58 33 62 25" />
      <rect x="21" y="115" width="58" height="24" />
      <rect x="34" y="129" width="32" height="10" />
      <circle className="fpl-pitch__spot" cx="50" cy="122" r="1.1" />
      <path d="M38 115 C42 107 58 107 62 115" />
    </svg>
  )
}

function cssSize(value: number | string | undefined): string | undefined {
  if (value == null) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

function countsLabel(counts: PitchFormationCounts): string {
  const parsed = parsePitchFormation(counts)
  return parsed
    .filter((row) => row.id !== 'GK')
    .map((row) => row.count)
    .join('-')
}
