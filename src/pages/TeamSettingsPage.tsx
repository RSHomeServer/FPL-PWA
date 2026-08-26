import { Button, Label, Spinner, Stack, TextField } from '@songara/pwa-base/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EP_NEXT_DISCLAIMER } from '../analysis/gw0EpNext'
import { buildLiveProjectionSample, GW0_PRIOR_SEASON_ID, LIVE_CURRENT_SEASON_ID } from '../analysis/liveBuild'
import type { LiveProjection } from '../analysis/liveProject'
import { liveAuditLine } from '../analysis/liveProject'
import { solveAllTransferStrategies, type SolveAllStrategiesResult } from '../analysis/transferSolver'
import {
  pairTransferSwaps,
  TRANSFER_STRATEGIES,
  type TransferSolution,
} from '../analysis/transferSquad'
import { getFplCacheDb } from '../data/db'
import { loadOfficialLiveSnapshot } from '../data/fplLiveSource'
import { loadSeasonCatalog, loadSeasonSnapshot } from '../data/ingest'
import { buildManagerGameweekStateFromSnapshot } from '../data/managerGameweekState'
import { formatGbpFromTenths } from '../data/prices'
import type { ManagerGameweekState, ManagerSnapshot } from '../data/types'
import {
  loadCachedUserStateAfterFailure,
  loadUserState,
  readConfiguredEntryId,
  refreshUserState,
} from '../data/userStateRefresh'
import { DataTable, ExplorerScreen, type DataTableColumn } from './ExplorerScreen'

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'success'
      snapshot: ManagerSnapshot
      captainName: string | null
      lastRefreshAt: number
      servingCached: boolean
      managerState: ManagerGameweekState | null
      playerNames: Map<number, string>
    }

type LiveSampleState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      asOfEvent: number
      source: 'squad' | 'top'
      rows: LiveProjection[]
      projected: LiveProjection[]
    }

type TransferOptState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      result: SolveAllStrategiesResult
      poolSize: number
      currentCodes: number[]
    }

function formatRefreshTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

async function enrichSnapshot(
  snapshot: ManagerSnapshot,
  lastRefreshAt: number,
  servingCached: boolean,
): Promise<Extract<ViewState, { kind: 'success' }>> {
  const live = await loadOfficialLiveSnapshot()
  const nameByElementId = new Map(live.players.map((player) => [player.id, player.webName]))
  const captain = snapshot.picks.picks.find((pick) => pick.isCaptain)
  const transfers = (await getFplCacheDb().userTransfers.get(snapshot.entry.identity.entryId))
    ?.transfers ?? []
  const managerState = buildManagerGameweekStateFromSnapshot(snapshot, {
    transfers,
    players: live.players,
  })
  return {
    kind: 'success',
    snapshot,
    captainName: captain ? (nameByElementId.get(captain.elementId) ?? null) : null,
    lastRefreshAt,
    servingCached,
    managerState,
    playerNames: nameByElementId,
  }
}

