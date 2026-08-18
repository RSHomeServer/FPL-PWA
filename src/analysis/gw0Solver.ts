import {
  assembleSquad,
  buildSquadLp,
  selectedFromColumns,
  type FormationId,
  type LpCandidate,
  type OrderedSquad,
  type SquadObjectiveName,
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

type HighsModule = {
  default: (options?: { locateFile?: (file: string) => string }) => Promise<HighsHandle>
}

let highsPromise: Promise<HighsHandle> | null = null

export async function loadGw0Highs(): Promise<HighsHandle> {
  if (!highsPromise) highsPromise = instantiateHighs()
  return highsPromise
}

export async function solveSquadObjective(
  candidates: readonly LpCandidate[],
  objective: SquadObjectiveName,
  formation: FormationId,
): Promise<OrderedSquad> {
  const highs = await loadGw0Highs()
  const lp = buildSquadLp(candidates, objective)
  const result = highs.solve(lp, {
    output_flag: false,
    log_to_console: false,
    presolve: 'on',
    time_limit: 30,
    random_seed: 1,
  })
  if (result.Status !== 'Optimal') {
    throw new Error(`HiGHS ${objective} status ${result.Status}`)
  }
  const picked = selectedFromColumns(result.Columns, candidates)
  return assembleSquad(picked, objective, formation)
}

export async function solveBothObjectives(
  candidates: readonly LpCandidate[],
  formation: FormationId,
): Promise<{ shortTerm: OrderedSquad; longTerm: OrderedSquad }> {
  const shortTerm = await solveSquadObjective(candidates, 'shortTerm', formation)
  const longTerm = await solveSquadObjective(candidates, 'longTerm', formation)
  return { shortTerm, longTerm }
}

async function instantiateHighs(): Promise<HighsHandle> {
  const mod = (await import('highs')) as HighsModule
  const loadHighs = mod.default
  return loadHighs(await loaderOptions())
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
