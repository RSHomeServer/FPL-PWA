import {
  DEFAULT_LIVE_OPTIONS,
  LIVE_CURRENT_SHRINKAGE,
  LIVE_FORM_WEIGHT,
  LIVE_LAST_GW_WEIGHT,
  LIVE_RECENCY_OVERLAY_CAP,
  LIVE_STARTS_SMALL_SAMPLE,
  type LiveOptions,
} from '../analysis/liveProject'

const STORAGE_KEY = 'fpl-app-settings-v1'

/** User-tunable live EP inputs for the transfer optimiser. */
export type OptimiserFormulaSettings = {
  /** Minutes of current-season play before fully trusting season raw p90. */
  currentShrinkageMinutesRef: number
  /** Max overlay weight for bootstrap FPL form. */
  formWeight: number
  /** Max overlay weight for last-GW p90. */
  lastGwWeight: number
  /** Cap on combined last-GW + form overlay. */
  recencyOverlayCap: number
  /** Minutes threshold for trusting current-season starts rate. */
  startsSmallSampleMinutes: number
}

export type AppSettings = {
  optimiser: OptimiserFormulaSettings
}

export const DEFAULT_OPTIMISER_FORMULA_SETTINGS: OptimiserFormulaSettings = {
  currentShrinkageMinutesRef:
    LIVE_CURRENT_SHRINKAGE.kind === 'linear' ? LIVE_CURRENT_SHRINKAGE.minutesRef : 270,
  formWeight: LIVE_FORM_WEIGHT,
  lastGwWeight: LIVE_LAST_GW_WEIGHT,
  recencyOverlayCap: LIVE_RECENCY_OVERLAY_CAP,
  startsSmallSampleMinutes: LIVE_STARTS_SMALL_SAMPLE,
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  optimiser: DEFAULT_OPTIMISER_FORMULA_SETTINGS,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sanitiseOptimiserFormula(
  partial: Partial<OptimiserFormulaSettings> | undefined,
): OptimiserFormulaSettings {
  const base = DEFAULT_OPTIMISER_FORMULA_SETTINGS
  return {
    currentShrinkageMinutesRef: clamp(
      Number(partial?.currentShrinkageMinutesRef ?? base.currentShrinkageMinutesRef),
      90,
      1800,
    ),
    formWeight: clamp(Number(partial?.formWeight ?? base.formWeight), 0, 0.5),
    lastGwWeight: clamp(Number(partial?.lastGwWeight ?? base.lastGwWeight), 0, 0.6),
    recencyOverlayCap: clamp(Number(partial?.recencyOverlayCap ?? base.recencyOverlayCap), 0.1, 0.9),
    startsSmallSampleMinutes: clamp(
      Number(partial?.startsSmallSampleMinutes ?? base.startsSmallSampleMinutes),
      45,
      900,
    ),
  }
}

export function readAppSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_APP_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APP_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      optimiser: sanitiseOptimiserFormula(parsed.optimiser),
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function writeAppSettings(settings: AppSettings): AppSettings {
  const next: AppSettings = {
    optimiser: sanitiseOptimiserFormula(settings.optimiser),
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

/** Merge saved optimiser formula settings into default live projection options. */
export function mergeOptimiserLiveOptions(overrides?: Partial<LiveOptions>): LiveOptions {
  const saved = readAppSettings().optimiser
  return {
    ...DEFAULT_LIVE_OPTIONS,
    currentShrinkage: { kind: 'linear', minutesRef: saved.currentShrinkageMinutesRef },
    formWeight: saved.formWeight,
    lastGwWeight: saved.lastGwWeight,
    recencyOverlayCap: saved.recencyOverlayCap,
    startsSmallSampleMinutes: saved.startsSmallSampleMinutes,
    ...overrides,
  }
}