const LIVE_COLUMNS: DataTableColumn<LiveProjection>[] = [
  {
    id: 'player',
    label: 'Player',
    sortValue: (row) => row.current.webName,
    render: (row) => row.current.webName,
  },
  {
    id: 'pos',
    label: 'Pos',
    sortValue: (row) => row.position,
    render: (row) => row.position,
  },
  {
    id: 'club',
    label: 'Club',
    sortValue: (row) => row.teamShortName,
    render: (row) => row.teamShortName || '—',
  },
  {
    id: 'ep',
    label: 'Next EP',
    hint: 'Our in-season Approach A expected points for the next GW (IS3).',
    sortValue: (row) => row.ePtsNext,
    render: (row) => row.ePtsNext.toFixed(2),
  },
  {
    id: 'h5',
    label: 'Next-5 Σ',
    hint: 'Sum of next-X GW EP (default X=5). Same rates/minutes; per-GW fixtures only.',
    sortValue: (row) => row.ePtsHorizon,
    render: (row) => row.ePtsHorizon.toFixed(2),
  },
  {
    id: 'avg',
    label: 'Next-5 avg',
    sortValue: (row) => (row.horizonEffective > 0 ? row.ePtsHorizon / row.horizonEffective : 0),
    render: (row) =>
      row.horizonEffective > 0 ? (row.ePtsHorizon / row.horizonEffective).toFixed(2) : '—',
  },
  {
    id: 'conf',
    label: 'Conf',
    hint: 'Confidence from current/prior samples and fitness — not a second EP number.',
    sortValue: (row) => row.confidence.value,
    render: (row) => row.confidence.label,
  },
  {
    id: 'epNext',
    label: 'ep_next',
    hint: EP_NEXT_DISCLAIMER,
    sortValue: (row) => row.epNext,
    render: (row) => (row.epNext == null ? '—' : row.epNext.toFixed(2)),
  },
  {
    id: 'audit',
    label: 'Audit',
    render: (row) => {
      const line = row.auditByGw[0] ? liveAuditLine(row.auditByGw[0]) : '—'
      return (
        <span className="fpl-team-settings__audit" title={line}>
          {line}
        </span>
      )
    },
  },
]

