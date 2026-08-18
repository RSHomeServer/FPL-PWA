import { Button, Label, Select, Spinner, Stack } from '@songara/pwa-base/ui'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import seedFile from '../analysis/gw0RoleEvidence.seed.json'
import { buildGw0OptimiserPool, GW0_PRIOR_SEASON_ID } from '../analysis/gw0Build'
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

type SolveState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; shortTerm: OrderedSquad; longTerm: OrderedSquad; overlap: SquadOverlap; lpPool: number }
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
      <p className="fpl-explorer__meta">
        The optimiser maximises expected FPL points, not EPPM and not FPL <code>ep_next</code>.
        GW2–GW6 do not condition on post-GW1 events. Phase 0 GW1 RMSE is about 2.7 pts per player —
        these are candidate squads, not a unique best team.
      </p>
      <p className="fpl-explorer__meta">{GW0_SOLVER_NOTE}</p>

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
        <ReadyView shortTerm={state.shortTerm} longTerm={state.longTerm} overlap={state.overlap} lpPool={state.lpPool} />
      ) : null}
    </ExplorerScreen>
  )
}

function ReadyView({
  shortTerm,
  longTerm,
  overlap,
  lpPool,
}: {
  shortTerm: OrderedSquad
  longTerm: OrderedSquad
  overlap: SquadOverlap
  lpPool: number
}) {
  return (
    <Stack gap="lg">
      <p className="fpl-explorer__meta">
        LP pool {lpPool} · overlap {overlap.shared.length}/15 · short-term ΣGW1 {fmt(overlap.shortGw1)} vs
        long-term {fmt(overlap.longGw1)} · short-term ΣGW1–6 {fmt(overlap.shortGw16)} vs long-term{' '}
        {fmt(overlap.longGw16)}
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
      <SquadPanel title="Short-term 15" blurb="Max expected GW1 points." squad={shortTerm} />
      <SquadPanel title="Long-term 15" blurb="Max equal-weight expected GW1–GW6 points." squad={longTerm} />
    </Stack>
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
