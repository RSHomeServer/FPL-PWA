import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_APP_SETTINGS,
  mergeOptimiserLiveOptions,
  readAppSettings,
  writeAppSettings,
} from './appSettings'

describe('appSettings', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    })
  })

  it('returns defaults when storage is empty', () => {
    expect(readAppSettings()).toEqual(DEFAULT_APP_SETTINGS)
  })

  it('persists and sanitises optimiser formula settings', () => {
    writeAppSettings({
      optimiser: {
        currentShrinkageMinutesRef: 30,
        formWeight: 9,
        lastGwWeight: -1,
        recencyOverlayCap: 2,
        startsSmallSampleMinutes: 5,
      },
    })
    expect(readAppSettings().optimiser).toMatchObject({
      currentShrinkageMinutesRef: 90,
      formWeight: 0.5,
      lastGwWeight: 0,
      recencyOverlayCap: 0.9,
      startsSmallSampleMinutes: 45,
    })
  })

  it('merges saved settings into live options', () => {
    writeAppSettings({
      optimiser: {
        ...DEFAULT_APP_SETTINGS.optimiser,
        currentShrinkageMinutesRef: 180,
        formWeight: 0.15,
        lastGwWeight: 0.4,
      },
    })
    const options = mergeOptimiserLiveOptions({ horizon: 3 })
    expect(options.horizon).toBe(3)
    expect(options.currentShrinkage).toEqual({ kind: 'linear', minutesRef: 180 })
    expect(options.formWeight).toBe(0.15)
    expect(options.lastGwWeight).toBe(0.4)
  })
})