export function TeamSettingsPage() {
  const [entryIdInput, setEntryIdInput] = useState('')
  const [state, setState] = useState<ViewState>({ kind: 'idle' })
  const [liveSample, setLiveSample] = useState<LiveSampleState>({ kind: 'idle' })
  const [transferOpt, setTransferOpt] = useState<TransferOptState>({ kind: 'idle' })

  const entryId = useMemo(() => Number.parseInt(entryIdInput.trim(), 10), [entryIdInput])

  const loadLiveSample = useCallback(async (manager: ManagerSnapshot | null) => {
    setLiveSample({ kind: 'loading' })
    try {
      const [live, catalog] = await Promise.all([
        loadOfficialLiveSnapshot(),
        loadSeasonCatalog(),
      ])
      const priorKind =
        catalog.find((entry) => entry.seasonId === GW0_PRIOR_SEASON_ID)?.kind ?? 'historical'
      const currentKind =
        catalog.find((entry) => entry.seasonId === LIVE_CURRENT_SEASON_ID)?.kind ?? 'current'
      const [priorSnap, currentSnap] = await Promise.all([
        loadSeasonSnapshot(GW0_PRIOR_SEASON_ID, { kind: priorKind }),
        loadSeasonSnapshot(LIVE_CURRENT_SEASON_ID, { kind: currentKind }).catch(() => null),
      ])
      const built = buildLiveProjectionSample({
        live,
        prior: priorSnap,
        current: currentSnap,
        manager,
        topN: 15,
      })
      setLiveSample({
        kind: 'ready',
        asOfEvent: built.asOfEvent,
        source: built.source,
        rows: built.sample,
        projected: built.projected,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to build live projections.'
      setLiveSample({ kind: 'error', message })
    }
  }, [])

  const applySuccess = useCallback(async (
    snapshot: ManagerSnapshot,
    lastRefreshAt: number,
    servingCached: boolean,
  ) => {
    setState(await enrichSnapshot(snapshot, lastRefreshAt, servingCached))
    void loadLiveSample(snapshot)
  }, [loadLiveSample])

  useEffect(() => {
    void (async () => {
      const configured = await readConfiguredEntryId()
      if (!configured) {
        void loadLiveSample(null)
        return
      }
      setEntryIdInput(String(configured))
      const loaded = await loadUserState(configured, { triggerBackgroundRefresh: true })
      if (!loaded) {
        void loadLiveSample(null)
        return
      }
      await applySuccess(loaded.snapshot, loaded.lastRefreshAt, loaded.servingCached)
    })()
  }, [applySuccess, loadLiveSample])

  async function loadTeam() {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setState({ kind: 'error', message: 'Enter a positive FPL entry ID (from your team URL).' })
      return
    }

    setState({ kind: 'loading' })
    try {
      const snapshot = await refreshUserState(entryId, { force: true })
      await applySuccess(snapshot, snapshot.fetchedAt, false)
    } catch (error) {
      const cached = await loadCachedUserStateAfterFailure(entryId)
      if (cached) {
        await applySuccess(cached.snapshot, cached.lastRefreshAt, true)
        return
      }
      const message =
        error instanceof Error ? error.message : 'Failed to load manager data.'
      setState({ kind: 'error', message })
      void loadLiveSample(null)
    }
  }

  async function refreshTeam() {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setState({ kind: 'error', message: 'Configure an entry ID before refreshing.' })
      return
    }

    setState({ kind: 'loading' })
    try {
      const snapshot = await refreshUserState(entryId, { force: true })
      await applySuccess(snapshot, snapshot.fetchedAt, false)
    } catch (error) {
      const cached = await loadCachedUserStateAfterFailure(entryId)
      if (cached) {
        await applySuccess(cached.snapshot, cached.lastRefreshAt, true)
        return
      }
      const message =
        error instanceof Error ? error.message : 'Failed to refresh manager data.'
      setState({ kind: 'error', message })
    }
  }

  const hasConfiguredEntry = state.kind === 'success' || (Number.isFinite(entryId) && entryId > 0)
  const sellRows =
    state.kind === 'success' && state.managerState
      ? [...state.managerState.sellPrices.values()].sort((a, b) => a.elementId - b.elementId)
      : []

  async function runTransferOptimiser() {
    if (state.kind !== 'success' || !state.managerState) {
      setTransferOpt({ kind: 'error', message: 'Load an entry with squad data first.' })
      return
    }
    if (liveSample.kind !== 'ready' || liveSample.projected.length === 0) {
      setTransferOpt({ kind: 'error', message: 'Live projections are not ready yet.' })
      return
    }

    const mgr = state.managerState
    const byElement = new Map(liveSample.projected.map((row) => [row.current.id, row]))
    const currentSquad: LiveProjection[] = []
    for (const pick of mgr.picks) {
      const row = byElement.get(pick.elementId)
      if (!row) {
        setTransferOpt({
          kind: 'error',
          message: `Missing live projection for pick element ${pick.elementId} (code ${pick.code}).`,
        })
        return
      }
      currentSquad.push(row)
    }
    if (currentSquad.length !== 15) {
      setTransferOpt({
        kind: 'error',
        message: `Need 15 projected picks, got ${currentSquad.length}.`,
      })
      return
    }

    setTransferOpt({ kind: 'loading' })
    try {
      const chip = mgr.activeChip?.toLowerCase() ?? null
      const result = await solveAllTransferStrategies({
        projected: liveSample.projected,
        currentSquad,
        bankTenths: mgr.bankTenths,
        freeTransfers: mgr.freeTransfers,
        sellPriceTenthsByCode: mgr.sellPriceTenthsByCode,
        wildcard: chip === 'wildcard',
        freeHit: chip === 'freehit',
      })
      setTransferOpt({
        kind: 'ready',
        result,
        poolSize: result.immediate.poolSize,
        currentCodes: currentSquad.map((row) => row.code),
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Transfer optimiser failed.'
      setTransferOpt({ kind: 'error', message })
    }
  }

  return (
    <ExplorerScreen
      kicker="My team"
      title="Entry settings"
      question="Load your FPL entry by numeric ID. Squad data is cached locally and refreshed every 30 minutes (or on demand)."
      hideSeasonBar
    >
      <Stack gap="md" className="fpl-team-settings">
        <Stack gap="sm" className="fpl-team-settings__form">
          <Label className="fpl-explorer__field" htmlFor="fpl-entry-id">
            FPL entry ID
            <TextField
              id="fpl-entry-id"
              inputMode="numeric"
              value={entryIdInput}
              onChange={(event) => setEntryIdInput(event.target.value)}
              placeholder="e.g. 8585919"
              autoComplete="off"
            />
          </Label>
          <p className="fpl-explorer__meta">
            Find this in your team URL: fantasy.premierleague.com/entry/<strong>1234567</strong>/event/…
          </p>
          <Stack gap="sm" className="fpl-team-settings__actions">
            <Button
              variant="primary"
              onClick={() => void loadTeam()}
              disabled={state.kind === 'loading'}
            >
              {state.kind === 'loading' ? 'Loading…' : 'Load team'}
            </Button>
            {hasConfiguredEntry ? (
              <Button
                variant="secondary"
                onClick={() => void refreshTeam()}
                disabled={state.kind === 'loading'}
              >
                Refresh squad
              </Button>
            ) : null}
          </Stack>
        </Stack>

        {state.kind === 'loading' ? (
          <Spinner label="Fetching entry, picks, history, and transfers via /fpl-api…" />
        ) : null}

        {state.kind === 'error' ? (
          <p className="fpl-team-settings__error" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.kind === 'success' && state.servingCached ? (
          <p className="fpl-team-settings__banner" role="status">
            Showing cached squad — live refresh failed or data is stale. Check your connection and try
            Refresh squad.
          </p>
        ) : null}

        {state.kind === 'success' ? (
          <>
            <p className="fpl-explorer__meta">
              Last refreshed: {formatRefreshTime(state.lastRefreshAt)}
            </p>
            <dl className="fpl-team-settings__summary">
              <div>
                <dt>Team</dt>
                <dd>{state.snapshot.entry.identity.teamName}</dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>
                  {state.snapshot.entry.identity.playerFirstName}{' '}
                  {state.snapshot.entry.identity.playerLastName}
                </dd>
              </div>
              <div>
                <dt>Current GW</dt>
                <dd>{state.snapshot.event}</dd>
              </div>
              <div>
                <dt>Bank</dt>
                <dd>{formatGbpFromTenths(state.snapshot.picks.entryHistory.bankTenths)}</dd>
              </div>
              <div>
                <dt>Squad value</dt>
                <dd>{formatGbpFromTenths(state.snapshot.picks.entryHistory.squadValueTenths)}</dd>
              </div>
              <div>
                <dt>Picks</dt>
                <dd>{state.snapshot.picks.picks.length}</dd>
              </div>
              <div>
                <dt>Captain</dt>
                <dd>{state.captainName ?? '—'}</dd>
              </div>
              <div>
                <dt>Season GW rows</dt>
                <dd>{state.snapshot.history.current.length}</dd>
              </div>
              <div>
                <dt>Chips played</dt>
                <dd>{state.snapshot.history.chips.length}</dd>
              </div>
              {state.managerState ? (
                <>
                  <div>
                    <dt>Free transfers</dt>
                    <dd>{state.managerState.freeTransfers}</dd>
                  </div>
                  <div>
                    <dt>Transfers this GW</dt>
                    <dd>{state.managerState.eventTransfers}</dd>
                  </div>
                  <div>
                    <dt>Hit cost</dt>
                    <dd>
                      {state.managerState.freeTransferDetail.hitCost > 0
                        ? `−${state.managerState.freeTransferDetail.hitCost} pts (${state.managerState.freeTransferDetail.hits} hits)`
                        : '0'}
                    </dd>
                  </div>
                  <div>
                    <dt>Active chip</dt>
                    <dd>{state.managerState.activeChip ?? '—'}</dd>
                  </div>
                </>
              ) : null}
            </dl>

            {state.managerState && sellRows.length > 0 ? (
              <details className="fpl-team-settings__fold">
                <summary>Sell prices (derived) — {sellRows.length} players</summary>
                <p className="fpl-explorer__meta">
                  Reconstructed from transfer log + bootstrap opening proxy. Uncertain rows use a
                  conservative (low) sell value for budget checks.
                </p>
                <table className="fpl-team-settings__sell-table">
                  <thead>
                    <tr>
                      <th scope="col">Player</th>
                      <th scope="col">Now</th>
                      <th scope="col">Bought</th>
                      <th scope="col">Sell</th>
                      <th scope="col">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellRows.map((row) => (
                      <tr key={row.elementId}>
                        <td>
                          {state.playerNames.get(row.elementId) ?? `#${row.elementId}`}
                          {row.uncertain ? (
                            <span className="fpl-team-settings__uncertain"> uncertain</span>
                          ) : null}
                        </td>
                        <td>{formatGbpFromTenths(row.nowCostTenths)}</td>
                        <td>{formatGbpFromTenths(row.purchasePriceTenths)}</td>
                        <td>{formatGbpFromTenths(row.sellPriceTenths)}</td>
                        <td>{row.method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
          </>
        ) : null}

        <details className="fpl-team-settings__fold">
          <summary>
            Live projection sample (LT-4)
            {liveSample.kind === 'ready' ? ` — ${liveSample.rows.length} rows` : ''}
          </summary>
          <p className="fpl-explorer__meta">
            In-season next-GW EP and next-5 aggregate. Price / EP / confidence stay separate.
            Official ep_next is reference only. Full My Team pitch is a later ticket.
          </p>
          {liveSample.kind === 'loading' ? (
            <Spinner label="Building live projections from prior + current season…" />
          ) : null}
          {liveSample.kind === 'error' ? (
            <p className="fpl-team-settings__error" role="alert">
              {liveSample.message}
            </p>
          ) : null}
          {liveSample.kind === 'ready' ? (
            <>
              <p className="fpl-explorer__meta">
                As-of event {liveSample.asOfEvent}
                {liveSample.source === 'squad'
                  ? ' · configured squad'
                  : ' · top 15 by next EP (load an entry to filter to your 15)'}
              </p>
              <DataTable
                caption="Live EP sample"
                columns={LIVE_COLUMNS}
                rows={liveSample.rows}
                empty="No projected players."
                rowKey={(row) => row.code}
                defaultSort={{ id: 'ep', direction: 'desc' }}
              />
            </>
          ) : null}
        </details>

        <section className="fpl-team-settings__transfers" aria-label="Transfer optimiser">
          <h2 className="fpl-team-settings__live-title">Transfer optimiser</h2>
          <p className="fpl-explorer__meta">
            Finds complete transfer <strong>baskets</strong> that keep a legal 15 (2 GK / 5 DEF /
            5 MID / 3 FWD, ≤3 per club, affordable from bank + sell prices). Each basket is solved
            as one simultaneous set — not one transfer at a time. Options differ by how many
            transfers you make and by time horizon. Full Transfer Assistant polish is a later
            ticket.
          </p>
          <Button
            variant="secondary"
            onClick={() => void runTransferOptimiser()}
            disabled={
              transferOpt.kind === 'loading' ||
              state.kind !== 'success' ||
              !state.managerState ||
              liveSample.kind !== 'ready'
            }
          >
            {transferOpt.kind === 'loading' ? 'Solving…' : 'Run transfer optimiser'}
          </Button>
          {transferOpt.kind === 'loading' ? (
            <Spinner label="Solving transfer baskets with HiGHS…" />
          ) : null}
          {transferOpt.kind === 'error' ? (
            <p className="fpl-team-settings__error" role="alert">
              {transferOpt.message}
            </p>
          ) : null}
          {transferOpt.kind === 'ready' && liveSample.kind === 'ready' ? (
            <>
              <p className="fpl-explorer__meta">
                Candidate pool {transferOpt.poolSize} players
                {state.kind === 'success' && state.managerState
                  ? ` · ${state.managerState.freeTransfers} free transfer${state.managerState.freeTransfers === 1 ? '' : 's'} available`
                  : ''}
                . Each card is a full transfer basket (1+ moves). Hover headers for definitions.
                Highlighted = best net EP after hits for that horizon.
              </p>
              <TransferSenseCheckTable
                projected={liveSample.projected}
                currentCodes={transferOpt.currentCodes}
                result={transferOpt.result}
                sellPriceTenthsByCode={
                  state.kind === 'success' && state.managerState
                    ? state.managerState.sellPriceTenthsByCode
                    : new Map()
                }
              />
              {TRANSFER_STRATEGIES.map((strategy) => {
                const block = transferOpt.result[strategy.id]
                const baskets = block.byTransferCount.filter((row) => row.transferCount > 0)
                const bestMoving =
                  baskets.reduce<TransferSolution | null>((best, row) => {
                    if (!best || row.objectiveValue > best.objectiveValue) return row
                    return best
                  }, null)
                return (
                  <div key={strategy.id} className="fpl-team-settings__xfer-block">
                    <h3 className="fpl-team-settings__xfer-heading">{strategy.label}</h3>
                    <p className="fpl-explorer__meta">{strategy.blurb}</p>
                    {baskets.length === 0 ? (
                      <p className="fpl-team-settings__error" role="status">
                        No improving transfer baskets for this horizon (holding is best).
                      </p>
                    ) : (
                      <div className="fpl-team-settings__baskets">
                        {baskets.map((row) => (
                          <TransferBasketCard
                            key={`${strategy.id}-${row.transferCount}`}
                            row={row}
                            recommended={bestMoving?.transferCount === row.transferCount}
                            byCode={new Map(liveSample.projected.map((p) => [p.code, p]))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : null}
        </section>
      </Stack>
    </ExplorerScreen>
  )
}

function formatSignedGbp(tenths: number): string {
  if (tenths === 0) return formatGbpFromTenths(0)
  const sign = tenths > 0 ? '+' : '−'
  return `${sign}${formatGbpFromTenths(Math.abs(tenths))}`
}

function formatSignedPts(value: number, digits = 2): string {
  if (Object.is(value, -0) || value === 0) return (0).toFixed(digits)
  const sign = value > 0 ? '+' : '−'
  return `${sign}${Math.abs(value).toFixed(digits)}`
}

function basketTitle(row: TransferSolution): string {
  const freeUsed = Math.min(row.transferCount, row.freeTransfers)
  const hitBit =
    row.hits > 0
      ? ` · ${row.hits} hit${row.hits === 1 ? '' : 's'} (−${row.hitCost} pts)`
      : ' · no hits'
  const freeBit =
    freeUsed > 0
      ? ` · uses ${freeUsed} free transfer${freeUsed === 1 ? '' : 's'}`
      : ''
  return `${row.transferCount} transfer${row.transferCount === 1 ? '' : 's'}${freeBit}${hitBit}`
}

type SenseRow = {
  code: number
  player: LiveProjection
  role: 'squad' | 'suggested'
  sellTenths: number | null
}

function TransferSenseCheckTable({
  projected,
  currentCodes,
  result,
  sellPriceTenthsByCode,
}: {
  projected: readonly LiveProjection[]
  currentCodes: readonly number[]
  result: SolveAllStrategiesResult
  sellPriceTenthsByCode: ReadonlyMap<number, number>
}) {
  const currentSet = new Set(currentCodes)
  const suggested = new Set<number>()
  for (const strategy of TRANSFER_STRATEGIES) {
    for (const basket of result[strategy.id].byTransferCount) {
      if (basket.transferCount === 0) continue
      for (const inn of basket.ins) suggested.add(inn.code)
    }
  }

  const byCode = new Map(projected.map((row) => [row.code, row]))
  const rows: SenseRow[] = []
  for (const code of currentCodes) {
    const player = byCode.get(code)
    if (!player) continue
    rows.push({
      code,
      player,
      role: 'squad',
      sellTenths: sellPriceTenthsByCode.get(code) ?? player.nowCostTenths,
    })
  }
  for (const code of [...suggested].sort((a, b) => a - b)) {
    if (currentSet.has(code)) continue
    const player = byCode.get(code)
    if (!player) continue
    rows.push({ code, player, role: 'suggested', sellTenths: null })
  }

  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'squad' ? -1 : 1
    return (
      b.player.ePtsNext - a.player.ePtsNext ||
      a.player.current.webName.localeCompare(b.player.current.webName)
    )
  })

  return (
    <section className="fpl-team-settings__sense" aria-label="Transfer sense-check">
      <h3 className="fpl-team-settings__xfer-heading">Sense-check — squad & suggested buys</h3>
      <p className="fpl-explorer__meta">
        Your current 15 plus anyone recommended as a buy in any basket below. Last GW is bootstrap{' '}
        <code>event_points</code>; Next EP is our in-season projection (not official ep_next).
      </p>
      <table className="fpl-team-settings__sell-table fpl-team-settings__swap-table">
        <thead>
          <tr>
            <th scope="col" tabIndex={0}>
              Player
            </th>
            <th scope="col" tabIndex={0}>
              Pos
            </th>
            <th scope="col" tabIndex={0}>
              Club
            </th>
            <th scope="col" tabIndex={0} title="In your squad or a suggested buy target">
              Role
              <span className="fpl-explorer__col-hint" role="tooltip">
                In squad = currently owned. Suggested buy = appears as an inbound transfer in at
                least one basket.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Current list price">
              Price
            </th>
            <th scope="col" tabIndex={0} title="Derived sell price if owned">
              Sell
              <span className="fpl-explorer__col-hint" role="tooltip">
                Derived sell value used in the budget (owned players only).
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Points in the most recent gameweek">
              Last GW
              <span className="fpl-explorer__col-hint" role="tooltip">
                Official bootstrap event_points for the latest / current gameweek.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Official FPL form">
              Form
            </th>
            <th scope="col" tabIndex={0} title="Season total points so far">
              Season
            </th>
            <th scope="col" tabIndex={0} title="Our expected points for the next GW">
              Next EP
              <span className="fpl-explorer__col-hint" role="tooltip">
                In-season Approach A expected points for the next gameweek (IS3).
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Sum of expected points over the next 5 GWs">
              Next-5 EP
              <span className="fpl-explorer__col-hint" role="tooltip">
                Sum of next-X GW EP (default X=5) from the live projection engine.
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td>{row.player.current.webName}</td>
              <td>{row.player.position}</td>
              <td>{row.player.teamShortName || '—'}</td>
              <td>{row.role === 'squad' ? 'In squad' : 'Suggested buy'}</td>
              <td>{formatGbpFromTenths(row.player.nowCostTenths)}</td>
              <td>{row.sellTenths == null ? '—' : formatGbpFromTenths(row.sellTenths)}</td>
              <td>{row.player.current.eventPoints ?? 0}</td>
              <td>{row.player.current.form.toFixed(1)}</td>
              <td>{row.player.current.totalPoints}</td>
              <td>{row.player.ePtsNext.toFixed(2)}</td>
              <td>{row.player.ePtsHorizon.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function TransferBasketCard({
  row,
  recommended,
  byCode,
}: {
  row: TransferSolution
  recommended: boolean
  byCode: ReadonlyMap<number, LiveProjection>
}) {
  const swaps = pairTransferSwaps(row.outs, row.ins)
  return (
    <article
      className={
        recommended
          ? 'fpl-team-settings__basket fpl-team-settings__basket--best'
          : 'fpl-team-settings__basket'
      }
    >
      <header className="fpl-team-settings__basket-head">
        <h4 className="fpl-team-settings__basket-title">
          {basketTitle(row)}
          {recommended ? (
            <span className="fpl-team-settings__basket-badge">Best for this horizon</span>
          ) : null}
        </h4>
        <p className="fpl-explorer__meta">
          Final squad stays within FPL rules (2/5/5/3, ≤3 per club) and is funded by bank + sell
          prices.
        </p>
      </header>

      <table className="fpl-team-settings__sell-table fpl-team-settings__swap-table">
        <thead>
          <tr>
            <th scope="col" tabIndex={0} title="Player you sell">
              Sell
              <span className="fpl-explorer__col-hint" role="tooltip">
                Player leaving. Price shown is the derived sell value used in the budget.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Points in the most recent gameweek (seller)">
              Last GW
              <span className="fpl-explorer__col-hint" role="tooltip">
                Seller’s official event_points from the latest / current gameweek.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Our next-GW expected points (seller)">
              Next EP
              <span className="fpl-explorer__col-hint" role="tooltip">
                Seller’s in-season next-GW expected points (IS3).
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Player you buy">
              Buy
              <span className="fpl-explorer__col-hint" role="tooltip">
                Player joining. Price shown is live now_cost.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Points in the most recent gameweek (buyer)">
              Last GW
              <span className="fpl-explorer__col-hint" role="tooltip">
                Buyer’s official event_points from the latest / current gameweek.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Our next-GW expected points (buyer)">
              Next EP
              <span className="fpl-explorer__col-hint" role="tooltip">
                Buyer’s in-season next-GW expected points (IS3).
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Position line for this swap">
              Pos
            </th>
            <th scope="col" tabIndex={0} title="Buy price minus sell price for this swap">
              Cost Δ
              <span className="fpl-explorer__col-hint" role="tooltip">
                Buy price − sell price. Positive means this swap spends bank.
              </span>
            </th>
            <th scope="col" tabIndex={0} title="Horizon EP change for this swap">
              Horizon EP Δ
              <span className="fpl-explorer__col-hint" role="tooltip">
                Change in expected points for this pair under the chosen horizon (before hit
                penalty).
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {swaps.map((swap) => {
            const outProj = byCode.get(swap.out.code)
            const inProj = byCode.get(swap.inn.code)
            return (
              <tr key={`${swap.out.code}-${swap.inn.code}`}>
                <td>
                  {swap.out.webName}{' '}
                  <span className="fpl-team-settings__muted">
                    ({swap.out.teamShortName} · {formatGbpFromTenths(swap.out.priceTenths)})
                  </span>
                </td>
                <td>{outProj?.current.eventPoints ?? '—'}</td>
                <td>{outProj ? outProj.ePtsNext.toFixed(2) : '—'}</td>
                <td>
                  {swap.inn.webName}{' '}
                  <span className="fpl-team-settings__muted">
                    ({swap.inn.teamShortName} · {formatGbpFromTenths(swap.inn.priceTenths)})
                  </span>
                </td>
                <td>{inProj?.current.eventPoints ?? '—'}</td>
                <td>{inProj ? inProj.ePtsNext.toFixed(2) : '—'}</td>
                <td>
                  {swap.out.position === swap.inn.position
                    ? swap.out.position
                    : `${swap.out.position}→${swap.inn.position}`}
                </td>
                <td>{formatSignedGbp(swap.costDeltaTenths)}</td>
                <td>{formatSignedPts(swap.epDelta)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <dl className="fpl-team-settings__basket-stats">
        <div title="Net spend across the basket (positive = costs bank)">
          <dt>Net cost (basket)</dt>
          <dd>{formatSignedGbp(-row.costDeltaTenths)}</dd>
        </div>
        <div title="Expected-points change of the final 15 vs current 15, before subtracting hits">
          <dt>EP change (before hits)</dt>
          <dd>{formatSignedPts(row.epDeltaBeforeHits)}</dd>
        </div>
        <div title="4 points per transfer beyond your free transfers">
          <dt>Hit penalty</dt>
          <dd>{row.hitCost > 0 ? `−${row.hitCost} pts (${row.hits}×4)` : 'None'}</dd>
        </div>
        <div title="EP change after subtracting the hit penalty">
          <dt>Net EP after hits</dt>
          <dd>{formatSignedPts(row.netEpVsCurrent)}</dd>
        </div>
        <div title="Bank remaining after all sells and buys in this basket">
          <dt>Bank left</dt>
          <dd>{formatGbpFromTenths(row.remainingBankTenths)}</dd>
        </div>
      </dl>
    </article>
  )
}
