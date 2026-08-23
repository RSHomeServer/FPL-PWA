import { Button, Label, Select, Spinner, Stack, TextField } from '@songara/pwa-base/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import seedFile from '../analysis/gw0RoleEvidence.seed.json'
import bandsFile from '../analysis/gw0Phase0Bands.json'
import { CAPTAIN_HINT, suggestCaptainForSquad, type CaptainSuggestion } from '../analysis/gw0Captain'
import { buildGw0OptimiserPool, GW0_PRIOR_SEASON_ID } from '../analysis/gw0Build'
import {
  asPhase0Bands,
  type Gw0Phase0Bands,
} from '../analysis/gw0Phase0Bands'
import {
  EP_NEXT_DISCLAIMER,
  epNextDelta,
  formatSigned,
  largestEpNextDisagreements,
  summariseEpNext,
} from '../analysis/gw0EpNext'
import {
  buildGw0ExportPayload,
  gw0ExportCsv,
  gw0ExportFilename,
  gw0ExportJson,
} from '../analysis/gw0Export'
import {
  assembleSquad,
  DEFAULT_FORMATION,
  FORMATION_IDS,
  fixtureCliff,
  isSquadInfeasibleError,
  overlapDiffs,
  playerAuditLine,
  type FormationId,
  type LpCandidate,
  type OrderedSquad,
  type SquadOverlap,
  type SquadPins,
} from '../analysis/gw0Squad'
import { GW0_SOLVER_NOTE, solveSquadObjective } from '../analysis/gw0Solver'
import { loadedSeasonFromSnapshot } from '../analysis/loadSeason'
import { positionPool, type PositionPool } from '../analysis/metrics'
import { mergeRoleEvidence, parseRoleEvidenceSeed, roleEvidenceByCode } from '../analysis/roleEvidence'
import { PlayerLabel, TeamLabel } from '../components/FplMedia'
import { FplPitch, type PitchPlayer } from '../components/FplPitch'
import { Gw0MetricsExplainer } from '../components/Gw0MetricsExplainer'
import { Gw0PoolCharts } from '../components/Gw0PoolCharts'
import { loadOfficialLiveSnapshot } from '../data/fplLiveSource'
import {
  emptyGw0Pins,
  pinsWithExclude,
  pinsWithLock,
  pinsWithoutCode,
  readGw0SquadPins,
  writeGw0SquadPins,
} from '../data/gw0PinStore'
import { loadSeasonCatalog, loadSeasonSnapshot } from '../data/ingest'
import { formatGbpFromTenths, poundsFromTenths } from '../data/prices'
import { readStoredRoleEvidence } from '../data/roleEvidenceStore'
import { teamRowStyle } from '../data/teamColors'
import type { Gw0PinScope, Gw0SquadPinsRecord } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen, HintedValue } from './ExplorerScreen'
import type { Gw0Projection } from '../analysis/gw0Project'

const PHASE0_BANDS = asPhase0Bands(bandsFile)
const PIN_DEBOUNCE_MS = 400

const HINT = {
  role: 'XI or bench order. The remaining goalkeeper is last on the bench so FPL auto-subs a keeper only if your starter does not play.',
  player: 'Official web_name from the live GW0 snapshot.',
  pos: 'FPL position pooled to GK / DEF / MID / FWD (AM counts as MID).',
  club: 'Club short name. Max 3 players per club in a 15.',
  price: 'Official now_cost in tenths of a million. Budget is £100.0m.',
  gw1: 'Our as-of-GW0 expected FPL points in GW1. Phase 0 RMSE is about 2.7 pts per player — these are candidates, not a unique best team.',
  gw16: 'Sum of independent as-of-GW0 expected points for GW1–GW6. Horizon projections do not condition on post-GW1 events.',
  conf: 'Confidence from minutes sample, external flags, and club stability. Not a second expected-points number.',
  epNext: 'Official FPL ep_next. Reference only — the optimiser does not use it. RMSE on our EP is still about 2.7.',
  delta: 'Our E[pts GW1] minus official ep_next. Not used by the solver.',
  fdr: 'Official fixture difficulty of this player’s GW1 opponent(s).',
  mins: 'Expected GW1 minutes after start-rate, RoleEvidence m_sem, and fitness.',
  club3: 'This club already uses the maximum of 3 in this 15.',
  cliff: 'Two or more FDR 4–5 fixtures in GW4–6.',
  captain: CAPTAIN_HINT,
  pin: 'Lock forces x_p = 1 (must be in the 15). Exclude forces x_p = 0 (cannot be in the 15). Neither leaves the optimiser free.',
  audit: 'Reconstructable GW1 expected-points line (minutes, FDR, m_sem, fitness). Expand or focus for the full audit.',
}

type ReadyBits = {
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  overlap: SquadOverlap
  candidates: LpCandidate[]
  lpPlayers: Gw0Projection[]
  teamShortById: Record<number, string>
  solvedAt: string
}

type PageState =
  | { status: 'loading'; message: string; ready: ReadyBits | null }
  | { status: 'ready'; ready: ReadyBits; infeasible: string | null }
  | { status: 'error'; message: string; ready: ReadyBits | null }

async function loadGw0Pool(force: boolean): Promise<{
  candidates: LpCandidate[]
  lpPlayers: Gw0Projection[]
  teamShortById: Record<number, string>
}> {
  const seed = parseRoleEvidenceSeed(seedFile)
  const stored = await readStoredRoleEvidence()
  const evidenceByCode = roleEvidenceByCode(mergeRoleEvidence(seed, stored))
  const [live, catalog] = await Promise.all([
    loadOfficialLiveSnapshot({ force }),
    loadSeasonCatalog({ force }),
  ])
  const priorKind = catalog.find((entry) => entry.seasonId === GW0_PRIOR_SEASON_ID)?.kind ?? 'historical'
  const priorSnap = await loadSeasonSnapshot(GW0_PRIOR_SEASON_ID, { force, kind: priorKind })
  const prior = loadedSeasonFromSnapshot(priorSnap)
  if (!prior.hasMergedGw) {
    throw new Error(`Vaastav ${GW0_PRIOR_SEASON_ID} merged_gw is required for GW0 priors`)
  }
  const pool = buildGw0OptimiserPool(live, prior, evidenceByCode)
  const teamShortById: Record<number, string> = {}
  for (const team of live.teams) {
    if (team.id > 0 && team.shortName) teamShortById[team.id] = team.shortName
  }
  return {
    candidates: pool.candidates,
    lpPlayers: pool.candidates.map((row) => row.projection),
    teamShortById,
  }
}

