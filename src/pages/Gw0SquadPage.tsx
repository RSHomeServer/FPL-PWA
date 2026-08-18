import { Button, Label, Select, Spinner, Stack } from '@songara/pwa-base/ui'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import seedFile from '../analysis/gw0RoleEvidence.seed.json'
import bandsFile from '../analysis/gw0Phase0Bands.json'
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
  overlapDiffs,
  playerAuditLine,
  type FormationId,
  type OrderedSquad,
  type SquadOverlap,
} from '../analysis/gw0Squad'
import { GW0_SOLVER_NOTE, solveBothObjectives } from '../analysis/gw0Solver'
import { loadedSeasonFromSnapshot } from '../analysis/loadSeason'
import { positionPool } from '../analysis/metrics'
import { mergeRoleEvidence, parseRoleEvidenceSeed, roleEvidenceByCode } from '../analysis/roleEvidence'
import { loadOfficialLiveSnapshot } from '../data/fplLiveSource'
import { loadSeasonCatalog, loadSeasonSnapshot } from '../data/ingest'
import { formatGbpFromTenths, poundsFromTenths } from '../data/prices'
import { readStoredRoleEvidence } from '../data/roleEvidenceStore'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'
import type { Gw0Projection } from '../analysis/gw0Project'

const PHASE0_BANDS = asPhase0Bands(bandsFile)

type SolveState =
  | { status: 'loading'; message: string }
  | {
      status: 'ready'
      shortTerm: OrderedSquad
      longTerm: OrderedSquad
      overlap: SquadOverlap
      lpPool: number
      lpPlayers: Gw0Projection[]
      solvedAt: string
    }
  | { status: 'error'; message: string }

async function loadGw0Squads(nextFormation: FormationId, force: boolean) {
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
  const { shortTerm, longTerm } = await solveBothObjectives(pool.candidates, nextFormation)
  return {
    shortTerm,
    longTerm,
    overlap: overlapDiffs(shortTerm.players, longTerm.players),
    lpPool: pool.candidates.length,
    lpPlayers: pool.candidates.map((row) => row.projection),
    solvedAt: new Date().toISOString(),
  }
}

