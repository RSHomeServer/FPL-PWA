import { Button, Label, Select } from '@songara/pwa-base/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FplPitch, type PitchPlayer } from '../components/FplPitch'
import { PlayerLabel } from '../components/FplMedia'
import type { ChipUse, DynamicStrategy } from '../analysis/perfectSeason'
import { searchDynamicStrategies, squadQuotaDetail, strategyWeekSeries, weekChipLabel } from '../analysis/perfectSeason'
import {
  formatPerfectSpend,
  scoreBreakdown,
  solvePerfectGwTeam,
  type HindsightPlayer,
  type PerfectGwTeam,
  type PerfectTeamCostMode,
} from '../analysis/perfectTeam'
import { openingOverlap, solveHistoricalGw0Opening } from '../analysis/historicalGw0'
import { GW0_SOLVER_NOTE } from '../analysis/gw0Solver'
import { isSquadInfeasibleError } from '../analysis/gw0Squad'
import { priorSeasonId } from '../analysis/loadSeason'
import { useFplData } from '../data/fplDataContext'
import { loadSeasonSnapshot } from '../data/ingest'
import {
  readDynamicStrategiesCache,
  readStaticTeamCache,
  writeDynamicStrategiesCache,
  writeStaticTeamCache,
  type PerfectCacheOptionFlags,
} from '../data/perfectTeamCache'
import {
  emptyPerfectTeamPins,
  perfectPinsWithExclude,
  perfectPinsWithLock,
  perfectPinsWithoutCode,
  readPerfectTeamPins,
  writePerfectTeamPins,
} from '../data/perfectTeamPinStore'
import { latestPlayedRound, maxRound, teamById } from '../data/queries'
import { formatGbpFromTenths } from '../data/prices'
import { formatEvent, formatScoreLines } from '../data/scoring'
import { teamRowStyle } from '../data/teamColors'
import type { FplPlayer, FplTeam, PerfectTeamPinsRecord, SeasonSnapshot } from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

type AnalysisMode = 'static' | 'dynamic'

type StaticState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; team: PerfectGwTeam; fromCache: boolean }
  | { status: 'error'; message: string }

type DynamicState =
  | { status: 'idle' }
  | { status: 'loading'; progress: string }
  | { status: 'ready'; strategies: DynamicStrategy[]; fromCache: boolean }
  | { status: 'error'; message: string }

type Gw0CompareState =
  | { status: 'idle' }
  | { status: 'loading'; progress: string }
  | {
      status: 'ready'
      modelOpening: HindsightPlayer[]
      idealGw1: HindsightPlayer[]
      shared: number
      modelSeasonPts: number
      optimalSeasonPts: number
    }
  | { status: 'error'; message: string }

function errorMessage(cause: unknown, fallback: string): string {
  if (isSquadInfeasibleError(cause)) return cause.message
  if (cause instanceof Error) return cause.message
  return fallback
}