type Gw0PageMode = 'data' | 'visual'

export function Gw0SquadPage() {
  return <Gw0Page mode="data" />
}

export function Gw0VisualPage() {
  return <Gw0Page mode="visual" />
}

function Gw0Page({ mode }: { mode: Gw0PageMode }) {
  const [formation, setFormation] = useState<FormationId>(DEFAULT_FORMATION)
  const [pins, setPins] = useState<Gw0SquadPinsRecord>(emptyGw0Pins())
  const [state, setState] = useState<PageState>({
    status: 'loading',
    message: 'Loading live prices and 2025/26 priors…',
    ready: null,
  })
  const debounceRef = useRef<number | null>(null)
  const formationRef = useRef(formation)
  const readyRef = useRef<ReadyBits | null>(null)
  const solveGen = useRef(0)

  useEffect(() => {
    formationRef.current = formation
  }, [formation])

  useEffect(() => {
    readyRef.current = state.ready
  }, [state.ready])

  async function runSolve(options: {
    nextFormation: FormationId
    nextPins: Gw0SquadPinsRecord
    force: boolean
    previous: ReadyBits | null
  }) {
    const { nextFormation, nextPins, force, previous } = options
    const gen = ++solveGen.current
    setState({
      status: 'loading',
      message: force ? 'Re-solving from live data…' : 'Re-solving with current locks/excludes…',
      ready: previous,
    })
    try {
      const pool =
        force || !previous
          ? await loadGw0Pool(force)
          : {
              candidates: previous.candidates,
              lpPlayers: previous.lpPlayers,
              teamShortById: previous.teamShortById,
            }
      const emptyPins: SquadPins = { lockedCodes: [], excludedCodes: [] }
      const shortPins = nextPins.scope === 'longTerm' ? emptyPins : nextPins
      const longPins = nextPins.scope === 'shortTerm' ? emptyPins : nextPins
      const short = await settleObjective(pool.candidates, 'shortTerm', nextFormation, shortPins)
      const long = await settleObjective(pool.candidates, 'longTerm', nextFormation, longPins)
      if (gen !== solveGen.current) return
      const shortTerm = short.squad ?? previous?.shortTerm ?? null
      const longTerm = long.squad ?? previous?.longTerm ?? null
      const failures = [short.error, long.error].filter((row): row is string => Boolean(row))
      if (!shortTerm || !longTerm) {
        setState({
          status: 'error',
          message: failures.join(' ') || 'GW0 solver failed',
          ready: previous,
        })
        return
      }
      const ready: ReadyBits = {
        shortTerm,
        longTerm,
        overlap: overlapDiffs(shortTerm.players, longTerm.players),
        candidates: pool.candidates,
        lpPlayers: pool.lpPlayers,
        teamShortById: pool.teamShortById,
        solvedAt: new Date().toISOString(),
      }
      setState({
        status: 'ready',
        ready,
        infeasible: failures.length ? failures.join(' ') : null,
      })
    } catch (cause) {
      if (gen !== solveGen.current) return
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'GW0 solver failed',
        ready: previous,
      })
    }
  }

  useEffect(() => {
    void (async () => {
      let stored: Gw0SquadPinsRecord
      try {
        stored = await readGw0SquadPins()
      } catch {
        stored = emptyGw0Pins()
      }
      setPins(stored)
      await runSolve({
        nextFormation: DEFAULT_FORMATION,
        nextPins: stored,
        force: false,
        previous: null,
      })
    })()
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    }
  }, [])

  function changeFormation(next: FormationId) {
    setFormation(next)
    setState((current) => {
      if (!current.ready) return current
      const shortTerm = assembleSquad(current.ready.shortTerm.players, 'shortTerm', next)
      const longTerm = assembleSquad(current.ready.longTerm.players, 'longTerm', next)
      return { ...current, ready: { ...current.ready, shortTerm, longTerm } }
    })
  }

  function scheduleSolve(nextPins: Gw0SquadPinsRecord) {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      void runSolve({
        nextFormation: formationRef.current,
        nextPins,
        force: false,
        previous: readyRef.current,
      })
    }, PIN_DEBOUNCE_MS)
  }

  async function commitPins(next: Gw0SquadPinsRecord) {
    setPins(next)
    await writeGw0SquadPins(next)
    scheduleSolve(next)
  }

  const ready = state.ready
  const infeasible = state.status === 'ready' ? state.infeasible : null
  const solving = state.status === 'loading'

  return (
    <ExplorerScreen
      hideSeasonBar
      kicker="GW0 squads"
      title={mode === 'visual' ? 'GW0 visuals and decisions' : 'GW0 calculations and tables'}
      question={
        mode === 'visual'
          ? 'Interactive squad view, pool comparison, and decision charts.'
          : 'Solver details, assumptions, lock/exclude controls, and audit tables.'
      }
    >
      <div className="fpl-explorer__toolbar">
        <Link
          className={`fpl-gw0-route-link${mode === 'visual' ? ' fpl-gw0-route-link--active' : ''}`}
          to="/gw0"
          viewTransition
        >
          Visuals
        </Link>
        <Link
          className={`fpl-gw0-route-link${mode === 'data' ? ' fpl-gw0-route-link--active' : ''}`}
          to="/gw0-data"
          viewTransition
        >
          Data & calc
        </Link>
      </div>
      <details className="fpl-gw0-notes">
        <summary>Limitations, RMSE, and how the optimiser scores</summary>
        <p className="fpl-gw0-callout">
          <strong>GW2–GW6 limitation.</strong> Horizon projections do not condition on post-GW1 events
          (injuries, price changes, realised minutes). They reuse the same as-of-GW0 rates with a
          different FDR.
        </p>
        <p className="fpl-explorer__meta">
          The optimiser maximises expected FPL points, not EPPM and not FPL <code>ep_next</code>.{' '}
          {EP_NEXT_DISCLAIMER} Phase 0 GW1 RMSE is about 2.7 pts per player — these are candidate
          squads, not a unique best team.
        </p>
        <p className="fpl-explorer__meta">{GW0_SOLVER_NOTE}</p>
        <RmseBandsPanel bands={PHASE0_BANDS} />
      </details>

      <div className="fpl-explorer__toolbar">
        <Label className="fpl-explorer__field">
          XI formation
          <Select
            value={formation}
            onChange={(event) => changeFormation(event.target.value as FormationId)}
            disabled={solving && !ready}
          >
            {FORMATION_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
                {id === DEFAULT_FORMATION ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </Label>
        <p className="fpl-explorer__meta">
          <Link to="/gw0-flags">Edit minutes evidence</Link>
          {' — minutes flags change '}
          <code>m_sem</code>
          {'; lock/exclude change the LP. Seed + Dexie overlay feed '}
          <code>m_sem</code>.
        </p>
      </div>

      {infeasible ? (
        <p className="fpl-gw0-callout fpl-gw0-callout--error" role="alert">
          <strong>Could not apply the current locks/excludes.</strong> Locks were not dropped.
          Previous feasible squads stay on screen. {infeasible}
        </p>
      ) : null}

      {solving ? <Spinner label={state.message} /> : null}

      {state.status === 'error' && !ready ? (
        <ExplorerEmpty title="Could not build squads" description={state.message} />
      ) : null}

      {ready ? (
        <Stack gap="lg">
          <ReadyView
            mode={mode}
            shortTerm={ready.shortTerm}
            longTerm={ready.longTerm}
            overlap={ready.overlap}
            lpPool={ready.lpPlayers.length}
            lpPlayers={ready.lpPlayers}
            teamShortById={ready.teamShortById}
            solvedAt={ready.solvedAt}
            pins={pins}
          />
          {mode === 'data' ? (
            <PinPanel
              pins={pins}
              lpPlayers={ready.lpPlayers}
              disabled={solving}
              onRecompute={() => {
                void runSolve({
                  nextFormation: formation,
                  nextPins: pins,
                  force: true,
                  previous: ready,
                })
              }}
              onChange={(next) => {
                void commitPins(next)
              }}
            />
          ) : null}
        </Stack>
      ) : null}
    </ExplorerScreen>
  )
}

async function settleObjective(
  candidates: readonly LpCandidate[],
  objective: 'shortTerm' | 'longTerm',
  formation: FormationId,
  pins: SquadPins,
): Promise<{ squad: OrderedSquad | null; error: string | null }> {
  try {
    const squad = await solveSquadObjective(candidates, objective, formation, pins)
    return { squad, error: null }
  } catch (cause) {
    if (isSquadInfeasibleError(cause)) {
      return { squad: null, error: `${objective}: ${cause.message}` }
    }
    return {
      squad: null,
      error: `${objective}: ${cause instanceof Error ? cause.message : 'solver failed'}`,
    }
  }
}

function RmseBandsPanel({ bands }: { bands: Gw0Phase0Bands }) {
  const shipped = bands.shippedGw1
  return (
    <section className="fpl-gw0-bands">
      <h2 className="fpl-explorer__title">Historical skill (Phase 0 backtest)</h2>
      <p className="fpl-explorer__meta">
        Cached from <code>{bands.source}</code> ({bands.generatedAt.slice(0, 10)}). Not a live
        re-run. One pooled number is not gospel — GW1 RMSE across eight season transitions ranged{' '}
        {bands.transitionRmseMin.toFixed(2)}–{bands.transitionRmseMax.toFixed(2)} (Approach A, no FDR,{' '}
        k_trans=1).
      </p>
      <ul className="fpl-gw0-band-metrics">
        <li>
          <span className="fpl-gw0-band-label">Shipped GW1 RMSE</span>
          <strong>{shipped.rmse.toFixed(2)}</strong>
          <span className="fpl-explorer__meta">pts / player · FDR + CS tables</span>
        </li>
        <li>
          <span className="fpl-gw0-band-label">MAE</span>
          <strong>{shipped.mae.toFixed(2)}</strong>
        </li>
        <li>
          <span className="fpl-gw0-band-label">Spearman</span>
          <strong>{shipped.spearman.toFixed(3)}</strong>
        </li>
        <li>
          <span className="fpl-gw0-band-label">n</span>
          <strong>{shipped.n}</strong>
        </li>
      </ul>
      <p className="fpl-explorer__meta">
        Independent as-of-GW0 horizon RMSE:{' '}
        {bands.horizonByGw.map((row) => `GW${row.gw} ${row.rmse.toFixed(2)}`).join(' · ')}
      </p>
      <p className="fpl-explorer__meta">{bands.squadRmseNote}</p>
    </section>
  )
}

function PinPanel({
  pins,
  lpPlayers,
  disabled,
  onRecompute,
  onChange,
}: {
  pins: Gw0SquadPinsRecord
  lpPlayers: Gw0Projection[]
  disabled: boolean
  onRecompute: () => void
  onChange: (next: Gw0SquadPinsRecord) => void
}) {
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<'ALL' | PositionPool>('ALL')
  const byCode = useMemo(() => new Map(lpPlayers.map((row) => [row.code, row])), [lpPlayers])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return lpPlayers.filter((row) => {
      if (pos !== 'ALL' && positionPool(row.position) !== pos) return false
      if (!needle) return true
      const hay = `${row.current.webName} ${row.current.secondName} ${row.teamShortName} ${positionPool(row.position)} ${row.code}`
      return hay.toLowerCase().includes(needle)
    })
  }, [lpPlayers, pos, query])

  return (
    <section className="fpl-gw0-pins">
      <h2 className="fpl-explorer__title">Lock / exclude</h2>
      <p className="fpl-explorer__meta">
        Pins apply to the LP pool (~{lpPlayers.length} players), not only the current 15. Search by
        name, club, or position. {HINT.pin}
      </p>
      <div className="fpl-explorer__toolbar">
        <Button variant="primary" disabled={disabled} onClick={onRecompute}>
          Recompute
        </Button>
        <Label className="fpl-explorer__field">
          Apply lock/exclude to
          <Select
            value={pins.scope}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...pins, scope: event.target.value as Gw0PinScope, updatedAt: Date.now() })
            }
          >
            <option value="both">Both squads</option>
            <option value="shortTerm">Short-term only</option>
            <option value="longTerm">Long-term only</option>
          </Select>
        </Label>
        <Label className="fpl-explorer__field">
          Search LP pool
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, club, or position"
            disabled={disabled}
          />
        </Label>
        <Label className="fpl-explorer__field">
          Position
          <Select value={pos} disabled={disabled} onChange={(event) => setPos(event.target.value as 'ALL' | PositionPool)}>
            <option value="ALL">All</option>
            <option value="GK">GK</option>
            <option value="DEF">DEF</option>
            <option value="MID">MID</option>
            <option value="FWD">FWD</option>
          </Select>
        </Label>
      </div>
      <div className="fpl-gw0-chip-row">
        <span className="fpl-explorer__meta">Locked:</span>
        {pins.lockedCodes.length === 0 ? <span className="fpl-explorer__meta">none</span> : null}
        {pins.lockedCodes.map((code) => (
          <Button
            key={`lock-${code}`}
            className="fpl-gw0-chip"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(pinsWithoutCode(pins, code))}
          >
            {byCode.get(code)?.current.webName ?? `code ${code}`} ×
          </Button>
        ))}
        {pins.lockedCodes.length ? (
          <Button disabled={disabled} onClick={() => onChange({ ...pins, lockedCodes: [], updatedAt: Date.now() })}>
            Clear locks
          </Button>
        ) : null}
      </div>
      <div className="fpl-gw0-chip-row">
        <span className="fpl-explorer__meta">Excluded:</span>
        {pins.excludedCodes.length === 0 ? <span className="fpl-explorer__meta">none</span> : null}
        {pins.excludedCodes.map((code) => (
          <Button
            key={`excl-${code}`}
            className="fpl-gw0-chip"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(pinsWithoutCode(pins, code))}
          >
            {byCode.get(code)?.current.webName ?? `code ${code}`} ×
          </Button>
        ))}
        {pins.excludedCodes.length ? (
          <Button disabled={disabled} onClick={() => onChange({ ...pins, excludedCodes: [], updatedAt: Date.now() })}>
            Clear excludes
          </Button>
        ) : null}
      </div>
      <DataTable
        caption="LP pool — lock or exclude for the next solve"
        defaultSort={{ id: 'gw1', direction: 'desc' }}
        columns={[
          {
            id: 'player',
            label: 'Player',
            hint: HINT.player,
            sortValue: (row) => row.current.webName,
            render: (row) => <PlayerLabel player={row.current} />,
          },
          {
            id: 'pos',
            label: 'Pos',
            hint: HINT.pos,
            sortValue: (row) => positionPool(row.position),
            render: (row) => positionPool(row.position),
          },
          {
            id: 'club',
            label: 'Club',
            hint: HINT.club,
            sortValue: (row) => row.teamShortName,
            render: (row) => <TeamLabel team={clubOf(row)} />,
          },
          {
            id: 'price',
            label: 'Price',
            hint: HINT.price,
            sortValue: (row) => row.nowCostTenths,
            render: (row) => formatGbpFromTenths(row.nowCostTenths),
          },
          {
            id: 'gw1',
            label: 'E GW1',
            hint: HINT.gw1,
            sortValue: (row) => row.ePtsGw1,
            render: (row) => (
              <HintedValue hint={HINT.gw1}>{fmt(row.ePtsGw1)}</HintedValue>
            ),
          },
          {
            id: 'pin',
            label: 'Pin',
            hint: HINT.pin,
            sortValue: (row) => pinStatus(pins, row.code),
            render: (row) => pinStatus(pins, row.code) || '—',
          },
          {
            id: 'actions',
            label: 'Lock / exclude',
            hint: HINT.pin,
            render: (row) => (
              <span className="fpl-gw0-actions">
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      pinStatus(pins, row.code) === 'lock'
                        ? pinsWithoutCode(pins, row.code)
                        : pinsWithLock(pins, row.code),
                    )
                  }
                >
                  {pinStatus(pins, row.code) === 'lock' ? 'Unlock' : 'Lock'}
                </Button>
                <Button
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      pinStatus(pins, row.code) === 'exclude'
                        ? pinsWithoutCode(pins, row.code)
                        : pinsWithExclude(pins, row.code),
                    )
                  }
                >
                  {pinStatus(pins, row.code) === 'exclude' ? 'Include' : 'Exclude'}
                </Button>
              </span>
            ),
          },
        ]}
        rows={visible}
        empty={query.trim() || pos !== 'ALL' ? 'No LP-pool players match that search.' : 'LP pool is empty.'}
        rowKey={(row) => row.code}
        rowStyle={(row) => teamRowStyle(clubOf(row))}
      />
    </section>
  )
}