export function Gw0SquadPage() {
  const [formation, setFormation] = useState<FormationId>(DEFAULT_FORMATION)
  const [state, setState] = useState<SolveState>({ status: 'loading', message: 'Loading live prices and 2025/26 priors…' })

  useEffect(() => {
    void (async () => {
      try {
        const result = await loadGw0Squads(DEFAULT_FORMATION, false)
        setState({ status: 'ready', ...result })
      } catch (cause) {
        setState({
          status: 'error',
          message: cause instanceof Error ? cause.message : 'GW0 solver failed',
        })
      }
    })()
  }, [])

  function changeFormation(next: FormationId) {
    setFormation(next)
    setState((current) => {
      if (current.status !== 'ready') return current
      const shortTerm = assembleSquad(current.shortTerm.players, 'shortTerm', next)
      const longTerm = assembleSquad(current.longTerm.players, 'longTerm', next)
      return { ...current, shortTerm, longTerm }
    })
  }

  return (
    <ExplorerScreen
      hideSeasonBar
      kicker="GW0 squads"
      title="Starting 15 candidates"
      question="Which 15-player 2026/27 squads are reasonable before the GW1 deadline, and why?"
    >
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

      <div className="fpl-explorer__toolbar">
        <Label className="fpl-explorer__field">
          XI formation
          <Select
            value={formation}
            onChange={(event) => changeFormation(event.target.value as FormationId)}
            disabled={state.status === 'loading'}
          >
            {FORMATION_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
                {id === DEFAULT_FORMATION ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </Label>
        <Button
          variant="primary"
          onClick={() => {
            setState({ status: 'loading', message: 'Re-solving…' })
            void loadGw0Squads(formation, true)
              .then((result) => setState({ status: 'ready', ...result }))
              .catch((cause: unknown) =>
                setState({
                  status: 'error',
                  message: cause instanceof Error ? cause.message : 'GW0 solver failed',
                }),
              )
          }}
          disabled={state.status === 'loading'}
        >
          Re-solve
        </Button>
        <p className="fpl-explorer__meta">
          <Link to="/gw0-flags">Edit minutes evidence</Link>
          {' '}then re-solve. Seed + Dexie overlay feed <code>m_sem</code>.
        </p>
      </div>

      {state.status === 'loading' ? <Spinner label={state.message} /> : null}
      {state.status === 'error' ? (
        <ExplorerEmpty title="Could not build squads" description={state.message} />
      ) : null}
      {state.status === 'ready' ? (
        <ReadyView
          shortTerm={state.shortTerm}
          longTerm={state.longTerm}
          overlap={state.overlap}
          lpPool={state.lpPool}
          lpPlayers={state.lpPlayers}
          solvedAt={state.solvedAt}
        />
      ) : null}
    </ExplorerScreen>
  )
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

function ReadyView({
  shortTerm,
  longTerm,
  overlap,
  lpPool,
  lpPlayers,
  solvedAt,
}: {
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  overlap: SquadOverlap
  lpPool: number
  lpPlayers: Gw0Projection[]
  solvedAt: string
}) {
  const disagreements = useMemo(() => largestEpNextDisagreements(lpPlayers), [lpPlayers])
  const shortEp = summariseEpNext(shortTerm.players)
  const longEp = summariseEpNext(longTerm.players)

  return (
    <Stack gap="lg">
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
      <DisagreementsPanel rows={disagreements} lpPool={lpPool} />
      <ExportBar shortTerm={shortTerm} longTerm={longTerm} solvedAt={solvedAt} />
      <SquadPanel title="Short-term 15" blurb="Max expected GW1 points." squad={shortTerm} />
      <SquadPanel title="Long-term 15" blurb="Max equal-weight expected GW1–GW6 points." squad={longTerm} />
    </Stack>
  )
}

function DisagreementsPanel({
  rows,
  lpPool,
}: {
  rows: ReturnType<typeof largestEpNextDisagreements>
  lpPool: number
}) {
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
            sortValue: (row) => row.webName,
            render: (row) => row.webName,
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
            render: (row) => row.teamShortName,
          },
          {
            id: 'gw1',
            label: 'E GW1',
            sortValue: (row) => row.ePtsGw1,
            render: (row) => fmt(row.ePtsGw1),
          },
          {
            id: 'epnext',
            label: 'ep_next',
            hint: 'FPL reference column only — not the objective.',
            sortValue: (row) => row.epNext,
            render: (row) => fmt(row.epNext),
          },
          {
            id: 'delta',
            label: 'Δ',
            hint: 'Our E[pts GW1] minus official ep_next.',
            sortValue: (row) => row.delta,
            render: (row) => formatSigned(row.delta),
          },
          {
            id: 'abs',
            label: '|Δ|',
            sortValue: (row) => row.absDelta,
            render: (row) => row.absDelta.toFixed(2),
          },
        ]}
        rows={rows}
        empty="No LP-pool player has both E GW1 and ep_next."
        rowKey={(row) => row.code}
      />
    </section>
  )
}