export function PerfectTeamPage() {
  const location = useLocation()
  const mode: AnalysisMode = location.pathname.includes('/dynamic') ? 'dynamic' : 'static'
  const { snapshot, status, catalog, seasonId, setSeasonId } = useFplData()
  const [round, setRound] = useState(1)
  const [staticState, setStaticState] = useState<StaticState>({ status: 'idle' })
  const [dynamicState, setDynamicState] = useState<DynamicState>({ status: 'idle' })
  const [strategyIndex, setStrategyIndex] = useState(0)
  const [dynamicGw, setDynamicGw] = useState(1)
  const [gw0Compare, setGw0Compare] = useState<Gw0CompareState>({ status: 'idle' })
  const [showDetails, setShowDetails] = useState(false)
  const [showCost, setShowCost] = useState(false)
  const [useChips, setUseChips] = useState(false)
  const [costMode, setCostMode] = useState<PerfectTeamCostMode>('gw-price')
  const [pins, setPins] = useState<PerfectTeamPinsRecord>(emptyPerfectTeamPins(''))
  const [pinQuery, setPinQuery] = useState('')
  const didDefaultSeason = useRef(false)

  const previousSeasonId = useMemo(() => {
    if (catalog.length === 0) return null
    return (
      [...catalog].reverse().find((entry) => entry.kind === 'historical')?.seasonId ??
      catalog.filter((entry) => entry.kind !== 'current').at(-1)?.seasonId ??
      null
    )
  }, [catalog])

  // One-shot default to previous completed season; never fight a later user choice.
  useEffect(() => {
    if (didDefaultSeason.current || !previousSeasonId) return
    didDefaultSeason.current = true
    if (previousSeasonId !== seasonId) setSeasonId(previousSeasonId)
  }, [previousSeasonId, seasonId, setSeasonId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!seasonId) return
      const stored = await readPerfectTeamPins(seasonId)
      if (!cancelled) setPins(stored)
    })()
    return () => {
      cancelled = true
    }
  }, [seasonId])

  const seasonReady = Boolean(snapshot)
  const maxGw = snapshot ? maxRound(snapshot.performances, snapshot.fixtures) : 0
  const latestGw = snapshot ? latestPlayedRound(snapshot.performances) : 0
  const selectedGw = Math.min(Math.max(1, round || latestGw || maxGw || 1), maxGw || 1)
  const revision = snapshot?.meta.sourceRevision ?? 'unknown'
  const noPlayedGwMessage =
    snapshot && (maxGw < 1 || latestGw < 1)
      ? snapshot.meta.kind === 'current'
        ? 'Current-season hindsight data is not available yet (no played gameweek performances in the snapshot). Try refreshing season data, or pick a completed historical season.'
        : 'No played gameweek performances in this season snapshot.'
      : null
  const cacheFlags: PerfectCacheOptionFlags = useMemo(
    () => ({
      useChips,
      lockedCodes: pins.lockedCodes,
      excludedCodes: pins.excludedCodes,
      costMode,
    }),
    [useChips, pins.lockedCodes, pins.excludedCodes, costMode],
  )

  useEffect(() => {
    if (!snapshot || mode !== 'static' || !seasonReady || noPlayedGwMessage) return
    let cancelled = false
    void (async () => {
      setStaticState({ status: 'loading' })
      try {
        const cached = await readStaticTeamCache(snapshot.meta.seasonId, selectedGw, revision, cacheFlags)
        if (cached && !cancelled) {
          setStaticState({ status: 'ready', team: cached, fromCache: true })
          return
        }
        const team = await solvePerfectGwTeam(snapshot, selectedGw, {
          costMode,
          lockedCodes: pins.lockedCodes,
          excludedCodes: pins.excludedCodes,
        })
        await writeStaticTeamCache(snapshot.meta.seasonId, selectedGw, revision, team, cacheFlags)
        if (!cancelled) setStaticState({ status: 'ready', team, fromCache: false })
      } catch (cause) {
        if (!cancelled) {
          setStaticState({
            status: 'error',
            message: errorMessage(cause, 'Perfect team solver failed'),
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    snapshot,
    mode,
    selectedGw,
    revision,
    seasonReady,
    noPlayedGwMessage,
    cacheFlags,
    costMode,
    pins.lockedCodes,
    pins.excludedCodes,
  ])

  useEffect(() => {
    if (!snapshot || mode !== 'dynamic' || !seasonReady || noPlayedGwMessage) return
    let cancelled = false
    void (async () => {
      setDynamicState({ status: 'loading', progress: 'Checking cache…' })
      try {
        const cached = await readDynamicStrategiesCache(snapshot.meta.seasonId, revision, cacheFlags)
        if (cached && !cancelled) {
          setDynamicState({ status: 'ready', strategies: cached, fromCache: true })
          setStrategyIndex(0)
          setDynamicGw(1)
          return
        }
        const strategies = await searchDynamicStrategies(snapshot, {
          useChips,
          lockedCodes: pins.lockedCodes,
          excludedCodes: pins.excludedCodes,
          onProgress: ({ gw, lastGw, message }) => {
            if (!cancelled) setDynamicState({ status: 'loading', progress: message || `GW ${gw}/${lastGw}` })
          },
        })
        await writeDynamicStrategiesCache(snapshot.meta.seasonId, revision, strategies, cacheFlags)
        if (!cancelled) {
          setDynamicState({ status: 'ready', strategies, fromCache: false })
          setStrategyIndex(0)
          setDynamicGw(1)
        }
      } catch (cause) {
        if (!cancelled) {
          setDynamicState({
            status: 'error',
            message: errorMessage(cause, 'Dynamic search failed'),
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    snapshot,
    mode,
    revision,
    seasonReady,
    noPlayedGwMessage,
    cacheFlags,
    useChips,
    pins.lockedCodes,
    pins.excludedCodes,
  ])

  const teams = useMemo(() => (snapshot ? teamById(snapshot.teams) : new Map<number, FplTeam>()), [snapshot])

  const activeStrategy =
    dynamicState.status === 'ready' ? dynamicState.strategies[strategyIndex] ?? dynamicState.strategies[0] : null
  const activeWeek = activeStrategy?.weeks.find((week) => week.gw === dynamicGw) ?? activeStrategy?.weeks[0]
  const weekSeries = activeStrategy ? strategyWeekSeries(activeStrategy) : []
  const baseSeasonPoints = activeStrategy ? activeStrategy.totalPoints - activeStrategy.chipBonus : 0

  function stepGw(delta: number) {
    if (!activeStrategy) return
    const weeks = activeStrategy.weeks.map((week) => week.gw)
    const index = Math.max(0, weeks.indexOf(dynamicGw))
    const next = weeks[Math.min(weeks.length - 1, Math.max(0, index + delta))]
    if (next != null) setDynamicGw(next)
  }

  async function commitPins(next: PerfectTeamPinsRecord) {
    setPins(next)
    await writePerfectTeamPins(next)
  }

  async function runGw0Comparison(target: SeasonSnapshot) {
    const priorId = priorSeasonId(target.meta.seasonId)
    if (!priorId) {
      setGw0Compare({ status: 'error', message: `No prior season for ${target.meta.seasonId}` })
      return
    }
    setGw0Compare({ status: 'loading', progress: `Loading ${priorId}…` })
    try {
      const prior = await loadSeasonSnapshot(priorId, { force: false, kind: 'historical' })
      setGw0Compare({ status: 'loading', progress: 'Solving GW0^ opening…' })
      const modelOpening = await solveHistoricalGw0Opening(prior, target)
      setGw0Compare({ status: 'loading', progress: 'Solving ideal GW1…' })
      const ideal = await solvePerfectGwTeam(target, 1, {
        costMode: 'opening',
        lockedCodes: pins.lockedCodes,
        excludedCodes: pins.excludedCodes,
      })
      setGw0Compare({ status: 'loading', progress: 'Simulating season from GW0^…' })
      const fromModel = await searchDynamicStrategies(target, {
        lockedOpening: modelOpening,
        maxStrategies: 1,
        useChips,
        lockedCodes: pins.lockedCodes,
        excludedCodes: pins.excludedCodes,
        onProgress: ({ message }) => setGw0Compare({ status: 'loading', progress: message }),
      })
      const optimal =
        dynamicState.status === 'ready'
          ? dynamicState.strategies[0]
          : (
              await searchDynamicStrategies(target, {
                maxStrategies: 1,
                useChips,
                lockedCodes: pins.lockedCodes,
                excludedCodes: pins.excludedCodes,
              })
            )[0]
      const overlap = openingOverlap(modelOpening, ideal.squad)
      setGw0Compare({
        status: 'ready',
        modelOpening,
        idealGw1: ideal.squad,
        shared: overlap.shared,
        modelSeasonPts: fromModel[0]?.totalPoints ?? 0,
        optimalSeasonPts: optimal?.totalPoints ?? 0,
      })
    } catch (cause) {
      setGw0Compare({
        status: 'error',
        message: errorMessage(cause, 'GW0 comparison failed'),
      })
    }
  }

  return (
    <ExplorerScreen
      kicker="Perfect hindsight"
      title="Best possible teams by season"
      question="With full knowledge of published points, what is the best legal squad each gameweek — and the best transfer path through a whole season? This is an oracle ceiling, not a live recommender."
    >
      <div className="fpl-explorer__toolbar">
        <Link
          className={`fpl-gw0-route-link${mode === 'static' ? ' fpl-gw0-route-link--active' : ''}`}
          to="/perfect-team"
          viewTransition
        >
          Static GW
        </Link>
        <Link
          className={`fpl-gw0-route-link${mode === 'dynamic' ? ' fpl-gw0-route-link--active' : ''}`}
          to="/perfect-team/dynamic"
          viewTransition
        >
          Dynamic season
        </Link>
      </div>

      <p className="fpl-explorer__meta">
        Season slicer stays above — current and historical seasons are both supported. First visit defaults to the
        previous completed season; your later selection sticks. Hindsight uses known points only (not forecasts). Static
        mode solves one gameweek; dynamic mode caches a full-season transfer search in IndexedDB. Wildcard / Free Hit
        chip search is deferred. {GW0_SOLVER_NOTE}
      </p>

      {status === 'loading' || !seasonReady ? <p className="fpl-explorer__meta">Loading season data…</p> : null}
      {status === 'error' ? (
        <ExplorerEmpty title="Season data unavailable" description="Could not load vaastav snapshot for this season." />
      ) : null}

      {snapshot && seasonReady ? (
        <PerfectTeamControls
          mode={mode}
          useChips={useChips}
          onUseChips={setUseChips}
          costMode={costMode}
          onCostMode={setCostMode}
          pins={pins}
          pinQuery={pinQuery}
          onPinQuery={setPinQuery}
          players={snapshot.players}
          teams={teams}
          onCommitPins={(next) => void commitPins(next)}
          latestGw={latestGw}
          maxGw={maxGw}
          seasonKind={snapshot.meta.kind}
        />
      ) : null}

      {snapshot && mode === 'static' ? (
        <>
          {noPlayedGwMessage ? (
            <ExplorerEmpty title="No hindsight data yet" description={noPlayedGwMessage} />
          ) : (
            <>
          <div className="fpl-explorer__toolbar">
            <Label className="fpl-explorer__field">
              Gameweek
              <Select value={String(selectedGw)} onChange={(event) => setRound(Number(event.target.value))}>
                {Array.from({ length: maxGw }, (_, index) => index + 1).map((gw) => (
                  <option key={gw} value={gw}>
                    GW {gw}
                    {gw > latestGw ? ' (unplayed)' : ''}
                  </option>
                ))}
              </Select>
            </Label>
            {staticState.status === 'loading' ? <p className="fpl-explorer__meta">Solving…</p> : null}
            {staticState.status === 'ready' && staticState.fromCache ? (
              <p className="fpl-explorer__meta">Loaded from cache</p>
            ) : null}
          </div>

          {staticState.status === 'error' ? (
            <ExplorerEmpty title="Could not solve" description={staticState.message} />
          ) : null}

          {staticState.status === 'ready' ? (
            <PerfectTeamPanel
              label={`Perfect GW${staticState.team.round} · ${staticState.team.formation}`}
              formation={staticState.team.formation}
              squad={staticState.team.squad}
              xi={staticState.team.xi}
              bench={staticState.team.bench}
              captainCode={staticState.team.captain.code}
              viceCode={staticState.team.viceCaptain.code}
              totalPoints={staticState.team.totalPoints}
              spendTenths={staticState.team.spendTenths}
              teams={teams}
              gw={selectedGw}
              maxGw={maxGw}
              onGwChange={setRound}
              showDetails={showDetails}
              showCost={showCost}
              onShowDetails={setShowDetails}
              onShowCost={setShowCost}
              chips={[]}
            />
          ) : null}
            </>
          )}
        </>
      ) : null}

      {snapshot && mode === 'dynamic' ? (
        <>
          {noPlayedGwMessage ? (
            <ExplorerEmpty title="No hindsight data yet" description={noPlayedGwMessage} />
          ) : (
            <>
          {dynamicState.status === 'loading' ? (
            <p className="fpl-explorer__meta">Computing & caching season path… {dynamicState.progress}</p>
          ) : null}
          {dynamicState.status === 'error' ? (
            <ExplorerEmpty title="Dynamic search failed" description={dynamicState.message} />
          ) : null}
          {dynamicState.status === 'ready' && activeStrategy && activeWeek ? (
            <>
              <div className="fpl-explorer__toolbar">
                <Label className="fpl-explorer__field">
                  Strategy
                  <Select
                    value={String(strategyIndex)}
                    onChange={(event) => {
                      setStrategyIndex(Number(event.target.value))
                      setDynamicGw(1)
                    }}
                  >
                    {dynamicState.strategies.map((strategy, index) => (
                      <option key={strategy.id} value={index}>
                        {strategy.label} · {strategy.totalPoints} pts
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="fpl-explorer__field">
                  Gameweek
                  <Select value={String(dynamicGw)} onChange={(event) => setDynamicGw(Number(event.target.value))}>
                    {activeStrategy.weeks.map((week) => (
                      <option key={week.gw} value={week.gw}>
                        GW {week.gw} ({week.gwPoints} pts)
                      </option>
                    ))}
                  </Select>
                </Label>
                {dynamicState.fromCache ? <p className="fpl-explorer__meta">Loaded from cache</p> : null}
              </div>

              <FormSlot
                label={`${activeStrategy.label} — points by gameweek`}
                data={weekSeries}
                yAxisLabel="Points"
                note={
                  useChips
                    ? `Base ${baseSeasonPoints} · chip bonus ${activeStrategy.chipBonus} · total ${activeStrategy.totalPoints} · hits ${activeStrategy.totalHits}. Gold points mark chip weeks (TC / BB).`
                    : `Season total ${activeStrategy.totalPoints} · hits ${activeStrategy.totalHits} · chips off (transfer/hit path only).`
                }
              />

              <div className="fpl-perfect-summary">
                <p>
                  <strong>{activeStrategy.totalPoints}</strong> season points
                  {useChips ? (
                    <>
                      {' '}
                      · base <strong>{baseSeasonPoints}</strong> · chip bonus{' '}
                      <strong>{activeStrategy.chipBonus}</strong>
                    </>
                  ) : null}{' '}
                  · <strong>{activeStrategy.totalHits}</strong> transfer hits
                </p>
                <p className="fpl-explorer__meta">{squadQuotaDetail(activeStrategy.openingSquad)} opening squad</p>
                {activeWeek.transfers.length > 0 ? (
                  <p className="fpl-explorer__meta">
                    GW{activeWeek.gw} transfers:{' '}
                    {activeWeek.transfers
                      .map(
                        (transfer) =>
                          `${transfer.out.webName} → ${transfer.in.webName}${transfer.hit ? ` (−${transfer.hit})` : ''}`,
                      )
                      .join('; ')}
                  </p>
                ) : null}
                {activeWeek.chips.length > 0 ? (
                  <p className="fpl-explorer__meta">
                    Chips: {activeWeek.chips.map((chip) => `${chip.chip} +${chip.bonusPoints}`).join(', ')}
                  </p>
                ) : null}
              </div>

              <PerfectTeamPanel
                label={`GW${activeWeek.gw} · ${activeWeek.formation}`}
                formation={activeWeek.formation}
                squad={activeWeek.squad}
                xi={activeWeek.xi}
                bench={activeWeek.bench}
                captainCode={activeWeek.captain.code}
                viceCode={activeWeek.viceCaptain.code}
                totalPoints={activeWeek.gwPoints}
                spendTenths={activeWeek.squad.reduce((sum, player) => sum + player.costTenths, 0)}
                teams={teams}
                gw={dynamicGw}
                maxGw={activeStrategy.weeks.at(-1)?.gw ?? dynamicGw}
                onGwChange={setDynamicGw}
                onStep={stepGw}
                showDetails={showDetails}
                showCost={showCost}
                onShowDetails={setShowDetails}
                onShowCost={setShowCost}
                chips={activeWeek.chips}
              />

              <Gw0ComparePanel
                seasonId={snapshot.meta.seasonId}
                state={gw0Compare}
                onRun={() => void runGw0Comparison(snapshot)}
              />
            </>
          ) : null}
            </>
          )}
        </>
      ) : null}

      <AnalysisFaq />
    </ExplorerScreen>
  )
}

function PerfectTeamControls({
  mode,
  useChips,
  onUseChips,
  costMode,
  onCostMode,
  pins,
  pinQuery,
  onPinQuery,
  players,
  teams,
  onCommitPins,
  latestGw,
  maxGw,
  seasonKind,
}: {
  mode: AnalysisMode
  useChips: boolean
  onUseChips: (value: boolean) => void
  costMode: PerfectTeamCostMode
  onCostMode: (value: PerfectTeamCostMode) => void
  pins: PerfectTeamPinsRecord
  pinQuery: string
  onPinQuery: (value: string) => void
  players: readonly FplPlayer[]
  teams: Map<number, FplTeam>
  onCommitPins: (next: PerfectTeamPinsRecord) => void
  latestGw: number
  maxGw: number
  seasonKind: SeasonSnapshot['meta']['kind']
}) {
  const q = pinQuery.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return []
    return players
      .filter((player) => {
        const team = teams.get(player.teamId)
        const hay = `${player.webName} ${player.firstName} ${player.secondName} ${team?.shortName ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 12)
  }, [players, teams, q])

  function labelFor(code: number): string {
    const player = players.find((row) => row.code === code)
    if (!player) return `code ${code}`
    const team = teams.get(player.teamId)
    return `${player.webName} (${team?.shortName ?? '?'})`
  }

  return (
    <section className="fpl-gw0-pins">
      <h2 className="fpl-explorer__title">Search options</h2>
      <p className="fpl-explorer__meta">
        {seasonKind === 'current'
          ? `Current season through latest played GW${latestGw || '—'} (of ${maxGw || '—'} scheduled).`
          : `Historical season · latest played GW${latestGw || '—'} / max GW${maxGw || '—'}.`}{' '}
        Locks and excludes apply to Perfect Team only — they do not change your manager squad.
      </p>

      <div className="fpl-explorer__toolbar">
        {mode === 'dynamic' ? (
          <label className="fpl-perfect-toggle">
            <input type="checkbox" checked={useChips} onChange={(event) => onUseChips(event.target.checked)} />
            With hindsight chips (TC / BB)
          </label>
        ) : null}
        {mode === 'static' ? (
          <Label className="fpl-explorer__field">
            Cost mode
            <Select value={costMode} onChange={(event) => onCostMode(event.target.value as PerfectTeamCostMode)}>
              <option value="gw-price">GW price</option>
              <option value="opening">Opening price</option>
            </Select>
          </Label>
        ) : null}
      </div>
      {mode === 'dynamic' && !useChips ? (
        <p className="fpl-explorer__meta">Chips off — season totals exclude TC/BB bonus (transfer/hit path only).</p>
      ) : null}

      <div className="fpl-gw0-chip-row">
        <strong>Must include</strong>
        {pins.lockedCodes.length === 0 ? <span className="fpl-explorer__meta">none</span> : null}
        {pins.lockedCodes.map((code) => (
          <Button
            key={`lock-${code}`}
            className="fpl-gw0-chip"
            size="sm"
            variant="secondary"
            onClick={() => onCommitPins(perfectPinsWithoutCode(pins, code))}
          >
            {labelFor(code)} ×
          </Button>
        ))}
        {pins.lockedCodes.length ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onCommitPins({ ...pins, lockedCodes: [], updatedAt: Date.now() })}
          >
            Clear locks
          </Button>
        ) : null}
      </div>

      <div className="fpl-gw0-chip-row">
        <strong>Must exclude</strong>
        {pins.excludedCodes.length === 0 ? <span className="fpl-explorer__meta">none</span> : null}
        {pins.excludedCodes.map((code) => (
          <Button
            key={`excl-${code}`}
            className="fpl-gw0-chip"
            size="sm"
            variant="secondary"
            onClick={() => onCommitPins(perfectPinsWithoutCode(pins, code))}
          >
            {labelFor(code)} ×
          </Button>
        ))}
        {pins.excludedCodes.length ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onCommitPins({ ...pins, excludedCodes: [], updatedAt: Date.now() })}
          >
            Clear excludes
          </Button>
        ) : null}
      </div>

      <Label className="fpl-explorer__field">
        Search players to lock / exclude
        <input
          className="fpl-perfect-pin-search"
          type="search"
          value={pinQuery}
          placeholder="web name or club…"
          onChange={(event) => onPinQuery(event.target.value)}
        />
      </Label>
      {matches.length > 0 ? (
        <ul className="fpl-perfect-pin-matches">
          {matches.map((player) => {
            const team = teams.get(player.teamId)
            const locked = pins.lockedCodes.includes(player.code)
            const excluded = pins.excludedCodes.includes(player.code)
            return (
              <li key={player.code} className="fpl-gw0-chip-row">
                <span>
                  {player.webName} · {team?.shortName ?? '?'} · {player.position}
                </span>
                <Button
                  size="sm"
                  variant={locked ? 'primary' : 'secondary'}
                  onClick={() =>
                    onCommitPins(locked ? perfectPinsWithoutCode(pins, player.code) : perfectPinsWithLock(pins, player.code))
                  }
                >
                  {locked ? 'Unlock' : 'Lock'}
                </Button>
                <Button
                  size="sm"
                  variant={excluded ? 'primary' : 'secondary'}
                  onClick={() =>
                    onCommitPins(
                      excluded ? perfectPinsWithoutCode(pins, player.code) : perfectPinsWithExclude(pins, player.code),
                    )
                  }
                >
                  {excluded ? 'Include' : 'Exclude'}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

function Gw0ComparePanel({
  seasonId,
  state,
  onRun,
}: {
  seasonId: string
  state: Gw0CompareState
  onRun: () => void
}) {
  return (
    <section className="fpl-perfect-summary">
      <h2 className="fpl-explorer__title">GW0^ vs ideal / optimal</h2>
      <p className="fpl-explorer__meta">
        Run the as-of-GW0 short-term model for {seasonId} (prior-season rates only), lock that opening 15, then simulate
        the hindsight transfer chain. Compare against ideal GW1 and unconstrained dynamic optimum.
      </p>
      <Button variant="secondary" size="sm" onClick={onRun} disabled={state.status === 'loading'}>
        Run GW0^ comparison
      </Button>
      {state.status === 'loading' ? <p className="fpl-explorer__meta">{state.progress}</p> : null}
      {state.status === 'error' ? <p className="fpl-explorer__meta">{state.message}</p> : null}
      {state.status === 'ready' ? (
        <ul className="fpl-explorer__meta">
          <li>
            GW0^ opening overlaps ideal GW1 on <strong>{state.shared}/15</strong> players
          </li>
          <li>
            Season points from GW0^ opening: <strong>{state.modelSeasonPts}</strong>
          </li>
          <li>
            Unconstrained dynamic optimum: <strong>{state.optimalSeasonPts}</strong> (gap{' '}
            <strong>{state.optimalSeasonPts - state.modelSeasonPts}</strong>)
          </li>
        </ul>
      ) : null}
    </section>
  )
}

function AnalysisFaq() {
  return (
    <details className="fpl-gw0-notes">
      <summary>Analysis answers (GW0^, diversity, draws, causal signals)</summary>
      <ol className="fpl-explorer__meta">
        <li>
          <strong>Can we run GW0 analysis on previous seasons and compare to the ideal first team?</strong> Yes. Use
          prior-season rates + target opening prices/fixtures (same model as live GW0), then compare the short-term 15 to
          the hindsight-perfect GW1 15. The “Run GW0^ comparison” control above does that for the selected season.
        </li>
        <li>
          <strong>GW0^ for 25/26 then dynamic solver?</strong> Supported via the comparison panel: lock the GW0^ opening,
          search transfers with hindsight scoring, and report the point gap vs unconstrained optimum. Switch season to
          2025-26 and run it.
        </li>
        <li>
          <strong>Why did diverse strategies look the same?</strong> The beam was ranked only by points, so different GW0
          seeds quickly transferred into the same hindsight-optimal path; a fill-in step then padded with near-clones.
          Fixed by keeping opening-key diversity in the beam, requiring ≥4 GW0 diffs or ≥3 transfer diffs before listing
          alternatives, and caching distinct path fingerprints.
        </li>
        <li>
          <strong>Does static perfect 15 handle draws/ties?</strong> Partially. The MILP returns one optimal objective
          value; if multiple squads share that value, HiGHS returns one feasible optimum (seeded). Captain ties break by
          name. We do not enumerate the full tie set yet.
        </li>
        <li>
          <strong>Can we extract causal, then-available signals?</strong> Not from pure hindsight search — that uses
          future points by design. The productive path is: (a) freeze features available at each deadline (form, FDR,
          ownership, prices, minutes flags), (b) train/select a policy that maps those features → transfers/XI/captain,
          (c) backtest that policy on historical seasons without future leakage. GW0^ + weekly re-solve with as-of data is
          the first such policy; the hindsight chain is only the oracle ceiling to score against.
        </li>
      </ol>
    </details>
  )
}

function PerfectTeamPanel({
  label,
  formation,
  squad,
  xi,
  bench,
  captainCode,
  viceCode,
  totalPoints,
  spendTenths,
  teams,
  gw,
  maxGw,
  onGwChange,
  onStep,
  showDetails,
  showCost,
  onShowDetails,
  onShowCost,
  chips,
}: {
  label: string
  formation: string
  squad: HindsightPlayer[]
  xi: HindsightPlayer[]
  bench: HindsightPlayer[]
  captainCode: number
  viceCode: number
  totalPoints: number
  spendTenths: number
  teams: Map<number, FplTeam>
  gw: number
  maxGw: number
  onGwChange: (gw: number) => void
  onStep?: (delta: number) => void
  showDetails: boolean
  showCost: boolean
  onShowDetails: (value: boolean) => void
  onShowCost: (value: boolean) => void
  chips: ChipUse[]
}) {
  const hasTc = chips.some((chip) => chip.chip === 'triple-captain')
  const hasBb = chips.some((chip) => chip.chip === 'bench-boost')
  const weekChip = weekChipLabel(chips)
  const tableRows = squad.map((player) => {
    const benchIndex = bench.findIndex((row) => row.code === player.code)
    const role = xi.some((row) => row.code === player.code)
      ? 'XI'
      : benchIndex >= 0
        ? `Bench ${benchIndex + 1}`
        : 'Squad'
    return { player, role }
  })

  return (
    <section className="fpl-perfect-panel">
      <div className="fpl-perfect-panel__head">
        <h2 className="fpl-explorer__title">{label}</h2>
        <p className="fpl-explorer__meta">
          {totalPoints} pts · {formatPerfectSpend(spendTenths)} spent · {formatGbpFromTenths(1000 - spendTenths)} ITB
          {weekChip ? ` · ${weekChip}` : ''}
        </p>
      </div>

      <div className="fpl-explorer__toolbar">
        <label className="fpl-perfect-toggle">
          <input type="checkbox" checked={showDetails} onChange={(event) => onShowDetails(event.target.checked)} />
          Show details
        </label>
        <label className="fpl-perfect-toggle">
          <input type="checkbox" checked={showCost} onChange={(event) => onShowCost(event.target.checked)} />
          Show cost
        </label>
      </div>

      <div className="fpl-perfect-pitch-nav">
        <button
          type="button"
          className="fpl-perfect-pitch-nav__btn"
          aria-label="Previous gameweek"
          disabled={gw <= 1}
          onClick={() => (onStep ? onStep(-1) : onGwChange(gw - 1))}
        >
          ←
        </button>
        <div className="fpl-perfect-pitch-nav__pitch">
          <FplPitch
            formation={formation}
            players={xi.map((player) =>
              toPitchPlayer(player, captainCode, viceCode, { hasTc, hasBb, onBench: false }),
            )}
            bench={bench.map((player) =>
              toPitchPlayer(player, captainCode, viceCode, { hasTc, hasBb, onBench: true }),
            )}
            label={`GW${gw} · ${formation}`}
            weekChip={weekChip}
            showCost={showCost}
            showDetails={showDetails}
            compact
            expandable
          />
        </div>
        <button
          type="button"
          className="fpl-perfect-pitch-nav__btn"
          aria-label="Next gameweek"
          disabled={gw >= maxGw}
          onClick={() => (onStep ? onStep(1) : onGwChange(gw + 1))}
        >
          →
        </button>
      </div>

      <DataTable
        caption="Squad breakdown"
        defaultSort={{ id: 'pts', direction: 'desc' }}
        rowStyle={(row) => teamRowStyle(teams.get(row.player.teamId))}
        rowKey={(row) => row.player.code}
        columns={[
          {
            id: 'who',
            label: 'Player',
            sortValue: (row) => row.player.webName,
            render: (row) => (
              <PlayerLabel
                player={{
                  code: row.player.code,
                  webName: row.player.webName,
                  firstName: '',
                  secondName: '',
                }}
                name={row.player.webName}
              />
            ),
          },
          {
            id: 'role',
            label: 'Role',
            sortValue: (row) => row.role,
            render: (row) => row.role,
          },
          {
            id: 'cost',
            label: 'Cost',
            sortValue: (row) => row.player.costTenths,
            render: (row) => formatGbpFromTenths(row.player.costTenths),
          },
          {
            id: 'pts',
            label: 'Pts',
            sortValue: (row) => row.player.gwPoints,
            render: (row) => row.player.gwPoints,
          },
          {
            id: 'event',
            label: 'Breakdown',
            sortValue: (row) => row.player.gwPoints,
            render: (row) => formatEvent(scoreBreakdown(row.player)),
          },
        ]}
        rows={tableRows}
        empty="No players"
      />
    </section>
  )
}

function toPitchPlayer(
  player: HindsightPlayer,
  captainCode: number,
  viceCode: number,
  opts: { hasTc: boolean; hasBb: boolean; onBench: boolean },
): PitchPlayer {
  const isCaptain = player.code === captainCode
  const countsTowardScore = !opts.onBench || opts.hasBb
  const multiplier = isCaptain ? (opts.hasTc ? 3 : 2) : 1
  const chip = isCaptain && opts.hasTc ? 'TC' : opts.onBench && opts.hasBb ? 'BB' : undefined
  const lines = formatScoreLines(scoreBreakdown(player))
  return {
    id: player.code,
    name: player.webName,
    photoCode: player.code,
    teamCode: player.teamCode,
    teamShortName: player.teamShortName,
    position: player.position,
    captain: isCaptain,
    viceCaptain: player.code === viceCode,
    // Always show the player's GW haul on the card; multiply only when it counts (C / TC).
    points: countsTowardScore ? player.gwPoints * multiplier : player.gwPoints,
    pointsUnscored: opts.onBench && !opts.hasBb,
    costLabel: formatGbpFromTenths(player.costTenths),
    scoreLines: lines,
    chip,
  }
}