function ReadyView({
  mode,
  shortTerm,
  longTerm,
  overlap,
  lpPool,
  lpPlayers,
  teamShortById,
  solvedAt,
  pins,
}: {
  mode: Gw0PageMode
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  overlap: SquadOverlap
  lpPool: number
  lpPlayers: Gw0Projection[]
  teamShortById: Record<number, string>
  solvedAt: string
  pins: Gw0SquadPinsRecord
}) {
  const disagreements = useMemo(() => largestEpNextDisagreements(lpPlayers), [lpPlayers])
  const shortEp = summariseEpNext(shortTerm.players)
  const longEp = summariseEpNext(longTerm.players)
  const shortCaptain = suggestCaptainForSquad(shortTerm)
  const longCaptain = suggestCaptainForSquad(longTerm)
  const shorts = useMemo(() => {
    const map = new Map<number, string>()
    for (const [id, name] of Object.entries(teamShortById)) map.set(Number(id), name)
    for (const [id, name] of teamShortByIdFromPlayers(lpPlayers)) map.set(id, name)
    return map
  }, [lpPlayers, teamShortById])
  const shortCodes = useMemo(() => new Set(shortTerm.players.map((row) => row.code)), [shortTerm])
  const longCodes = useMemo(() => new Set(longTerm.players.map((row) => row.code)), [longTerm])
  const [view15, setView15] = useState<'shortTerm' | 'longTerm'>('shortTerm')

  const selectedSquad = view15 === 'shortTerm' ? shortTerm : longTerm
  const selectedCaptain = view15 === 'shortTerm' ? shortCaptain : longCaptain
  const otherCodes = view15 === 'shortTerm' ? longCodes : shortCodes
  const selectedCodes = view15 === 'shortTerm' ? shortCodes : longCodes

  const selectedLabel = view15 === 'shortTerm' ? 'Short-term 15' : 'Long-term 15'
  const otherLabel = view15 === 'shortTerm' ? 'Long-term 15' : 'Short-term 15'

  const selectedCodesSet = selectedCodes

  if (mode === 'visual') {
    return (
      <Stack gap="lg">
        <div className="fpl-explorer__toolbar">
          <Label className="fpl-explorer__field">
            Show 15
            <Select value={view15} onChange={(event) => setView15(event.target.value as 'shortTerm' | 'longTerm')}>
              <option value="shortTerm">Short-term 15</option>
              <option value="longTerm">Long-term 15</option>
            </Select>
          </Label>
          <p className="fpl-explorer__meta">
            LP pool {lpPlayers.length} · overlap {overlap.shared.length}/15 · short-term ΣGW1 {fmt(overlap.shortGw1)}{' '}
            vs long-term {fmt(overlap.longGw1)}.
          </p>
        </div>

        <div className="fpl-gw0-pitches">
          <SquadPanel
            title={view15 === 'shortTerm' ? 'Short-term 15' : 'Long-term 15'}
            blurb={view15 === 'shortTerm' ? 'Max expected GW1 points.' : 'Max equal-weight expected GW1–GW6 points.'}
            squad={selectedSquad}
            captain={selectedCaptain}
            shorts={shorts}
          />
        </div>

        <PoolPlayersTable
          players={lpPlayers}
          selectedCodes={selectedCodesSet}
          captainCode={selectedCaptain.captain.code}
          viceCode={selectedCaptain.vice.code}
        />

        <Gw0PoolCharts
          pool={lpPlayers}
          metricDefault="ePtsGw1"
          selectedCodes={selectedCodesSet}
          otherCodes={otherCodes}
          selectedLabel={selectedLabel}
          otherLabel={otherLabel}
        />

        <Gw0MetricsExplainer />
      </Stack>
    )
  }

  return (
    <Stack gap="lg">
      <div className="fpl-gw0-pitches">
        <SquadPanel
          title="Short-term 15"
          blurb="Max expected GW1 points."
          squad={shortTerm}
          captain={shortCaptain}
          shorts={shorts}
          showPitch={false}
        />
        <SquadPanel
          title="Long-term 15"
          blurb="Max equal-weight expected GW1–GW6 points."
          squad={longTerm}
          captain={longCaptain}
          shorts={shorts}
          showPitch={false}
        />
      </div>
      <p className="fpl-explorer__meta">
        LP pool {lpPool} · overlap {overlap.shared.length}/15 · short-term ΣGW1 {fmt(overlap.shortGw1)} vs
        long-term {fmt(overlap.longGw1)} · short-term ΣGW1–6 {fmt(overlap.shortGw16)} vs long-term{' '}
        {fmt(overlap.longGw16)}
      </p>
      <p className="fpl-explorer__meta">
        Σ ep_next vs Σ E GW1 (compared players only): short-term {fmt(shortEp.epNextSum)} vs{' '}
        {fmt(shortEp.ourGw1Compared)}
        {shortEp.delta == null ? '' : ` (${formatSigned(shortEp.delta)})`}
        {shortEp.missing ? ` · ${shortEp.missing} missing ep_next` : ''} · long-term{' '}
        {fmt(longEp.epNextSum)} vs {fmt(longEp.ourGw1Compared)}
        {longEp.delta == null ? '' : ` (${formatSigned(longEp.delta)})`}
        {longEp.missing ? ` · ${longEp.missing} missing ep_next` : ''}
      </p>
      <div className="fpl-gw0-diff">
        <p>
          <strong>Shared:</strong> {names(overlap.shared) || 'none'}
        </p>
        <p>
          <strong>Short-term only:</strong> {names(overlap.onlyShort) || '—'}
        </p>
        <p>
          <strong>Long-term only:</strong> {names(overlap.onlyLong) || '—'}
        </p>
      </div>
      <DisagreementsPanel rows={disagreements} lpPool={lpPool} lpPlayers={lpPlayers} />
      <ExportBar
        shortTerm={shortTerm}
        longTerm={longTerm}
        solvedAt={solvedAt}
        pins={pins}
        shortCaptain={shortCaptain}
        longCaptain={longCaptain}
      />
    </Stack>
  )
}

