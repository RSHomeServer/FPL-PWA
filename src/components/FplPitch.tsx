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
}: FplPitchProps) {
  const lines = pitchPlayersByLine(players, formation, { showEmptySlots })
  const formationLabel = typeof formation === 'string' ? formation : countsLabel(formation)

  return (
    <section
      className={['fpl-pitch', className].filter(Boolean).join(' ')}
      style={{ width: cssSize(width), height: cssSize(height) }}
      aria-label={label ?? `Pitch in a ${formationLabel} formation`}
    >
      {label ? <p className="fpl-pitch__label">{label}</p> : null}
      <div className="fpl-pitch__field">
        <PitchMarkings />
        <div className="fpl-pitch__lines">
          {lines.map((row) => (
            <div key={row.line.id} className="fpl-pitch__row" data-line={row.line.id}>
              {row.players.map((player, index) =>
                player ? (
                  <PitchCard key={player.id} player={player} />
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
          {bench.map((player) => (
            <div key={player.id} className="fpl-pitch__bench-slot">
              <span className="fpl-pitch__bench-pos">{BENCH_POS[pitchLineOf(player.position)]}</span>
              <PitchCard player={player} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function PitchCard({ player }: { player: PitchPlayer }) {
  return (
    <figure className="fpl-pitch-card">
      {player.captain ? (
        <span className="fpl-pitch-card__badge fpl-pitch-card__badge--c" title="Captain">
          C
        </span>
      ) : player.viceCaptain ? (
        <span className="fpl-pitch-card__badge fpl-pitch-card__badge--v" title="Vice-captain">
          V
        </span>
      ) : null}
      <span className="fpl-pitch-card__media">
        <PlayerPhoto
          className="fpl-pitch-card__face"
          code={player.photoCode ?? 0}
          name={player.name}
          size={48}
        />
        <TeamCrest
          className="fpl-pitch-card__crest"
          code={player.teamCode ?? 0}
          name={player.teamShortName || player.name}
          size={16}
        />
      </span>
      <figcaption className="fpl-pitch-card__plate">
        <span className="fpl-pitch-card__name">{player.name}</span>
        {player.fixture ? <span className="fpl-pitch-card__fixture">{player.fixture}</span> : null}
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