function ExportBar({
  shortTerm,
  longTerm,
  solvedAt,
}: {
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  solvedAt: string
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const payload = useMemo(
    () => buildGw0ExportPayload(shortTerm, longTerm, solvedAt),
    [shortTerm, longTerm, solvedAt],
  )
  const json = useMemo(() => gw0ExportJson(payload), [payload])
  const csv = useMemo(() => gw0ExportCsv(payload), [payload])

  return (
    <div className="fpl-gw0-export">
      <p className="fpl-explorer__meta">
        Export both 15s (XI, bench, prices, E GW1, E GW1–6, remaining budget, formation, generated-at).
        Client-side only.
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

function SquadPanel({ title, blurb, squad }: { title: string; blurb: string; squad: OrderedSquad }) {
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

  return (
    <section className="fpl-gw0-squad">
      <h2 className="fpl-explorer__title">{title}</h2>
      <p className="fpl-explorer__meta">{blurb}</p>
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
          Σ ep_next {fmt(ep.epNextSum)} vs Σ E GW1 {fmt(ep.ourGw1Compared)}
          {ep.delta == null ? '' : ` (${formatSigned(ep.delta)})`}
          {ep.missing ? ` · ${ep.missing} missing` : ''} — reference only
        </li>
      </ul>
      <DataTable
        caption={`${title} — names, position, club, price, expected points, confidence`}
        defaultSort={{ id: 'role', direction: 'asc' }}
        columns={[
          {
            id: 'player',
            label: 'Player',
            sortValue: (row) => row.current.webName,
            render: (row) => row.current.webName,
          },
          {
            id: 'pos',
            label: 'Pos',
            sortValue: (row) => positionPool(row.position),
            render: (row) => positionPool(row.position),
          },
          {
            id: 'club',
            label: 'Club',
            sortValue: (row) => row.teamShortName,
            render: (row) => row.teamShortName,
          },
          {
            id: 'price',
            label: 'Price',
            hint: 'Official now_cost in tenths of a million.',
            sortValue: (row) => row.nowCostTenths,
            render: (row) => formatGbpFromTenths(row.nowCostTenths),
          },
          {
            id: 'gw1',
            label: 'E GW1',
            sortValue: (row) => row.ePtsGw1,
            render: (row) => fmt(row.ePtsGw1),
          },
          {
            id: 'gw16',
            label: 'E GW1–6',
            sortValue: (row) => row.ePtsGw16,
            render: (row) => fmt(row.ePtsGw16),
          },
          {
            id: 'conf',
            label: 'Conf',
            sortValue: (row) => row.confidence.label,
            render: (row) => row.confidence.label,
          },
          {
            id: 'epnext',
            label: 'ep_next',
            hint: 'FPL reference column only — not the objective.',
            sortValue: (row) => row.epNext ?? -1,
            render: (row) => (row.epNext == null ? '—' : fmt(row.epNext)),
          },
          {
            id: 'delta',
            label: 'Δ vs ep_next',
            hint: 'Our E[pts GW1] minus official ep_next. Not used by the solver.',
            sortValue: (row) => epNextDelta(row.ePtsGw1, row.epNext) ?? -999,
            render: (row) => {
              const delta = epNextDelta(row.ePtsGw1, row.epNext)
              return delta == null ? '—' : formatSigned(delta)
            },
          },
          {
            id: 'eppm',
            label: 'EPPM',
            hint: 'Diagnostic pts per £m. Not maximised.',
            sortValue: (row) => row.eppmGw1,
            render: (row) => fmt(row.eppmGw1),
          },
          {
            id: 'role',
            label: 'XI / bench',
            sortValue: (row) => (xiCodes.has(row.code) ? 0 : 10 + squad.bench.findIndex((item) => item.code === row.code)),
            render: (row) =>
              xiCodes.has(row.code) ? 'XI' : `bench ${squad.bench.findIndex((item) => item.code === row.code) + 1}`,
          },
          {
            id: 'audit',
            label: 'Audit',
            hint: 'Reconstructable GW1 expected-points line.',
            render: (row) => <span className="fpl-gw0-audit">{playerAuditLine(row)}</span>,
          },
        ]}
        rows={squad.players}
        empty="Solver returned no players."
        rowKey={(row) => row.code}
      />
      <p className="fpl-explorer__meta">
        Price {formatGbpFromTenths(d.spendTenths)} · Σ E GW1 {fmt(d.ePtsGw1)} · Σ E GW1–6 {fmt(d.ePtsGw16)}
        {' · '}£{poundsFromTenths(d.remainingTenths).toFixed(1)}m unspent
      </p>
    </section>
  )
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