function PoolPlayersTable({
  players,
  selectedCodes,
  captainCode,
  viceCode,
}: {
  players: readonly Gw0Projection[]
  selectedCodes: ReadonlySet<number>
  captainCode: number
  viceCode: number
}) {
  const [query, setQuery] = useState('')
  const inSelectedHint = 'Whether this LP-pool player is in the selected 15 (C/V if captain/vice).'

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return players
    return players.filter((row) => {
      const club = row.teamShortName ?? ''
      const pos = positionPool(row.position)
      const hay = `${row.current.webName} ${club} ${pos} ${row.code}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [players, query])

  return (
    <section className="fpl-gw0-squad">
      <h2 className="fpl-explorer__title">LP pool — all players</h2>
      <p className="fpl-explorer__meta">
        Marked with <strong>✓</strong> (or <strong>C</strong>/<strong>V</strong>) when they belong to the selected 15.
      </p>

      <div className="fpl-explorer__toolbar">
        <Label className="fpl-explorer__field">
          Search
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, club, or pos"
          />
        </Label>
      </div>

      <DataTable
        caption="LP-pool players — compare selected 15 membership"
        defaultSort={{ id: 'in15', direction: 'desc' }}
        columns={[
          {
            id: 'player',
            label: 'Player',
            hint: HINT.player,
            sortValue: (row) => row.current.webName,
            render: (row) => <PlayerLabel player={row.current} />,
          },
          {
            id: 'pos',
            label: 'Pos',
            hint: HINT.pos,
            sortValue: (row) => positionPool(row.position),
            render: (row) => positionPool(row.position),
          },
          {
            id: 'club',
            label: 'Club',
            hint: HINT.club,
            sortValue: (row) => row.teamShortName,
            render: (row) => <TeamLabel team={clubOf(row)} />,
          },
          {
            id: 'price',
            label: 'Price',
            hint: HINT.price,
            sortValue: (row) => row.nowCostTenths,
            render: (row) => formatGbpFromTenths(row.nowCostTenths),
          },
          {
            id: 'gw1',
            label: 'E GW1',
            hint: HINT.gw1,
            sortValue: (row) => row.ePtsGw1,
            render: (row) => <HintedValue hint={HINT.gw1}>{fmt(row.ePtsGw1)}</HintedValue>,
          },
          {
            id: 'in15',
            label: 'In selected 15',
            hint: inSelectedHint,
            sortValue: (row) => (selectedCodes.has(row.code) ? 1 : 0),
            render: (row) => {
              if (row.code === captainCode) return <span className="fpl-gw0-captain-mark">C</span>
              if (row.code === viceCode) return 'V'
              return selectedCodes.has(row.code) ? '✓' : '—'
            },
          },
        ]}
        rows={visible}
        empty={query.trim() ? 'No LP-pool players match that search.' : 'LP pool is empty.'}
        rowKey={(row) => row.code}
        rowStyle={(row) => teamRowStyle(clubOf(row))}
        rowClassName={(row) =>
          row.code === captainCode
            ? 'fpl-gw0-row--captain'
            : row.code === viceCode
              ? 'fpl-gw0-row--vice'
              : selectedCodes.has(row.code)
                ? 'fpl-gw0-row--in-selected'
                : undefined
        }
      />
    </section>
  )
}

function DisagreementsPanel({
  rows,
  lpPool,
  lpPlayers,
}: {
  rows: ReturnType<typeof largestEpNextDisagreements>
  lpPool: number
  lpPlayers: Gw0Projection[]
}) {
  const byCode = useMemo(() => new Map(lpPlayers.map((row) => [row.code, row])), [lpPlayers])
  return (
    <section className="fpl-gw0-squad">
      <h2 className="fpl-explorer__title">Largest ep_next disagreements</h2>
      <p className="fpl-explorer__meta">
        Top {rows.length} |E GW1 − ep_next| in the LP pool ({lpPool} players). Reference only — the
        solver does not use ep_next.
      </p>
      <DataTable
        caption="LP-pool players with the largest absolute gap versus official ep_next"
        defaultSort={{ id: 'abs', direction: 'desc' }}
        columns={[
          {
            id: 'player',
            label: 'Player',
            hint: HINT.player,
            sortValue: (row) => row.webName,
            render: (row) => {
              const player = byCode.get(row.code)
              return player ? <PlayerLabel player={player.current} /> : row.webName
            },
          },
          {
            id: 'pos',
            label: 'Pos',
            hint: HINT.pos,
            sortValue: (row) => row.position,
            render: (row) => row.position,
          },
          {
            id: 'club',
            label: 'Club',
            hint: HINT.club,
            sortValue: (row) => row.teamShortName,
            render: (row) => {
              const player = byCode.get(row.code)
              return player ? <TeamLabel team={clubOf(player)} /> : row.teamShortName
            },
          },
          {
            id: 'gw1',
            label: 'E GW1',
            hint: HINT.gw1,
            sortValue: (row) => row.ePtsGw1,
            render: (row) => <HintedValue hint={HINT.gw1}>{fmt(row.ePtsGw1)}</HintedValue>,
          },
          {
            id: 'epnext',
            label: 'ep_next',
            hint: HINT.epNext,
            sortValue: (row) => row.epNext,
            render: (row) => <HintedValue hint={HINT.epNext}>{fmt(row.epNext)}</HintedValue>,
          },
          {
            id: 'delta',
            label: 'Δ',
            hint: HINT.delta,
            sortValue: (row) => row.delta,
            render: (row) => <HintedValue hint={HINT.delta}>{formatSigned(row.delta)}</HintedValue>,
          },
          {
            id: 'abs',
            label: '|Δ|',
            hint: HINT.delta,
            sortValue: (row) => row.absDelta,
            render: (row) => row.absDelta.toFixed(2),
          },
        ]}
        rows={rows}
        empty="No LP-pool player has both E GW1 and ep_next."
        rowKey={(row) => row.code}
        rowStyle={(row) => teamRowStyle(clubOf(byCode.get(row.code)))}
      />
    </section>
  )
}

function ExportBar({
  shortTerm,
  longTerm,
  solvedAt,
  pins,
  shortCaptain,
  longCaptain,
}: {
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  solvedAt: string
  pins: Gw0SquadPinsRecord
  shortCaptain: CaptainSuggestion
  longCaptain: CaptainSuggestion
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const payload = useMemo(
    () =>
      buildGw0ExportPayload(shortTerm, longTerm, solvedAt, {
        pins: {
          lockedCodes: pins.lockedCodes,
          excludedCodes: pins.excludedCodes,
          scope: pins.scope,
        },
        shortCaptain,
        longCaptain,
      }),
    [shortTerm, longTerm, solvedAt, pins, shortCaptain, longCaptain],
  )
  const json = useMemo(() => gw0ExportJson(payload), [payload])
  const csv = useMemo(() => gw0ExportCsv(payload), [payload])

  return (
    <div className="fpl-gw0-export">
      <p className="fpl-explorer__meta">
        Export both 15s (XI, bench, prices, E GW1, E GW1–6, remaining budget, formation, generated-at,
        lock/exclude sets, captain suggestion). Client-side only.
      </p>
      <div className="fpl-explorer__toolbar">
        <Button
          onClick={() => downloadText(gw0ExportFilename(payload.generatedAt, 'json'), json, 'application/json')}
        >
          Download JSON
        </Button>
        <Button
          onClick={() => downloadText(gw0ExportFilename(payload.generatedAt, 'csv'), csv, 'text/csv')}
        >
          Download CSV
        </Button>
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(json).then(
              () => {
                setCopyState('copied')
                window.setTimeout(() => setCopyState('idle'), 2000)
              },
              () => setCopyState('failed'),
            )
          }}
        >
          {copyState === 'copied' ? 'Copied JSON' : copyState === 'failed' ? 'Copy failed' : 'Copy JSON'}
        </Button>
      </div>
    </div>
  )
}

function SquadPanel({
  title,
  blurb,
  squad,
  captain,
  shorts,
  showPitch = true,
}: {
  title: string
  blurb: string
  squad: OrderedSquad
  captain: CaptainSuggestion
  shorts: Map<number, string>
  showPitch?: boolean
}) {
  const d = squad.diagnostics
  const clubs = d.clubs
    .filter((row) => row.n >= 2)
    .map((row) => `${row.shortName}×${row.n}${row.flagged ? ' · 3-of-club' : ''}`)
    .join(' · ')
  const cliffs =
    d.cliffs.length === 0
      ? 'No player has two or more FDR 4–5 fixtures in GW4–6.'
      : d.cliffs.map((row) => `${row.player.current.webName} (${row.cliff.detail})`).join('; ')
  const xiCodes = new Set(squad.xi.map((row) => row.code))
  const ep = summariseEpNext(squad.players)
  const clubCount = new Map(d.clubs.map((row) => [row.teamId, row]))
  const xi = squad.xi.map((player) => toPitchPlayer(player, shorts, captain))
  const bench = squad.bench.map((player) => toPitchPlayer(player, shorts, captain))

  return (
    <section className="fpl-gw0-squad">
      <h2 className="fpl-explorer__title">{title}</h2>
      <p className="fpl-explorer__meta">{blurb}</p>
      {showPitch ? (
        <FplPitch
          formation={squad.formation}
          players={xi}
          bench={bench}
          label={`${title} · ${squad.formation}`}
        />
      ) : null}
      <ul className="fpl-gw0-stats">
        <li>Remaining {formatGbpFromTenths(d.remainingTenths)} of £100.0m</li>
        <li>
          Spend GK {formatGbpFromTenths(d.spendByLine.GK)} · DEF {formatGbpFromTenths(d.spendByLine.DEF)} · MID{' '}
          {formatGbpFromTenths(d.spendByLine.MID)} · FWD {formatGbpFromTenths(d.spendByLine.FWD)}
        </li>
        <li>Club concentration: {clubs || 'no doubles'}</li>
        <li>Fixture cliff: {cliffs}</li>
        <li>
          Best XI ({squad.formation}): {names(squad.xi)}
        </li>
        <li>Bench (outfield by GW1 EP, GK last): {names(squad.bench)}</li>
        <li>
          <HintedValue hint={HINT.captain}>
            Captain {captain.captain.current.webName} ({fmt(captain.captain.ePtsGw1)} E GW1, doubled{' '}
            {fmt(captain.captainDoubledGw1)}) · vice {captain.vice.current.webName} · Σ GW1 with captain{' '}
            {fmt(captain.squadGw1WithCaptain)}
          </HintedValue>
        </li>
        {captain.tossUp ? <li>Captain toss-up: {captain.tossUpDetail}</li> : null}
        <li>
          Σ ep_next {fmt(ep.epNextSum)} vs Σ E GW1 {fmt(ep.ourGw1Compared)}
          {ep.delta == null ? '' : ` (${formatSigned(ep.delta)})`}
          {ep.missing ? ` · ${ep.missing} missing` : ''} — reference only
        </li>
      </ul>
      <details className="fpl-gw0-selected15-table">
        <summary tabIndex={0}>Selected 15 — full audit table</summary>
        <DataTable
        caption={`${title} — pick role, stats, captain suggestion, and GW1 audit`}
        defaultSort={{ id: 'role', direction: 'asc' }}
        rowStyle={(row) => teamRowStyle(clubOf(row))}
        rowClassName={(row) =>
          row.code === captain.captain.code
            ? 'fpl-gw0-row--captain'
            : row.code === captain.vice.code
              ? 'fpl-gw0-row--vice'
              : undefined
        }
        columns={[
          {
            id: 'role',
            label: 'XI / bench',
            hint: HINT.role,
            sortValue: (row) => (xiCodes.has(row.code) ? 0 : 10 + squad.bench.findIndex((item) => item.code === row.code)),
            render: (row) => (
              <HintedValue hint={HINT.role}>{roleLabel(row, squad, xiCodes)}</HintedValue>
            ),
          },
          {
            id: 'player',
            label: 'Player',
            hint: HINT.player,
            sortValue: (row) => row.current.webName,
            render: (row) => <PlayerLabel player={row.current} />,
          },
          {
            id: 'pos',
            label: 'Pos',
            hint: HINT.pos,
            sortValue: (row) => positionPool(row.position),
            render: (row) => positionPool(row.position),
          },
          {
            id: 'club',
            label: 'Club',
            hint: HINT.club,
            sortValue: (row) => row.teamShortName,
            render: (row) => <TeamLabel team={clubOf(row)} />,
          },
          {
            id: 'price',
            label: 'Price',
            hint: HINT.price,
            sortValue: (row) => row.nowCostTenths,
            render: (row) => (
              <HintedValue hint={HINT.price}>{formatGbpFromTenths(row.nowCostTenths)}</HintedValue>
            ),
          },
          {
            id: 'gw1',
            label: 'E GW1',
            hint: HINT.gw1,
            sortValue: (row) => row.ePtsGw1,
            render: (row) => <HintedValue hint={HINT.gw1}>{fmt(row.ePtsGw1)}</HintedValue>,
          },
          {
            id: 'gw16',
            label: 'E GW1–6',
            hint: HINT.gw16,
            sortValue: (row) => row.ePtsGw16,
            render: (row) => <HintedValue hint={HINT.gw16}>{fmt(row.ePtsGw16)}</HintedValue>,
          },
          {
            id: 'conf',
            label: 'Conf',
            hint: HINT.conf,
            sortValue: (row) => row.confidence.label,
            render: (row) => <HintedValue hint={HINT.conf}>{row.confidence.label}</HintedValue>,
          },
          {
            id: 'epnext',
            label: 'ep_next',
            hint: HINT.epNext,
            sortValue: (row) => row.epNext ?? -1,
            render: (row) => (
              <HintedValue hint={HINT.epNext}>{row.epNext == null ? '—' : fmt(row.epNext)}</HintedValue>
            ),
          },
          {
            id: 'delta',
            label: 'Δ vs ep_next',
            hint: HINT.delta,
            sortValue: (row) => epNextDelta(row.ePtsGw1, row.epNext) ?? -999,
            render: (row) => {
              const delta = epNextDelta(row.ePtsGw1, row.epNext)
              return <HintedValue hint={HINT.delta}>{delta == null ? '—' : formatSigned(delta)}</HintedValue>
            },
          },
          {
            id: 'captain',
            label: 'C / V',
            hint: HINT.captain,
            sortValue: (row) => (row.code === captain.captain.code ? 0 : row.code === captain.vice.code ? 1 : 2),
            render: (row) => (
              <HintedValue hint={HINT.captain}>
                {row.code === captain.captain.code ? (
                  <span className="fpl-gw0-captain-mark">C</span>
                ) : row.code === captain.vice.code ? (
                  'V'
                ) : (
                  '—'
                )}
              </HintedValue>
            ),
          },
          {
            id: 'fdr',
            label: 'FDR GW1',
            hint: HINT.fdr,
            sortValue: (row) => gw1Fdr(row),
            render: (row) => <HintedValue hint={HINT.fdr}>{gw1Fdr(row)}</HintedValue>,
          },
          {
            id: 'mins',
            label: 'E min GW1',
            hint: HINT.mins,
            sortValue: (row) => row.expectedMinutesGw1,
            render: (row) => <HintedValue hint={HINT.mins}>{row.expectedMinutesGw1.toFixed(0)}</HintedValue>,
          },
          {
            id: 'club3',
            label: '3-of-club',
            hint: HINT.club3,
            sortValue: (row) => clubCount.get(row.current.teamId)?.n ?? 0,
            render: (row) => {
              const club = clubCount.get(row.current.teamId)
              const label = club?.flagged ? '3-of-club' : club && club.n >= 2 ? `${club.n}` : '—'
              return <HintedValue hint={HINT.club3}>{label}</HintedValue>
            },
          },
          {
            id: 'cliff',
            label: 'Cliff',
            hint: HINT.cliff,
            sortValue: (row) => (fixtureCliff(row).flagged ? 1 : 0),
            render: (row) => {
              const cliff = fixtureCliff(row)
              return <HintedValue hint={`${HINT.cliff} ${cliff.detail}`}>{cliff.flagged ? 'Yes' : '—'}</HintedValue>
            },
          },
          {
            id: 'audit',
            label: 'Audit',
            hint: HINT.audit,
            render: (row) => <AuditCell player={row} />,
          },
        ]}
        rows={squad.players}
        empty="Solver returned no players."
        rowKey={(row) => row.code}
      />
      </details>
      <p className="fpl-explorer__meta">
        Price {formatGbpFromTenths(d.spendTenths)} · Σ E GW1 {fmt(d.ePtsGw1)} · Σ E GW1–6 {fmt(d.ePtsGw16)}
        {' · '}£{poundsFromTenths(d.remainingTenths).toFixed(1)}m unspent · Σ GW1 with captain{' '}
        {fmt(captain.squadGw1WithCaptain)}
      </p>
    </section>
  )
}

function AuditCell({ player }: { player: Gw0Projection }) {
  const line = playerAuditLine(player)
  return (
    <details className="fpl-gw0-audit-details">
      <summary tabIndex={0} title={line || HINT.audit}>
        GW1 audit
      </summary>
      <p className="fpl-gw0-audit">{line || 'No GW1 audit line.'}</p>
    </details>
  )
}

function clubOf(
  player?: Pick<Gw0Projection, 'current' | 'teamName' | 'teamShortName'> | null,
) {
  if (!player) return undefined
  return {
    code: player.current.teamCode,
    name: player.teamName,
    shortName: player.teamShortName,
  }
}

function teamShortByIdFromPlayers(players: readonly Gw0Projection[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const row of players) {
    if (row.current.teamId > 0 && row.teamShortName) map.set(row.current.teamId, row.teamShortName)
  }
  return map
}

function gw1FixtureLabel(player: Gw0Projection, shorts: Map<number, string>): string {
  const gw1 = player.auditByGw.find((row) => row.gw === 1)
  const fixtures = gw1?.fixtures.filter((row) => row.fixtureId > 0) ?? []
  if (!fixtures.length) return ''
  return fixtures
    .map((fx) => {
      const opp = shorts.get(fx.opponentTeamId)
      const place = fx.home ? 'H' : 'A'
      return opp ? `${opp} (${place})` : `(${place})`
    })
    .join(' · ')
}

function toPitchPlayer(
  player: Gw0Projection,
  shorts: Map<number, string>,
  captain: CaptainSuggestion,
): PitchPlayer {
  return {
    id: player.code,
    name: player.current.webName,
    photoCode: player.code,
    teamCode: player.current.teamCode,
    teamShortName: player.teamShortName,
    position: positionPool(player.position),
    fixture: gw1FixtureLabel(player, shorts),
    captain: player.code === captain.captain.code,
    viceCaptain: player.code === captain.vice.code,
  }
}

function roleLabel(row: Gw0Projection, squad: OrderedSquad, xiCodes: ReadonlySet<number>): string {
  if (xiCodes.has(row.code)) return 'XI'
  const index = squad.bench.findIndex((item) => item.code === row.code)
  const gk = positionPool(row.position) === 'GK'
  return gk ? `Bench ${index + 1} (GK last)` : `Bench ${index + 1}`
}

function gw1Fdr(player: Gw0Projection): string {
  const gw1 = player.auditByGw.find((row) => row.gw === 1)
  if (!gw1 || gw1.fdrBuckets.length === 0) return '—'
  return gw1.fdrBuckets.map((bucket) => (bucket == null ? '?' : String(bucket))).join('/')
}

function pinStatus(pins: Gw0SquadPinsRecord, code: number): 'lock' | 'exclude' | '' {
  if (pins.lockedCodes.includes(code)) return 'lock'
  if (pins.excludedCodes.includes(code)) return 'exclude'
  return ''
}

function names(players: readonly { current: { webName: string } }[]): string {
  return players.map((row) => row.current.webName).join(', ')
}

function fmt(value: number): string {
  return value.toFixed(2)
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
