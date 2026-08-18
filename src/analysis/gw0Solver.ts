import { formatGbpFromTenths } from '../data/prices'
import {
  assembleSquad,
  BUDGET_TENTHS,
  MAX_PER_CLUB,
  buildSquadLp,
  diagnosePins,
  formatPinInfeasibility,
  selectedFromColumns,
  SquadInfeasibleError,
  uniquePinCodes,
  type FormationId,
  type LpCandidate,
  type OrderedSquad,
  type PinViolation,
  type SquadObjectiveName,
  type SquadPinScope,
  type SquadPins,
} from './gw0Squad'

/**
 * Browser / Node MILP: HiGHS compiled to WASM (`highs` / lovasoa/highs-js,
 * MIT, HiGHS 1.15). Same CPLEX LP text in the PWA and `npm run gw0:phase3`.
 * GLPK.js is the documented fallback only if this WASM load is blocked.
 */
export const GW0_SOLVER_PACKAGE = 'highs'
export const GW0_SOLVER_NOTE =
  'HiGHS WASM via npm `highs` (lovasoa/highs-js). Runs in the browser for `/gw0` and in Node for the Phase 3 CLI. No backend.'

type HighsHandle = {
  solve: (
    problem: string,
    options?: { output_flag?: boolean; log_to_console?: boolean; presolve?: string; time_limit?: number; random_seed?: number },
  ) => { Status: string; Columns: Record<string, { Primal?: number }> }
}

type HighsLoader = (options?: { locateFile?: (file: string) => string }) => Promise<HighsHandle>

let highsPromise: Promise<HighsHandle> | null = null

export async function loadGw0Highs(): Promise<HighsHandle> {
  if (!highsPromise) {
    highsPromise = instantiateHighs().catch((error) => {
      highsPromise = null
      throw error
    })
  }
  return highsPromise
}

export async function solveSquadObjective(
  candidates: readonly LpCandidate[],
  objective: SquadObjectiveName,
  formation: FormationId,
  pins: SquadPins = {},
): Promise<OrderedSquad> {
  const diagnosed = diagnosePins(candidates, pins)
  if (diagnosed.length) {
    throw new SquadInfeasibleError(formatPinInfeasibility(diagnosed), diagnosed)
  }
  const highs = await loadGw0Highs()
  const lp = buildSquadLp(candidates, objective, pins)
  const result = highs.solve(lp, {
    output_flag: false,
    log_to_console: false,
    presolve: 'on',
    time_limit: 30,
    random_seed: 1,
  })
  if (result.Status !== 'Optimal') {
    const violations = highsInfeasible(objective, result.Status, pins)
    throw new SquadInfeasibleError(formatPinInfeasibility(violations), violations)
  }
  const picked = selectedFromColumns(result.Columns, candidates)
  return assembleSquad(picked, objective, formation)
}

export async function solveBothObjectives(
  candidates: readonly LpCandidate[],
  formation: FormationId,
  pins: SquadPins = {},
  scope: SquadPinScope = 'both',
): Promise<{ shortTerm: OrderedSquad; longTerm: OrderedSquad }> {
  const shortPins = scope === 'longTerm' ? {} : pins
  const longPins = scope === 'shortTerm' ? {} : pins
  const shortTerm = await solveSquadObjective(candidates, 'shortTerm', formation, shortPins)
  const longTerm = await solveSquadObjective(candidates, 'longTerm', formation, longPins)
  return { shortTerm, longTerm }
}

function highsInfeasible(objective: SquadObjectiveName, status: string, pins: SquadPins): PinViolation[] {
  const locked = uniquePinCodes(pins.lockedCodes)
  const excluded = uniquePinCodes(pins.excludedCodes)
  const lockBit = locked.length ? ` Locked: ${locked.join(', ')}.` : ''
  const exclBit = excluded.length ? ` Excluded: ${excluded.join(', ')}.` : ''
  return [
    {
      code: 'infeasible',
      detail: `HiGHS ${objective} status ${status}. Binding FPL rules: 15 players, ${formatGbpFromTenths(BUDGET_TENTHS)}, 2 GK / 5 DEF / 5 MID / 3 FWD, max ${MAX_PER_CLUB} per club.${lockBit}${exclBit}`,
      lockedCodes: locked,
    },
  ]
}

async function instantiateHighs(): Promise<HighsHandle> {
  const mod = await import('highs')
  const loadHighs = highsLoaderFromImport(mod)
  return loadHighs(await loaderOptions())
}

/** Vite serves highs.js as CJS; Node ESM may nest `default`. Accept either. */
export function highsLoaderFromImport(mod: unknown): HighsLoader {
  const seen = new Set<unknown>()
  let current: unknown = mod
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === 'function') return current as HighsLoader
    if (!current || typeof current !== 'object' || seen.has(current)) break
    seen.add(current)
    current = (current as { default?: unknown }).default
  }
  throw new Error('HiGHS package did not export a loader function')
}

async function loaderOptions(): Promise<{ locateFile?: (file: string) => string } | undefined> {
  if (typeof document === 'undefined') return undefined
  try {
    const wasm = await import('highs/runtime?url')
    return { locateFile: (file) => (file.endsWith('.wasm') ? wasm.default : file) }
  } catch {
    return undefined
  }
}
